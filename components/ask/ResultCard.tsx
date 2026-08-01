import { ChartRenderer } from "./ChartRenderer";
import { ExplainabilityPanel } from "./ExplainabilityPanel";
import type { AskResult } from "@/lib/ai/orchestrate";
import type { Metric } from "@/lib/queries/schemas";

export function ResultCard({ question, result }: { question: string; result: AskResult }) {
  return (
    <div className="card">
      <div className="text-sm text-[var(--color-text-muted)]">&quot;{question}&quot;</div>
      <div className="mt-2 text-base">{result.answer}</div>
      <div className="mt-3">
        <ChartRenderer chart={result.chart} metric={result.metric as Metric | null} />
      </div>
      <ExplainabilityPanel result={result} />
    </div>
  );
}
