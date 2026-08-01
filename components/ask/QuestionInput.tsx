"use client";
import { useState } from "react";

export function QuestionInput({
  onSubmit,
  disabled,
  value,
}: {
  onSubmit: (question: string) => void;
  disabled: boolean;
  value?: string;
}) {
  const [text, setText] = useState(value ?? "");
  // ponytail: React's documented "adjust state during render" pattern
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // instead of useEffect — this project's lint config (react-hooks/set-state-in-effect)
  // errors on setState-in-effect, and this avoids the extra-render effect penalty anyway.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(value ?? "");
  }

  function submit() {
    if (!text.trim() || disabled) return;
    onSubmit(text.trim());
    setText("");
  }

  return (
    <div className="flex gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Ask about your logistics data..."
        className="card flex-1 !py-2 outline-none"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled}
        className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-black transition active:scale-[0.97] disabled:opacity-50"
      >
        Ask
      </button>
    </div>
  );
}
