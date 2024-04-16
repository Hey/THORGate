import { Redis } from "ioredis";

export const redis = new Redis(
  Number(process.env.REDIS_PORT) || 6379,
  process.env.REDIS_HOST || "localhost",
  {
    password: process.env.REDIS_PASSWORD,
  },
);

export const findClosestTimeKey = async (
  redisKey: string,
  targetTime: number,
  margin = 5,
): Promise<{ key: string; value: bigint }> => {
  const startTime = targetTime - margin * 60000;
  const endTime = targetTime + margin * 60000;
  const pattern = `${redisKey}:time:*`;
  let closestKey = "";
  let closestValue = BigInt(0); // Default to zero
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
          if (value !== null && /^\d+$/.test(value)) {
            // Check if value is a numeric string
            closestKey = key;
            try {
              closestValue = BigInt(value);
              closestDiff = diff;
            } catch (error) {
              console.error(`Error converting value to BigInt: ${error}`);
              continue;
            }
          }
        }
      }
    }
  } while (cursor !== "0");

  return { key: closestKey, value: closestValue };
};
