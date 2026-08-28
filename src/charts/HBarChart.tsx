import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AXIS_TICK, CHART, ChartFrame, ChartTooltip, RoundedBar } from './chartTheme';
import { truncate } from '../utils/format';

export interface HBarDatum {
  name: string;
  value: number;
  /** Extra rows shown in the tooltip. */
  detail?: Array<{ label: string; value: string }>;
  emphasis?: boolean;
}

interface HBarChartProps {
  data: HBarDatum[];
  /** Formats both the axis ticks and the tooltip value. */
  format: (value: number) => string;
  valueLabel: string;
  /** Draws a dividing reference line, e.g. market growth. */
  reference?: { value: number; label: string };
  /** Diverging colours around zero instead of a single sequential hue. */
  diverging?: boolean;
  height?: number;
  /** Direct-label the bar ends. Used on short lists only. */
  showValueLabels?: boolean;
}

export function HBarChart({
  data,
  format,
  valueLabel,
  reference,
  diverging = false,
  height,
  showValueLabels = false,
}: HBarChartProps) {
  if (!data.length) {
    return (
      <p className="t-sub" style={{ padding: '24px 0', textAlign: 'center' }}>
        Not enough data to draw this chart.
      </p>
    );
  }

  const rowHeight = 26;
  const chartHeight = height ?? Math.max(160, data.length * rowHeight + 46);
  const labelWidth = Math.min(168, Math.max(96, ...data.map((d) => Math.min(d.name.length, 22) * 7)));
  const hasNegative = data.some((d) => d.value < 0);

  const colourFor = (datum: HBarDatum) => {
    if (datum.emphasis) return CHART.emphasis;
    if (diverging) return datum.value >= 0 ? CHART.diverging.positive : CHART.diverging.negative;
    return CHART.sequential[2];
  };

  return (
    <ChartFrame height={chartHeight}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: showValueLabels ? 62 : 16, bottom: 18, left: 4 }}
          barCategoryGap={4}
        >
          <CartesianGrid horizontal={false} stroke={CHART.grid} />
          <XAxis
            type="number"
            tickFormatter={format}
            tick={AXIS_TICK}
            axisLine={{ stroke: CHART.axis }}
            tickLine={false}
            height={20}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={labelWidth}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: string) => truncate(value, 22)}
            interval={0}
          />
          {(hasNegative || diverging) && <ReferenceLine x={0} stroke={CHART.axis} />}
          {reference && (
            <ReferenceLine
              x={reference.value}
              stroke={CHART.inkMuted}
              strokeWidth={1}
              label={{ value: reference.label, position: 'top', fill: CHART.inkMuted, fontSize: 11 }}
            />
          )}
          <Tooltip
            cursor={{ fill: 'rgba(11,18,32,.04)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const datum = payload[0].payload as HBarDatum;
              return (
                <ChartTooltip
                  title={datum.name}
                  rows={[
                    { label: valueLabel, value: format(datum.value), swatch: colourFor(datum) },
                    ...(datum.detail ?? []),
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey="value"
            isAnimationActive={false}
            shape={(props: any) => <RoundedBar {...props} negative={(props.payload as HBarDatum).value < 0} />}
            label={
              showValueLabels
                ? {
                    position: 'right',
                    formatter: (value: number) => format(value),
                    fill: CHART.inkMuted,
                    fontSize: 11.5,
                  }
                : undefined
            }
          >
            {data.map((datum) => (
              <Cell key={datum.name} fill={colourFor(datum)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
