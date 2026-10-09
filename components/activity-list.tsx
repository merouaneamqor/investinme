import { formatUsdt, formatWhen } from "@/lib/money";
import { type ActivityItem } from "@/lib/platform";
import { explorerTxUrl } from "@/lib/ethereum";

const STATUS_LABEL = {
  pending: "Pending",
  confirmed: "Confirmed",
  failed: "Failed",
};

export function ActivityList({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="quiet">No activity yet.</p>;
  }
  return (
    <div className="activity-list">
      {items.map((item) => (
        <article key={item.id} className="activity-row">
          <div>
            <strong>{item.title}</strong>
            <div className="quiet" style={{ fontSize: "0.82rem", marginTop: 2 }}>
              {item.note}
            </div>
          </div>
          <div
            className={
              item.direction === "in"
                ? "amount money credit"
                : item.direction === "out"
                  ? "amount money debit"
                  : "amount money"
            }
          >
            {item.direction === "in" ? "+" : item.direction === "out" ? "−" : ""}
            {formatUsdt(item.amountCents)}
          </div>
          <div className="meta">
            <span>{formatWhen(item.createdAt)}</span>
            <span className={`status status-${item.status}`}>{STATUS_LABEL[item.status]}</span>
            {item.txHash ? (
              <a href={explorerTxUrl(item.txHash)} target="_blank" rel="noreferrer">
                Etherscan
              </a>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
