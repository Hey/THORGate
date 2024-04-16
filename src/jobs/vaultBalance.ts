import { getWebhook } from "../notifications";
import getLatestPriceByAsset from "../prices";
import { findClosestTimeKey, redis } from "../redis";
import { Vault, fetchVaults } from "../thorchain";
import { formatNumber } from "../utils";

const compareAndAlert = async (
  vaults: Vault[],
  compareTimes = [1, 10, 30, 60],
) => {
  const coinSums = new Map<string, bigint>();
  const currentTime = Date.now();

  vaults.forEach((vault) => {
    vault.coins.forEach((coin) => {
      const currentSum = coinSums.get(coin.asset) || BigInt(0);
      coinSums.set(coin.asset, currentSum + BigInt(coin.amount));
    });
  });

  for (const [asset, totalSum] of coinSums) {
    const price = await getLatestPriceByAsset(asset);

    const redisKey = `pool:${asset}`;

    for (const time of compareTimes) {
      const closestHistoricalData = await findClosestTimeKey(
        redisKey,
        currentTime - time * 60000,
      );

      if (closestHistoricalData.key) {
        const { value: historicalSum } = closestHistoricalData;
        if (historicalSum > 0) {
          const diff =
            totalSum > historicalSum
              ? totalSum - historicalSum
              : historicalSum - totalSum;
          const diffPercentage = Number((diff * 100n) / historicalSum);
          const percentageRequired = 10;

          const formattedSum = formatNumber(Number(historicalSum) / 1e8);
          const formattedTotalSum = formatNumber(Number(totalSum) / 1e8);

          if (diffPercentage >= percentageRequired && historicalSum > 0) {
            if (price && diff * price < 100_000 * 1e8) {
              console.log(
                `[VAULT BALANCE] Skipping ${asset} due to low $ difference, only ${diff * price} USD (${diffPercentage}%, ${formattedSum} -> ${formattedTotalSum})`,
              );
              continue;
            }

            console.log(
              `Total amount of ${asset} changed by more than ${percentageRequired}% (${diffPercentage}%, ${formattedSum} -> ${formattedTotalSum}) over the last ${time} minute(s).`,
            );

            await notify(
              asset,
              BigInt(historicalSum),
              BigInt(totalSum),
              diffPercentage,
              time,
            );

            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      }
    }

    const ttl = 120 * 60; // 2 hours
    const timeKey = `${redisKey}:time:${currentTime}`;
    await redis.set(timeKey, totalSum.toString(), "EX", ttl);
  }
};

export const runAsgardVaultBalance = async () => {
  console.log("Running Asgard vault check...");
  try {
    const currentVaults = await fetchVaults();
    await compareAndAlert(currentVaults);
    console.log("Asgard vault check complete.");
  } catch (error) {
    console.error("Error in Asgard vault check:", error);
  }
};

const notify = async (
  pool: string,
  amountBefore: bigint,
  amountAfter: bigint,
  percentageChange: number,
  minutesAgo: number,
) => {
  const hook = getWebhook();

  const image = `https://static.thorswap.net/token-list/images/${pool.toLowerCase()}.png`;
  const poolUrl = `https://viewblock.io/thorchain/pool/${pool}`;

  const embed = hook
    .setTitle(
      `${pool.split("-")[0]} ${percentageChange.toFixed(0)}% Asgard Vault Change`,
    )
    .setURL(poolUrl)
    .addField(
      "Before",
      `${formatNumber(Number(amountBefore) / 1e8)} ${pool.split("-")[0]}`,
      true,
    )
    .addField(
      "Now",
      `${formatNumber(Number(amountAfter) / 1e8)} ${pool.split("-")[0]}`,
      true,
    )
    .addField(
      "Change",
      `${amountAfter - amountBefore < 0 ? "" : "+"}${formatNumber(Number(amountAfter - amountBefore) / 1e8)}`,
      true,
    )
    .setColor("#FF0000")
    .setThumbnail(image)
    .setDescription(
      `**${pool}** pool has changed by **${percentageChange.toFixed(2)}%** compared to** ${minutesAgo === 1 ? "a minute" : `${minutesAgo} minutes`} ago**`,
    )
    .setTimestamp();
  // .setText("@everyone");

  return hook.send(embed);
};
