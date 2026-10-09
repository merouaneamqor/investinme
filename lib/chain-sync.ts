import type { Db } from "./db";
import { PlatformError } from "./money";
import {
  confirmWithdrawal,
  creditChainDeposit,
  failWithdrawal,
  findUserById,
  listOpenWithdrawals,
  markWithdrawalBroadcasting,
  withdrawalsEnabled,
} from "./platform";
import {
  broadcastUsdtTransfer,
  fetchHotWalletUsdtCents,
  fetchInboundUsdt,
  hasHotWallet,
  hasMasterSeed,
} from "./ethereum";

export type SyncResult = {
  depositsCredited: number;
  withdrawalsBroadcast: number;
  withdrawalsConfirmed: number;
  withdrawalsFailed: number;
  hotWalletCents: number | null;
  errors: string[];
};

export async function syncChain(db: Db): Promise<SyncResult> {
  const result: SyncResult = {
    depositsCredited: 0,
    withdrawalsBroadcast: 0,
    withdrawalsConfirmed: 0,
    withdrawalsFailed: 0,
    hotWalletCents: null,
    errors: [],
  };

  if (!hasMasterSeed()) {
    result.errors.push("ETH_MASTER_SEED is not configured.");
    return result;
  }

  const addresses = db
    .prepare(
      `SELECT id, deposit_address FROM users
       WHERE deposit_address IS NOT NULL AND deposit_address != ''
       ORDER BY id`,
    )
    .all();

  for (const row of addresses) {
    const userId = Number(row.id);
    const address = String(row.deposit_address);
    try {
      const transfers = await fetchInboundUsdt(address);
      for (const transfer of transfers) {
        try {
          const credited = creditChainDeposit(db, {
            userId,
            txHash: transfer.txHash,
            fromAddress: transfer.fromAddress,
            toAddress: transfer.toAddress,
            amountCents: transfer.amountCents,
          });
          if (credited) result.depositsCredited += 1;
        } catch (error) {
          result.errors.push(
            `Deposit ${transfer.txHash}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } catch (error) {
      result.errors.push(
        `Watch ${address}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  result.hotWalletCents = await fetchHotWalletUsdtCents();
  const canBroadcast = withdrawalsEnabled(db);

  for (const withdrawal of listOpenWithdrawals(db)) {
    try {
      if (withdrawal.status === "pending") {
        if (!canBroadcast) continue;
        if (result.hotWalletCents != null && result.hotWalletCents < withdrawal.amountCents) {
          failWithdrawal(db, withdrawal.id, "Hot wallet does not have enough USDT.");
          result.withdrawalsFailed += 1;
          continue;
        }
        if (!hasHotWallet() && process.env.ETH_SIMULATE_TRANSFERS !== "1") {
          result.errors.push(`Withdrawal ${withdrawal.id}: hot wallet is not configured.`);
          continue;
        }
        const broadcast = await broadcastUsdtTransfer(withdrawal.toAddress, withdrawal.amountCents);
        markWithdrawalBroadcasting(db, withdrawal.id, broadcast.txHash);
        result.withdrawalsBroadcast += 1;
        if (broadcast.simulated || process.env.ETH_SIMULATE_TRANSFERS === "1") {
          confirmWithdrawal(db, withdrawal.id, broadcast.txHash);
          result.withdrawalsConfirmed += 1;
          if (result.hotWalletCents != null) {
            result.hotWalletCents -= withdrawal.amountCents;
          }
        }
      } else if (withdrawal.status === "broadcasting" && withdrawal.txHash) {
        if (process.env.ETH_CONFIRM_AFTER_BROADCAST === "1") {
          confirmWithdrawal(db, withdrawal.id, withdrawal.txHash);
          result.withdrawalsConfirmed += 1;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        failWithdrawal(db, withdrawal.id, message);
        result.withdrawalsFailed += 1;
      } catch {
        result.errors.push(`Withdrawal ${withdrawal.id}: ${message}`);
      }
    }
  }

  return result;
}

export function simulateInboundDeposit(
  db: Db,
  userId: number,
  amountCents: number,
  fromAddress = "0x0000000000000000000000000000000000000001",
): void {
  const user = findUserById(db, userId);
  if (!user?.depositAddress) {
    throw new PlatformError("This account does not have an Ethereum deposit address yet.");
  }
  const txHash = `sim_in_${userId}_${Date.now()}_${amountCents}`;
  creditChainDeposit(db, {
    userId,
    txHash,
    fromAddress,
    toAddress: user.depositAddress,
    amountCents,
  });
}
