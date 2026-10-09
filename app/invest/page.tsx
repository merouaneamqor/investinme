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
        <p className="eyebrow">Deploy</p>
        <h1>Move charge into cells</h1>
      </div>
      <Flash error={params.error} notice={params.notice} />
      <p className="lede">
        Liquid {formatUsdt(account.availableCents)}. In cells {formatUsdt(account.principalCents)}.
        Daily output {formatUsdt(dailyCapCents(account.principalCents))}.
      </p>

      <section className="forms">
        <form action={investAction} className="card stack">
          <h2>Deploy into cells</h2>
          <p className="quiet">Moves liquid USDT into principal. Not used to pay other investors.</p>
          <label>
            Amount (USDT)
            <input name="amount" inputMode="decimal" placeholder="100.00" required />
          </label>
          <button className="primary" type="submit">
            Deploy
          </button>
        </form>
        <form action={releasePrincipalAction} className="card stack">
          <h2>Return to liquid</h2>
          <p className="quiet">Moves invested USDT back to available charge.</p>
          <label>
            Amount (USDT)
            <input name="amount" inputMode="decimal" placeholder="100.00" required />
          </label>
          <button className="secondary" type="submit">
            Undeploy
          </button>
        </form>
      </section>
    </>
  );
}
