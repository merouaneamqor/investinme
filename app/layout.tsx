import type { Metadata } from "next";
import { NetworkBanner } from "@/components/network-banner";
import { Shell } from "@/components/shell";
import { currentUser } from "@/lib/current-user";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "InvestInMe",
  description: "Custodial USDT wallet on Ethereum. Returns are paid only from recorded project revenue.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        <Shell
          user={user ? { name: user.name, isOperator: user.isOperator } : null}
          banner={<NetworkBanner />}
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}
