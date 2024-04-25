import { getWebhook, notifyLock } from "../notifications";
import { getAveragePriceByAsset, getLatestPriceByAsset } from "../prices";
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
          // console.log(`[VAULT BALANCE] No change in ${asset} balance`);
          continue;
        }

        if (diffPercentage >= 10) {
          if (doNotAlert) continue;

          const price = await getAveragePriceByAsset(asset);
          if (!price) {
            console.log(
              `[BALANCE] Skipping ${asset} due to missing price data.`,
            );
            continue;
          }

          // console.log(`
          //   asset: ${asset}
          //   historicalSum: ${historicalSum}
          //   totalSum: ${totalSum}
          //   diff: ${diff}
          //   diffPercentage: ${diffPercentage}
          //   price: ${price}
          //   `);

          if (diff * BigInt(price) < 10000n) {
            console.log(
              `[BALANCE] Skipping ${asset} due to too little USD change (${(diff * BigInt(price)) / BigInt(1e8)} USD).`,
            );
            continue;
          }

          if (!(await notifyLock(redisKey))) {
            console.log(
              `Notification lock for ${redisKey} already exists, not sending notification.`,
            );
            continue;
          }

          await notify(
            asset,
            historicalSum,
            totalSum,
            diffPercentage,
            time,
            BigInt(price),
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

  const ticker = asset.split("-")[0].split(".")[1];

  const usdBefore = price ? Number(amountBefore * price) / 1e8 : null;
  const usdAfter = price ? Number(amountAfter * price) / 1e8 : null;
  const usdChange = price
    ? Number((amountAfter - amountBefore) * price) / 1e8
    : null;

  const embed = embedBuilder
    .setTitle(
      `${asset.split("-")[0]} Pool ${percentageChange.toFixed(0)}% Change`,
    )
    .setURL(poolUrl)
    .addField(
      "Before",
      `${usdBefore ? `$${usdBefore.toFixed(2)}\n` : ""}${formatNumber(Number(amountBefore) / 1e8)} ${ticker}`,
      true,
    )
    .addField(
      "Now",
      `${usdAfter ? `$${usdAfter.toFixed(2)}\n` : ""}${formatNumber(Number(amountAfter) / 1e8)} ${ticker}`,
      true,
    )
    .addField(
      "Change",
      `${usdChange ? `$${usdChange.toFixed(2)}\n` : ""}${amountAfter - amountBefore >= 0 ? "+" : ""}${formatNumber(Number(amountAfter - amountBefore) / 1e8)}`,
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
    console.error(error);
  }
};
