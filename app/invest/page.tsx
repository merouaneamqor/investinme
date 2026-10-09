import { investAction, releasePrincipalAction } from "@/app/actions";
import { Flash } from "@/components/flash";
import { currentUser } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { dailyCapCents, formatUsdt } from "@/lib/money";
import { accountOf } from "@/lib/platform";
import { redirect } from "next/navigation";

export default async function InvestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/");
  const params = await searchParams;
  const account = accountOf(getDb(), user.id);

  return (
    <>
      <div className="screen-title">
        <p className="eyebrow">Invest</p>
        <h1>Allocate USDT</h1>
      </div>
      <Flash error={params.error} notice={params.notice} />
      <p className="lede">
        Available {formatUsdt(account.availableCents)}. Invested {formatUsdt(account.principalCents)}.
        Daily yield {formatUsdt(dailyCapCents(account.principalCents))}.
      </p>

      <section className="forms">
        <form action={investAction} className="card stack">
          <h2>Invest</h2>
          <p className="quiet">
            Moves available USDT into principal. Principal is not used to pay other investors.
          </p>
          <label>
            Amount (USDT)
            <input name="amount" type="text" inputMode="decimal" placeholder="100.00" required />
          </label>
          <button className="primary" type="submit">
            Invest
          </button>
        </form>
        <form action={releasePrincipalAction} className="card stack">
          <h2>Move to available</h2>
          <p className="quiet">Returns invested USDT to your available balance.</p>
          <label>
            Amount (USDT)
            <input name="amount" type="text" inputMode="decimal" placeholder="100.00" required />
          </label>
          <button className="secondary" type="submit">
            Move to available
          </button>
        </form>
      </section>
    </>
  );
}
