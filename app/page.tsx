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
      <section className="onboarding-hero">
        <p className="onboarding-brand">
          Invest<span>InMe</span>
        </p>
        <h1>Invest USDT. Earn from project revenue.</h1>
        <p className="lede">
          Deposit Ethereum USDT, invest into the project, and collect daily yield paid only from
          recorded revenue.
        </p>
        <div className="onboarding-cta">
          <a className="primary" href="#create-account">
            Create account
          </a>
          <a className="secondary" href="#sign-in">
            Sign in
          </a>
        </div>
        <span className="pill">{networkPill()}</span>
      </section>

      <Flash error={params.error} notice={params.notice} />

      <section className="onboarding-forms" aria-label="Account">
        <form id="create-account" action={registerAction} className="panel stack">
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

        <form id="sign-in" action={loginAction} className="panel stack">
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
      </section>

      <ul className="rules">
        <li>
          <strong>Deposit on Ethereum</strong>
          Send only USDT (ERC-20) to your deposit address.
        </li>
        <li>
          <strong>Available, then invested</strong>
          Confirmed deposits stay available until you invest them as principal.
        </li>
        <li>
          <strong>Daily yield from revenue</strong>
          3.00 USDT per 100.00 USDT invested, paid only from recorded project revenue.
        </li>
      </ul>

      <p className="demo">
        Local operator: {DEMO_OPERATOR_EMAIL} / {DEMO_OPERATOR_PASSWORD}
      </p>
    </div>
  );
}
