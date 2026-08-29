export type IconName =
  | 'overview'
  | 'market'
  | 'brand'
  | 'molecule'
  | 'competitors'
  | 'opportunities'
  | 'insights'
  | 'explorer'
  | 'upload'
  | 'methodology'
  | 'arrowUp'
  | 'arrowDown'
  | 'arrowRight'
  | 'flat'
  | 'alert'
  | 'check'
  | 'info'
  | 'close'
  | 'download'
  | 'file'
  | 'reset'
  | 'chevronDown'
  | 'external';

const PATHS: Record<IconName, JSX.Element> = {
  overview: <path d="M3 3h7v7H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 14h7v7H3z" />,
  market: <path d="M3 20h18M6 20v-6M11 20V8M16 20v-9M21 20V4" />,
  brand: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.6" fill="currentColor" /></>,
  molecule: <><circle cx="6" cy="7" r="2.6" /><circle cx="17.5" cy="6.5" r="2.2" /><circle cx="12" cy="17" r="2.8" /><path d="M8.2 8.6 10.6 14.6M8.4 6.9 15.3 6.6M15.9 8.4 13.4 14.8" /></>,
  competitors: <><circle cx="8" cy="9" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M2.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5M15 20c0-2.2 1.4-3.8 3.4-3.8 1.6 0 3.1 1 3.1 3.8" /></>,
  opportunities: <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>,
  insights: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2h5c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" /></>,
  explorer: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11M3 14.5h18" /></>,
  upload: <><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /><path d="M12 15V4M8 8l4-4 4 4" /></>,
  methodology: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M8 7.5h7M8 11h7" /></>,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  flat: <path d="M5 12h14" />,
  alert: <><path d="M12 4.5 2.8 20h18.4z" /><path d="M12 10v4.5M12 17.2v.1" /></>,
  check: <path d="M4.5 12.5l5 5 10-11" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.8v.1" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  download: <><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" /><path d="M4 19h16" /></>,
  file: <><path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" /><path d="M13 3v6h6" /></>,
  reset: <><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><path d="M3 4v5h5" /></>,
  chevronDown: <path d="M5 9l7 7 7-7" />,
  external: <><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 13.5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H11" /></>,
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

/** Single-stroke icon set. No icon ever carries meaning alone — always beside a label. */
export function Icon({ name, size = 16, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** Direction glyph for a signed number. Paired with the number itself, never alone. */
export function TrendIcon({ value, size = 13 }: { value: number | null | undefined; size?: number }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (Math.abs(value) < 0.05) return <Icon name="flat" size={size} strokeWidth={2} />;
  return <Icon name={value > 0 ? 'arrowUp' : 'arrowDown'} size={size} strokeWidth={2.1} />;
}
