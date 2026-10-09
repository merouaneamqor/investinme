type BatteryMeterProps = {
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
}: BatteryMeterProps) {
  const total = availableCents + principalCents + pendingCents;
  const chargePct = total > 0 ? clampPercent((availableCents / total) * 100) : 0;
  const investedPct = total > 0 ? clampPercent((principalCents / total) * 100) : 0;
  const pendingPct = total > 0 ? Math.max(0, 100 - chargePct - investedPct) : 0;

  return (
    <div className="battery-meter">
      <div className="battery-shell" aria-hidden="true">
        <div className="battery-body">
          <div className="battery-fill available" style={{ width: `${chargePct}%` }} />
          <div className="battery-fill invested" style={{ width: `${investedPct}%` }} />
          <div className="battery-fill pending" style={{ width: `${pendingPct}%` }} />
          <div className="battery-cells">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="battery-cap" />
      </div>
      <div className="battery-readout">
        <p className="eyebrow">Charge available</p>
        <p className="hero-figure">{label}</p>
        <p className="battery-pct">{chargePct}% liquid · {investedPct}% in cells</p>
      </div>
    </div>
  );
}
