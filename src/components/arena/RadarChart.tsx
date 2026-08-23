'use client';

/**
 * Minimal hand-drawn SVG radar chart — no charting library dependency for
 * one shape. Two overlaid polygons (agent A / agent B) on shared axes,
 * each axis 0-100. Values and axis meaning come entirely from the caller;
 * this component only draws.
 */

interface RadarChartProps {
  axes: string[];
  seriesA: number[];
  seriesB: number[];
  colorA?: string;
  colorB?: string;
  size?: number;
}

function pointOnAxis(index: number, total: number, value: number, radius: number, center: number) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const r = (Math.max(0, Math.min(100, value)) / 100) * radius;
  return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
}

function polygonPoints(values: number[], radius: number, center: number) {
  return values.map((v, i) => pointOnAxis(i, values.length, v, radius, center)).map((p) => `${p.x},${p.y}`).join(' ');
}

export function RadarChart({ axes, seriesA, seriesB, colorA = '#f59e0b', colorB = '#60a5fa', size = 240 }: RadarChartProps) {
  const center = size / 2;
  const radius = size / 2 - 28;
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto">
      {/* Grid rings */}
      {rings.map((r) => (
        <polygon
          key={r}
          points={polygonPoints(axes.map(() => r * 100), radius, center)}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.12}
          className="text-gray-400"
        />
      ))}
      {/* Axis lines + labels */}
      {axes.map((label, i) => {
        const p = pointOnAxis(i, axes.length, 100, radius, center);
        const labelPos = pointOnAxis(i, axes.length, 118, radius, center);
        return (
          <g key={label}>
            <line x1={center} y1={center} x2={p.x} y2={p.y} stroke="currentColor" strokeOpacity={0.12} className="text-gray-400" />
            <text
              x={labelPos.x}
              y={labelPos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-gray-500"
              style={{ fontSize: 9 }}
            >
              {label}
            </text>
          </g>
        );
      })}
      {/* Series B (behind) */}
      <polygon
        points={polygonPoints(seriesB, radius, center)}
        fill={colorB}
        fillOpacity={0.18}
        stroke={colorB}
        strokeWidth={1.5}
      />
      {/* Series A (front) */}
      <polygon
        points={polygonPoints(seriesA, radius, center)}
        fill={colorA}
        fillOpacity={0.22}
        stroke={colorA}
        strokeWidth={1.5}
      />
    </svg>
  );
}
