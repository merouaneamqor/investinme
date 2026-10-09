import { formatUsdt } from "@/lib/money";

type PortfolioMeterProps = {
  availableCents: number;
  principalCents: number;
  pendingCents: number;
  label: string;
};

function clampPercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(100, Math.round(value));
}

export function BatteryMeter({
  availableCents,
  principalCents,
  pendingCents,
  label,
}: PortfolioMeterProps) {
  const total = availableCents + principalCents + pendingCents;
  const availablePct = total > 0 ? clampPercent((availableCents / total) * 100) : 0;
  const investedPct = total > 0 ? clampPercent((principalCents / total) * 100) : 0;

  return (
    <div className="portfolio-meter">
      <div className="portfolio-readout">
        <p className="portfolio-total-label">Estimated balance</p>
        <p className="hero-figure">{label}</p>
        <p className="portfolio-pct">
          {availablePct}% available · {investedPct}% invested
        </p>
      </div>
      <div className="portfolio-split">
        <article>
          <p className="eyebrow">Available</p>
          <p className="figure">{formatUsdt(availableCents)}</p>
        </article>
        <article>
          <p className="eyebrow">Invested</p>
          <p className="figure">{formatUsdt(principalCents)}</p>
        </article>
      </div>
    </div>
  );
}
