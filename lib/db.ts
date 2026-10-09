import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ensureDepositAddresses, ensureWalletCodes, seedOperator } from "./platform";

export type SqlValue = string | number | null;

export type RunResult = {
  lastInsertRowid: number;
  changes: number;
};

export type Statement = {
  run(...params: SqlValue[]): RunResult;
  get(...params: SqlValue[]): Record<string, unknown> | undefined;
  all(...params: SqlValue[]): Record<string, unknown>[];
};

export type Db = {
  exec(sql: string): void;
  prepare(sql: string): Statement;
};

const MIGRATION = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  referral_code TEXT NOT NULL UNIQUE,
  referred_by_user_id INTEGER REFERENCES users(id),
  is_operator INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN (
    'deposit',
    'wallet_deposit',
    'invest',
    'release_principal',
    'principal_withdrawal',
    'daily_return',
    'referral_reward',
    'earnings_withdrawal',
    'wallet_withdrawal',
    'project_revenue',
    'reward_budget'
  )),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  funding_source TEXT NOT NULL CHECK (funding_source IN (
    'investor_transfer',
    'investor_wallet',
    'project_revenue',
    'reward_budget',
    'investor_earnings',
    'investor_principal'
  )),
  reference TEXT NOT NULL UNIQUE,
  note TEXT NOT NULL,
  balance_after_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ledger_entries_user_id ON ledger_entries(user_id, id);

CREATE TABLE IF NOT EXISTS payout_runs (
  id INTEGER PRIMARY KEY,
  run_date TEXT NOT NULL UNIQUE,
  principal_cents INTEGER NOT NULL,
  cap_cents INTEGER NOT NULL,
  revenue_available_cents INTEGER NOT NULL,
  distributed_cents INTEGER NOT NULL,
  investor_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS referral_grants (
  id INTEGER PRIMARY KEY,
  referrer_user_id INTEGER NOT NULL REFERENCES users(id),
  referee_user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('waiting_for_budget', 'paid')),
  ledger_entry_id INTEGER REFERENCES ledger_entries(id),
  created_at TEXT NOT NULL,
  paid_at TEXT
);

CREATE TABLE IF NOT EXISTS chain_deposits (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  tx_hash TEXT NOT NULL UNIQUE,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  ledger_entry_id INTEGER REFERENCES ledger_entries(id),
  status TEXT NOT NULL CHECK (status IN ('confirmed')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  to_address TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'broadcasting', 'confirmed', 'failed')),
  tx_hash TEXT UNIQUE,
  ledger_entry_id INTEGER REFERENCES ledger_entries(id),
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS withdrawals_user_id ON withdrawals(user_id, id);
CREATE INDEX IF NOT EXISTS chain_deposits_user_id ON chain_deposits(user_id, id);

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function wrap(sqlite: DatabaseSync): Db {
  return {
    exec(sql) {
      sqlite.exec(sql);
    },
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        run(...params) {
          const result = statement.run(...params);
          return {
            lastInsertRowid: Number(result.lastInsertRowid),
            changes: Number(result.changes),
          };
        },
        get(...params) {
          const row = statement.get(...params);
          return row == null ? undefined : (row as Record<string, unknown>);
        },
        all(...params) {
          return statement.all(...params) as Record<string, unknown>[];
        },
      };
    },
  };
}

export function openDatabase(filename: string): Db {
  const sqlite = new DatabaseSync(filename);
  const db = wrap(sqlite);
  db.exec("PRAGMA foreign_keys = ON");
  if (filename !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL");
  }
  db.exec("PRAGMA busy_timeout = 3000");
  db.exec(MIGRATION);
  upgradeExistingDatabase(db);
  return db;
}

