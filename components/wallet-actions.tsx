"use client";

import Link from "next/link";
import { useState } from "react";

export function WalletActions({ receive }: { receive: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="round-actions">
        <button type="button" className="round-action" onClick={() => setOpen(true)}>
          <span className="round-action-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M12 4v12M12 16l-4-4M12 16l4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M5 20h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <span>Deposit</span>
        </button>
        <Link href="/wallet/send" className="round-action">
          <span className="round-action-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M12 20V8M12 8l-4 4M12 8l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M5 4h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <span>Withdraw</span>
        </Link>
        <Link href="/invest" className="round-action">
          <span className="round-action-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path
                d="M4 16l5-5 3 3 7-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span>Invest</span>
        </Link>
      </div>
      {open ? (
        <div className="receive-sheet" role="dialog" aria-label="Deposit USDT">
          <div className="receive-sheet-head">
            <h2>Deposit USDT</h2>
            <button type="button" className="sheet-close" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          {receive}
        </div>
      ) : null}
    </>
  );
}
