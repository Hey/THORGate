import { MessageBuilder, Webhook } from "discord-webhook-node";
import { formatNumber } from "./utils";

export const getWebhook = (): Webhook => {
  const hook = new Webhook(process.env.DISCORD_WEBHOOK_URL);

  hook.setUsername("THORGate");

  return hook;
};

export const notifyPoolChange = (
  pool: string,
  amountBefore: bigint,
  amountAfter: bigint,
  percentageChange: number,
  minutesAgo: number,
) => {
  const hook = getWebhook();

  const image = `https://static.thorswap.net/token-list/images/${pool.toLowerCase()}.png`;
  const poolUrl = `https://viewblock.io/thorchain/pool/${pool}`;

  const embed = new MessageBuilder()
    .setTitle(
      `${pool.split("-")[0]} ${percentageChange.toFixed(0)}% Pool Change`,
    )
    .setAuthor(
      "THORGate",
      "https://blog.mexc.com/wp-content/uploads/2022/09/1_KkoJRE6ICrE70mNegVeY_Q.png",
      poolUrl,
    )
    .setURL(poolUrl)
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
      `**${pool}** pool has changed by **${percentageChange.toFixed(2)}%** compared to** ${minutesAgo === 1 ? "a minute" : `${minutesAgo} minutes`} ago**`,
    )
    .setTimestamp()
    .setText("@everyone");

  return hook.send(embed);
};

export const notifyPriceChange = (
  asset: string,
  priceBefore: bigint,
  priceAfter: bigint,
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

  const embed = new MessageBuilder()
    .setTitle(`${title} ${percentageChange.toFixed(0)}% Change`)
    .setAuthor(
      "THORGate",
      "https://blog.mexc.com/wp-content/uploads/2022/09/1_KkoJRE6ICrE70mNegVeY_Q.png",
      assetUrl,
    )
    .setURL(assetUrl)
    .addField("Before", formatNumber(Number(priceBefore)), true)
    .addField("Now", formatNumber(Number(priceAfter)), true)
    .addField(
      "Change",
      `${priceAfter - priceBefore < 0 ? "" : "+"}${formatNumber(Number(priceAfter - priceBefore))}`,
      true,
    )
    .setColor("#FF0000")
    .setThumbnail(image)
    .setDescription(
      `The ${title} has changed by **${percentageChange.toFixed(2)}%** compared to **${minutesAgo === 1 ? "a minute" : `${minutesAgo} minutes`} ago**.`,
    )
    .setTimestamp()
    .setText("@everyone");

  return hook.send(embed);
};

export const notifyBalanceChange = (
  denom: string,
  address: string,
  nickname: string,
  amountBefore: bigint,
  amountAfter: bigint,
  percentageChange: number,
  minutesAgo: number,
) => {
  const hook = getWebhook();

  const identifier = denom.toLowerCase().replace("/", ".");
  const image = `https://static.thorswap.net/token-list/images/${identifier}.png`;
  const url = `https://viewblock.io/thorchain/address/${address}`;

  const embed = new MessageBuilder()
    .setTitle(`${nickname}: ${denom} ${percentageChange.toFixed(0)}% Change`)
    .setAuthor(
      "THORGate",
      "https://blog.mexc.com/wp-content/uploads/2022/09/1_KkoJRE6ICrE70mNegVeY_Q.png",
      url,
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
      `The balance of **${denom}** in wallet **${nickname}** has changed by **${percentageChange.toFixed(2)}%** compared to **${minutesAgo === 1 ? "a minute" : `${minutesAgo} minutes`} ago**.`,
    )
    .setTimestamp()
    .setText("@everyone");

  return hook.send(embed);
};
