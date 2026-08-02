"use client";
import { useEffect, useRef, useState } from "react";
import { QuestionInput } from "@/components/ask/QuestionInput";
import { ExampleChips } from "@/components/ask/ExampleChips";
import { ResultCard } from "@/components/ask/ResultCard";
import type { AskResult, ConversationTurn } from "@/lib/ai/orchestrate";

type Turn = { question: string; result: AskResult };

const STORAGE_KEY = "ldash_ask_turns";

export default function AskPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | undefined>();
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Read the persisted conversation after mount, not during render — localStorage
  // doesn't exist on the server, so reading it outside an effect would make the
  // server-rendered HTML (always empty) mismatch the client's first paint.
  useEffect(() => {
    // One-time SSR-safe hydration read, not the derived-state anti-pattern
    // react-hooks/set-state-in-effect targets: localStorage doesn't exist on
    // the server, so there's no way to get this value during render without a
    // server/client mismatch (see QuestionInput.tsx for the same lint rule
    // noted against a different pattern).
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setTurns(JSON.parse(raw));
    } catch {
      // Corrupt/unreadable storage: start clean instead of crashing.
    }
    setHydrated(true);
  }, []);

  // Persist on every change, but only once the read-effect above has run. Both
  // effects fire on mount; without the `hydrated` guard this one's first run
  // (turns still []) would overwrite the saved conversation before it's loaded.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(turns));
    } catch {
      // Storage unavailable (e.g., Safari private browsing, storage quota
      // exceeded) — fail silently, same as read-effect. Non-critical persistence.
    }
  }, [turns, hydrated]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading]);

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

  function newChat() {
    setTurns([]);
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between border-b border-black/10 p-4">
        <h1 className="text-xl font-semibold">Ask AI</h1>
        <button
          type="button"
          onClick={newChat}
          className="rounded-[var(--radius-md)] border border-black/10 px-3 py-1.5 text-xs text-[var(--color-text-muted)] transition hover:border-black/20"
        >
          New chat
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-8">
        {turns.length === 0 && !loading ? (
          <div className="space-y-6">
            <p className="text-sm text-[var(--color-text-muted)]">
              Ask a question about your logistics data to get started.
            </p>
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
          </div>
        ) : (
          <div className="space-y-4">
            {turns.map((t, i) => (
              <ResultCard key={i} question={t.question} result={t.result} />
            ))}
            {loading && <div className="text-sm text-[var(--color-text-muted)]">Thinking…</div>}
          </div>
        )}
      </div>

      <div className="border-t border-black/10 p-4">
        <QuestionInput onSubmit={ask} disabled={loading} value={pendingQuestion} />
      </div>
    </div>
  );
}
