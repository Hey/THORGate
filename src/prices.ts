import { findClosestTimeKey } from "./redis";

async function getLatestPriceByAsset(asset: string) {
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

export default getLatestPriceByAsset;
