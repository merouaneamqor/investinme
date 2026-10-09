"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions";

type SessionUser = {
  name: string;
  isOperator: boolean;
};

const tabs = [
  { href: "/dashboard", label: "Portfolio", icon: PortfolioIcon },
  { href: "/invest", label: "Invest", icon: InvestIcon },
  { href: "/activity", label: "Activity", icon: ActivityIcon },
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
            <span className="brand-mark" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 14 14">
                <path d="M7 1L12 4v6L7 13 2 10V4L7 1z" fill="currentColor" />
              </svg>
            </span>
            <span>
              <strong>InvestInMe</strong>
              <span>USDT · Ethereum</span>
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

function PortfolioIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 10h18" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 14h3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function InvestIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 16l5-5 3 3 7-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 7h5v5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
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
