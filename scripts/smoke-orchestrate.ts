import { orchestrate } from "../lib/ai/orchestrate";

async function main() {
  console.log(await orchestrate("Which carrier has the highest delay rate?", []));
  console.log(await orchestrate("How much inventory should I plan?", [])); // should ask for a SKU/category, not guess
  console.log(await orchestrate("What's the weather like in London?", [])); // should decline
}
main().then(() => process.exit(0));
