"use client";

const EXAMPLES = [
  "Show delayed orders by week for the last 3 months",
  "Which carrier has the highest delay rate?",
  "How many orders were delivered late last month?",
  "Predict demand for SKU PAPER-0197 for the next 4 months",
  "Why does DHL's delay rate look high this month?",
];

export function ExampleChips({ onPick }: { onPick: (question: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {EXAMPLES.map((ex) => (
        <button
          key={ex}
          type="button"
          onClick={() => onPick(ex)}
          className="rounded-[var(--radius-md)] border border-black/10 px-3 py-1.5 text-xs text-[var(--color-text-muted)] transition hover:border-black/20"
        >
          {ex}
        </button>
      ))}
    </div>
  );
}
