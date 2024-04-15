import { notifyPoolChange } from "../notifications";
import { findClosestTimeKey, redis } from "../redis";
import { fetchPools } from "../thorchain";
import { formatNumber } from "../utils";

interface Thresholds {
  [key: string]: number;
}

// Minimum percentage change required to trigger an alert
const propertyThresholds: Thresholds = {
  balance_asset: 5,
  balance_rune: 5,
  pool_units: 3,
  LP_units: 2,
  synth_units: 10,
  loan_collateral: 2,
  loan_collateral_remaining: 2,
  savers_depth: 2,
};

const compareAndAlertPools = async (compareTimes = [1, 10, 30, 60]) => {
  const pools = await fetchPools();
  const currentTime = Date.now();

  for (const pool of pools) {
    for (const property in propertyThresholds) {
      const currentValue = BigInt(pool[property]);
      const redisKey = `pool:${pool.asset}:${property}`;

      for (const time of compareTimes) {
        const closestHistoricalData = await findClosestTimeKey(
          redisKey,
          currentTime - time * 60000,
        );

        if (closestHistoricalData.key) {
          const historicalValue = BigInt(closestHistoricalData.value);
          if (historicalValue > 0) {
            const diff =
              currentValue > historicalValue
                ? currentValue - historicalValue
                : historicalValue - currentValue;
            const diffPercentage = Number((diff * 100n) / historicalValue);
            const percentageRequired = propertyThresholds[property];

            if (diffPercentage >= percentageRequired) {
              const formattedHistoricalValue = formatNumber(
                Number(historicalValue) / 1e8,
              );
              const formattedCurrentValue = formatNumber(
                Number(currentValue) / 1e8,
              );

              console.log(
                `Significant pool property change detected in ${property} of ${pool.asset}: ${diffPercentage}% change (${formattedHistoricalValue} -> ${formattedCurrentValue}) over the last ${time} minutes.`,
              );

              await notifyPoolChange(
                pool.asset,
                property,
                historicalValue,
                currentValue,
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
      await redis.set(timeKey, currentValue.toString(), "EX", ttl);
    }
  }
};

export const runPoolMonitoring = async () => {
  console.log("Running pool monitoring...");
  try {
    await compareAndAlertPools();
    console.log("Pool monitoring completed.");
  } catch (error) {
    console.error("Error in pool monitoring:", error);
  }
};