function upgradeExistingDatabase(db: Db): void {
  const ledger = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ledger_entries'").get();
  const ledgerSql = ledger && typeof ledger.sql === "string" ? ledger.sql : "";
  if (!ledgerSql.includes("wallet_deposit")) {
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN");
    db.exec(`
      CREATE TABLE ledger_entries_v2 (
        id INTEGER PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        kind TEXT NOT NULL CHECK (kind IN (
          'deposit',
          'wallet_deposit',
          'invest',
          'release_principal',
          'principal_withdrawal',
          'daily_return',
          'referral_reward',
          'earnings_withdrawal',
          'wallet_withdrawal',
          'project_revenue',
          'reward_budget'
        )),
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        funding_source TEXT NOT NULL CHECK (funding_source IN (
          'investor_transfer',
          'investor_wallet',
          'project_revenue',
          'reward_budget',
          'investor_earnings',
          'investor_principal'
        )),
        reference TEXT NOT NULL UNIQUE,
        note TEXT NOT NULL,
        balance_after_cents INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    db.exec(`
      INSERT INTO ledger_entries_v2
        (id, user_id, kind, amount_cents, funding_source, reference, note, balance_after_cents, created_at)
      SELECT id, user_id, kind, amount_cents, funding_source, reference, note, balance_after_cents, created_at
      FROM ledger_entries
    `);
    db.exec("DROP TABLE ledger_entries");
    db.exec("ALTER TABLE ledger_entries_v2 RENAME TO ledger_entries");
    db.exec("CREATE INDEX IF NOT EXISTS ledger_entries_user_id ON ledger_entries(user_id, id)");
    db.exec("COMMIT");
    db.exec("PRAGMA foreign_keys = ON");
  }

  const columns = db.prepare("PRAGMA table_info(users)").all();
  const names = new Set(columns.map((column) => String(column.name)));
  if (!names.has("wallet_code")) {
    db.exec("ALTER TABLE users ADD COLUMN wallet_code TEXT");
  }
  if (!names.has("tron_address")) {
    db.exec("ALTER TABLE users ADD COLUMN tron_address TEXT");
  }
  if (!names.has("tron_derivation_index")) {
    db.exec("ALTER TABLE users ADD COLUMN tron_derivation_index INTEGER");
  }
  if (!names.has("deposit_address")) {
    db.exec("ALTER TABLE users ADD COLUMN deposit_address TEXT");
  }
  if (!names.has("derivation_index")) {
    db.exec("ALTER TABLE users ADD COLUMN derivation_index INTEGER");
  }
  // Clear legacy TRON addresses; a T… address is not a valid Ethereum receive address.
  db.exec(`
    UPDATE users
    SET tron_address = NULL, tron_derivation_index = NULL
    WHERE tron_address IS NOT NULL
  `);
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_wallet_code ON users(wallet_code)");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_deposit_address ON users(deposit_address)");
  db.exec(`
    CREATE TABLE IF NOT EXISTS chain_deposits (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      tx_hash TEXT NOT NULL UNIQUE,
      from_address TEXT NOT NULL,
      to_address TEXT NOT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      ledger_entry_id INTEGER REFERENCES ledger_entries(id),
      status TEXT NOT NULL CHECK (status IN ('confirmed')),
      created_at TEXT NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      to_address TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'broadcasting', 'confirmed', 'failed')),
      tx_hash TEXT UNIQUE,
      ledger_entry_id INTEGER REFERENCES ledger_entries(id),
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.exec("CREATE INDEX IF NOT EXISTS withdrawals_user_id ON withdrawals(user_id, id)");
  db.exec("CREATE INDEX IF NOT EXISTS chain_deposits_user_id ON chain_deposits(user_id, id)");
  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

let singleton: Db | null = null;

export function getDb(): Db {
  if (!singleton) {
    const file = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "investinme.sqlite");
    if (file !== ":memory:") {
      fs.mkdirSync(path.dirname(file), { recursive: true });
    }
    singleton = openDatabase(file);
    seedOperator(singleton);
    ensureWalletCodes(singleton);
    ensureDepositAddresses(singleton);
  }
  return singleton;
}
