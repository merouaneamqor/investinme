import { isTestnet, networkConfig } from "@/lib/ethereum";

export function NetworkBanner() {
  if (!isTestnet()) return null;
  return (
    <p className="network-banner" role="status">
      Testnet: {networkConfig().label}. Sepolia is not mainnet USDT.
    </p>
  );
}
