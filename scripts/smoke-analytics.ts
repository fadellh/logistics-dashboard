import { runQueryAnalytics } from "../lib/queries/analytics";

async function main() {
  console.log(await runQueryAnalytics({ metric: "count" }));
  console.log(await runQueryAnalytics({ metric: "delay_rate", groupBy: "carrier" }));
  console.log(await runQueryAnalytics({ metric: "on_time_rate", filters: { dateRange: { from: "2025-01-01", to: "2025-03-31" } } }));
}
main().then(() => process.exit(0));
