import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Mono, Sora } from "next/font/google";
import { NetworkBanner } from "@/components/network-banner";
import { Shell } from "@/components/shell";
import { currentUser } from "@/lib/current-user";
import "./globals.css";

const display = Sora({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "700"],
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["500", "600"],
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "InvestInMe",
  description: "Invest USDT on Ethereum. Returns are paid only from recorded project revenue.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
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
