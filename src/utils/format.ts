/** Number, currency and percentage formatting. Indian pharma convention: Cr / Lakh. */

const CRORE = 1e7;
const LAKH = 1e5;

/** Formats an absolute INR value using the Indian crore/lakh convention. */
export function formatValue(value: number | null | undefined, opts: { decimals?: number } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const d = opts.decimals;
  if (abs >= CRORE) return `${sign}₹${(abs / CRORE).toFixed(d ?? (abs / CRORE >= 100 ? 0 : 1))} Cr`;
  if (abs >= LAKH) return `${sign}₹${(abs / LAKH).toFixed(d ?? 1)} L`;
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
}

/** Compact axis label version — no currency symbol repetition noise. */
export function formatValueAxis(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= CRORE) return `${sign}${(abs / CRORE).toFixed(abs / CRORE >= 10 ? 0 : 1)}Cr`;
  if (abs >= LAKH) return `${sign}${(abs / LAKH).toFixed(0)}L`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(0)}K`;
  return `${sign}${Math.round(abs)}`;
}

export function formatUnits(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e7) return `${(value / 1e7).toFixed(2)} Cr units`;
  if (abs >= 1e5) return `${(value / 1e5).toFixed(2)} L units`;
  return `${Math.round(value).toLocaleString('en-IN')} units`;
}

export function formatPct(
  value: number | null | undefined,
  opts: { decimals?: number; signed?: boolean; suffix?: string } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const d = opts.decimals ?? 1;
  const sign = opts.signed && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(d)}${opts.suffix ?? '%'}`;
}

/** Percentage-point deltas (share change, growth gap) always carry a sign and "pp". */
export function formatPp(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)} pp`;
}

export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString('en-IN');
}

export function formatRank(rank: number | null | undefined): string {
  if (rank === null || rank === undefined || !Number.isFinite(rank)) return '—';
  return `#${rank}`;
}

/** Direction of a number, for colour and icon selection. Zero-ish counts as flat. */
export function tone(value: number | null | undefined, epsilon = 0.05): 'positive' | 'negative' | 'neutral' {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'neutral';
  if (value > epsilon) return 'positive';
  if (value < -epsilon) return 'negative';
  return 'neutral';
}

export function toneClass(value: number | null | undefined, epsilon = 0.05): string {
  const t = tone(value, epsilon);
  return t === 'positive' ? 'pos' : t === 'negative' ? 'neg' : 'flat';
}

/** Truncates long brand names for axis labels without cutting mid-word where avoidable. */
export function truncate(text: string, max = 18): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function pluralise(count: number, singular: string, plural?: string): string {
  return `${formatInt(count)} ${count === 1 ? singular : plural ?? `${singular}s`}`;
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
