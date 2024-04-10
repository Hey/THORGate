import { notifyPriceChange } from "../notifications";
import { findClosestTimeKey, redis } from "../redis";
import { fetchNetwork } from "../thorchain";
import { formatNumber } from "../utils";

const compareAndAlert = async (compareTimes = [1, 10, 30, 60]) => {
  const currentTime = Date.now();
  const currentNetworkData = await fetchNetwork();
  const assets = ["rune_price_in_tor", "tor_price_in_rune"];

  for (const asset of assets) {
    const currentPrice = BigInt(
      asset === "rune_price_in_tor"
        ? currentNetworkData.rune_price_in_tor
        : currentNetworkData.tor_price_in_rune,
    );
    const redisKey = `price:${asset}`;

    for (const time of compareTimes) {
      const closestHistoricalData = await findClosestTimeKey(
        redisKey,
        currentTime - time * 60000,
      );

      if (closestHistoricalData.key) {
        const historicalPrice = BigInt(closestHistoricalData.value);

        if (historicalPrice > 0) {
          const diff =
            currentPrice > historicalPrice
              ? currentPrice - historicalPrice
              : historicalPrice - currentPrice;
          const diffPercentage = Number((diff * 100n) / historicalPrice);

          const formattedHistoricalPrice = formatNumber(
            Number(historicalPrice),
          );
          const formattedCurrentPrice = formatNumber(Number(currentPrice));
          const percentageRequired = 1;

          if (diffPercentage >= percentageRequired) {
            console.log(
              `Price of ${asset} changed by more than ${percentageRequired}% (${diffPercentage}%, ${formattedHistoricalPrice} -> ${formattedCurrentPrice}) over the last ${time} minute(s).`,
            );

            await notifyPriceChange(
              asset,
              historicalPrice,
              currentPrice,
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
    await redis.set(timeKey, currentPrice.toString(), "EX", ttl);
  }
};

export const runNetworkPrice = async () => {
  console.log("Running network price check...");
  try {
    await compareAndAlert();
    console.log("Network price check completed.");
  } catch (error) {
    console.error("Error in scheduled network price check:", error);
  }
};
