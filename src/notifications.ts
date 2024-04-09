import { MessageBuilder, Webhook } from "discord-webhook-node";
import { formatNumber } from "./utils";

export const notifyAlert = async (message: string) => {
  console.log(`ALERT: ${message}`);
};

export const getWebhook = (): Webhook => {
  const hook = new Webhook(process.env.DISCORD_WEBHOOK_URL);

  hook.setUsername("THORGate");

  return hook;
};

export const notifyPoolChange = (
  pool: string,
  amountBefore: number,
  amountAfter: number,
  percentageChange: number,
  minutesAgo: number,
) => {
  const hook = getWebhook();

  const image = `https://static.thorswap.net/token-list/images/${pool.toLowerCase()}.png`;
  const poolUrl = `https://viewblock.io/thorchain/pool/${pool}`;

  const formattedAmountBefore = formatNumber(amountBefore / 1e8);
  const formattedAmountAfter = formatNumber(amountAfter / 1e8);

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
    .addField("Before", formattedAmountBefore, true)
    .addField("Now", formattedAmountAfter, true)
    .addField(
      "Change",
      formatNumber((Number(amountAfter) - Number(amountBefore)) / 1e8),
      true,
    )
    // .addField("Transaction Hash", transactionHash)
    .setColor("#FF0000")
    .setThumbnail(image)
    .setDescription(
      `${pool} pool has changed by ${percentageChange.toFixed(2)}% compared to ${minutesAgo === 1 ? "minute" : `${minutesAgo} minutes`} ago.`,
    )
    .setTimestamp();

  return hook.send(embed);
};
