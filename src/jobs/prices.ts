import { getWebhook } from "../notifications";
import { redis, findClosestTimeKey } from "../redis"; // Added findClosestTimeKey
import {
  calculatePriceInUSD,
  fetchDerivedPools,
  fetchPools,
  fetchRuneUSDPrice,
} from "../thorchain";
import { formatNumber } from "../utils";

const monitorPrices = async () => {
  console.log("Starting price monitoring...");

  const pools = await fetchPools();
  const runePriceInUsd = await fetchRuneUSDPrice(pools);
  const derivedPools = await fetchDerivedPools();

  const allPools = [...pools, ...derivedPools];
  const compareTimes = [1, 10, 30, 60]; // times in minutes
  const currentTime = Date.now();

  for (const pool of allPools) {
    const priceInUSD = calculatePriceInUSD(pool, runePriceInUsd);
    if (priceInUSD === null) continue;

    const redisKey = `price:${pool.asset}`;
    await redis.set(redisKey, priceInUSD.toString(), "EX", 86400); // TTL of 24 hours

    for (const time of compareTimes) {
      const closestHistoricalData = await findClosestTimeKey(
        redisKey,
        currentTime - time * 60000,
      );

      if (closestHistoricalData.key) {
        const historicalPrice = Number(closestHistoricalData.value);
        if (isNaN(historicalPrice)) continue;

        const percentageChange =
          Math.abs((priceInUSD - historicalPrice) / historicalPrice) * 100;

        if (percentageChange >= 5) {
          await notify(
            pool.asset,
            BigInt(historicalPrice * 1e8),
            BigInt(priceInUSD * 1e8),
            percentageChange,
            time,
          );
        }
      }
    }

    // Set the new historical data point
    const timeKey = `${redisKey}:time:${currentTime}`;
    await redis.set(timeKey, priceInUSD.toString(), "EX", 120 * 60); // TTL of 2 hours
  }

  console.log("Price monitoring completed.");
};

export const runPriceMonitoring = async () => {
  console.log("Running price monitoring...");
  try {
    await monitorPrices();
  } catch (error) {
    console.error("Error during price monitoring:", error);
  }
};

export const notify = async (
  asset: string,
  amountBefore: bigint,
  amountAfter: bigint,
  percentageChange: number,
  minutesAgo: number,
) => {
  const hook = getWebhook();

  const identifier = asset.toLowerCase().replace("/", ".");
  const image = `https://static.thorswap.net/token-list/images/${identifier}.png`;
  const url = `https://viewblock.io/thorchain/pool/${asset}`;

  const embed = hook
    .setTitle(
      `${identifier.split("-")[0]}: ${percentageChange.toFixed(0)}% Change`,
    )
    .setURL(url)
    .addField("Before", "$" + formatNumber(Number(amountBefore) / 1e8), true)
    .addField("Now", "$" + formatNumber(Number(amountAfter) / 1e8), true)
    .addField(
      "Change",
      `${amountAfter - amountBefore < 0 ? "" : "+"}${formatNumber(Number(amountAfter - amountBefore) / 1e8)}`,
      true,
    )
    .setColor("#FF0000")
    .setThumbnail(image)
    .setDescription(
      `The price of **${identifier}** has changed by **${percentageChange.toFixed(2)}%** compared to **${minutesAgo === 1 ? "a minute" : `${minutesAgo} minutes`} ago**.`,
    )
    .setTimestamp();
  // .setText("@everyone");

  return hook.send(embed);
};
