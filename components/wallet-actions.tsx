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
          <span>Charge</span>
        </button>
        <Link href="/wallet/send" className="round-action">
          <span className="round-action-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M12 20V8M12 8l-4 4M12 8l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M5 4h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <span>Drain</span>
        </Link>
        <Link href="/invest" className="round-action">
          <span className="round-action-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24">
              <rect x="4" y="7" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
              <rect x="18" y="10" width="2.5" height="4" rx="0.8" fill="currentColor" />
              <rect x="7" y="10" width="4" height="4" rx="0.6" fill="currentColor" />
            </svg>
          </span>
          <span>Deploy</span>
        </Link>
      </div>
      {open ? (
        <div className="receive-sheet" role="dialog" aria-label="Charge USDT">
          <div className="receive-sheet-head">
            <h2>Charge pack</h2>
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
