import { getWebhook } from "../notifications";
import { redis, findClosestTimeKey } from "../redis";
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
  const compareTimes = [1, 10, 30, 60]; // in minutes
  const currentTime = Date.now();

  for (const pool of allPools) {
    const priceInUSD = calculatePriceInUSD(pool, runePriceInUsd);
    if (priceInUSD === null) continue;

    const redisKey = `price:${pool.asset}`;
    await redis.set(redisKey, priceInUSD.toString(), "EX", 86400); // 24 hours TTL

    for (const time of compareTimes) {
      const { key, value } = await findClosestTimeKey(
        redisKey,
        currentTime - time * 60000,
      );
      if (key && value) {
        const historicalPrice = parseFloat(value);
        if (!isNaN(historicalPrice)) {
          const percentageChange =
            Math.abs((priceInUSD - historicalPrice) / historicalPrice) * 100;

          if (percentageChange >= 5) {
            console.log(`Alerting significant price change for ${pool.asset}`);
            await notify(
              pool.asset,
              historicalPrice,
              priceInUSD,
              percentageChange,
              time,
            );
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Throttle notifications
          }
        }
      }
    }

    const timeKey = `${redisKey}:time:${currentTime}`;
    await redis.set(timeKey, priceInUSD.toString(), "EX", 7200); // 2 hours TTL
  }

  console.log("Price monitoring completed.");
};

const notify = async (
  asset: string,
  priceBefore: number,
  priceNow: number,
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
    .addField("Before", `$${formatNumber(priceBefore)}`, true)
    .addField("Now", `$${formatNumber(priceNow)}`, true)
    .addField(
      "Change",
      `${priceNow - priceBefore < 0 ? "" : "+"}${formatNumber(priceNow - priceBefore)}`,
      true,
    )
    .setColor("#FF0000")
    .setThumbnail(image)
    .setDescription(
      `The price of **${identifier}** has changed by **${percentageChange.toFixed(2)}%** in the last ${minutesAgo} minutes.`,
    )
    .setTimestamp();

  return hook.send(embed);
};

export const runPriceMonitoring = async () => {
  console.log("Running price monitoring...");
  try {
    await monitorPrices();
  } catch (error) {
    console.error("Error during price monitoring:", error);
  }
};
