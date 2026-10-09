import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { allocateDailyReturns } from "./allocate";
import type { Db } from "./db";
import {
  assertPositiveCents,
  DEMO_OPERATOR_EMAIL,
  DEMO_OPERATOR_PASSWORD,
  PlatformError,
  QUALIFYING_PRINCIPAL_CENTS,
  REFERRAL_REWARD_CENTS,
  todayUtc,
} from "./money";
import {
  assertEthAddress,
  deriveDepositAddress,
  hasMasterSeed,
  nextDerivationIndex,
} from "./ethereum";

export type User = {
  id: number;
  email: string;
  name: string;
  referralCode: string;
  walletCode: string;
  depositAddress: string | null;
  derivationIndex: number | null;
  referredByUserId: number | null;
  isOperator: boolean;
  createdAt: string;
};

export type LedgerEntry = {
  id: number;
  userId: number | null;
  kind: string;
  amountCents: number;
  fundingSource: string;
  reference: string;
  note: string;
  balanceAfterCents: number;
  createdAt: string;
};

export type Snapshot = {
  principalCents: number;
  revenueRecordedCents: number;
  returnsPaidCents: number;
  undistributedRevenueCents: number;
  rewardBudgetRecordedCents: number;
  referralRewardsPaidCents: number;
  rewardBudgetRemainingCents: number;
  earningsWithdrawnCents: number;
  principalWithdrawnCents: number;
  walletCents: number;
};

export type Account = {
  principalCents: number;
  walletCents: number;
  pendingCents: number;
  availableCents: number;
};

