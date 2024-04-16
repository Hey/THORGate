import { findClosestTimeKey, redis } from "../redis";
import { getWebhook } from "../notifications";
import { Balance, fetchBalances } from "../thorchain";
import getLatestPriceByAsset from "../prices";
import { formatNumber } from "../utils";

const wallets = new Map([
  [
    "thor1g98cy3n9mmjrpn0sxmn63lztelera37n8n67c0",
    { name: "Pool Module", percentage: 3 },
  ],
  [
    "thor1dheycdevq39qlkxs2a6wuuzyn4aqxhve4qxtxt",
    { name: "Reserve Module", percentage: 1 },
  ],
  [
    "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncsv",
    { name: "Bond Module", percentage: 1 },
  ],
  [
    "thor1egxvam70a86jafa8gcg3kqfmfax3s0m2g3m754",
    { name: "Treasury: LP", percentage: 1 },
  ],
  [
    "thor14n2q7tpemxcha8zc26j0g5pksx4x3a9xw9ryq9",
    { name: "Treasury: 2", percentage: 1 },
  ],
  [
    "thor1qd4my7934h2sn5ag5eaqsde39va4ex2asz3yv5",
    { name: "Treasury: 1", percentage: 1 },
  ],
  [
    "thor1wfe7hsuvup27lx04p5al4zlcnx6elsnyft7dzm",
    { name: "Treasury: LP 2", percentage: 1 },
  ],
]);

async function compareAndAlert(
  address: string,
  balances: Balance[],
  minimumPercentage: number,
  compareTimes = [1, 10, 30, 60],
) {
  const currentTime = Date.now();

  for (const balance of balances) {
    const redisKey = `wallet:${address}:${balance.denom}`;
    for (const time of compareTimes) {
      const closestHistoricalData = await findClosestTimeKey(
        redisKey,
        currentTime - time * 60000,
      );

      if (
        closestHistoricalData.key &&
        BigInt(closestHistoricalData.value) > 0
      ) {
        const historicalAmount = BigInt(closestHistoricalData.value);
        const currentAmount = BigInt(balance.amount);
        const diff =
          currentAmount > historicalAmount
            ? currentAmount - historicalAmount
            : historicalAmount - currentAmount;
        const diffPercentage = Number((diff * 100n) / historicalAmount);

        if (diffPercentage >= minimumPercentage) {
          const price = await getLatestPriceByAsset(balance.denom);
          if (!price) {
            console.log(
              `[BALANCE] Skipping ${balance.denom} due to missing price data.`,
            );
            continue;
          }

          if (diff * price < 100_000 * 1e8) {
            console.log(
              `[BALANCE] Low USD difference for ${balance.denom}, only ${Number(diff * price) / 1e8} USD.`,
            );
            continue;
          }

          await notify(
            balance.denom,
            address,
            wallets.get(address)?.name || address,
            historicalAmount,
            currentAmount,
            diffPercentage,
            time,
          );
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Throttle notifications
        }
      }
    }

    await redis.set(
      `${redisKey}:time:${currentTime}`,
      balance.amount,
      "EX",
      7200,
    ); // 2 hours expiry
  }
}

export async function runThorchainBalanceJob() {
  for (const [address, { name, percentage }] of wallets) {
    console.log(`Checking balance for ${name}...`);
    try {
      const currentBalances = await fetchBalances(address);
      await compareAndAlert(address, currentBalances, percentage);
      console.log(`Balance check completed for ${name}.`);
    } catch (error) {
      console.error(`Error checking balance for ${name}: ${error}`);
    }
  }
}

async function notify(
  denom: string,
  address: string,
  nickname: string,
  amountBefore: bigint,
  amountAfter: bigint,
  percentageChange: number,
  minutesAgo: number,
) {
  const { hook, embedBuilder } = getWebhook();

  const identifier = denom.toLowerCase().replace("/", ".");
  const image = `https://static.thorswap.net/token-list/images/${identifier}.png`;
  const url = `https://viewblock.io/thorchain/address/${address}`;

  const embed = embedBuilder
    .setTitle(
      `${nickname}: ${denom} ${percentageChange.toFixed(0)}% Balance Change`,
    )
    .setURL(url)
    .addField("Before", formatNumber(Number(amountBefore) / 1e8), true)
    .addField("Now", formatNumber(Number(amountAfter) / 1e8), true)
    .addField(
      "Change",
      `${amountAfter - amountBefore < 0 ? "" : "+"}${formatNumber(Number(amountAfter - amountBefore) / 1e8)}`,
      true,
    )
    .setColor("#FF0000")
    .setThumbnail(image)
    .setDescription(
      `The balance of **${denom}** in wallet **${nickname}** has changed by **${percentageChange.toFixed(2)}%** over the past ${minutesAgo === 1 ? "a minute" : `${minutesAgo} minutes`} ago.`,
    )
    .setTimestamp();

  return hook.send(embed);
}
