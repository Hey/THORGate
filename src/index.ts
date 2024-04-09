import Redis from "ioredis";
import cron from "node-cron";
import { formatNumber } from "./utils";
import { Vault, fetchVaults } from "./thorchain";
import { notifyAlert, notifyPoolChange } from "./notifications";

const redis = new Redis(
  Number(process.env.REDIS_PORT) || 6379,
  process.env.REDIS_HOST || "localhost",
  {
    password: process.env.REDIS_PASSWORD,
  },
);

const findClosestTimeKey = async (
  redis: Redis.Redis,
  redisKey: string,
  targetTime: number,
  margin = 5,
): Promise<{ key: string; value: bigint }> => {
  const startTime = targetTime - margin * 60000;
  const endTime = targetTime + margin * 60000;
  const pattern = `${redisKey}:time:*`;
  let closestKey = "";
  let closestValue = BigInt(0);
  let closestDiff = Number.MAX_SAFE_INTEGER;

  let cursor = "0";
  do {
    const [newCursor, keys] = await redis.scan(
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      100,
    );
    cursor = newCursor;

    for (const key of keys) {
      const timePart = parseInt(key.split(":").pop(), 10);
      if (timePart >= startTime && timePart <= endTime) {
        const diff = Math.abs(targetTime - timePart);
        if (diff < closestDiff) {
          const value = await redis.get(key);
          if (value !== null) {
            closestKey = key;
            closestValue = BigInt(value);
            closestDiff = diff;
          }
        }
      }
    }
  } while (cursor !== "0");

  return { key: closestKey, value: closestValue };
};

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
        redis,
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

          if (diffPercentage > percentageRequired) {
            notifyAlert(
              `Total amount of ${asset} changed by more than ${percentageRequired}% (${diffPercentage}%, ${formattedSum} -> ${formattedTotalSum}) over the last ${time} minute(s).`,
            );

            notifyPoolChange(
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

    const ttl = 60 * 60 + 5;
    const timeKey = `${redisKey}:time:${currentTime}`;
    await redis.set(timeKey, totalSum.toString(), "EX", ttl);
  }
};

const runVaultComparison = async () => {
  console.log("Running vault comparison...");
  try {
    const currentVaults = await fetchVaults();
    await compareAndAlert(currentVaults);
    console.log("Vault check completed.");
  } catch (error) {
    console.error("Error in scheduled vault comparison:", error);
  }
};

const scheduleVaultComparison = () => {
  runVaultComparison();

  cron.schedule("* * * * *", async () => runVaultComparison);

  console.log("Vault comparison scheduled to run every minute.");
};

scheduleVaultComparison();

process.on("SIGINT", () => {
  console.log("Shutting down...");
  redis.quit();
  process.exit();
});
