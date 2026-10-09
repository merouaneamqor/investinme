import {
  budgetAction,
  payoutAction,
  revenueAction,
  setWithdrawalsAction,
  simulateDepositAction,
  syncChainAction,
} from "@/app/actions";
import { Flash } from "@/components/flash";
import { currentUser } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import {
  fetchHotWalletEthLabel,
  fetchHotWalletUsdtCents,
  hasHotWallet,
  hasMasterSeed,
  hotWalletAddress,
  networkPill,
} from "@/lib/ethereum";
import { formatUsdt, formatWhen, todayUtc } from "@/lib/money";
import {
  findUserById,
  listWithdrawals,
  payoutPreview,
  snapshot,
  withdrawalsEnabled,
} from "@/lib/platform";
import { redirect } from "next/navigation";

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/");
  if (!user.isOperator) redirect("/dashboard?error=Only the project operator can record funding.");
  const params = await searchParams;
  const db = getDb();
  const totals = snapshot(db);
  const preview = payoutPreview(db);
  const rows = preview.holders.map((holder) => ({
    ...holder,
    name: findUserById(db, holder.userId)?.name ?? "Investor",
  }));
  const withdrawals = listWithdrawals(db).slice(0, 20);
  const sendsOpen = withdrawalsEnabled(db);
  const hot = hotWalletAddress();
  const hotBalance = await fetchHotWalletUsdtCents();
  const hotEth = await fetchHotWalletEthLabel();
  const investors = db
    .prepare("SELECT id, name, deposit_address FROM users WHERE is_operator = 0 ORDER BY id")
    .all()
    .map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      depositAddress: row.deposit_address == null ? null : String(row.deposit_address),
    }));

  return (
    <>
      <div className="row-between">
        <div>
          <p className="eyebrow">Operations</p>
          <h1>Admin console</h1>
        </div>
        <span className="pill">{networkPill()}</span>
      </div>
      <Flash error={params.error} notice={params.notice} />
      <p className="lede">
        Undistributed project revenue is {formatUsdt(totals.undistributedRevenueCents)}. Referral
        wallet remaining is {formatUsdt(totals.rewardBudgetRemainingCents)}. Investor principal of{" "}
        {formatUsdt(totals.principalCents)} cannot fund returns.
      </p>

      <section className="forms">
        <form action={setWithdrawalsAction} className="card stack">
          <h2>Withdrawals</h2>
          <p className="quiet">
            Status:{" "}
            <span className={`status status-${sendsOpen ? "confirmed" : "failed"}`}>
              {sendsOpen ? "open" : "paused"}
            </span>
            . When paused, investors cannot queue sends and pending sends are not broadcast.
          </p>
          <input type="hidden" name="enabled" value={sendsOpen ? "0" : "1"} />
          <button className={sendsOpen ? "secondary" : "primary"} type="submit">
            {sendsOpen ? "Pause withdrawals" : "Resume withdrawals"}
          </button>
        </form>
      </section>

      <section className="balances">
        <article className="card">
          <p className="eyebrow">Hot wallet USDT</p>
          <p className="figure">
            {hotBalance == null ? "—" : formatUsdt(hotBalance)}
          </p>
          <p className="quiet">
            {hot ? hot : "Not configured"}
            {!hasHotWallet() && process.env.ETH_SIMULATE_TRANSFERS === "1"
              ? " · simulated sends enabled"
              : ""}
          </p>
        </article>
        <article className="card">
          <p className="eyebrow">Hot wallet ETH</p>
          <p className="figure">{hotEth ?? "—"}</p>
          <p className="quiet">Gas for Ethereum USDT transfers.</p>
        </article>
        <article className="card">
          <p className="eyebrow">Master seed</p>
          <p className="figure">{hasMasterSeed() ? "Ready" : "Missing"}</p>
          <p className="quiet">Deposit addresses derive from ETH_MASTER_SEED.</p>
        </article>
        <article className="card">
          <p className="eyebrow">Open sends</p>
          <p className="figure">
            {withdrawals.filter((row) => row.status === "pending" || row.status === "broadcasting").length}
          </p>
          <p className="quiet">Pending or broadcasting withdrawals.</p>
        </article>
      </section>

      <section className="forms">
        <form action={revenueAction} className="card stack">
          <h2>Project revenue</h2>
          <label>
            Amount (USDT)
            <input name="amount" inputMode="decimal" placeholder="50.00" required />
          </label>
          <label>
            Source note
            <input name="note" placeholder="March capacity payment" required />
          </label>
          <button className="primary" type="submit">
            Record revenue
          </button>
        </form>
        <form action={budgetAction} className="card stack">
          <h2>Referral wallet</h2>
          <label>
            Amount (USDT)
            <input name="amount" inputMode="decimal" placeholder="10.00" required />
          </label>
          <label>
            Source note
            <input name="note" placeholder="Prefunded referral budget" required />
          </label>
          <button className="primary" type="submit">
            Add budget
          </button>
        </form>
        <form action={payoutAction} className="card stack">
          <h2>Daily distribution</h2>
          <p className="quiet">
            Posts today’s cap for {todayUtc()} from undistributed project revenue. One run per day.
          </p>
          <button className="primary" type="submit" disabled={Boolean(preview.alreadyRun)}>
            {preview.alreadyRun ? "Already posted today" : "Run today’s distribution"}
          </button>
        </form>
      </section>

      <section className="forms pairs">
        <form action={syncChainAction} className="card stack">
          <h2>Sync Ethereum</h2>
          <p className="quiet">
            Credits confirmed inbound USDT and broadcasts open withdrawals when the hot wallet can
            cover them.
          </p>
          <button className="primary" type="submit">
            Sync now
          </button>
        </form>
        <form action={simulateDepositAction} className="card stack">
          <h2>Simulate inbound deposit</h2>
          <p className="quiet">Local helper. Credits a wallet as if Ethereum confirmed a transfer.</p>
          <label>
            Investor
            <select name="userId" required defaultValue={investors[0]?.id ?? ""}>
              {investors.map((investor) => (
                <option key={investor.id} value={investor.id}>
                  {investor.name}
                  {investor.depositAddress ? "" : " (no address)"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount (USDT)
            <input name="amount" inputMode="decimal" placeholder="100.00" required />
          </label>
          <button className="secondary" type="submit" disabled={investors.length === 0}>
            Credit simulated deposit
          </button>
        </form>
      </section>

      <div className="section-head">
        <h2>Preview from current revenue</h2>
      </div>
      {rows.length === 0 ? (
        <p className="quiet">No principal is currently eligible for a daily return.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Investor</th>
                <th>Principal</th>
                <th>Daily cap</th>
                <th>Share if run now</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId}>
                  <td>{row.name}</td>
                  <td className="money">{formatUsdt(row.principalCents)}</td>
                  <td className="money">{formatUsdt(row.capCents)}</td>
                  <td className="money">{formatUsdt(preview.alreadyRun ? 0 : row.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-head">
        <h2>Outgoing sends</h2>
      </div>
      {withdrawals.length === 0 ? (
        <p className="quiet">No withdrawals yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Investor</th>
                <th>Amount</th>
                <th>To</th>
                <th>Status</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((row) => (
                <tr key={row.id}>
                  <td>{formatWhen(row.createdAt)}</td>
                  <td>{findUserById(db, row.userId)?.name ?? row.userId}</td>
                  <td className="money">{formatUsdt(row.amountCents)}</td>
                  <td>
                    <code>{row.toAddress}</code>
                  </td>
                  <td>
                    <span className={`status status-${row.status === "broadcasting" ? "pending" : row.status}`}>
                      {row.status}
                    </span>
                  </td>
                  <td>{row.txHash ? <code>{row.txHash.slice(0, 12)}…</code> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
