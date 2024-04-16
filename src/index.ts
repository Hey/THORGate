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

  cron.schedule('*/5 * * * *"', async () => {
    await runPriceMonitoring(false);
    await runNetworkPrice(false);
    await runAsgardVaultBalance(false);
    await runThorchainBalanceJob(false);
    await runPoolMonitoring(false);
  });

  cron.schedule(
    "1-4,6-9,11-14,16-19,21-24,26-29,31-34,36-39,41-44,46-49,51-54,56-59 * * * *",
    async () => {
      await runPriceMonitoring(true);
      await runNetworkPrice(true);
      await runAsgardVaultBalance(true);
      await runThorchainBalanceJob(true);
      await runPoolMonitoring(true);
    },
  );
};

schedule();
