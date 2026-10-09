import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  type Address,
  type Hex,
  createPublicClient,
  createWalletClient,
  erc20Abi,
  formatEther,
  getAddress,
  http,
  isAddress,
  parseAbiItem,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, sepolia } from "viem/chains";
import { PlatformError } from "./money";

export type EthNetwork = "sepolia" | "mainnet";

type NetworkConfig = {
  id: EthNetwork;
  label: string;
  chain: typeof mainnet | typeof sepolia;
  usdtContract: Address;
  explorerTx: string;
  explorerAddress: string;
  defaultRpc: string;
};

/** Official Tether USD on Ethereum mainnet (6 decimals). */
const MAINNET_USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7" as const;

/**
 * Sepolia has no official USDT. The contract below is only used when
 * ETH_SIMULATE_TRANSFERS is off and you point at a Sepolia ERC-20 for tests.
 * With simulation enabled (local default), transfers never hit the chain.
 */
const SEPOLIA_USDT_PLACEHOLDER = "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06" as const;

const NETWORKS: Record<EthNetwork, NetworkConfig> = {
  sepolia: {
    id: "sepolia",
    label: "Ethereum Sepolia",
    chain: sepolia,
    usdtContract: SEPOLIA_USDT_PLACEHOLDER,
    explorerTx: "https://sepolia.etherscan.io/tx/",
    explorerAddress: "https://sepolia.etherscan.io/address/",
    defaultRpc: "https://ethereum-sepolia-rpc.publicnode.com",
  },
  mainnet: {
    id: "mainnet",
    label: "Ethereum",
    chain: mainnet,
    usdtContract: MAINNET_USDT,
    explorerTx: "https://etherscan.io/tx/",
    explorerAddress: "https://etherscan.io/address/",
    defaultRpc: "https://ethereum-rpc.publicnode.com",
  },
};

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

export function ethNetwork(): EthNetwork {
  return process.env.ETH_NETWORK === "mainnet" ? "mainnet" : "sepolia";
}

export function networkConfig(network = ethNetwork()): NetworkConfig {
  return NETWORKS[network];
}

export function networkPill(): string {
  return ethNetwork() === "mainnet" ? "USDT · ERC-20" : "USDT · ERC-20 · Sepolia";
}

export function isTestnet(): boolean {
  return ethNetwork() !== "mainnet";
}

function masterSeedBytes(): Buffer | null {
  const raw = process.env.ETH_MASTER_SEED?.trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  return createHash("sha256").update(raw).digest();
}

export function hasMasterSeed(): boolean {
  return masterSeedBytes() != null;
}

function hotPrivateKey(): Hex | null {
  const raw = process.env.ETH_HOT_WALLET_PRIVATE_KEY?.trim();
  if (!raw) return null;
  const hex = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) return null;
  return hex as Hex;
}

export function hasHotWallet(): boolean {
  return hotPrivateKey() != null;
}

export function ethConfigured(): boolean {
  return hasMasterSeed();
}

function rpcUrl(): string {
  return process.env.ETH_RPC_URL?.trim() || networkConfig().defaultRpc;
}

function publicClient() {
  const config = networkConfig();
  return createPublicClient({
    chain: config.chain,
    transport: http(rpcUrl()),
  });
}

export function isEthAddress(address: string): boolean {
  try {
    return isAddress(address.trim(), { strict: false });
  } catch {
    return false;
  }
}

export function assertEthAddress(address: string): Address {
  const trimmed = address.trim();
  if (!isEthAddress(trimmed)) {
    throw new PlatformError("Enter an Ethereum address that starts with 0x.");
  }
  return getAddress(trimmed);
}

export function deriveDepositKey(index: number): { privateKey: Hex; address: Address } {
  const seed = masterSeedBytes();
  if (!seed) {
    throw new PlatformError("Ethereum deposit addresses are not configured.");
  }
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new PlatformError("Invalid deposit derivation index.");
  }
  const privateKey = (`0x${createHmac("sha256", seed).update(`eth-deposit/${index}`).digest("hex")}`) as Hex;
  const account = privateKeyToAccount(privateKey);
  return { privateKey, address: account.address };
}

export function deriveDepositAddress(index: number): Address {
  return deriveDepositKey(index).address;
}

export function hotWalletAddress(): Address | null {
  const key = hotPrivateKey();
  if (!key) return null;
  try {
    return privateKeyToAccount(key).address;
  } catch {
    return null;
  }
}

export function explorerTxUrl(txHash: string): string {
  return `${networkConfig().explorerTx}${txHash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${networkConfig().explorerAddress}${address}`;
}

export type ChainTransfer = {
  txHash: string;
  toAddress: string;
  fromAddress: string;
  amountCents: number;
  blockTimestamp: number;
};

