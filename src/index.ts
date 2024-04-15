import cron from "node-cron";
import { runAsgardVaultBalance } from "./jobs/vaultBalance";
import { runNetworkPrice } from "./jobs/networkPrice";
import { runThorchainBalanceJob } from "./jobs/thorchainBalance";
import { runPoolMonitoring } from "./jobs/pool";

const schedule = () => {
  console.log("Scheduling jobs...");

  runAsgardVaultBalance();
  runNetworkPrice();
  runThorchainBalanceJob();

  cron.schedule("* * * * *", async () => {
    await runAsgardVaultBalance();
  });
  console.log("Asgard vault balance check scheduled to run every minute.");

  cron.schedule("* * * * *", async () => {
    await runNetworkPrice();
  });
  console.log(
    "Network price check (rune_price_in_tor & tor_price_in_rune) scheduled to run every minute.",
  );

  cron.schedule("* * * * *", async () => {
    await runThorchainBalanceJob();
  });
  console.log(
    "Thorchain various wallet balance check scheduled to run every minute.",
  );

  cron.schedule("* * * * *", async () => {
    await runPoolMonitoring();
  });
  console.log("Pool balance check scheduled to run every minute.");
};

schedule();
