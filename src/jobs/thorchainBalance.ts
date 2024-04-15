import { findClosestTimeKey, redis } from "../redis";
import { notifyBalanceChange } from "../notifications";
import { Balance, fetchBalances } from "../thorchain";

const wallets = new Map([
  [
    "thor1g98cy3n9mmjrpn0sxmn63lztelera37n8n67c0",
    {
      name: "Pool Module",
      percentage: 3,
    },
  ],
  [
    "thor1dheycdevq39qlkxs2a6wuuzyn4aqxhve4qxtxt",
    {
      name: "Reserve Module",
      percentage: 1,
    },
  ],
  [
    "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncsv",
    {
      name: "Bond Module",
      percentage: 1,
    },
  ],
  [
    "thor1egxvam70a86jafa8gcg3kqfmfax3s0m2g3m754",
    {
      name: "Treasury: LP",
      percentage: 1,
    },
  ],
  [
    "thor14n2q7tpemxcha8zc26j0g5pksx4x3a9xw9ryq9",
    {
      name: "Treasury: 2",
      percentage: 1,
    },
  ],
  [
    "thor1qd4my7934h2sn5ag5eaqsde39va4ex2asz3yv5",
    {
      name: "Treasury: 1",
      percentage: 1,
    },
  ],
  [
    "thor1wfe7hsuvup27lx04p5al4zlcnx6elsnyft7dzm",
    {
      name: "Treasury: LP 2",
      percentage: 1,
    },
  ],
]);

const compareAndAlert = async (
  address: string,
  balances: Balance[],
  minimumPercentage: number,
  compareTimes = [1, 10, 30, 60],
) => {
  const currentTime = Date.now();

  for (const balance of balances) {
    const redisKey = `wallet:${address}:${balance.denom}`;
    for (const time of compareTimes) {
      const closestHistoricalData = await findClosestTimeKey(
        redisKey,
        currentTime - time * 60000,
      );
      if (closestHistoricalData.key) {
        const { value: historicalAmount } = closestHistoricalData;
        const currentAmount = BigInt(balance.amount);
        if (BigInt(historicalAmount) > 0) {
          const diff =
            currentAmount > BigInt(historicalAmount)
              ? currentAmount - BigInt(historicalAmount)
              : BigInt(historicalAmount) - currentAmount;
          const diffPercentage = Number(
            (diff * 100n) / BigInt(historicalAmount),
          );
          if (diffPercentage >= minimumPercentage) {
            await notifyBalanceChange(
              balance.denom,
              address,
              wallets.get(address)?.name ?? address,
              BigInt(historicalAmount),
              currentAmount,
              diffPercentage,
              time,
            );
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Throttle notifications
          }
        }
      }
    }

    const ttl = 120 * 60; // 2 hours
    const timeKey = `${redisKey}:time:${currentTime}`;
    await redis.set(timeKey, balance.amount, "EX", ttl);
  }
};

export const runThorchainBalanceJob = async () => {
  for (const address of wallets.keys()) {
    const name = wallets.get(address)?.name ?? address;
    const minimumPercentage = wallets.get(address)?.percentage ?? 1;
    console.log(`Running balance check for ${name}...`);
    try {
      const currentBalances = await fetchBalances(address);
      await compareAndAlert(address, currentBalances, minimumPercentage);
      console.log(`Balance check complete for ${name}.`);
    } catch (error) {
      console.error(`Error in balance check for ${name}:`, error);
    }
  }
};
