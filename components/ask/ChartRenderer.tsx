"use client";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { TooltipValueType } from "recharts";
import type { ChartSpec } from "@/lib/format/chartSelect";
import type { Metric } from "@/lib/queries/schemas";
import { formatMetricValue } from "@/lib/format/metricLabels";

const RATE_METRICS = new Set<string>(["on_time_rate", "delay_rate"]);

export function ChartRenderer({ chart, metric }: { chart: ChartSpec | null; metric?: Metric | null }) {
  if (!chart || chart.kind === "stat") return null;

  const rateMetric = metric && RATE_METRICS.has(metric) ? metric : undefined;
  const tickFormatter = rateMetric ? (v: number) => formatMetricValue(rateMetric, v) : undefined;
  const tooltipFormatter = rateMetric
    ? (v: TooltipValueType | undefined) => formatMetricValue(rateMetric, Number(v))
    : undefined;

  if (chart.kind === "line") {
    return (
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart.points.map((p) => ({ x: p.x, y: p.y }))}>
            <XAxis dataKey="x" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={tickFormatter} />
            <Tooltip formatter={tooltipFormatter} />
            <Line type="monotone" dataKey="y" stroke="var(--status-info)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chart.kind === "bar") {
    return (
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart.points.map((p) => ({ x: p.x, y: p.y }))}>
            <XAxis dataKey="x" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={tickFormatter} />
            <Tooltip formatter={tooltipFormatter} />
            <Bar dataKey="y" fill="var(--status-info)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chart.kind === "forecast-line") {
    const merged = [
      ...chart.historical.map((p) => ({ x: p.x, historical: p.y, forecast: undefined as number | undefined })),
      ...chart.forecast.map((p) => ({ x: p.x, historical: undefined as number | undefined, forecast: p.y })),
    ];
    return (
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={merged}>
            <XAxis dataKey="x" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="historical" stroke="var(--status-info)" strokeWidth={2} dot={false} name="Historical" />
            <Line type="monotone" dataKey="forecast" stroke="var(--status-info)" strokeWidth={2} strokeDasharray="4 4" dot={false} name="Forecast" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chart.kind === "compare-bar") {
    const data = [
      { x: chart.primary.label, y: chart.primary.value },
      { x: chart.baseline.label, y: chart.baseline.value },
    ];
    return (
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="x" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={tickFormatter} />
            <Tooltip formatter={tooltipFormatter} />
            <Bar dataKey="y" fill="var(--status-info)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return null;
}
