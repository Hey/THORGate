import cron from "node-cron";
import { runAsgardVaultBalance } from "./jobs/vaultBalance";
import { runNetworkPrice } from "./jobs/networkPrice";
import { runThorchainBalanceJob } from "./jobs/thorchainBalance";
import { runPoolMonitoring } from "./jobs/pool";
import { runPriceMonitoring } from "./jobs/prices";

const schedule = async () => {
  console.log("Scheduling jobs...");

  await runPriceMonitoring();

  if (process.env.NODE_ENV === "development") {
    console.log("Running jobs instantly:");
    await runAsgardVaultBalance();
    await runNetworkPrice();
    await runThorchainBalanceJob();
    await runPoolMonitoring();
  }

  cron.schedule("* * * * *", async () => {
    await runPriceMonitoring();
    await runNetworkPrice();
    await runAsgardVaultBalance();
    await runThorchainBalanceJob();
    await runPoolMonitoring();
  });
};

schedule();