export type Withdrawal = {
  id: number;
  userId: number;
  amountCents: number;
  toAddress: string;
  status: "pending" | "broadcasting" | "confirmed" | "failed";
  txHash: string | null;
  ledgerEntryId: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActivityItem = {
  id: string;
  kind: string;
  title: string;
  amountCents: number;
  direction: "in" | "out" | "transfer";
  status: "pending" | "confirmed" | "failed";
  fundingSource: string | null;
  note: string;
  createdAt: string;
  txHash: string | null;
  balanceAfterCents: number | null;
};

export const REVENUE_WALLET_CODE = "IMW-REVENUE";
export const REWARD_WALLET_CODE = "IMW-REWARD";

const PRINCIPAL_CASE = `CASE kind
  WHEN 'deposit' THEN amount_cents
  WHEN 'invest' THEN amount_cents
  WHEN 'principal_withdrawal' THEN -amount_cents
  WHEN 'release_principal' THEN -amount_cents
  ELSE 0 END`;

const WALLET_CASE = `CASE kind
  WHEN 'wallet_deposit' THEN amount_cents
  WHEN 'daily_return' THEN amount_cents
  WHEN 'referral_reward' THEN amount_cents
  WHEN 'release_principal' THEN amount_cents
  WHEN 'invest' THEN -amount_cents
  WHEN 'earnings_withdrawal' THEN -amount_cents
  WHEN 'wallet_withdrawal' THEN -amount_cents
  ELSE 0 END`;

export type PayoutRun = {
  id: number;
  runDate: string;
  principalCents: number;
  capCents: number;
  revenueAvailableCents: number;
  distributedCents: number;
  investorCount: number;
  createdAt: string;
};

export type ReferralRow = {
  userId: number;
  name: string;
  createdAt: string;
  principalCents: number;
  status: "not_qualified" | "waiting_for_budget" | "paid";
  amountCents: number;
  paidAt: string | null;
};

const KIND_LABELS: Record<string, string> = {
  deposit: "Deposit",
  wallet_deposit: "Wallet deposit",
  invest: "Investment",
  release_principal: "Returned to wallet",
  principal_withdrawal: "Principal withdrawal",
  daily_return: "Daily return",
  referral_reward: "Referral reward",
  earnings_withdrawal: "Earnings withdrawal",
  wallet_withdrawal: "Wallet withdrawal",
  project_revenue: "Project revenue",
  reward_budget: "Referral budget",
};

const SOURCE_LABELS: Record<string, string> = {
  investor_transfer: "Investor transfer",
  investor_wallet: "Investor wallet",
  project_revenue: "Project revenue",
  reward_budget: "Referral budget",
  investor_earnings: "Investor earnings",
  investor_principal: "Investor principal",
};

export function labelKind(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

export function labelSource(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

function numberValue(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  return 0;
}

function stringValue(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function mapUser(row: Record<string, unknown>): User {
  return {
    id: numberValue(row, "id"),
    email: stringValue(row, "email"),
    name: stringValue(row, "name"),
    referralCode: stringValue(row, "referral_code"),
    walletCode: stringValue(row, "wallet_code"),
    depositAddress:
      row.deposit_address == null || row.deposit_address === "" ? null : stringValue(row, "deposit_address"),
    derivationIndex: row.derivation_index == null ? null : numberValue(row, "derivation_index"),
    referredByUserId: row.referred_by_user_id == null ? null : numberValue(row, "referred_by_user_id"),
    isOperator: numberValue(row, "is_operator") === 1,
    createdAt: stringValue(row, "created_at"),
  };
}

function mapWithdrawal(row: Record<string, unknown>): Withdrawal {
  return {
    id: numberValue(row, "id"),
    userId: numberValue(row, "user_id"),
    amountCents: numberValue(row, "amount_cents"),
    toAddress: stringValue(row, "to_address"),
    status: stringValue(row, "status") as Withdrawal["status"],
    txHash: row.tx_hash == null ? null : stringValue(row, "tx_hash"),
    ledgerEntryId: row.ledger_entry_id == null ? null : numberValue(row, "ledger_entry_id"),
    errorMessage: row.error_message == null ? null : stringValue(row, "error_message"),
    createdAt: stringValue(row, "created_at"),
    updatedAt: stringValue(row, "updated_at"),
  };
}

function mapEntry(row: Record<string, unknown>): LedgerEntry {
  return {
    id: numberValue(row, "id"),
    userId: row.user_id == null ? null : numberValue(row, "user_id"),
    kind: stringValue(row, "kind"),
    amountCents: numberValue(row, "amount_cents"),
    fundingSource: stringValue(row, "funding_source"),
    reference: stringValue(row, "reference"),
    note: stringValue(row, "note"),
    balanceAfterCents: numberValue(row, "balance_after_cents"),
    createdAt: stringValue(row, "created_at"),
  };
}

function mapRun(row: Record<string, unknown>): PayoutRun {
  return {
    id: numberValue(row, "id"),
    runDate: stringValue(row, "run_date"),
    principalCents: numberValue(row, "principal_cents"),
    capCents: numberValue(row, "cap_cents"),
    revenueAvailableCents: numberValue(row, "revenue_available_cents"),
    distributedCents: numberValue(row, "distributed_cents"),
    investorCount: numberValue(row, "investor_count"),
    createdAt: stringValue(row, "created_at"),
  };
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function withTransaction<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    assertInvariants(db);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function newCode(db: Db, column: "referral_code" | "wallet_code", prefix = ""): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const bytes = randomBytes(8);
    const body = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
    const code = `${prefix}${body}`;
    const taken = db.prepare(`SELECT 1 AS taken FROM users WHERE ${column} = ?`).get(code);
    if (!taken) return code;
  }
  throw new PlatformError("Could not generate a wallet code.");
}

function newReferralCode(db: Db): string {
  return newCode(db, "referral_code");
}

function newWalletCode(db: Db): string {
  return newCode(db, "wallet_code", "IMW-");
}

export function ensureWalletCodes(db: Db): void {
  const missing = db.prepare("SELECT id FROM users WHERE wallet_code IS NULL OR wallet_code = ''").all();
  for (const row of missing) {
    db.prepare("UPDATE users SET wallet_code = ? WHERE id = ?").run(newWalletCode(db), numberValue(row, "id"));
  }
}

export function ensureDepositAddresses(db: Db): void {
  if (!hasMasterSeed()) return;
  const missing = db
    .prepare("SELECT id FROM users WHERE deposit_address IS NULL OR deposit_address = '' ORDER BY id")
    .all();
  for (const row of missing) {
    assignDepositAddress(db, numberValue(row, "id"));
  }
}

function assignDepositAddress(db: Db, userId: number): string {
  const maxRow = db.prepare("SELECT MAX(derivation_index) AS max_index FROM users").get();
  const maxIndex = maxRow?.max_index == null ? null : numberValue(maxRow, "max_index");
  const index = nextDerivationIndex(maxIndex);
  const address = deriveDepositAddress(index);
  db.prepare("UPDATE users SET deposit_address = ?, derivation_index = ? WHERE id = ?").run(
    address,
    index,
    userId,
  );
  return address;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function findUserById(db: Db, id: number): User | null {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  return row ? mapUser(row) : null;
}

export function findUserByEmail(db: Db, email: string): User | null {
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase());
  return row ? mapUser(row) : null;
}

function passwordHashForEmail(db: Db, email: string): string | null {
  const row = db.prepare("SELECT password_hash FROM users WHERE email = ?").get(email.trim().toLowerCase());
  return row ? stringValue(row, "password_hash") : null;
}

export function authenticate(db: Db, email: string, password: string): User {
  const hash = passwordHashForEmail(db, email);
  const user = findUserByEmail(db, email);
  if (!hash || !user || !verifyPassword(password, hash)) {
    throw new PlatformError("Email or password is incorrect.");
  }
  return user;
}

export function registerUser(
  db: Db,
  input: { name: string; email: string; password: string; referralCode?: string; isOperator?: boolean },
): User {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const referralCode = input.referralCode?.trim().toUpperCase() ?? "";
  if (name.length < 2 || name.length > 80) {
    throw new PlatformError("Name must be between 2 and 80 characters.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new PlatformError("Enter a valid email address.");
  }
  if (input.password.length < 8) {
    throw new PlatformError("Password must be at least 8 characters.");
  }

  return withTransaction(db, () => {
    let referredByUserId: number | null = null;
    if (referralCode) {
      const referrer = db.prepare("SELECT id FROM users WHERE referral_code = ?").get(referralCode);
      if (!referrer) throw new PlatformError("Referral code was not found.");
      referredByUserId = numberValue(referrer, "id");
    }

    try {
      const result = db
        .prepare(
          `INSERT INTO users (email, name, password_hash, referral_code, wallet_code, referred_by_user_id, is_operator, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          email,
          name,
          hashPassword(input.password),
          newReferralCode(db),
          newWalletCode(db),
          referredByUserId,
          input.isOperator ? 1 : 0,
          nowIso(),
        );
      if (hasMasterSeed()) {
        assignDepositAddress(db, result.lastInsertRowid);
      }
      const user = findUserById(db, result.lastInsertRowid);
      if (!user) throw new PlatformError("Account could not be created.");
      return user;
    } catch (error) {
      if (error instanceof PlatformError) throw error;
      if (String(error).includes("users.email")) {
        throw new PlatformError("An account with that email already exists.");
      }
      throw error;
    }
  });
}

export function seedOperator(db: Db): void {
  const existing = findUserByEmail(db, DEMO_OPERATOR_EMAIL);
  if (existing) return;
  registerUser(db, {
    name: "Project operator",
    email: DEMO_OPERATOR_EMAIL,
    password: DEMO_OPERATOR_PASSWORD,
    isOperator: true,
  });
}

export function pendingWithdrawalCents(db: Db, userId: number): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS pending_cents
       FROM withdrawals
       WHERE user_id = ? AND status IN ('pending', 'broadcasting')`,
    )
    .get(userId);
  return row ? numberValue(row, "pending_cents") : 0;
}

export function accountOf(db: Db, userId: number): Account {
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(${PRINCIPAL_CASE}), 0) AS principal_cents,
         COALESCE(SUM(${WALLET_CASE}), 0) AS wallet_cents
       FROM ledger_entries
       WHERE user_id = ?`,
    )
    .get(userId);
  const walletCents = row ? numberValue(row, "wallet_cents") : 0;
  const pendingCents = pendingWithdrawalCents(db, userId);
  return {
    principalCents: row ? numberValue(row, "principal_cents") : 0,
    walletCents,
    pendingCents,
    availableCents: Math.max(0, walletCents - pendingCents),
  };
}

function ownedCents(account: Account): number {
  return account.principalCents + account.walletCents;
}

export function snapshot(db: Db): Snapshot {
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(${PRINCIPAL_CASE}), 0) AS principal_cents,
         COALESCE(SUM(${WALLET_CASE}), 0) AS wallet_cents,
         COALESCE(SUM(CASE WHEN kind = 'project_revenue' THEN amount_cents ELSE 0 END), 0) AS revenue_recorded_cents,
         COALESCE(SUM(CASE WHEN kind = 'daily_return' THEN amount_cents ELSE 0 END), 0) AS returns_paid_cents,
         COALESCE(SUM(CASE WHEN kind = 'reward_budget' THEN amount_cents ELSE 0 END), 0) AS reward_budget_recorded_cents,
         COALESCE(SUM(CASE WHEN kind = 'referral_reward' THEN amount_cents ELSE 0 END), 0) AS referral_rewards_paid_cents,
         COALESCE(SUM(CASE WHEN kind = 'earnings_withdrawal' THEN amount_cents ELSE 0 END), 0) AS earnings_withdrawn_cents,
         COALESCE(SUM(CASE WHEN kind = 'principal_withdrawal' THEN amount_cents ELSE 0 END), 0) AS principal_withdrawn_cents
       FROM ledger_entries`,
    )
    .get();
  const revenueRecordedCents = row ? numberValue(row, "revenue_recorded_cents") : 0;
  const returnsPaidCents = row ? numberValue(row, "returns_paid_cents") : 0;
  const rewardBudgetRecordedCents = row ? numberValue(row, "reward_budget_recorded_cents") : 0;
  const referralRewardsPaidCents = row ? numberValue(row, "referral_rewards_paid_cents") : 0;
  return {
    principalCents: row ? numberValue(row, "principal_cents") : 0,
    revenueRecordedCents,
    returnsPaidCents,
    undistributedRevenueCents: revenueRecordedCents - returnsPaidCents,
    rewardBudgetRecordedCents,
    referralRewardsPaidCents,
    rewardBudgetRemainingCents: rewardBudgetRecordedCents - referralRewardsPaidCents,
    earningsWithdrawnCents: row ? numberValue(row, "earnings_withdrawn_cents") : 0,
    principalWithdrawnCents: row ? numberValue(row, "principal_withdrawn_cents") : 0,
    walletCents: row ? numberValue(row, "wallet_cents") : 0,
  };
}

function assertInvariants(db: Db): void {
  const totals = snapshot(db);
  if (totals.undistributedRevenueCents < 0) {
    throw new Error("Project revenue cannot fund more returns than it has recorded.");
  }
  if (totals.rewardBudgetRemainingCents < 0) {
    throw new Error("Referral rewards cannot exceed the referral budget.");
  }
  const negative = db
    .prepare(
      `SELECT user_id FROM (
         SELECT user_id,
           SUM(${PRINCIPAL_CASE}) AS principal_cents,
           SUM(${WALLET_CASE}) AS wallet_cents
         FROM ledger_entries
         WHERE user_id IS NOT NULL
         GROUP BY user_id
       )
       WHERE principal_cents < 0 OR wallet_cents < 0`,
    )
    .get();
  if (negative) {
    throw new Error("An account balance went negative.");
  }
}

function holders(db: Db): { userId: number; principalCents: number }[] {
  const rows = db
    .prepare(
      `SELECT user_id,
         SUM(${PRINCIPAL_CASE}) AS principal_cents
       FROM ledger_entries
       WHERE user_id IS NOT NULL
       GROUP BY user_id
       HAVING principal_cents > 0
       ORDER BY user_id`,
    )
    .all();
  return rows.map((row) => ({
    userId: numberValue(row, "user_id"),
    principalCents: numberValue(row, "principal_cents"),
  }));
}

function insertEntry(
  db: Db,
  input: {
    userId: number | null;
    kind: string;
    amountCents: number;
    fundingSource: string;
    reference: string;
    note: string;
    balanceAfterCents: number;
  },
): number {
  const result = db
    .prepare(
      `INSERT INTO ledger_entries
         (user_id, kind, amount_cents, funding_source, reference, note, balance_after_cents, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.userId,
      input.kind,
      input.amountCents,
      input.fundingSource,
      input.reference,
      input.note,
      input.balanceAfterCents,
      nowIso(),
    );
  return result.lastInsertRowid;
}

function requireNote(note: string): string {
  const trimmed = note.trim();
  if (trimmed.length < 3 || trimmed.length > 280) {
    throw new PlatformError("Add a note between 3 and 280 characters describing the funding source.");
  }
  return trimmed;
}

export function deposit(db: Db, userId: number, amountCents: number): void {
  assertPositiveCents(amountCents, "Deposit");
  withTransaction(db, () => {
    const account = accountOf(db, userId);
    insertEntry(db, {
      userId,
      kind: "wallet_deposit",
      amountCents,
      fundingSource: "investor_transfer",
      reference: `wallet_deposit:${userId}:${randomBytes(8).toString("hex")}`,
      note: "USDT received into the investor wallet. It stays there until it is invested.",
      balanceAfterCents: ownedCents(account) + amountCents,
    });
  });
}

export function invest(db: Db, userId: number, amountCents: number): void {
  assertPositiveCents(amountCents, "Investment");
  withTransaction(db, () => {
    const account = accountOf(db, userId);
    if (amountCents > account.availableCents) {
      throw new PlatformError("Your available wallet balance does not cover that amount.");
    }
    insertEntry(db, {
      userId,
      kind: "invest",
      amountCents,
      fundingSource: "investor_wallet",
      reference: `invest:${userId}:${randomBytes(8).toString("hex")}`,
      note: "USDT moved from the wallet into principal. Principal is not used to pay other investors.",
      balanceAfterCents: ownedCents(account),
    });
    considerReferral(db, userId);
  });
}

export function releasePrincipal(db: Db, userId: number, amountCents: number): void {
  assertPositiveCents(amountCents, "Principal return");
  withTransaction(db, () => {
    const account = accountOf(db, userId);
    if (amountCents > account.principalCents) {
      throw new PlatformError("Invested principal does not have that much USDT.");
    }
    insertEntry(db, {
      userId,
      kind: "release_principal",
      amountCents,
      fundingSource: "investor_principal",
      reference: `release_principal:${userId}:${randomBytes(8).toString("hex")}`,
      note: "Principal returned to the investor wallet. This amount stops earning a daily cap.",
      balanceAfterCents: ownedCents(account),
    });
    considerReferral(db, userId);
  });
}

const WITHDRAWALS_ENABLED_KEY = "withdrawals_enabled";

export function withdrawalsEnabled(db: Db): boolean {
  const row = db.prepare("SELECT value FROM platform_settings WHERE key = ?").get(WITHDRAWALS_ENABLED_KEY);
  if (!row) return true;
  return stringValue(row, "value") !== "0";
}

export function setWithdrawalsEnabled(db: Db, enabled: boolean): void {
  db.prepare(
    `INSERT INTO platform_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(WITHDRAWALS_ENABLED_KEY, enabled ? "1" : "0");
}

export function requestWithdrawal(db: Db, userId: number, amountCents: number, toAddress: string): Withdrawal {
  assertPositiveCents(amountCents, "Withdrawal");
  if (!withdrawalsEnabled(db)) {
    throw new PlatformError("Withdrawals are paused.");
  }
  const address = assertEthAddress(toAddress);
  return withTransaction(db, () => {
    const account = accountOf(db, userId);
    if (amountCents > account.availableCents) {
      throw new PlatformError("Your available wallet balance does not cover that amount.");
    }
    const now = nowIso();
    const result = db
      .prepare(
        `INSERT INTO withdrawals
           (user_id, amount_cents, to_address, status, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', ?, ?)`,
      )
      .run(userId, amountCents, address, now, now);
    const created = db.prepare("SELECT * FROM withdrawals WHERE id = ?").get(result.lastInsertRowid);
    if (!created) throw new PlatformError("Withdrawal could not be recorded.");
    return mapWithdrawal(created);
  });
}

export function markWithdrawalBroadcasting(db: Db, withdrawalId: number, txHash: string): Withdrawal {
  return withTransaction(db, () => {
    const row = db.prepare("SELECT * FROM withdrawals WHERE id = ?").get(withdrawalId);
    if (!row) throw new PlatformError("Withdrawal was not found.");
    if (stringValue(row, "status") !== "pending") {
      throw new PlatformError("Only a pending withdrawal can be broadcast.");
    }
    db.prepare(
      `UPDATE withdrawals
       SET status = 'broadcasting', tx_hash = ?, updated_at = ?
       WHERE id = ?`,
    ).run(txHash, nowIso(), withdrawalId);
    const updated = db.prepare("SELECT * FROM withdrawals WHERE id = ?").get(withdrawalId);
    if (!updated) throw new PlatformError("Withdrawal could not be updated.");
    return mapWithdrawal(updated);
  });
}

export function confirmWithdrawal(db: Db, withdrawalId: number, txHash?: string): Withdrawal {
  return withTransaction(db, () => {
    const row = db.prepare("SELECT * FROM withdrawals WHERE id = ?").get(withdrawalId);
    if (!row) throw new PlatformError("Withdrawal was not found.");
    const status = stringValue(row, "status");
    if (status !== "pending" && status !== "broadcasting") {
      throw new PlatformError("This withdrawal is already finished.");
    }
    const userId = numberValue(row, "user_id");
    const amountCents = numberValue(row, "amount_cents");
    const hash = txHash ?? (row.tx_hash == null ? null : stringValue(row, "tx_hash"));
    if (!hash) throw new PlatformError("A transaction hash is required to confirm the withdrawal.");
    const account = accountOf(db, userId);
    const entryId = insertEntry(db, {
      userId,
      kind: "wallet_withdrawal",
      amountCents,
      fundingSource: "investor_wallet",
      reference: `wallet_withdrawal:${hash}`,
      note: `USDT sent on Ethereum to ${stringValue(row, "to_address")}.`,
      balanceAfterCents: ownedCents({
        ...account,
        pendingCents: Math.max(0, account.pendingCents - amountCents),
        availableCents: account.availableCents,
      }) - amountCents,
    });
    db.prepare(
      `UPDATE withdrawals
       SET status = 'confirmed', tx_hash = ?, ledger_entry_id = ?, updated_at = ?, error_message = NULL
       WHERE id = ?`,
    ).run(hash, entryId, nowIso(), withdrawalId);
    const updated = db.prepare("SELECT * FROM withdrawals WHERE id = ?").get(withdrawalId);
    if (!updated) throw new PlatformError("Withdrawal could not be confirmed.");
    return mapWithdrawal(updated);
  });
}

export function failWithdrawal(db: Db, withdrawalId: number, message: string): Withdrawal {
  return withTransaction(db, () => {
    const row = db.prepare("SELECT * FROM withdrawals WHERE id = ?").get(withdrawalId);
    if (!row) throw new PlatformError("Withdrawal was not found.");
    const status = stringValue(row, "status");
    if (status !== "pending" && status !== "broadcasting") {
      throw new PlatformError("This withdrawal is already finished.");
    }
    db.prepare(
      `UPDATE withdrawals
       SET status = 'failed', error_message = ?, updated_at = ?
       WHERE id = ?`,
    ).run(message.slice(0, 280), nowIso(), withdrawalId);
    const updated = db.prepare("SELECT * FROM withdrawals WHERE id = ?").get(withdrawalId);
    if (!updated) throw new PlatformError("Withdrawal could not be updated.");
    return mapWithdrawal(updated);
  });
}

export function creditChainDeposit(
  db: Db,
  input: {
    userId: number;
    txHash: string;
    fromAddress: string;
    toAddress: string;
    amountCents: number;
  },
): boolean {
  assertPositiveCents(input.amountCents, "Chain deposit");
  return withTransaction(db, () => {
    const existing = db.prepare("SELECT id FROM chain_deposits WHERE tx_hash = ?").get(input.txHash);
    if (existing) return false;
    const account = accountOf(db, input.userId);
    const entryId = insertEntry(db, {
      userId: input.userId,
      kind: "wallet_deposit",
      amountCents: input.amountCents,
      fundingSource: "investor_transfer",
      reference: `wallet_deposit:${input.txHash}`,
      note: `USDT received on Ethereum from ${input.fromAddress}. Send only USDT on Ethereum to this address.`,
      balanceAfterCents: ownedCents(account) + input.amountCents,
    });
    db.prepare(
      `INSERT INTO chain_deposits
         (user_id, tx_hash, from_address, to_address, amount_cents, ledger_entry_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?)`,
    ).run(
      input.userId,
      input.txHash,
      input.fromAddress,
      input.toAddress,
      input.amountCents,
      entryId,
      nowIso(),
    );
    return true;
  });
}

export function listWithdrawals(db: Db, userId?: number): Withdrawal[] {
  const rows = userId
    ? db.prepare("SELECT * FROM withdrawals WHERE user_id = ? ORDER BY id DESC").all(userId)
    : db.prepare("SELECT * FROM withdrawals ORDER BY id DESC").all();
  return rows.map(mapWithdrawal);
}

export function listOpenWithdrawals(db: Db): Withdrawal[] {
  return db
    .prepare("SELECT * FROM withdrawals WHERE status IN ('pending', 'broadcasting') ORDER BY id")
    .all()
    .map(mapWithdrawal);
}

export function listActivity(db: Db, userId: number): ActivityItem[] {
  const entries = listLedger(db, userId).map((entry): ActivityItem => {
    const direction =
      entry.kind === "invest" || entry.kind === "release_principal"
        ? "transfer"
        : entry.kind === "wallet_withdrawal" || entry.kind === "earnings_withdrawal"
          ? "out"
          : "in";
    let txHash: string | null = null;
    if (entry.reference.startsWith("wallet_deposit:")) {
      const maybe = entry.reference.slice("wallet_deposit:".length);
      if (!maybe.includes(":")) txHash = maybe;
    }
    if (entry.reference.startsWith("wallet_withdrawal:")) {
      const maybe = entry.reference.slice("wallet_withdrawal:".length);
      if (!maybe.includes(":")) txHash = maybe;
    }
    return {
      id: `ledger-${entry.id}`,
      kind: entry.kind,
      title: labelKind(entry.kind),
      amountCents: entry.amountCents,
      direction,
      status: "confirmed",
      fundingSource: entry.fundingSource,
      note: entry.note,
      createdAt: entry.createdAt,
      txHash,
      balanceAfterCents: entry.balanceAfterCents,
    };
  });

  const open = listWithdrawals(db, userId)
    .filter((row) => row.status === "pending" || row.status === "broadcasting" || row.status === "failed")
    .map(
      (row): ActivityItem => ({
        id: `withdrawal-${row.id}`,
        kind: "wallet_withdrawal",
        title: "Wallet withdrawal",
        amountCents: row.amountCents,
        direction: "out",
        status: row.status === "failed" ? "failed" : "pending",
        fundingSource: "investor_wallet",
        note:
          row.status === "failed"
            ? row.errorMessage ?? "Withdrawal failed."
            : `Sending USDT on Ethereum to ${row.toAddress}.`,
        createdAt: row.createdAt,
        txHash: row.txHash,
        balanceAfterCents: null,
      }),
    );

  return [...open, ...entries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function recordProjectRevenue(db: Db, amountCents: number, note: string): void {
  assertPositiveCents(amountCents, "Project revenue");
  const cleanNote = requireNote(note);
  withTransaction(db, () => {
    const reference = `revenue:${randomBytes(8).toString("hex")}`;
    insertEntry(db, {
      userId: null,
      kind: "project_revenue",
      amountCents,
      fundingSource: "project_revenue",
      reference,
      note: cleanNote,
      balanceAfterCents: 0,
    });
    const totals = snapshot(db);
    db.prepare("UPDATE ledger_entries SET balance_after_cents = ? WHERE reference = ?").run(
      totals.undistributedRevenueCents,
      reference,
    );
  });
}

export function recordRewardBudget(db: Db, amountCents: number, note: string): void {
  assertPositiveCents(amountCents, "Referral budget");
  const cleanNote = requireNote(note);
  withTransaction(db, () => {
    const reference = `reward_budget:${randomBytes(8).toString("hex")}`;
    insertEntry(db, {
      userId: null,
      kind: "reward_budget",
      amountCents,
      fundingSource: "reward_budget",
      reference,
      note: cleanNote,
      balanceAfterCents: 0,
    });
    const funded = snapshot(db);
    db.prepare("UPDATE ledger_entries SET balance_after_cents = ? WHERE reference = ?").run(
      funded.rewardBudgetRemainingCents,
      reference,
    );
    settleAllReferrals(db);
  });
}

function considerReferral(db: Db, refereeId: number): void {
  const referee = findUserById(db, refereeId);
  if (!referee?.referredByUserId) return;
  const account = accountOf(db, refereeId);
  const existing = db
    .prepare("SELECT id, status FROM referral_grants WHERE referee_user_id = ?")
    .get(refereeId);

  if (!existing) {
    if (account.principalCents < QUALIFYING_PRINCIPAL_CENTS) return;
    db.prepare(
      `INSERT INTO referral_grants
         (referrer_user_id, referee_user_id, amount_cents, status, created_at)
       VALUES (?, ?, ?, 'waiting_for_budget', ?)`,
    ).run(referee.referredByUserId, refereeId, REFERRAL_REWARD_CENTS, nowIso());
  }

  const grant = db.prepare("SELECT id FROM referral_grants WHERE referee_user_id = ?").get(refereeId);
  if (grant) settleGrant(db, numberValue(grant, "id"));
}

function settleGrant(db: Db, grantId: number): void {
  const grant = db.prepare("SELECT * FROM referral_grants WHERE id = ?").get(grantId);
  if (!grant || stringValue(grant, "status") === "paid") return;
  const refereeId = numberValue(grant, "referee_user_id");
  const referrerId = numberValue(grant, "referrer_user_id");
  const amountCents = numberValue(grant, "amount_cents");
  if (accountOf(db, refereeId).principalCents < QUALIFYING_PRINCIPAL_CENTS) return;
  if (snapshot(db).rewardBudgetRemainingCents < amountCents) return;

  const reference = `referral:${refereeId}`;
  const referrerAccount = accountOf(db, referrerId);
  const entryId = insertEntry(db, {
    userId: referrerId,
    kind: "referral_reward",
    amountCents,
    fundingSource: "reward_budget",
    reference,
    note: "Referral reward. Paid in USDT from the referral budget because the invited account still holds at least 100.00 USDT of principal.",
    balanceAfterCents: ownedCents(referrerAccount) + amountCents,
  });
  db.prepare(
    `UPDATE referral_grants
     SET status = 'paid', ledger_entry_id = ?, paid_at = ?
     WHERE id = ?`,
  ).run(entryId, nowIso(), grantId);
}

function settleAllReferrals(db: Db): void {
  const referees = db
    .prepare("SELECT id FROM users WHERE referred_by_user_id IS NOT NULL ORDER BY id")
    .all();
  for (const referee of referees) {
    considerReferral(db, numberValue(referee, "id"));
  }
}

export function payoutPreview(db: Db): {
  holders: ReturnType<typeof allocateDailyReturns>;
  revenueCents: number;
  alreadyRun: PayoutRun | null;
} {
  const totals = snapshot(db);
  return {
    holders: allocateDailyReturns(holders(db), totals.undistributedRevenueCents),
    revenueCents: totals.undistributedRevenueCents,
    alreadyRun: getPayoutRun(db, todayUtc()),
  };
}

export function getPayoutRun(db: Db, runDate: string): PayoutRun | null {
  const row = db.prepare("SELECT * FROM payout_runs WHERE run_date = ?").get(runDate);
  return row ? mapRun(row) : null;
}

export function listPayoutRuns(db: Db): PayoutRun[] {
  return db.prepare("SELECT * FROM payout_runs ORDER BY run_date DESC, id DESC").all().map(mapRun);
}

export function runDailyPayout(db: Db, runDate = todayUtc()): PayoutRun {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(runDate)) {
    throw new PlatformError("Distribution date must be YYYY-MM-DD.");
  }
  return withTransaction(db, () => {
    if (getPayoutRun(db, runDate)) {
      throw new PlatformError(`A distribution for ${runDate} has already been recorded.`);
    }
    const available = snapshot(db).undistributedRevenueCents;
    if (available <= 0) {
      throw new PlatformError(
        "No undistributed project revenue. Record revenue before running the daily return.",
      );
    }
    const active = holders(db);
    const allocation = allocateDailyReturns(active, available);
    const plan = allocation.filter((row) => row.amountCents > 0);
    if (plan.length === 0) {
      throw new PlatformError("No active principal is large enough for a daily return.");
    }

    let distributed = 0;
    for (const row of plan) {
      const account = accountOf(db, row.userId);
      insertEntry(db, {
        userId: row.userId,
        kind: "daily_return",
        amountCents: row.amountCents,
        fundingSource: "project_revenue",
        reference: `daily_return:${runDate}:${row.userId}`,
        note: `Daily return for ${runDate}. Share of recorded project revenue, in USDT, within the 3.00 USDT per 100.00 USDT daily cap.`,
        balanceAfterCents: ownedCents(account) + row.amountCents,
      });
      distributed += row.amountCents;
    }

    const totalPrincipal = allocation.reduce((sum, holder) => sum + holder.principalCents, 0);
    const totalCap = allocation.reduce((sum, holder) => sum + holder.capCents, 0);
    const result = db
      .prepare(
        `INSERT INTO payout_runs
           (run_date, principal_cents, cap_cents, revenue_available_cents, distributed_cents, investor_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(runDate, totalPrincipal, totalCap, available, distributed, plan.length, nowIso());
    const created = db.prepare("SELECT * FROM payout_runs WHERE id = ?").get(result.lastInsertRowid);
    if (!created) throw new PlatformError("Distribution could not be recorded.");
    return mapRun(created);
  });
}

export function listLedger(db: Db, userId: number): LedgerEntry[] {
  return db
    .prepare("SELECT * FROM ledger_entries WHERE user_id = ? ORDER BY id DESC")
    .all(userId)
    .map(mapEntry);
}

export function listPlatformEntries(db: Db): LedgerEntry[] {
  return db
    .prepare(
      `SELECT * FROM ledger_entries
       WHERE kind IN ('project_revenue', 'reward_budget')
       ORDER BY id DESC`,
    )
    .all()
    .map(mapEntry);
}

export function listReferrals(db: Db, referrerId: number): ReferralRow[] {
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.created_at, g.status, g.amount_cents, g.paid_at
       FROM users u
       LEFT JOIN referral_grants g ON g.referee_user_id = u.id
       WHERE u.referred_by_user_id = ?
       ORDER BY u.id DESC`,
    )
    .all(referrerId);

  return rows.map((row) => {
    const userId = numberValue(row, "id");
    const principal = accountOf(db, userId).principalCents;
    const statusRaw = row.status == null ? null : stringValue(row, "status");
    let status: ReferralRow["status"] = "not_qualified";
    if (statusRaw === "paid") status = "paid";
    else if (principal >= QUALIFYING_PRINCIPAL_CENTS && statusRaw === "waiting_for_budget") {
      status = "waiting_for_budget";
    }
    return {
      userId,
      name: stringValue(row, "name"),
      createdAt: stringValue(row, "created_at"),
      principalCents: principal,
      status,
      amountCents: row.amount_cents == null ? REFERRAL_REWARD_CENTS : numberValue(row, "amount_cents"),
      paidAt: row.paid_at == null ? null : stringValue(row, "paid_at"),
    };
  });
}

export function shareForUser(
  preview: ReturnType<typeof payoutPreview>,
  userId: number,
): { capCents: number; amountCents: number } {
  const row = preview.holders.find((holder) => holder.userId === userId);
  return {
    capCents: row?.capCents ?? 0,
    amountCents: row?.amountCents ?? 0,
  };
}
