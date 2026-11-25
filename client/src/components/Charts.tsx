import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const AXIS = { fontSize: 11, fill: '#667089' };
const tooltipStyle = {
  contentStyle: { borderRadius: 10, border: '1px solid #DCE1EC', boxShadow: '0 12px 32px -12px rgba(17,27,68,.28)', fontSize: 12 },
  labelStyle: { fontWeight: 700, color: '#151B2B' },
  cursor: { fill: 'rgba(36,73,216,0.06)' },
};

export interface BarSeries {
  key: string;
  label: string;
  color?: string;
}


export function TrendBars({ data, xKey, series, height = 220, formatX }: {
  data: Record<string, unknown>[];
  xKey: string;
  series: BarSeries[];
  height?: number;
  formatX?: (v: string) => string;
}) {
  const palette = ['#2449D8', '#9AB4FB', '#1B2C6E'];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -24 }} barGap={2}>
        <CartesianGrid vertical={false} stroke="#EBEEF5" />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={formatX} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
        <Tooltip {...tooltipStyle} labelFormatter={(v) => (formatX ? formatX(String(v)) : String(v))} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? palette[i % palette.length]} radius={[4, 4, 0, 0]} maxBarSize={28} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function BurndownChart({ data, unit, height = 260, formatX }: {
  data: { day: string; ideal: number; remaining: number | null }[];
  unit: string;
  height?: number;
  formatX?: (v: string) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid vertical={false} stroke="#EBEEF5" />
        <XAxis dataKey="day" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={formatX} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
        <Tooltip {...tooltipStyle} cursor={{ stroke: '#C5D4FE' }} labelFormatter={(v) => (formatX ? formatX(String(v)) : String(v))} formatter={(v, n) => [`${v} ${unit}`, n]} />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        <Line type="linear" dataKey="ideal" name="Idéal" stroke="#9AB4FB" strokeDasharray="5 4" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="remaining" name="Reste à faire" stroke="#2449D8" strokeWidth={2.5} dot={{ r: 3, fill: '#2449D8' }} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}


/** Barres horizontales simples (répartition par type, par personne…). */
export function HBars({ items, max }: { items: { label: string; value: number; sub?: string }[]; max?: number }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
            <span className="truncate font-semibold text-ink-800">{i.label}</span>
            <span className="shrink-0 tabular-nums text-ink-500">
              <strong className="text-ink-900">{i.value}</strong>
              {i.sub && <span className="ml-1">{i.sub}</span>}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${(i.value / top) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
