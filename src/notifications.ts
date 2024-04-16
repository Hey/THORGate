import { MessageBuilder, Webhook } from "discord-webhook-node";

export const getWebhook = (): {
  hook: Webhook;
  embedBuilder: MessageBuilder;
} => {
  const hook = new Webhook(process.env.DISCORD_WEBHOOK_URL);

  hook
    .setUsername("THORGate")
    .setAvatar(
      "https://blog.mexc.com/wp-content/uploads/2022/09/1_KkoJRE6ICrE70mNegVeY_Q.png",
    );

  const embed = new MessageBuilder();
  //   .setAuthor(
  //   "THORGate",
  //   "https://blog.mexc.com/wp-content/uploads/2022/09/1_KkoJRE6ICrE70mNegVeY_Q.png",
  // );

  return {
    hook,
    embedBuilder: embed,
  };
};
