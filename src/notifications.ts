import { MessageBuilder, Webhook } from "discord-webhook-node";
import { redis } from "./redis";

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

const setNotificationLock = async (
  resource: string,
  ttl: number = 3600,
): Promise<string | null> => {
  return redis.set(`notification-lock:${resource}`, "1", "EX", ttl);
};

const getNotificationLock = async (
  resource: string,
): Promise<string | null> => {
  return redis.get(`notification-lock:${resource}`);
};

// Returns false if lock was already active
// Returns true if new lock was set
export const notifyLock = async (resource: string, ttl: number = 3600) => {
  const lock = await getNotificationLock(resource);
  if (lock) {
    return false;
  }

  await setNotificationLock(resource, ttl);
  return true;
};
