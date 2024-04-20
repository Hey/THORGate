import { getWebhook, notifyLock } from "../notifications";
import { findClosestTimeKey, redis } from "../redis";
import { fetchPools } from "../thorchain";
import { DEFAULT_COMPARE_TIMES, formatNumber } from "../utils";

interface Thresholds {
  [key: string]: {
    percentage: number;
  };
}

const propertyThresholds: Thresholds = {
  balance_asset: { percentage: 5 },
  balance_rune: { percentage: 5 },
  // pool_units: { percentage: 3 },
  // LP_units: { percentage: 2 },
  // synth_units: { percentage: 10 },
  // loan_collateral: { percentage: 2 },
  // loan_collateral_remaining: { percentage: 2 },
  // savers_depth: { percentage: 2 },
};

const compareAndAlertPools = async (
  doNotAlert: boolean,
  compareTimes = DEFAULT_COMPARE_TIMES,
) => {
  const pools = await fetchPools();
  const currentTime = Date.now();

  for (const pool of pools) {
    for (const property in propertyThresholds) {
      if (!pool.hasOwnProperty(property)) continue; // Skip if the pool does not have the property

      if (pool.status !== "Available") continue;

      const currentValue = BigInt(pool[property]);
      const redisKey = `pool:${pool.asset}:${property}`;

      for (const time of compareTimes) {
        const { key, value } = await findClosestTimeKey(
          redisKey,
          currentTime - time * 60000,
        );
        if (key && value && BigInt(value) > 0) {
          const historicalValue = BigInt(value);
          const diff =
            currentValue > historicalValue
              ? currentValue - historicalValue
              : historicalValue - currentValue;
          const diffPercentage = Number((diff * 100n) / historicalValue);

          if (diffPercentage >= propertyThresholds[property].percentage) {
            if (doNotAlert) continue;

            if (!(await notifyLock(redisKey)))
              return console.log(
                `Notification lock for ${redisKey} already exists, not sending notificaiton.`,
              );

            console.log(
              `Significant change in ${property} of ${pool.asset}: ${diffPercentage}% (${formatNumber(Number(historicalValue))} -> ${formatNumber(Number(currentValue))}) over the last ${time} minutes.`,
            );
            await notify(
              pool.asset,
              property,
              historicalValue,
              currentValue,
              diffPercentage,
              time,
            );
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay to throttle notifications
          }
        }
      }
      await redis.set(
        `${redisKey}:time:${currentTime}`,
        currentValue.toString(),
        "EX",
        7200,
      ); // 2 hours TTL
    }
  }
};

const notify = async (
  pool: string,
  property: string,
  valueBefore: bigint,
  valueAfter: bigint,
  percentageChange: number,
  minutesAgo: number,
) => {
  const { hook, embedBuilder } = getWebhook();

  const embed = embedBuilder
    .setTitle(
      `${pool.split("-")[0]} ${percentageChange.toFixed(0)}% Change in ${property}`,
    )
    .setURL(`https://viewblock.io/thorchain/pool/${pool}`)
    .addField("Before", `${formatNumber(Number(valueBefore) / 1e8)}`, true)
    .addField("Now", `${formatNumber(Number(valueAfter) / 1e8)}`, true)
    .addField(
      "Change",
      `${valueAfter > valueBefore ? "+" : ""}${formatNumber(Number(valueAfter - valueBefore) / 1e8)}`,
      true,
    )
    .setColor("#FF0000")
    .setThumbnail(
      `https://static.thorswap.net/token-list/images/${pool.toLowerCase()}.png`,
    )
    .setDescription(
      `The **${property}** of **${pool}** has changed by **${percentageChange.toFixed(2)}%** compared to ${minutesAgo === 1 ? "a minute ago" : `${minutesAgo} minutes ago`}.`,
    )
    .setTimestamp();

  return hook.send(embed);
};

export const runPoolMonitoring = async (doNotAlert: boolean) => {
  console.log("Running pool monitoring...");
  try {
    await compareAndAlertPools(doNotAlert);
    console.log("Pool monitoring completed.");
  } catch (error) {
    console.error("Error in pool monitoring:", error);
  }
};
