import { redirect } from "next/navigation";
import { loginAction, registerAction } from "@/app/actions";
import { Flash } from "@/components/flash";
import { currentUser } from "@/lib/current-user";
import { networkPill } from "@/lib/ethereum";
import { DEMO_OPERATOR_EMAIL, DEMO_OPERATOR_PASSWORD } from "@/lib/money";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const user = await currentUser();
  if (user) redirect("/dashboard");
  const params = await searchParams;

  return (
    <div className="onboarding">
      <section>
        <p className="eyebrow">Battery funding · {networkPill()}</p>
        <h1>Charge your pack. Earn from output.</h1>
        <p className="lede">
          Fund a battery project with Ethereum USDT. Liquid charge sits in your pack until you
          deploy it into cells.
        </p>
        <ul className="rules">
          <li>
            <strong>Charge on Ethereum</strong>
            Send only USDT (ERC-20) to your pack address.
          </li>
          <li>
            <strong>Liquid, then cells</strong>
            Confirmed deposits stay available until you deploy them as principal.
          </li>
          <li>
            <strong>Daily output from revenue</strong>
            3.00 USDT per 100.00 USDT in cells, paid only from recorded project revenue.
          </li>
        </ul>
      </section>

      <Flash error={params.error} notice={params.notice} />

      <form action={registerAction} className="panel stack">
        <h2>Create account</h2>
        <label>
          Name
          <input name="name" required autoComplete="name" />
        </label>
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Password
          <input name="password" type="password" required minLength={8} autoComplete="new-password" />
        </label>
        <label>
          Referral code, optional
          <input name="referralCode" autoComplete="off" />
        </label>
        <button className="primary" type="submit">
          Create account
        </button>
      </form>

      <form action={loginAction} className="panel stack">
        <h2>Sign in</h2>
        <label>
          Email
          <input name="email" type="email" required autoComplete="username" />
        </label>
        <label>
          Password
          <input name="password" type="password" required autoComplete="current-password" />
        </label>
        <button className="secondary" type="submit">
          Sign in
        </button>
      </form>

      <p className="demo">
        Local operator: {DEMO_OPERATOR_EMAIL} / {DEMO_OPERATOR_PASSWORD}
      </p>
    </div>
  );
}
