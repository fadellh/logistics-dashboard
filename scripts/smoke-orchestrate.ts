import { orchestrate } from "../lib/ai/orchestrate";

async function main() {
  console.log(await orchestrate("Which carrier has the highest delay rate?", []));
  console.log(await orchestrate("How much inventory should I plan?", [])); // should ask for a SKU/category, not guess
  console.log(await orchestrate("What's the weather like in London?", [])); // should decline
  // Self-correction path: horizonMonths is capped at 6 by forecastDemandArgsSchema.
  // Asking for 18 months tempts the model to pass an out-of-range value, which
  // Zod .parse() throws on — that error gets pushed back as a `tool`-role message
  // so the model can retry with a corrected/clamped horizonMonths.
  console.log(await orchestrate("Forecast demand for SKU PAPER-0197 for the next 18 months", []));
}
main().then(() => process.exit(0));
