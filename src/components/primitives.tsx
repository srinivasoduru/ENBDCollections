import type { ReactNode } from 'react';

interface HeroProps {
  eyebrow: string;
  title: string;
  lede: string;
  /** The Proposition hero runs slightly larger than the other five. */
  lead?: boolean;
  ledeWidth?: number;
}

export function Hero({ eyebrow, title, lede, lead = false, ledeWidth }: HeroProps) {
  return (
    <section className={'hero' + (lead ? ' hero--lead' : '')}>
      <div className="shell hero__inner">
        <div className="hero__eyebrow">{eyebrow}</div>
        <h1 className="hero__title">{title}</h1>
        <p className="hero__lede" style={ledeWidth ? { maxWidth: ledeWidth } : undefined}>
          {lede}
        </p>
      </div>
    </section>
  );
}

interface SectionHeadProps {
  title: string;
  meta?: string;
  /** Tightens the gap when a lede paragraph follows immediately. */
  flush?: boolean;
}

export function SectionHead({ title, meta, flush = false }: SectionHeadProps) {
  return (
    <div className="section-head" style={flush ? { marginBottom: 8 } : undefined}>
      <h2 className="section-head__title">{title}</h2>
      {meta && <div className="section-head__meta">{meta}</div>}
    </div>
  );
}

interface StanceCardProps {
  kicker: string;
  /** Colour of the top rule. */
  accent: string;
  title: string;
  body: string;
  compact?: boolean;
  /** Defaults to the accent; the gate cards keep a grey kicker over a coloured rule. */
  kickerColor?: string;
}

export function StanceCard({
  kicker,
  accent,
  title,
  body,
  compact = false,
  kickerColor,
}: StanceCardProps) {
  return (
    <article className={'stance' + (compact ? ' stance--compact' : '')} style={{ borderTopColor: accent }}>
      <div className="stance__kicker" style={{ color: kickerColor ?? accent }}>
        {kicker}
      </div>
      <h3 className="stance__title">{title}</h3>
      <p className="stance__body">{body}</p>
    </article>
  );
}

/** A plain card without the coloured top rule — used where the kicker is grey. */
export function PlainCard({ kicker, title, body }: { kicker: string; title: string; body: string }) {
  return (
    <article className="stance stance--compact" style={{ borderTop: '1px solid var(--line)' }}>
      <div className="stance__kicker">{kicker}</div>
      <h3 className="stance__title">{title}</h3>
      <p className="stance__body">{body}</p>
    </article>
  );
}

export function Panel({
  title,
  children,
  wideHead = false,
}: {
  title: string;
  children: ReactNode;
  wideHead?: boolean;
}) {
  return (
    <div className="panel">
      <div className={'panel__head' + (wideHead ? ' panel__head--wide' : '')}>{title}</div>
      {children}
    </div>
  );
}

/** Horizontal meter used by the journey tally and the impact breakdown. */
export function Meter({
  label,
  value,
  width,
  color,
}: {
  label: string;
  value: string;
  width: string;
  color: string;
}) {
  return (
    <div className="meter">
      <div className="meter__head">
        <span>{label}</span>
        <b>{value}</b>
      </div>
      <div className="meter__rail">
        <div className="meter__fill" style={{ width, background: color }} />
      </div>
    </div>
  );
}
