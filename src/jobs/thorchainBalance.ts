import { findClosestTimeKey, redis } from "../redis";
import { notifyBalanceChange } from "../notifications";
import { Balance, fetchBalances } from "../thorchain";

const walletNicknames = new Map([
  ["thor1g98cy3n9mmjrpn0sxmn63lztelera37n8n67c0", "Pool Module"],
  ["thor1dheycdevq39qlkxs2a6wuuzyn4aqxhve4qxtxt", "Reserve Module"],
  ["thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncsv", "Bond Module"],
  ["thor1egxvam70a86jafa8gcg3kqfmfax3s0m2g3m754", "Treasury: LP"],
  ["thor14n2q7tpemxcha8zc26j0g5pksx4x3a9xw9ryq9", "Treasury: 2"],
  ["thor1qd4my7934h2sn5ag5eaqsde39va4ex2asz3yv5", "Treasury: 1"],
  ["thor1wfe7hsuvup27lx04p5al4zlcnx6elsnyft7dzm", "Treasury: 3"],
]);

const compareAndAlert = async (
  address: string,
  balances: Balance[],
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
          if (diffPercentage >= 1) {
            await notifyBalanceChange(
              balance.denom,
              address,
              walletNicknames.get(address) || address,
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
  for (const address of walletNicknames.keys()) {
    console.log(
      `Running balance check for ${walletNicknames.get(address) || address}...`,
    );
    try {
      const currentBalances = await fetchBalances(address);
      await compareAndAlert(address, currentBalances);
      console.log(
        `Balance check complete for ${walletNicknames.get(address) || address}.`,
      );
    } catch (error) {
      console.error(
        `Error in balance check for ${walletNicknames.get(address) || address}:`,
        error,
      );
    }
  }
};
