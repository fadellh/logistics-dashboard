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
