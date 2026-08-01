import { runCompareMetric } from "../lib/queries/compare";

async function main() {
  console.log(await runCompareMetric({
    metric: "delay_rate",
    filters: { carrier: "DHL", dateRange: { from: "2025-11-01", to: "2025-11-30" } },
    compareTo: "previous_period",
  }));
  console.log(await runCompareMetric({
    metric: "delay_rate",
    filters: { carrier: "DHL" },
    compareTo: "overall_average",
  }));
}
main().then(() => process.exit(0));
