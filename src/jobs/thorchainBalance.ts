import { findClosestTimeKey, redis } from "../redis";
import { getWebhook, notifyLock } from "../notifications";
import { Balance, fetchBalances } from "../thorchain";
import { getAveragePriceByAsset } from "../prices";
import { DEFAULT_COMPARE_TIMES, formatNumber } from "../utils";

const wallets = new Map([
  [
    "thor1g98cy3n9mmjrpn0sxmn63lztelera37n8n67c0",
    { name: "Pool Module", percentage: 1 },
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
  doNotAlert: boolean,
  address: string,
  balances: Balance[],
  minimumPercentage: number,
  compareTimes = DEFAULT_COMPARE_TIMES,
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
        const historicalAmount =
          BigInt(closestHistoricalData.value) / BigInt(1e8);
        const currentAmount = BigInt(balance.amount) / BigInt(1e8);
        const diff =
          currentAmount > historicalAmount
            ? currentAmount - historicalAmount
            : historicalAmount - currentAmount;

        if (diff === 0n || (historicalAmount === 0n && currentAmount === 0n)) {
          // console.log(
          //   `[BALANCE] Skipping ${balance.denom} due to no change in balance, or both balances are 0. (${historicalAmount} -> ${currentAmount})`,
          // );
          continue;
        }

        const diffPercentage = Number(
          (Number(diff) / Number(historicalAmount)) * 100,
        );

        if (diffPercentage >= minimumPercentage) {
          if (doNotAlert) continue;

          const price = await getAveragePriceByAsset(balance.denom);
          if (!price) {
            console.log(
              `[BALANCE] Skipping ${balance.denom} due to missing price data.`,
            );
            continue;
          }

          const diffUSD = Number(diff) * price;

          if (diffUSD < 10000) {
            console.log(
              `[BALANCE] Skipping ${balance.denom} due to too little USD change (${diffUSD.toFixed(2)}).`,
            );
            continue;
          }

          if (!(await notifyLock(redisKey))) {
            console.log(
              `Notification lock for ${redisKey} already exists, not sending notification.`,
            );
            continue;
          }

          console.log(
            `Big change in ${balance.denom} for ${address} (${wallets.get(address)?.name || address}) at ${time} minutes ago: ${diffPercentage.toFixed(2)}%`,
          );

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

export async function runThorchainBalanceJob(doNotAlert: boolean) {
  for (const [address, { name, percentage }] of wallets) {
    console.log(`Checking balance for ${name}...`);
    try {
      const currentBalances = await fetchBalances(address);
      await compareAndAlert(doNotAlert, address, currentBalances, percentage);
      console.log(`Balance check completed for ${name}.`);
    } catch (error) {
      console.error(`Error checking balance for ${name}: ${error}`);
      console.error(error);
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
