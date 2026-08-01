"use client";
import { useRouter } from "next/navigation";

export function DateRangeFilter({ from, to }: { from?: string; to?: string }) {
  const router = useRouter();

  function apply(newFrom: string, newTo: string) {
    const params = new URLSearchParams();
    if (newFrom) params.set("from", newFrom);
    if (newTo) params.set("to", newTo);
    router.push(`/?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <input
        type="date"
        defaultValue={from}
        onChange={(e) => apply(e.target.value, to ?? "2025-12-31")}
        className="rounded-[var(--radius-md)] border border-black/10 px-2 py-1"
      />
      <span className="text-[var(--color-text-muted)]">to</span>
      <input
        type="date"
        defaultValue={to}
        onChange={(e) => apply(from ?? "2025-01-01", e.target.value)}
        className="rounded-[var(--radius-md)] border border-black/10 px-2 py-1"
      />
    </div>
  );
}
