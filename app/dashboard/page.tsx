import Link from "next/link";
import { ActivityList } from "@/components/activity-list";
import { BatteryMeter } from "@/components/battery-meter";
import { Flash } from "@/components/flash";
import { ReceivePanel } from "@/components/receive-panel";
import { WalletActions } from "@/components/wallet-actions";
import { currentUser } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { networkPill } from "@/lib/ethereum";
import { formatUsdt, todayUtc } from "@/lib/money";
import { accountOf, listActivity, payoutPreview, shareForUser } from "@/lib/platform";
import { redirect } from "next/navigation";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/");
  const params = await searchParams;
  const db = getDb();
  const account = accountOf(db, user.id);
  const preview = payoutPreview(db);
  const share = shareForUser(preview, user.id);
  const activity = listActivity(db, user.id).slice(0, 6);
  const totalCents = account.availableCents + account.principalCents + account.pendingCents;

  return (
    <>
      <div className="screen-title row-between">
        <div>
          <p className="eyebrow">Portfolio</p>
          <h1>{user.name}</h1>
        </div>
        <span className="pill">{networkPill()}</span>
      </div>
      <Flash error={params.error} notice={params.notice} />

      <section className="wallet-hero portfolio-hero">
        <BatteryMeter
          availableCents={account.availableCents}
          principalCents={account.principalCents}
          pendingCents={account.pendingCents}
          label={formatUsdt(totalCents)}
        />
        <WalletActions receive={<ReceivePanel address={user.depositAddress} embedded />} />
      </section>

      <section className="cell-strip" aria-label="Portfolio status">
        <article className="cell-card">
          <div className="cell-bar" style={{ ["--fill" as string]: packFill(account.principalCents) }} />
          <p className="eyebrow">Invested</p>
          <p className="figure">{formatUsdt(account.principalCents)}</p>
          <p className="quiet">Principal</p>
        </article>
        <article className="cell-card">
          <div className="cell-bar" style={{ ["--fill" as string]: packFill(account.pendingCents) }} />
          <p className="eyebrow">Pending</p>
          <p className="figure">{formatUsdt(account.pendingCents)}</p>
          <p className="quiet">Withdrawals</p>
        </article>
        <article className="cell-card">
          <div className="cell-bar" style={{ ["--fill" as string]: packFill(share.capCents) }} />
          <p className="eyebrow">Daily yield</p>
          <p className="figure">{formatUsdt(share.capCents)}</p>
          <p className="quiet">Cap {todayUtc()}</p>
        </article>
      </section>

      <div className="section-head">
        <h2>Recent</h2>
        <Link href="/activity">See all</Link>
      </div>
      <ActivityList items={activity} />

      <p className="funding-link">
        <Link href="/transparency">Funding transparency</Link>
      </p>
    </>
  );
}

function packFill(cents: number): string {
  if (cents <= 0) return "8%";
  const pct = Math.min(100, Math.max(18, Math.round(Math.log10(cents + 10) * 28)));
  return `${pct}%`;
}
