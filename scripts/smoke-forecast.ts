import { runForecastDemand, InsufficientDataError } from "../lib/queries/forecast";

async function main() {
  console.log(
    await runForecastDemand({ productCategory: "CRAYON", horizonMonths: 3 })
  );
  console.log(
    await runForecastDemand({ sku: "CRAYON-0017", horizonMonths: 2 })
  );
  try {
    await runForecastDemand({ sku: "PAPER-0197", horizonMonths: 1 });
    console.log("ERROR: expected InsufficientDataError, none thrown");
  } catch (e) {
    console.log(
      "InsufficientDataError reachable:",
      e instanceof InsufficientDataError,
      (e as Error).message
    );
  }
}
main().then(() => process.exit(0));
