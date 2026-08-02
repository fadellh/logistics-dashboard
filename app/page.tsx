import { runQueryAnalytics } from "@/lib/queries/analytics";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { OrderVolumeChart } from "@/components/dashboard/OrderVolumeChart";
import { DeliveryStatusChart } from "@/components/dashboard/DeliveryStatusChart";
import { CarrierBreakdownChart } from "@/components/dashboard/CarrierBreakdownChart";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const dateRange = from && to ? { from, to } : undefined;
  const baseFilters = dateRange ? { dateRange } : undefined;
  const filterLabel = dateRange ? `${dateRange.from} – ${dateRange.to}` : "All 2025";

  const [
    total,
    delivered,
    delayed,
    inTransit,
    exception,
    canceled,
    onTimeRate,
    avgDeliveryTime,
    volumeOverTime,
    carrierDelayBreakdown,
  ] = await Promise.all([
    runQueryAnalytics({ metric: "count", filters: baseFilters }),
    runQueryAnalytics({ metric: "count", filters: { ...baseFilters, status: "delivered" } }),
    runQueryAnalytics({ metric: "count", filters: { ...baseFilters, status: "delayed" } }),
    runQueryAnalytics({ metric: "count", filters: { ...baseFilters, status: "in_transit" } }),
    runQueryAnalytics({ metric: "count", filters: { ...baseFilters, status: "exception" } }),
    runQueryAnalytics({ metric: "count", filters: { ...baseFilters, status: "canceled" } }),
    runQueryAnalytics({ metric: "on_time_rate", filters: baseFilters }),
    runQueryAnalytics({ metric: "avg_delivery_time", filters: baseFilters }),
    runQueryAnalytics({ metric: "count", groupBy: "week", filters: baseFilters }),
    runQueryAnalytics({ metric: "delay_rate", groupBy: "carrier", filters: baseFilters }),
  ]);

  return (
    <div className="space-y-8 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <DateRangeFilter from={from} to={to} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <KpiCard label="Total Orders" value={total.rows[0].value} />
        <KpiCard label="Delivered" value={delivered.rows[0].value} />
        <KpiCard label="Delayed" value={delayed.rows[0].value} />
        <KpiCard label="On-Time Rate" value={onTimeRate.rows[0].value} format="percent" />
        <KpiCard label="Avg Delivery Time" value={avgDeliveryTime.rows[0].value} format="days" />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <OrderVolumeChart data={volumeOverTime.rows} filterLabel={filterLabel} />
        <DeliveryStatusChart
          delivered={delivered.rows[0].value}
          delayed={delayed.rows[0].value}
          inTransit={inTransit.rows[0].value}
          exception={exception.rows[0].value}
          canceled={canceled.rows[0].value}
          filterLabel={filterLabel}
        />
      </div>

      <CarrierBreakdownChart data={carrierDelayBreakdown.rows} filterLabel={filterLabel} />
    </div>
  );
}
