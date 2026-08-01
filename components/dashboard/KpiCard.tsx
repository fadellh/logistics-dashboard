import NumberFlow from "@number-flow/react";

export function KpiCard({
  label,
  value,
  format = "number",
}: {
  label: string;
  value: number;
  format?: "number" | "percent" | "days";
}) {
  const displayValue = format === "percent" ? value * 100 : value;
  const suffix = format === "percent" ? "%" : format === "days" ? "d" : "";
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">{label}</div>
      <div className="mt-2 text-3xl font-bold tracking-tight">
        <NumberFlow value={Math.round(displayValue * 10) / 10} />
        {suffix}
      </div>
    </div>
  );
}
