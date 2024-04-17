import cron from "node-cron";
import { runAsgardVaultBalance } from "./jobs/vaultBalance";
import { runNetworkPrice } from "./jobs/networkPrice";
import { runThorchainBalanceJob } from "./jobs/thorchainBalance";
import { runPoolMonitoring } from "./jobs/pool";
import { runPriceMonitoring } from "./jobs/prices";

const schedule = async () => {
  console.log("Scheduling jobs...");

  await runPriceMonitoring(false);

  if (process.env.NODE_ENV === "development") {
    console.log("Running jobs instantly:");
    await runAsgardVaultBalance(false);
    await runNetworkPrice(false);
    await runThorchainBalanceJob(false);
    await runPoolMonitoring(false);
  }

  cron.schedule('* * * * *"', async () => {
    await runPriceMonitoring(false);
    await runNetworkPrice(false);
    await runAsgardVaultBalance(false);
    await runThorchainBalanceJob(false);
    await runPoolMonitoring(false);
  });
};

schedule();
