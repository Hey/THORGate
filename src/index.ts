import cron from "node-cron";
import { redis } from "./redis";
import { runAsgardVaultBalance } from "./jobs/vaultBalance";
import { runNetworkPrice } from "./jobs/networkPrice";

const schedule = () => {
  console.log("Scheduling jobs...");

  runAsgardVaultBalance();
  cron.schedule("* * * * *", async () => runAsgardVaultBalance);
  console.log("Asgard vault balance check scheduled to run every minute.");

  runNetworkPrice();
  cron.schedule("* * * * *", async () => runNetworkPrice);
  console.log(
    "Network price check (rune_price_in_tor & tor_price_in_rune) scheduled to run every minute.",
  );
};

schedule();

process.on("SIGINT", () => {
  console.log("Shutting down...");
  redis.quit();
  process.exit();
});
