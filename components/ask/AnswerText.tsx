// Minimal, dependency-free renderer for **bold** / *italic* markdown in the plain-text
// LLM fallback path (declines, clarifications, follow-up explanations) — that prose comes
// straight from the model, which routinely reaches for markdown emphasis. Deterministic
// template answers (composeQueryAnswer & co.) never contain "*", so this is a no-op for
// them. Not a general markdown renderer — just enough to stop literal asterisks and
// collapsed newlines from reaching the screen.
const SEGMENT_RE = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;

export function AnswerText({ text }: { text: string }) {
  const segments = text.split(SEGMENT_RE).filter((s) => s.length > 0);
  return (
    <div className="mt-2 whitespace-pre-wrap text-base">
      {segments.map((seg, i) => {
        if (seg.startsWith("**") && seg.endsWith("**")) {
          return <strong key={i}>{seg.slice(2, -2)}</strong>;
        }
        if (seg.startsWith("*") && seg.endsWith("*")) {
          return <em key={i}>{seg.slice(1, -1)}</em>;
        }
        return <span key={i}>{seg}</span>;
      })}
    </div>
  );
}
