import { getWebhook } from "../notifications";
import { findClosestTimeKey, redis } from "../redis";
import { Network, fetchNetwork } from "../thorchain";
import { formatNumberPrice } from "../utils";

interface Asset {
  key: keyof Network;
  scale: number;
}

const compareAndAlert = async (compareTimes = [1, 10, 30, 60]) => {
  const currentTime = Date.now();
  const currentNetworkData: Network = await fetchNetwork();
  const assets: Asset[] = [
    { key: "rune_price_in_tor", scale: 1e8 },
    { key: "tor_price_in_rune", scale: 1e6 },
  ];

  for (const { key, scale } of assets) {
    const currentPrice = Number(currentNetworkData[key]) / scale;
    console.log(`${key}: Current Price - ${currentPrice}`);

    const redisKey = `price:${key}`;

    for (const time of compareTimes) {
      const closestHistoricalData = await findClosestTimeKey(
        redisKey,
        currentTime - time * 60000,
      );

      if (closestHistoricalData.key && closestHistoricalData.value > 0) {
        const historicalPrice = Number(closestHistoricalData.value) / scale;
        const diff = Math.abs(currentPrice - historicalPrice);
        const diffPercentage = (diff * 100) / historicalPrice;

        if (diffPercentage >= 1) {
          console.log(
            `${key}: Price changed by ${diffPercentage.toFixed(2)}% (${historicalPrice} -> ${currentPrice}) over the last ${time} minutes.`,
          );
          await notify(
            key,
            historicalPrice,
            currentPrice,
            diffPercentage,
            time,
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    const ttl = 7200; // 2 hours in seconds
    const timeKey = `${redisKey}:time:${currentTime}`;
    await redis.set(timeKey, currentPrice.toString(), "EX", ttl);
  }
};

const notify = async (
  asset: string,
  priceBefore: number,
  priceAfter: number,
  percentageChange: number,
  minutesAgo: number,
) => {
  const hook = getWebhook();
  const formattedAsset = asset.split("_").join(" ").toUpperCase();
  const image = `https://static.thorswap.net/token-list/images/${formattedAsset.toLowerCase().includes("tor") ? "eth.vthor-0x815c23eca83261b6ec689b60cc4a58b54bc24d8d" : "thor.rune"}.png`;
  const assetUrl = `https://viewblock.io/thorchain/${asset}`;

  const embed = hook
    .setTitle(`${formattedAsset} ${percentageChange.toFixed(2)}% Change`)
    .setURL(assetUrl)
    .addField("Before", formatNumberPrice(priceBefore), true)
    .addField("Now", formatNumberPrice(priceAfter), true)
    .addField(
      "Change",
      `${priceAfter >= priceBefore ? "+" : ""}${formatNumberPrice(priceAfter - priceBefore)}`,
      true,
    )
    .setColor("#FF0000")
    .setThumbnail(image)
    .setDescription(
      `The price of ${formattedAsset} has changed by ${percentageChange.toFixed(2)}% in the last ${minutesAgo} minutes.`,
    )
    .setTimestamp();

  return hook.send(embed);
};

export const runNetworkPrice = async () => {
  console.log("Running network price check...");
  try {
    await compareAndAlert();
    console.log("Network price check completed.");
  } catch (error) {
    console.error("Error in scheduled network price check:", error);
  }
};
