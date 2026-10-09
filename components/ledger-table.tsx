import { formatUsdt, formatWhen } from "@/lib/money";
import { labelKind, labelSource, type LedgerEntry } from "@/lib/platform";

const CREDITS = new Set([
  "deposit",
  "wallet_deposit",
  "daily_return",
  "referral_reward",
  "project_revenue",
  "reward_budget",
]);
const TRANSFERS = new Set(["invest", "release_principal"]);

export function LedgerTable({
  entries,
  balanceLabel,
}: {
  entries: LedgerEntry[];
  balanceLabel: string;
}) {
  if (entries.length === 0) {
    return <p className="quiet">No entries yet.</p>;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Entry</th>
            <th>Funding source</th>
            <th>Amount</th>
            <th>{balanceLabel}</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>{formatWhen(entry.createdAt)}</td>
              <td>{labelKind(entry.kind)}</td>
              <td>{labelSource(entry.fundingSource)}</td>
              <td
                className={
                  TRANSFERS.has(entry.kind) ? "money" : CREDITS.has(entry.kind) ? "money credit" : "money debit"
                }
              >
                {TRANSFERS.has(entry.kind) ? "" : CREDITS.has(entry.kind) ? "+" : "−"}
                {formatUsdt(entry.amountCents)}
              </td>
              <td className="money">{formatUsdt(entry.balanceAfterCents)}</td>
              <td>{entry.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
