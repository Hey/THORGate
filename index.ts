import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_PORT || "6379");

interface Coin {
  asset: string;
  amount: string;
}

interface Vault {
  block_height: number;
  pub_key: string;
  coins: Coin[];
}

const fetchVaults = async (): Promise<Vault[]> => {
  const response = await fetch(
    "https://thornode.ninerealms.com/thorchain/vaults/asgard",
    {
      method: "GET",
      headers: { accept: "application/json", "x-client-id": "thorswap-be" },
    },
  );
  if (!response.ok) {
    throw new Error("Network response was not ok");
  }
  return response.json() as Promise<Vault[]>;
};

const compareAndAlert = async (vaults: Vault[]) => {
  const coinSums = new Map<string, bigint>();

  // Sum up the amounts of each coin across all vaults
  vaults.forEach((vault) => {
    vault.coins.forEach((coin) => {
      const currentSum = coinSums.get(coin.asset) || BigInt(0);
      coinSums.set(coin.asset, currentSum + BigInt(coin.amount));
    });
  });

  for (const [asset, totalSum] of coinSums) {
    const redisKey = `pool:${asset}`;
    const redisValue = await redis.get(redisKey);
    if (redisValue) {
      const previousSum = BigInt(redisValue);
      if (previousSum > 0) {
        const diff =
          totalSum > previousSum
            ? totalSum - previousSum
            : previousSum - totalSum;
        const diffPercentage = Number((diff * BigInt(100)) / previousSum);

        if (diffPercentage > 1) {
          console.log(
            `Alert: Total amount of ${asset} changed by more than 10% (${diffPercentage}%, ${previousSum} -> ${totalSum}).`,
          );
        }
      } else if (totalSum > 0) {
        console.log(
          `Alert: Total amount of ${asset} changed from 0 to ${totalSum}.`,
        );
      }
    } else {
      // New pool or clean db
      if (totalSum > 0) {
        console.log(
          `Alert: Total amount of ${asset} has been set to ${totalSum}.`,
        );
      }
    }

    await redis.set(redisKey, totalSum.toString());
  }
};

fetchVaults()
  .then(compareAndAlert)
  .then(() => console.log("Vault check completed."))
  .catch((error) => console.error("Error fetching vaults:", error))
  .finally(() => redis.quit());
