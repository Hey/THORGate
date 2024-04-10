import cron from "node-cron";
import { runVaultComparison } from "./jobs/vaultComparison";
import { redis } from "./redis";

const schedule = () => {
  console.log("Scheduling jobs...");

  runVaultComparison();
  cron.schedule("* * * * *", async () => runVaultComparison);
  console.log("Vault comparison scheduled to run every minute.");
};

schedule();

process.on("SIGINT", () => {
  console.log("Shutting down...");
  redis.quit();
  process.exit();
});
