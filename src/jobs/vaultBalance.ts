import { notifyPoolChange } from "../notifications";
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

          if (diffPercentage >= percentageRequired) {
            console.log(
              `Total amount of ${asset} changed by more than ${percentageRequired}% (${diffPercentage}%, ${formattedSum} -> ${formattedTotalSum}) over the last ${time} minute(s).`,
            );

            await notifyPoolChange(
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
