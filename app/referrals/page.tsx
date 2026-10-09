import { CopyButton } from "@/components/copy-button";
import { currentUser } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { formatUsdt, formatWhen } from "@/lib/money";
import { listReferrals } from "@/lib/platform";
import { redirect } from "next/navigation";

const STATUS_LABEL = {
  not_qualified: "Needs 100.00 USDT of principal",
  waiting_for_budget: "Waiting for referral wallet",
  paid: "Paid from referral wallet",
};

export default async function ReferralsPage() {
  const user = await currentUser();
  if (!user) redirect("/");
  const referrals = listReferrals(getDb(), user.id);

  return (
    <>
      <div className="screen-title">
        <p className="eyebrow">Invite</p>
        <h1>Referral rewards</h1>
      </div>
      <p className="lede">
        Earn 10.00 USDT after an invitee holds at least 100.00 USDT invested and the referral wallet
        can pay it.
      </p>
      <article className="card stack">
        <p className="eyebrow">Your code</p>
        <code className="address-block">{user.referralCode}</code>
        <CopyButton value={user.referralCode} label="Copy code" />
      </article>
      {referrals.length === 0 ? (
        <p className="quiet" style={{ marginTop: 16 }}>
          No invited accounts yet.
        </p>
      ) : (
        <div className="invite-list">
          {referrals.map((referral) => (
            <article key={referral.userId} className="invite-row">
              <strong>{referral.name}</strong>
              <span className="quiet">{formatWhen(referral.createdAt)}</span>
              <span className="money">Principal {formatUsdt(referral.principalCents)}</span>
              <span className="status">{STATUS_LABEL[referral.status]}</span>
              {referral.status === "paid" ? (
                <span className="quiet">{formatUsdt(referral.amountCents)}</span>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
