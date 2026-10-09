import { LedgerTable } from "@/components/ledger-table";
import { currentUser } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { formatUsdt } from "@/lib/money";
import {
  listPayoutRuns,
  listPlatformEntries,
  REVENUE_WALLET_CODE,
  REWARD_WALLET_CODE,
  snapshot,
} from "@/lib/platform";
import { hotWalletAddress, networkPill } from "@/lib/ethereum";
import { redirect } from "next/navigation";

export default async function TransparencyPage() {
  const user = await currentUser();
  if (!user) redirect("/");
  const db = getDb();
  const totals = snapshot(db);
  const runs = listPayoutRuns(db);
  const entries = listPlatformEntries(db);
  const hot = hotWalletAddress();

  return (
    <>
      <div className="row-between">
        <div>
          <p className="eyebrow">Funding</p>
          <h1>What can be paid.</h1>
        </div>
        <span className="pill">{networkPill()}</span>
      </div>
      <p className="lede">
        Returns paid ({formatUsdt(totals.returnsPaidCents)}) stay within recorded project revenue (
        {formatUsdt(totals.revenueRecordedCents)}). Referral rewards paid (
        {formatUsdt(totals.referralRewardsPaidCents)}) stay within the referral wallet (
        {formatUsdt(totals.rewardBudgetRecordedCents)}). Investor wallets and principal stay separate.
      </p>
      <section className="balances">
        <article className="card">
          <p className="eyebrow">Revenue wallet {REVENUE_WALLET_CODE}</p>
          <p className="figure">{formatUsdt(totals.undistributedRevenueCents)}</p>
          <p className="quiet">Funds daily returns only.</p>
        </article>
        <article className="card">
          <p className="eyebrow">Referral wallet {REWARD_WALLET_CODE}</p>
          <p className="figure">{formatUsdt(totals.rewardBudgetRemainingCents)}</p>
          <p className="quiet">Funds qualified referral rewards only.</p>
        </article>
        <article className="card">
          <p className="eyebrow">Investor wallets</p>
          <p className="figure">{formatUsdt(totals.walletCents)}</p>
          <p className="quiet">Available balances across accounts.</p>
        </article>
        <article className="card">
          <p className="eyebrow">Invested principal</p>
          <p className="figure">{formatUsdt(totals.principalCents)}</p>
          <p className="quiet">Never used to pay returns.</p>
        </article>
      </section>

      <article className="card stack">
        <h2>Platform hot wallet</h2>
        <p className="quiet">Outgoing investor sends leave from this Ethereum address when configured.</p>
        {hot ? <code className="address-block">{hot}</code> : <p>Hot wallet not configured.</p>}
      </article>

      <div className="section-head">
        <h2>Daily distributions</h2>
      </div>
      {runs.length === 0 ? (
        <p className="quiet">No distribution has been run.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Principal in the run</th>
                <th>Cap</th>
                <th>Revenue available</th>
                <th>Posted</th>
                <th>Investors paid</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>{run.runDate}</td>
                  <td className="money">{formatUsdt(run.principalCents)}</td>
                  <td className="money">{formatUsdt(run.capCents)}</td>
                  <td className="money">{formatUsdt(run.revenueAvailableCents)}</td>
                  <td className="money">{formatUsdt(run.distributedCents)}</td>
                  <td>{run.investorCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-head">
        <h2>Revenue and budget entries</h2>
      </div>
      <LedgerTable entries={entries} balanceLabel="Bucket after" />
    </>
  );
}
