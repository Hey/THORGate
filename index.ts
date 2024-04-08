import Redis from "ioredis";
import fetch from "node-fetch";
import cron from "node-cron";

const redis = new Redis(
  Number(process.env.REDIS_PORT) || 6379,
  process.env.REDIS_HOST || "localhost",
  {
    password: process.env.REDIS_PASSWORD,
  },
);

interface Coin {
  asset: string;
  amount: string;
}

interface Vault {
  block_height: number;
  pub_key: string;
  coins: Coin[];
}

const alert = async (message: string) => {
  console.log(`ALERT: ${message}`);
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (webhookUrl) {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `@everyone: ${message}` }),
    });
  }
};

const fetchVaults = async (blockHeight?: number): Promise<Vault[]> => {
  const url = `https://thornode.ninerealms.com/thorchain/vaults/asgard${blockHeight ? `?block_height=${blockHeight}` : ""}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json", "x-client-id": "thorswap-be" },
  });
  if (!response.ok) {
    throw new Error("Network response was not ok");
  }
  return response.json();
};

const findClosestTimeKey = async (
  redisKey: string,
  targetTime: number,
  margin: number = 5,
) => {
  // attempt to find the closest timestamp within +/- margin minutes
  let closest = null;
  let closestDiff = Number.MAX_SAFE_INTEGER;

  for (let offset = -margin; offset <= margin; offset++) {
    const testTime = targetTime + offset * 60000; // offset in milliseconds
    const testKey = `${redisKey}:time:${testTime}`;
    const testValue = await redis.get(testKey);
    if (testValue !== null) {
      const diff = Math.abs(offset);
      if (diff < closestDiff) {
        closest = { key: testKey, value: BigInt(testValue) };
        closestDiff = diff;
      }
    }
  }

  return closest;
};

const compareAndAlert = async (
  vaults: Vault[],
  compareTimes = [1, 10, 30, 60],
) => {
  const coinSums = new Map<string, bigint>();
  const currentTime = Date.now();

  // sum up the amounts of each coin across all vaults
  vaults.forEach((vault) => {
    vault.coins.forEach((coin) => {
      const currentSum = coinSums.get(coin.asset) || BigInt(0);
      coinSums.set(coin.asset, currentSum + BigInt(coin.amount));
    });
  });

  for (const [asset, totalSum] of coinSums) {
    const redisKey = `pool:${asset}`;

    // For each comparison time, find the closest available data
    for (const time of compareTimes) {
      const closestHistoricalData = await findClosestTimeKey(
        redisKey,
        currentTime - time * 60000,
      );
      if (closestHistoricalData) {
        const { value: sum } = closestHistoricalData;
        if (sum > 5) {
          // ignore small changes
          const diff = totalSum > sum ? totalSum - sum : sum - totalSum;
          const diffPercentage = Number((diff * BigInt(100)) / sum);
          if (diffPercentage > 0) {
            alert(
              `Total amount of ${asset} changed by more than 1% (${diffPercentage}%, ${sum} -> ${totalSum}) over the last ${time} minute(s).`,
            );
          }
        }
      }
    }

    // store current sum with timestamp and set TTL
    const ttl = 60 * 60 + 5; // 1 hour and 5 minutes in seconds, to ensure we don't miss the next comparison
    const timeKey = `${redisKey}:time:${currentTime}`;
    await redis.set(timeKey, totalSum.toString(), "EX", ttl);
  }
};

const scheduleVaultComparison = () => {
  cron.schedule("* * * * *", async () => {
    console.log("Running vault comparison...");
    try {
      const currentVaults = await fetchVaults();
      await compareAndAlert(currentVaults);
      console.log("Vault check completed.");
    } catch (error) {
      console.error("Error in scheduled vault comparison:", error);
    }
  });

  console.log("Vault comparison scheduled to run every minute.");
};

scheduleVaultComparison();

process.on("SIGINT", () => {
  console.log("Shutting down...");
  redis.quit();
  process.exit();
});
