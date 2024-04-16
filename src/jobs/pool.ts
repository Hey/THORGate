import { getWebhook } from "../notifications";
import { findClosestTimeKey, redis } from "../redis";
import { fetchPools } from "../thorchain";
import { formatNumber } from "../utils";

interface Thresholds {
  [key: string]: {
    percentage: number;
  };
}

const propertyThresholds: Thresholds = {
  balance_asset: {
    percentage: 5,
  },
  balance_rune: {
    percentage: 5,
  },
  // pool_units: 3,
  // LP_units: 2,
  // synth_units: 10,
  // loan_collateral: 2,
  // loan_collateral_remaining: 2,
  // savers_depth: 2,
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
            const propertyConfig = propertyThresholds[property];

            if (diffPercentage >= propertyConfig.percentage) {
              const formattedHistoricalValue = formatNumber(
                Number(historicalValue) / 1e8,
              );
              const formattedCurrentValue = formatNumber(
                Number(currentValue) / 1e8,
              );

              console.log(
                `Significant pool property change detected in ${property} of ${pool.asset}: ${diffPercentage}% change (${formattedHistoricalValue} -> ${formattedCurrentValue}) over the last ${time} minutes.`,
              );

              await notify(
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

export const notify = async (
  pool: string,
  property: string,
  valueBefore: bigint,
  valueAfter: bigint,
  percentageChange: number,
  minutesAgo: number,
) => {
  const hook = getWebhook();
  const formattedValueBefore = formatNumber(Number(valueBefore) / 1e8);
  const formattedValueAfter = formatNumber(Number(valueAfter) / 1e8);
  const formattedChange = formatNumber(Number(valueAfter - valueBefore) / 1e8);

  const image = `https://static.thorswap.net/token-list/images/${pool.toLowerCase()}.png`;
  const poolUrl = `https://viewblock.io/thorchain/pool/${pool}`;

  const embed = hook
    .setTitle(
      `${pool.split("-")[0]} ${percentageChange.toFixed(0)}% Pool Change in ${property}`,
    )
    .setURL(poolUrl)
    .addField("Before", formattedValueBefore, true)
    .addField("Now", formattedValueAfter, true)
    .addField(
      "Change",
      `${valueAfter - valueBefore < 0 ? "" : "+"}${formattedChange}`,
      true,
    )
    .setColor("#FF0000")
    .setThumbnail(image)
    .setDescription(
      `The **${property}** of **${pool}** pool has changed by **${percentageChange.toFixed(2)}%** compared to **${minutesAgo === 1 ? "a minute" : `${minutesAgo} minutes`} ago**.`,
    )
    .setTimestamp();
  // .setText("@everyone");

  return hook.send(embed);
};
