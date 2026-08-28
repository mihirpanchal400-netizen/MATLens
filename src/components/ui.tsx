import React from 'react';
import { Icon, type IconName, TrendIcon } from './Icon';
import { toneClass } from '../utils/format';

/* ---------------- Card ---------------- */

export function Card({
  title,
  subtitle,
  actions,
  children,
  flush,
  className,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={`card ${className ?? ''}`}>
      {(title || actions) && (
        <header className="card__head">
          <div style={{ minWidth: 0 }}>
            {title && <h3 className="t-h2">{title}</h3>}
            {subtitle && <p className="t-sub" style={{ marginTop: 2 }}>{subtitle}</p>}
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      <div className={`card__body ${flush ? 'card__body--flush' : ''}`}>{children}</div>
    </section>
  );
}

/* ---------------- Section ---------------- */

export function Section({
  title,
  subtitle,
  aside,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="section">
      <div className="section__head">
        <div>
          <h2 className="t-h2">{title}</h2>
          {subtitle && <p className="t-sub" style={{ marginTop: 2 }}>{subtitle}</p>}
        </div>
        {aside && <div className="section__aside">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/* ---------------- Badge ---------------- */

export type BadgeTone = 'neutral' | 'good' | 'warning' | 'serious' | 'critical' | 'accent' | 'synthetic';

export function Badge({
  children,
  tone = 'neutral',
  icon,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  icon?: IconName;
}) {
  return (
    <span className={`badge badge--${tone}`}>
      {icon && <Icon name={icon} size={11} strokeWidth={2.2} />}
      {children}
    </span>
  );
}

/* ---------------- Provenance ---------------- */

export type Provenance = 'observed' | 'derived' | 'interpretation' | 'hypothesis';

const PROV_LABEL: Record<Provenance, string> = {
  observed: 'Observed data',
  derived: 'Derived metric',
  interpretation: 'Interpretation',
  hypothesis: 'Hypothesis',
};

/** Marks whether a statement came from the file, from arithmetic, or from reading. */
export function ProvenanceTag({ kind, label }: { kind: Provenance; label?: string }) {
  return <span className={`prov prov--${kind}`}>{label ?? PROV_LABEL[kind]}</span>;
}

/* ---------------- KPI tile ---------------- */

export function KpiTile({
  label,
  value,
  foot,
  delta,
  deltaLabel,
  unavailableReason,
  tooltip,
}: {
  label: string;
  value?: React.ReactNode;
  foot?: React.ReactNode;
  delta?: number | null;
  deltaLabel?: string;
  unavailableReason?: string;
  tooltip?: string;
}) {
  return (
    <div className="kpi" title={tooltip}>
      <div className="kpi__label">{label}</div>
      {unavailableReason ? (
        <div className="kpi__unavailable">{unavailableReason}</div>
      ) : (
        <>
          <div className="kpi__value">{value}</div>
          {(foot || deltaLabel) && (
            <div className="kpi__foot">
              {deltaLabel && (
                <span className={`row ${toneClass(delta ?? null)}`} style={{ gap: 3, fontWeight: 600 }}>
                  <TrendIcon value={delta ?? null} />
                  {deltaLabel}
                </span>
              )}
              {foot}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------- Stat (inline metric) ---------------- */

export function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'positive' | 'negative' | 'neutral';
  hint?: string;
}) {
  const cls = tone === 'positive' ? 'pos' : tone === 'negative' ? 'neg' : '';
  return (
    <div title={hint}>
      <div className="evidence__label">{label}</div>
      <div className={`evidence__value ${cls}`}>{value}</div>
    </div>
  );
}

/* ---------------- Empty state ---------------- */

export function EmptyState({
  icon = 'file',
  title,
  message,
  action,
}: {
  icon?: IconName;
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty__icon">
        <Icon name={icon} size={42} strokeWidth={1.3} />
      </div>
      <h3 className="t-h2" style={{ marginBottom: 6 }}>{title}</h3>
      <p className="t-sub" style={{ maxWidth: 460, margin: '0 auto 18px' }}>{message}</p>
      {action}
    </div>
  );
}

/* ---------------- Callout ---------------- */

export function Callout({
  tone = 'neutral',
  title,
  children,
}: {
  tone?: 'neutral' | 'warning' | 'accent' | 'critical';
  title?: string;
  children: React.ReactNode;
}) {
  const cls = tone === 'neutral' ? '' : `callout--${tone}`;
  return (
    <div className={`callout ${cls}`}>
      {title && <strong style={{ display: 'block', marginBottom: 3 }}>{title}</strong>}
      {children}
    </div>
  );
}

/* ---------------- Formula ---------------- */

export function Formula({ children }: { children: React.ReactNode }) {
  return <pre className="formula">{children}</pre>;
}

/* ---------------- Modal ---------------- */

export function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Details'}
      >
        <header className="modal__head">
          <div style={{ minWidth: 0 }}>
            <h3 className="t-h2">{title}</h3>
            {subtitle && <p className="t-sub" style={{ marginTop: 3 }}>{subtitle}</p>}
          </div>
          <button className="btn btn--ghost btn--sm" onClick={onClose} style={{ marginLeft: 'auto' }} aria-label="Close">
            <Icon name="close" size={15} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- Select field ---------------- */

export function SelectField({
  label,
  value,
  options,
  onChange,
  allLabel = 'All',
  disabled,
}: {
  label: string;
  value: string | null;
  options: string[];
  onChange: (value: string | null) => void;
  allLabel?: string;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <select
        className="select"
        value={value ?? ''}
        disabled={disabled || options.length === 0}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ---------------- Mini bar (in-table magnitude) ---------------- */

export function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="minibar" aria-hidden="true">
      <div className="minibar__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ---------------- Delta text ---------------- */

export function Delta({ value, children }: { value: number | null | undefined; children: React.ReactNode }) {
  return (
    <span className={`row ${toneClass(value ?? null)}`} style={{ gap: 3, display: 'inline-flex', fontWeight: 600 }}>
      <TrendIcon value={value ?? null} />
      {children}
    </span>
  );
}
