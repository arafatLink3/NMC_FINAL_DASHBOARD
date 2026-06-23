// Tiny dependency-free SVG chart helpers (line + pie). Re-renders when the
// theme changes so axis/label colours stay in sync.

import { useEffect, useMemo, useState } from 'react';
import { bus } from '../lib/bus';
import '../styles/charts.css';

export type LinePoint = { label: string; value: number };
export type PieSlice = { label: string; value: number; color?: string };

const PALETTE = ['#4ea2ff', '#57d9a3', '#ffb74d', '#ff6b6b', '#b08fff', '#5fc1ff', '#ffd166', '#06d6a0', '#ef476f', '#8d99ae'];

function useThemeTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => bus.on('nmc:themechange', () => setTick((t) => t + 1)), []);
  return tick;
}

export function LineChart({ data, height = 240, ariaLabel }: { data: LinePoint[]; height?: number; ariaLabel?: string }) {
  useThemeTick();
  const { points, path, area, min, max, w, h, padX, padY } = useMemo(() => {
    const w = 600, h = height;
    const padX = 32, padY = 24;
    if (data.length === 0) return { points: '', path: '', area: '', min: 0, max: 0, w, h, padX, padY };
    const values = data.map((d) => d.value);
    const min = Math.min(0, ...values);
    const max = Math.max(1, ...values);
    const span = max - min || 1;
    const stepX = (w - padX * 2) / Math.max(1, data.length - 1);
    const coords = data.map((d, i) => {
      const x = padX + i * stepX;
      const y = h - padY - ((d.value - min) / span) * (h - padY * 2);
      return { x, y };
    });
    const points = coords.map((p) => `${p.x},${p.y}`).join(' ');
    const path = coords.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const area = `${path} L ${(coords[coords.length - 1]?.x ?? padX)} ${h - padY} L ${(coords[0]?.x ?? padX)} ${h - padY} Z`;
    return { points, path, area, min, max, w, h, padX, padY };
  }, [data, height]);

  if (data.length === 0) {
    return <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel ?? 'empty chart'}><text x={w / 2} y={h / 2} textAnchor="middle" className="chart-empty">No data</text></svg>;
  }

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => min + ((max - min) * i) / ticks);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel} preserveAspectRatio="none">
      {yTicks.map((v, i) => {
        const y = h - padY - ((v - min) / (max - min || 1)) * (h - padY * 2);
        return (
          <g key={i}>
            <line className="chart-grid-line" x1={padX} y1={y} x2={w - padX} y2={y} />
            <text className="chart-axis-text" x={padX - 6} y={y + 3} textAnchor="end">{Math.round(v)}</text>
          </g>
        );
      })}
      <path className="chart-line-area" d={area} />
      <path className="chart-line" d={path} />
      {data.map((d, i) => {
        const stepX = (w - padX * 2) / Math.max(1, data.length - 1);
        const x = padX + i * stepX;
        return (
          <g key={i}>
            <circle className="chart-point" cx={x} cy={h - padY - ((d.value - min) / (max - min || 1)) * (h - padY * 2)} r={3} />
            <text className="chart-axis-text" x={x} y={h - 6} textAnchor="middle">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function PieChart({ data, height = 240, ariaLabel }: { data: PieSlice[]; height?: number; ariaLabel?: string }) {
  useThemeTick();
  const { slices, total, w, h, cx, cy, r } = useMemo(() => {
    const w = 320, h = height;
    const cx = w / 2, cy = h / 2;
    const r = Math.min(cx, cy) - 10;
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    let angle = -Math.PI / 2;
    const slices = data.map((d, i) => {
      const frac = d.value / total;
      const a0 = angle;
      const a1 = angle + frac * Math.PI * 2;
      angle = a1;
      const x0 = cx + r * Math.cos(a0);
      const y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1);
      const y1 = cy + r * Math.sin(a1);
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const path = total === data.length && data.length === 1
        ? `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`
        : `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
      const midA = (a0 + a1) / 2;
      const lx = cx + (r * 0.6) * Math.cos(midA);
      const ly = cy + (r * 0.6) * Math.sin(midA);
      return { ...d, path, lx, ly, color: d.color ?? PALETTE[i % PALETTE.length], pct: frac * 100 };
    });
    return { slices, total, w, h, cx, cy, r };
  }, [data, height]);

  if (data.length === 0 || total === 0) {
    return <svg viewBox={`0 0 320 ${height}`} role="img" aria-label={ariaLabel}><text x={160} y={height / 2} textAnchor="middle" className="chart-empty">No data</text></svg>;
  }

  return (
    <svg viewBox={`0 0 320 ${height}`} role="img" aria-label={ariaLabel}>
      {slices.map((s, i) => (
        <g key={i}>
          <path d={s.path} fill={s.color} />
          {slices.length <= 6 && s.pct > 5 && (
            <text className="chart-pie-label" x={s.lx} y={s.ly} textAnchor="middle">{Math.round(s.pct)}%</text>
          )}
        </g>
      ))}
      <g>
        {slices.map((s, i) => (
          <g key={i} transform={`translate(220, ${10 + i * 14})`}>
            <rect width="10" height="10" fill={s.color} />
            <text className="chart-legend" x="14" y="9">{s.label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
