"use client";
import { useState } from "react";
import { QuestionInput } from "@/components/ask/QuestionInput";
import { ExampleChips } from "@/components/ask/ExampleChips";
import { ResultCard } from "@/components/ask/ResultCard";
import type { AskResult, ConversationTurn } from "@/lib/ai/orchestrate";

type Turn = { question: string; result: AskResult };

export default function AskPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | undefined>();

  async function ask(question: string) {
    setLoading(true);
    const history: ConversationTurn[] = turns.flatMap((t) => [
      { role: "user" as const, content: t.question },
      { role: "assistant" as const, content: t.result.answer },
    ]);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const result: AskResult = await res.json();
      setTurns((prev) => [...prev, { question, result }]);
    } catch {
      const result: AskResult = {
        answer: "Something went wrong answering that question. Please try again.",
        chart: null,
        queryPlan: null,
        filters: null,
        metric: null,
        groupBy: null,
        table: null,
      };
      setTurns((prev) => [...prev, { question, result }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-8">
      <h1 className="text-xl font-semibold">Ask AI</h1>
      <QuestionInput onSubmit={ask} disabled={loading} value={pendingQuestion} />
      <ExampleChips
        onPick={(q) => {
          // Guard here (not inside ask()) so a blocked call never invokes ask
          // at all — an async function's early return still resolves its
          // promise, which would fire the .finally() below prematurely and
          // blank the box mid-request. QuestionInput's own `disabled` prop
          // already guards its Ask button/Enter path, so this is the only
          // caller that needs it (covers a focused chip's Enter key re-firing
          // its click while the first request is still in flight).
          if (loading) return;
          setPendingQuestion(q);
          // Clear the synced text once this request settles, so leftover chip
          // text can't be double-submitted via Ask/Enter, and clicking the same
          // chip again re-triggers the sync (value goes q -> undefined -> q).
          ask(q).finally(() => setPendingQuestion(undefined));
        }}
      />
      <div className="space-y-4">
        {turns.map((t, i) => (
          <ResultCard key={i} question={t.question} result={t.result} />
        ))}
        {loading && <div className="text-sm text-[var(--color-text-muted)]">Thinking…</div>}
      </div>
    </div>
  );
}