function usdtToCents(value: bigint, decimals = 6): number {
  if (value <= 0n) return 0;
  const factor = 10n ** BigInt(decimals);
  const whole = value / factor;
  const fraction = value % factor;
  const centsFraction = Number((fraction * 100n) / factor);
  return Number(whole) * 100 + centsFraction;
}

function centsToUsdt(amountCents: number, decimals = 6): bigint {
  return BigInt(amountCents) * 10n ** BigInt(decimals - 2);
}

function depositLookbackBlocks(): bigint {
  const raw = process.env.ETH_DEPOSIT_LOOKBACK_BLOCKS?.trim();
  if (raw && /^\d+$/.test(raw)) return BigInt(raw);
  // Public Sepolia RPCs often prune history; keep the default short.
  return ethNetwork() === "mainnet" ? 14_400n : 2_000n;
}

export async function fetchInboundUsdt(address: string, fromBlock?: bigint): Promise<ChainTransfer[]> {
  const config = networkConfig();
  const client = publicClient();
  const to = assertEthAddress(address);
  const latest = await client.getBlockNumber();
  const lookback = depositLookbackBlocks();
  const start = fromBlock ?? (latest > lookback ? latest - lookback : 0n);
  // Chunk getLogs so public nodes do not reject large ranges.
  const chunk = 1_000n;

  const logs = [];
  for (let from = start; from <= latest; from += chunk + 1n) {
    const toBlock = from + chunk > latest ? latest : from + chunk;
    try {
      const batch = await client.getLogs({
        address: config.usdtContract,
        event: transferEvent,
        args: { to },
        fromBlock: from,
        toBlock,
      });
      logs.push(...batch);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Skip pruned windows; keep scanning newer chunks.
      if (/pruned history|history unavailable|block range/i.test(message)) {
        continue;
      }
      throw error;
    }
  }

  const transfers: ChainTransfer[] = [];
  for (const log of logs) {
    if (!log.transactionHash || log.args.value == null || log.args.from == null || log.args.to == null) {
      continue;
    }
    const amountCents = usdtToCents(log.args.value, 6);
    if (amountCents <= 0) continue;
    let blockTimestamp = 0;
    if (log.blockNumber != null) {
      try {
        const block = await client.getBlock({ blockNumber: log.blockNumber });
        blockTimestamp = Number(block.timestamp) * 1000;
      } catch {
        blockTimestamp = 0;
      }
    }
    transfers.push({
      txHash: log.transactionHash,
      toAddress: getAddress(log.args.to),
      fromAddress: getAddress(log.args.from),
      amountCents,
      blockTimestamp,
    });
  }
  return transfers;
}

export async function fetchHotWalletUsdtCents(): Promise<number | null> {
  const address = hotWalletAddress();
  if (!address) return null;
  const config = networkConfig();
  try {
    const client = publicClient();
    const raw = await client.readContract({
      address: config.usdtContract,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
    return usdtToCents(raw, 6);
  } catch {
    return null;
  }
}

export async function fetchHotWalletEthWei(): Promise<bigint | null> {
  const address = hotWalletAddress();
  if (!address) return null;
  try {
    return await publicClient().getBalance({ address });
  } catch {
    return null;
  }
}

export async function fetchHotWalletEthLabel(): Promise<string | null> {
  const wei = await fetchHotWalletEthWei();
  if (wei == null) return null;
  return `${formatEther(wei)} ETH`;
}

export async function broadcastUsdtTransfer(
  toAddress: string,
  amountCents: number,
): Promise<{ txHash: string; simulated: boolean }> {
  const to = assertEthAddress(toAddress);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new PlatformError("Withdrawal amount must be positive.");
  }

  if (process.env.ETH_SIMULATE_TRANSFERS === "1" || !hasHotWallet()) {
    if (!hasHotWallet() && process.env.ETH_SIMULATE_TRANSFERS !== "1") {
      throw new PlatformError("The platform hot wallet is not configured.");
    }
    return { txHash: `sim_${randomBytes(16).toString("hex")}`, simulated: true };
  }

  const key = hotPrivateKey()!;
  const account = privateKeyToAccount(key);
  const config = networkConfig();
  const client = publicClient();
  const wallet = createWalletClient({
    account,
    chain: config.chain,
    transport: http(rpcUrl()),
  });

  const balance = await client.readContract({
    address: config.usdtContract,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  const amount = centsToUsdt(amountCents, 6);
  if (balance < amount) {
    throw new PlatformError("Hot wallet does not have enough USDT.");
  }

  const hash = await wallet.writeContract({
    address: config.usdtContract,
    abi: erc20Abi,
    functionName: "transfer",
    args: [to, amount],
  });
  return { txHash: hash, simulated: false };
}

export function nextDerivationIndex(dbMaxIndex: number | null): number {
  return (dbMaxIndex ?? -1) + 1;
}
