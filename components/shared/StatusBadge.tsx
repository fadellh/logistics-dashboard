import { cva, type VariantProps } from "class-variance-authority";

const statusBadge = cva("inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-0.5 text-xs font-medium", {
  variants: {
    status: {
      delivered: "bg-[var(--status-good)]/10 text-[var(--status-good)]",
      delayed: "bg-[var(--status-warning)]/10 text-[var(--status-warning)]",
      exception: "bg-[var(--status-critical)]/10 text-[var(--status-critical)]",
      in_transit: "bg-[var(--status-info)]/10 text-[var(--status-info)]",
      canceled: "bg-black/5 text-[var(--color-text-muted)]",
    },
  },
});

const STATUS_ICON: Record<string, string> = {
  delivered: "✓",
  delayed: "⚠",
  exception: "✕",
  in_transit: "→",
  canceled: "–",
};

const STATUS_LABEL: Record<string, string> = {
  delivered: "Delivered",
  delayed: "Delayed",
  exception: "Exception",
  in_transit: "In Transit",
  canceled: "Canceled",
};

export function StatusBadge({ status }: VariantProps<typeof statusBadge> & { status: keyof typeof STATUS_LABEL }) {
  return (
    <span className={statusBadge({ status })}>
      <span aria-hidden>{STATUS_ICON[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}
