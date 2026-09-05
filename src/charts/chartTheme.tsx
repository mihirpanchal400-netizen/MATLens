import React from 'react';

/**
 * Chart parameters, mirrored from the CSS tokens so SVG attributes get literal
 * colours. Categorical hues are assigned in fixed slot order and never cycled.
 */
export const CHART = {
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  /** Neutral mark for "everyone else" when one entity is emphasised. */
  muted: '#bfccd8',
  emphasis: '#0a5f59',
  diverging: { positive: '#2a78d6', negative: '#d03b3b', mid: '#f0efec' },
  sequential: ['#9ec5f4', '#5598e7', '#2a78d6', '#184f95'],
  grid: '#eaeff4',
  axis: '#cbd6df',
  ink: '#0a1620',
  inkMuted: '#54687b',
  surface: '#ffffff',
} as const;

export const AXIS_TICK = { fontSize: 11.5, fill: CHART.inkMuted } as const;

interface TooltipRow {
  label: string;
  value: string;
  swatch?: string;
}

export function ChartTooltip({ title, rows, note }: { title: string; rows: TooltipRow[]; note?: string }) {
  return (
    <div className="tooltip">
      <div className="tooltip__title">{title}</div>
      {rows.map((row) => (
        <div className="tooltip__row" key={row.label}>
          <span className="row" style={{ gap: 6 }}>
            {row.swatch && <span className="dot" style={{ background: row.swatch, width: 7, height: 7 }} />}
            {row.label}
          </span>
          <b>{row.value}</b>
        </div>
      ))}
      {note && <div className="t-micro" style={{ marginTop: 5 }}>{note}</div>}
    </div>
  );
}

/**
 * Bar shape with a 4px rounded data-end anchored to the baseline. Handles the
 * diverging case: a negative bar rounds on the left, a positive one on the right.
 */
export function RoundedBar(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  radius?: number;
  negative?: boolean;
}) {
  const { x = 0, y = 0, width = 0, height = 0, fill, radius = 4, negative = false } = props;
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  if (w <= 0 || h <= 0) return null;
  const r = Math.min(radius, w, h / 2);

  const path = negative
    ? `M ${x + w} ${y} H ${x + r} A ${r} ${r} 0 0 0 ${x} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 0 ${x + r} ${y + h} H ${x + w} Z`
    : `M ${x} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x} Z`;

  return <path d={path} fill={fill} />;
}

export function Legend({ items }: { items: Array<{ label: string; colour: string; shape?: 'dot' | 'bar' }> }) {
  return (
    <div className="legend" style={{ marginTop: 10 }}>
      {items.map((item) => (
        <span className="legend__item" key={item.label}>
          <span
            className="dot"
            style={{
              background: item.colour,
              width: item.shape === 'bar' ? 12 : 8,
              height: item.shape === 'bar' ? 8 : 8,
              borderRadius: item.shape === 'bar' ? 2 : 999,
            }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** Wraps a chart so its x-axis band is always inside the sized container. */
export function ChartFrame({ height, children }: { height: number; children: React.ReactNode }) {
  return (
    <div className="chart-frame" style={{ height }}>
      {children}
    </div>
  );
}
