import { getWebhook } from "../notifications";
import { findClosestTimeKey, redis } from "../redis";
import { fetchNetwork } from "../thorchain";
import { formatNumberPrice } from "../utils";

const compareAndAlert = async (compareTimes = [1, 10, 30, 60]) => {
  const currentTime = Date.now();
  const currentNetworkData = await fetchNetwork();
  const assets = ["rune_price_in_tor", "tor_price_in_rune"];

  for (const asset of assets) {
    const currentPrice =
      asset === "rune_price_in_tor"
        ? Number(currentNetworkData.rune_price_in_tor) / 1e8
        : Number(currentNetworkData.tor_price_in_rune) / 1e6;
    console.log("currentPrice", currentPrice);

    const redisKey = `price:${asset}`;

    for (const time of compareTimes) {
      const closestHistoricalData = await findClosestTimeKey(
        redisKey,
        currentTime - time * 60000,
      );

      if (closestHistoricalData.key) {
        const historicalPrice =
          asset === "rune_price_in_tor"
            ? Number(closestHistoricalData.value) / 1e8
            : Number(closestHistoricalData.value) / 1e6;

        if (historicalPrice > 0) {
          const diff =
            currentPrice > historicalPrice
              ? currentPrice - Number(historicalPrice)
              : historicalPrice - currentPrice;
          const diffPercentage = Number((diff * 100) / historicalPrice);

          const percentageRequired = 0; // 1% notified too much

          if (diffPercentage >= percentageRequired) {
            console.log(
              `Price of ${asset} changed by more than ${percentageRequired}% (${diffPercentage}%, ${historicalPrice} -> ${currentPrice}) over the last ${time} minute(s).`,
            );

            await notify(
              asset,
              historicalPrice,
              currentPrice,
              diffPercentage,
              time,
            );

            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      }
    }

    const ttl = 120 * 60; // 2 hours
    const timeKey = `${redisKey}:time:${currentTime}`;
    await redis.set(timeKey, currentPrice.toString(), "EX", ttl);
  }
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

export const notify = async (
  asset: string,
  priceBefore: number,
  priceAfter: number,
  percentageChange: number,
  minutesAgo: number,
) => {
  const hook = getWebhook();

  const assetLower = asset.toLowerCase();
  const image = `https://static.thorswap.net/token-list/images/${assetLower.includes("tor") ? "eth.vthor-0x815c23eca83261b6ec689b60cc4a58b54bc24d8d" : "thor.rune"}.png`; // I know tor != thor, but needed a logo;
  const assetUrl = `https://viewblock.io/thorchain/${assetLower}`;

  let title = "";
  if (asset === "tor_price_in_rune") {
    title = "Network TOR Price in RUNE";
  } else if (asset === "rune_price_in_tor") {
    title = "Network RUNE Price in TOR";
  }

  const embed = hook
    .setTitle(`${title} ${percentageChange.toFixed(2)}% Change`)
    .addField("Before", formatNumberPrice(priceBefore), true)
    .addField("Now", formatNumberPrice(priceAfter), true)
    .addField(
      "Change",
      `${priceAfter - priceBefore < 0 ? "" : "+"}${formatNumberPrice(Number(priceAfter - priceBefore))}`,
      true,
    )
    .setColor("#FF0000")
    .setThumbnail(image)
    .setDescription(
      `The ${title} has changed by **${percentageChange.toFixed(2)}%** compared to **${minutesAgo === 1 ? "a minute" : `${minutesAgo} minutes`} ago**.`,
    )
    .setTimestamp();
  // .setText("@everyone");

  return hook.send(embed);
};
