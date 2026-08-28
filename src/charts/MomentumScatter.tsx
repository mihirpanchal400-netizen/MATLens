import {
  CartesianGrid,
  Cell,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { AXIS_TICK, CHART, ChartFrame, ChartTooltip } from './chartTheme';
import { formatPct, formatValue } from '../utils/format';

export interface MomentumPoint {
  name: string;
  share: number;
  growth: number;
  value: number;
  company: string | null;
  emphasis?: boolean;
}

/**
 * Share (x) against growth (y), split into the four competitive quadrants by the
 * market growth rate and the median share of the plotted set.
 *
 * Colour carries only two states here — the focus brand and everyone else — so
 * the quadrant meaning is read from position and the labelled backdrop, not from
 * a four-colour key that would fail all-pairs colour separation.
 */
export function MomentumScatter({
  points,
  marketGrowth,
  shareSplit,
  onSelect,
}: {
  points: MomentumPoint[];
  marketGrowth: number;
  shareSplit: number;
  onSelect?: (name: string) => void;
}) {
  if (points.length < 3) {
    return (
      <p className="t-sub" style={{ padding: '24px 0', textAlign: 'center' }}>
        At least three brands with growth data are needed to plot a momentum map.
      </p>
    );
  }

  const maxShare = Math.max(...points.map((p) => p.share)) * 1.1;
  const growths = points.map((p) => p.growth);
  const minGrowth = Math.min(...growths, marketGrowth) - 4;
  const maxGrowth = Math.max(...growths, marketGrowth) + 6;

  return (
    <div>
      <ChartFrame height={380}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 18, bottom: 34, left: 8 }}>
            <CartesianGrid stroke={CHART.grid} />
            <ReferenceArea x1={shareSplit} x2={maxShare} y1={marketGrowth} y2={maxGrowth} fill="#1baf7a" fillOpacity={0.05} />
            <ReferenceArea x1={0} x2={shareSplit} y1={marketGrowth} y2={maxGrowth} fill="#2a78d6" fillOpacity={0.045} />
            <ReferenceArea x1={shareSplit} x2={maxShare} y1={minGrowth} y2={marketGrowth} fill="#eda100" fillOpacity={0.05} />
            <XAxis
              type="number"
              dataKey="share"
              domain={[0, maxShare]}
              tick={AXIS_TICK}
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              axisLine={{ stroke: CHART.axis }}
              tickLine={false}
              label={{ value: 'Market share %', position: 'insideBottom', offset: -18, fill: CHART.inkMuted, fontSize: 11.5 }}
            />
            <YAxis
              type="number"
              dataKey="growth"
              domain={[minGrowth, maxGrowth]}
              tick={AXIS_TICK}
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
              axisLine={{ stroke: CHART.axis }}
              tickLine={false}
              width={46}
              label={{ value: 'Growth %', angle: -90, position: 'insideLeft', fill: CHART.inkMuted, fontSize: 11.5 }}
            />
            <ZAxis type="number" dataKey="value" range={[70, 420]} />
            <ReferenceLine
              y={marketGrowth}
              stroke={CHART.inkMuted}
              label={{ value: `Market growth ${formatPct(marketGrowth, { signed: true })}`, position: 'insideTopRight', fill: CHART.inkMuted, fontSize: 11 }}
            />
            <ReferenceLine x={shareSplit} stroke={CHART.axis} />
            <Tooltip
              cursor={{ strokeDasharray: '0', stroke: CHART.axis }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as MomentumPoint;
                return (
                  <ChartTooltip
                    title={point.name}
                    rows={[
                      { label: 'Market share', value: formatPct(point.share, { decimals: 2 }) },
                      { label: 'Growth', value: formatPct(point.growth, { signed: true }) },
                      { label: 'MAT value', value: formatValue(point.value) },
                    ]}
                    note={point.company ?? undefined}
                  />
                );
              }}
            />
            <Scatter
              data={points}
              isAnimationActive={false}
              onClick={(payload: any) => onSelect?.(payload?.name)}
              cursor={onSelect ? 'pointer' : undefined}
            >
              {points.map((point) => (
                <Cell
                  key={point.name}
                  fill={point.emphasis ? CHART.emphasis : CHART.series[0]}
                  fillOpacity={point.emphasis ? 0.95 : 0.55}
                  stroke={CHART.surface}
                  strokeWidth={2}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </ChartFrame>

      <div className="quadrant-legend">
        <div className="quadrant-legend__cell">
          <div className="t-eyebrow">Low share · High growth</div>
          <p className="t-micro">Challengers. Small today, compounding fast.</p>
        </div>
        <div className="quadrant-legend__cell">
          <div className="t-eyebrow">High share · High growth</div>
          <p className="t-micro">Momentum leaders. Setting the category pace.</p>
        </div>
        <div className="quadrant-legend__cell">
          <div className="t-eyebrow">Low share · Low growth</div>
          <p className="t-micro">Tail brands. Limited influence on category direction.</p>
        </div>
        <div className="quadrant-legend__cell">
          <div className="t-eyebrow">High share · Low growth</div>
          <p className="t-micro">Incumbents under pressure. Scale without momentum.</p>
        </div>
      </div>
      <p className="t-micro" style={{ marginTop: 8 }}>
        Bubble size is MAT value. The vertical split is the median share of the plotted brands
        ({formatPct(shareSplit, { decimals: 2 })}); the horizontal split is market growth.
      </p>
    </div>
  );
}
