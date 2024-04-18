import { getWebhook, notifyLock } from "../notifications";
import getLatestPriceByAsset from "../prices";
import { findClosestTimeKey, redis } from "../redis";
import { Vault, fetchVaults } from "../thorchain";
import { DEFAULT_COMPARE_TIMES, formatNumber } from "../utils";

const compareAndAlert = async (
  doNotAlert: boolean,
  vaults: Vault[],
  compareTimes = DEFAULT_COMPARE_TIMES,
) => {
  const coinSums = new Map();
  const currentTime = Date.now();

  vaults.forEach((vault: Vault) =>
    vault.coins.forEach((coin) => {
      const currentSum = coinSums.get(coin.asset) || BigInt(0);
      coinSums.set(coin.asset, currentSum + BigInt(coin.amount));
    }),
  );

  for (const [asset, totalSum] of coinSums) {
    const price = await getLatestPriceByAsset(asset);
    const redisKey = `pool:${asset}`;

    for (const time of compareTimes) {
      const { key, value: historicalSum } = await findClosestTimeKey(
        redisKey,
        currentTime - time * 60000,
        2,
      );

      if (key && historicalSum > 0) {
        const diff =
          totalSum > historicalSum
            ? totalSum - historicalSum
            : historicalSum - totalSum;
        const diffPercentage = Number((diff * 100n) / historicalSum);

        if (diff === BigInt(0)) {
          console.log(`[VAULT BALANCE] No change in ${asset} balance`);
          continue;
        }

        if (diffPercentage >= 10) {
          // const usdChange = price ? Number(diff * price) / 1e8 : null;
          // const logMessage = usdChange
          //   ? `${asset}: ${diffPercentage.toFixed(2)}% change; USD Change: ${usdChange.toFixed(2)}`
          //   : `${asset}: ${diffPercentage.toFixed(2)}% change`;

          if (doNotAlert) continue;

          if (!(await notifyLock(redisKey)))
            return console.log(
              `Notification lock for ${redisKey} already exists, not sending notificaiton.`,
            );

          await notify(
            asset,
            historicalSum,
            totalSum,
            diffPercentage,
            time,
            price,
          );
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Cooldown between notifications
        }
      }
    }

    await redis.set(
      `${redisKey}:time:${currentTime}`,
      totalSum.toString(),
      "EX",
      7200,
    ); // 2 hours expiry
  }
};

const notify = async (
  asset: string,
  amountBefore: bigint,
  amountAfter: bigint,
  percentageChange: number,
  minutesAgo: number,
  price: bigint | null,
) => {
  const { hook, embedBuilder } = getWebhook();

  const image = `https://static.thorswap.net/token-list/images/${asset.toLowerCase()}.png`;
  const poolUrl = `https://viewblock.io/thorchain/pool/${asset}`;

  const embed = embedBuilder
    .setTitle(
      `${asset.split("-")[0]} Pool ${percentageChange.toFixed(0)}% Change`,
    )
    .setURL(poolUrl)
    .addField(
      "Before",
      `${formatNumber(Number(amountBefore) / 1e8)} ${asset.split("-")[0].split(".")[1]}`,
      true,
    )
    .addField(
      "Now",
      `${formatNumber(Number(amountAfter) / 1e8)} ${asset.split("-")[0].split(".")[1]}`,
      true,
    )
    .addField(
      "Change",
      `${amountAfter - amountBefore >= 0 ? "+" : ""}${formatNumber(Number(amountAfter - amountBefore) / 1e8)}`,
      true,
    )
    .setColor("#FF0000")
    .setThumbnail(image)
    .setDescription(
      `The **${asset}** pool has changed by **${percentageChange.toFixed(2)}%** over the past **${minutesAgo}** minutes.`,
    )
    .setTimestamp();

  if (price) {
    const usdValue = Number(amountAfter * price) / 1e8;
    embed.addField("USD Value", `$${usdValue.toFixed(2)}`, true);
  }

  return hook.send(embed);
};

export const runAsgardVaultBalance = async (doNotAlert: boolean) => {
  console.log("Running Asgard vault check...");
  try {
    const currentVaults = await fetchVaults();
    await compareAndAlert(doNotAlert, currentVaults, DEFAULT_COMPARE_TIMES);
    console.log("Asgard vault check complete.");
  } catch (error) {
    console.error("Error in Asgard vault check:", error);
  }
};
