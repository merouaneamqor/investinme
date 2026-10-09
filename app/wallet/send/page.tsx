import Link from "next/link";
import { sendAction } from "@/app/actions";
import { Flash } from "@/components/flash";
import { currentUser } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { networkPill } from "@/lib/ethereum";
import { formatUsdt } from "@/lib/money";
import { accountOf, withdrawalsEnabled } from "@/lib/platform";
import { redirect } from "next/navigation";

export default async function SendPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    notice?: string;
    amount?: string;
    toAddress?: string;
    step?: string;
  }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/");
  const params = await searchParams;
  const db = getDb();
  const account = accountOf(db, user.id);
  const sendsOpen = withdrawalsEnabled(db);
  const confirmStep = sendsOpen && params.step === "confirm" && params.amount && params.toAddress;

  return (
    <div className="send-screen">
      <div className="screen-title row-between">
        <div>
          <p className="eyebrow">Drain</p>
          <h1>Send charge out</h1>
        </div>
        <span className="pill">{networkPill()}</span>
      </div>
      <Flash error={params.error} notice={params.notice} />
      <p className="lede">
        Available {formatUsdt(account.availableCents)}. Ethereum address only. Principal cannot be
        selected.
      </p>

      {!sendsOpen ? (
        <div className="card stack">
          <p className="flash error" role="status">
            Withdrawals are paused. You cannot send USDT until the operator resumes them.
          </p>
          <Link className="secondary-link" href="/dashboard">
            Back to pack
          </Link>
        </div>
      ) : confirmStep ? (
        <form action={sendAction} className="card stack">
          <h2>Confirm send</h2>
          <p>
            Send <strong>{params.amount} USDT</strong> to <code className="address-block">{params.toAddress}</code>{" "}
            on Ethereum.
          </p>
          <input type="hidden" name="amount" value={params.amount} />
          <input type="hidden" name="toAddress" value={params.toAddress} />
          <input type="hidden" name="confirm" value="1" />
          <div className="sticky-submit stack">
            <button className="primary" type="submit">
              Confirm and send
            </button>
            <Link className="secondary-link" href="/wallet/send">
              Edit
            </Link>
          </div>
        </form>
      ) : (
        <form action={sendAction} className="card stack">
          <label>
            Amount (USDT)
            <input
              name="amount"
              inputMode="decimal"
              placeholder="10.00"
              defaultValue={params.amount}
              required
            />
          </label>
          <label>
            Destination Ethereum address
            <input
              name="toAddress"
              placeholder="0x…"
              defaultValue={params.toAddress}
              autoComplete="off"
              required
            />
          </label>
          <div className="sticky-submit">
            <button className="primary" type="submit">
              Review send
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
