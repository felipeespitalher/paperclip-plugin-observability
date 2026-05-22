import type { MetricSeries } from "../cloudwatch-metrics.js";

const chartWidth = 520;
const chartHeight = 160;
const padding = { top: 12, right: 12, bottom: 28, left: 44 };

export function MetricChart({ series }: { series: MetricSeries }) {
  const points = series.points;
  if (points.length === 0) {
    return (
      <div style={{ fontSize: "0.85rem", opacity: 0.7, padding: "0.5rem 0" }}>
        No datapoints in the selected window.
      </div>
    );
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const plotted = points.map((point, index) => {
    const x =
      padding.left +
      (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
    const y = padding.top + innerHeight - ((point.value - min) / range) * innerHeight;
    return { x, y, ...point };
  });

  const polyline = plotted.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div style={{ display: "grid", gap: "0.35rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <strong style={{ fontSize: "0.95rem" }}>{series.label}</strong>
        <span style={{ fontSize: "0.75rem", opacity: 0.65 }}>{series.unit}</span>
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        role="img"
        aria-label={`${series.label} chart`}
        style={{ maxWidth: chartWidth, border: "1px solid rgba(128,128,128,0.2)", borderRadius: 6 }}
      >
        <line
          x1={padding.left}
          y1={padding.top + innerHeight}
          x2={chartWidth - padding.right}
          y2={padding.top + innerHeight}
          stroke="rgba(128,128,128,0.35)"
        />
        <text x={padding.left} y={chartHeight - 6} fontSize="10" fill="currentColor" opacity="0.6">
          {formatTime(plotted[0]?.timestamp)}
        </text>
        <text
          x={chartWidth - padding.right}
          y={chartHeight - 6}
          fontSize="10"
          fill="currentColor"
          opacity="0.6"
          textAnchor="end"
        >
          {formatTime(plotted[plotted.length - 1]?.timestamp)}
        </text>
        <text x={6} y={padding.top + 10} fontSize="10" fill="currentColor" opacity="0.6">
          {max.toFixed(1)}
        </text>
        <polyline
          fill="none"
          stroke="var(--paperclip-accent, #3b82f6)"
          strokeWidth="2"
          points={polyline}
        />
        {plotted.map((point) => (
          <circle key={point.timestamp} cx={point.x} cy={point.y} r="2.5" fill="#3b82f6" />
        ))}
      </svg>
    </div>
  );
}

function formatTime(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
