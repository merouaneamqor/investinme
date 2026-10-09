"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions";

type SessionUser = {
  name: string;
  isOperator: boolean;
};

const tabs = [
  { href: "/dashboard", label: "Pack", icon: BatteryIcon },
  { href: "/invest", label: "Deploy", icon: DeployIcon },
  { href: "/activity", label: "Log", icon: ActivityIcon },
  { href: "/referrals", label: "Invite", icon: InviteIcon },
];

function tabActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname.startsWith("/wallet/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Shell({
  user,
  banner,
  children,
}: {
  user: SessionUser | null;
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="viewport">
      <div className={`phone${user ? " phone-signed-in" : ""}`}>
        {banner}
        <header className="phone-header">
          <Link href={user ? "/dashboard" : "/"} className="brand">
            <svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true">
              <rect x="2" y="7" width="20" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <rect x="22" y="11" width="3" height="6" rx="1" fill="var(--copper)" />
              <rect x="5" y="10" width="8" height="8" rx="1" fill="var(--copper)" />
            </svg>
            <span>
              <strong>InvestInMe</strong>
              <span>Battery · USDT</span>
            </span>
          </Link>
          {user ? (
            <div className="header-actions">
              {user.isOperator ? (
                <Link
                  href="/operations"
                  className={pathname === "/operations" || pathname === "/transparency" ? "active" : ""}
                >
                  Ops
                </Link>
              ) : (
                <Link href="/transparency">Funding</Link>
              )}
              <form action={logoutAction}>
                <button type="submit">Sign out</button>
              </form>
            </div>
          ) : null}
        </header>
        <main className="phone-screen">{children}</main>
        {user ? (
          <nav className="tab-bar" aria-label="Primary">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = tabActive(pathname, tab.href);
              return (
                <Link key={tab.href} href={tab.href} className={active ? "active" : ""}>
                  <Icon />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>
    </div>
  );
}

function BatteryIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="7" width="17" height="10" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <rect x="19.5" y="10" width="2.5" height="4" rx="0.8" fill="currentColor" />
      <rect x="5" y="10" width="5" height="4" rx="0.7" fill="currentColor" />
    </svg>
  );
}

function DeployIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="6" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <rect x="9" y="5" width="6" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <rect x="15" y="5" width="6" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <rect x="4.5" y="12" width="3" height="5" rx="0.5" fill="currentColor" />
      <rect x="10.5" y="9" width="3" height="8" rx="0.5" fill="currentColor" />
      <rect x="16.5" y="14" width="3" height="3" rx="0.5" fill="currentColor" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 12h4l2.5-5 3 10L16 12h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InviteIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="9" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M4.5 18c.8-2.4 2.7-3.6 4.5-3.6s3.7 1.2 4.5 3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path d="M17 8v6M14 11h6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
