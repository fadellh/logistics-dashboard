"use client";
import { useState } from "react";

export function ExplainCaption({
  filterLabel,
  metricLabel,
  rows,
}: {
  filterLabel: string;
  metricLabel: string;
  rows: { label: string; value: number }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 text-xs text-[var(--color-text-muted)]">
      <div className="flex items-center gap-2">
        <span>{filterLabel} · {metricLabel}</span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="underline underline-offset-2"
        >
          {open ? "hide data" : "view data"}
        </button>
      </div>
      {open && (
        <table className="mt-2 w-full text-left">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-black/5">
                <td className="py-1 pr-4">{r.label}</td>
                <td className="py-1">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
