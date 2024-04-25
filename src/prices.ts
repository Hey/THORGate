import { findClosestTimeKey, redis } from "./redis";

export async function getLatestPriceByAsset(asset: string) {
  asset = asset.toUpperCase();
  asset = asset.replace("/", ".");

  try {
    const redisKey = `price:${asset}`;
    const closestHistoricalData = await findClosestTimeKey(
      redisKey,
      Date.now(),
    );
    if (closestHistoricalData.value === null) {
      console.log(`No price found for ${asset}`);
      return null;
    }
    return closestHistoricalData.value;
  } catch (error) {
    console.error(`Error fetching price for ${asset}:`, error);
    return null;
  }
}

export async function getAveragePriceByAsset(asset: string) {
  if (asset === "rune") asset = "THOR.RUNE";
  asset = asset.toUpperCase();
  asset = asset.replace("/", ".");

  try {
    const redisKeyPattern = `price:${asset}:*`;
    const keys = await redis.keys(redisKeyPattern);
    if (keys.length === 0) {
      console.log(`No price data found for ${asset}`);
      return null;
    }
    const pricePromises = keys.map((key) => redis.get(key));
    const prices = await Promise.all(pricePromises);
    const validPrices = prices
      .filter((price): price is string => price !== null)
      .map(parseFloat)
      .filter((price) => !isNaN(price));

    if (validPrices.length === 0) {
      console.log(`No valid prices found for ${asset}`);
      return null;
    }

    const averagePrice =
      validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
    return averagePrice;
  } catch (error) {
    console.error(`Error fetching average price for ${asset}:`, error);
    return null;
  }
}
