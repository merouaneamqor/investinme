import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allocateDailyReturns } from "./allocate";
import { openDatabase } from "./db";
import { dailyCapCents, formatUsdt, parseUsdt } from "./money";
import {
  accountOf,
  confirmWithdrawal,
  creditChainDeposit,
  deposit,
  invest,
  listActivity,
  listLedger,
  recordProjectRevenue,
  recordRewardBudget,
  registerUser,
  releasePrincipal,
  requestWithdrawal,
  runDailyPayout,
  setWithdrawalsEnabled,
  snapshot,
  withdrawalsEnabled,
} from "./platform";

function db() {
  return openDatabase(":memory:");
}

describe("USDT amounts", () => {
  it("formats and parses USDT, and rejects a dollar sign", () => {
    assert.equal(formatUsdt(10_000), "100.00 USDT");
    assert.equal(formatUsdt(300), "3.00 USDT");
    assert.equal(parseUsdt("100 USDT"), 10_000);
    assert.equal(parseUsdt("3.50"), 350);
    assert.throws(() => parseUsdt("$100"), /USDT/);
  });
});

describe("daily return funding", () => {
  it("pays a capped share only from recorded project revenue", () => {
    const database = db();
    const investor = registerUser(database, {
      name: "Ada Investor",
      email: "ada@example.com",
      password: "password1",
    });
    deposit(database, investor.id, 10_000);
    assert.equal(accountOf(database, investor.id).walletCents, 10_000);
    assert.equal(accountOf(database, investor.id).principalCents, 0);
    assert.match(investor.walletCode, /^IMW-/);

    invest(database, investor.id, 10_000);
    assert.equal(accountOf(database, investor.id).walletCents, 0);
    assert.equal(accountOf(database, investor.id).principalCents, 10_000);
    assert.throws(
      () => runDailyPayout(database, "2026-10-09"),
      /No undistributed project revenue/,
    );

    recordProjectRevenue(database, 5_000, "October grid-services settlement");
    const run = runDailyPayout(database, "2026-10-09");

    assert.equal(run.distributedCents, 300);
    assert.equal(accountOf(database, investor.id).principalCents, 10_000);
    assert.equal(accountOf(database, investor.id).walletCents, 300);
    assert.equal(snapshot(database).undistributedRevenueCents, 4_700);
    assert.equal(snapshot(database).principalCents, 10_000);

    const entry = listLedger(database, investor.id).find((row) => row.kind === "daily_return");
    assert.equal(entry?.fundingSource, "project_revenue");
    assert.equal(entry?.balanceAfterCents, 10_300);
  });

  it("refuses a second distribution on the same day", () => {
    const database = db();
    const investor = registerUser(database, {
      name: "Grace Investor",
      email: "grace@example.com",
      password: "password1",
    });
    deposit(database, investor.id, 10_000);
    invest(database, investor.id, 10_000);
    recordProjectRevenue(database, 1_000, "Operating cash");
    runDailyPayout(database, "2026-10-09");
    assert.throws(() => runDailyPayout(database, "2026-10-09"), /already been recorded/);
    assert.equal(accountOf(database, investor.id).walletCents, 300);
  });

  it("splits revenue by principal and never pays above the cap", () => {
    const plan = allocateDailyReturns(
      [
        { userId: 1, principalCents: 10_000 },
        { userId: 2, principalCents: 30_000 },
      ],
      100_000,
    );
    assert.deepEqual(
      plan.map((row) => row.amountCents),
      [dailyCapCents(10_000), dailyCapCents(30_000)],
    );
    assert.equal(
      plan.reduce((sum, row) => sum + row.amountCents, 0),
      1_200,
    );

    const tight = allocateDailyReturns(
      [
        { userId: 1, principalCents: 10_000 },
        { userId: 2, principalCents: 10_000 },
        { userId: 3, principalCents: 10_000 },
      ],
      500,
    );
    const paid = tight.reduce((sum, row) => sum + row.amountCents, 0);
    assert.equal(paid, 500);
    assert.ok(tight.every((row) => row.amountCents <= row.capCents));
  });
});

describe("referrals, chain deposits, and withdrawals", () => {
  it("pays a referral only from the referral budget while principal still qualifies", () => {
    const database = db();
    const referrer = registerUser(database, {
      name: "Mina Referrer",
      email: "mina@example.com",
      password: "password1",
    });
    const referee = registerUser(database, {
      name: "Noah Invitee",
      email: "noah@example.com",
      password: "password1",
      referralCode: referrer.referralCode,
    });

    deposit(database, referee.id, 10_000);
    assert.equal(accountOf(database, referrer.id).walletCents, 0);
    assert.equal(snapshot(database).principalCents, 0);
    invest(database, referee.id, 10_000);
    assert.equal(accountOf(database, referrer.id).walletCents, 0);
    assert.equal(snapshot(database).principalCents, 10_000);

    recordProjectRevenue(database, 10_000, "This cash is operating revenue, not referral funds");
    assert.equal(accountOf(database, referrer.id).walletCents, 0);

    recordRewardBudget(database, 1_000, "Prefunded referral budget");
    assert.equal(accountOf(database, referrer.id).walletCents, 1_000);
    assert.equal(accountOf(database, referrer.id).principalCents, 0);
    assert.equal(snapshot(database).rewardBudgetRemainingCents, 0);
    assert.equal(snapshot(database).undistributedRevenueCents, 10_000);
    assert.equal(snapshot(database).principalCents, 10_000);

    const reward = listLedger(database, referrer.id).find((row) => row.kind === "referral_reward");
    assert.equal(reward?.fundingSource, "reward_budget");
  });

  it("does not pay a referral funded after the invitee returns principal", () => {
    const database = db();
    const referrer = registerUser(database, {
      name: "Mina Referrer",
      email: "mina@example.com",
      password: "password1",
    });
    const referee = registerUser(database, {
      name: "Noah Invitee",
      email: "noah@example.com",
      password: "password1",
      referralCode: referrer.referralCode,
    });
    deposit(database, referee.id, 10_000);
    invest(database, referee.id, 10_000);
    releasePrincipal(database, referee.id, 10_000);
    recordRewardBudget(database, 1_000, "Referral budget");
    assert.equal(accountOf(database, referrer.id).walletCents, 0);
    assert.equal(snapshot(database).rewardBudgetRemainingCents, 1_000);
  });

  it("reserves pending withdrawals and credits chain deposits once", () => {
    const database = db();
    const investor = registerUser(database, {
      name: "Ada Investor",
      email: "ada@example.com",
      password: "password1",
    });
    creditChainDeposit(database, {
      userId: investor.id,
      txHash: "tx_once",
      fromAddress: "0x1111111111111111111111111111111111111111",
      toAddress: "0x2222222222222222222222222222222222222222",
      amountCents: 10_000,
    });
    assert.equal(
      creditChainDeposit(database, {
        userId: investor.id,
        txHash: "tx_once",
        fromAddress: "0x1111111111111111111111111111111111111111",
        toAddress: "0x2222222222222222222222222222222222222222",
        amountCents: 10_000,
      }),
      false,
    );
    assert.equal(accountOf(database, investor.id).availableCents, 10_000);

    const withdrawal = requestWithdrawal(
      database,
      investor.id,
      3_000,
      "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    );
    assert.equal(withdrawal.status, "pending");
    assert.equal(accountOf(database, investor.id).availableCents, 7_000);
    assert.equal(accountOf(database, investor.id).pendingCents, 3_000);
    assert.throws(() => invest(database, investor.id, 7_001), /available wallet balance/);

    confirmWithdrawal(database, withdrawal.id, "tx_out_1");
    assert.equal(accountOf(database, investor.id).walletCents, 7_000);
    assert.equal(accountOf(database, investor.id).pendingCents, 0);
    assert.ok(listActivity(database, investor.id).some((row) => row.txHash === "tx_out_1"));
  });

  it("pauses and resumes withdrawals from platform settings", () => {
    const database = db();
    const investor = registerUser(database, {
      name: "Ada Investor",
      email: "ada@example.com",
      password: "password1",
    });
    creditChainDeposit(database, {
      userId: investor.id,
      txHash: "tx_pause",
      fromAddress: "0x1111111111111111111111111111111111111111",
      toAddress: "0x2222222222222222222222222222222222222222",
      amountCents: 5_000,
    });
    assert.equal(withdrawalsEnabled(database), true);

    setWithdrawalsEnabled(database, false);
    assert.equal(withdrawalsEnabled(database), false);
    assert.throws(
      () =>
        requestWithdrawal(
          database,
          investor.id,
          1_000,
          "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        ),
      /Withdrawals are paused/,
    );
    assert.equal(accountOf(database, investor.id).availableCents, 5_000);
    assert.equal(accountOf(database, investor.id).pendingCents, 0);

    setWithdrawalsEnabled(database, true);
    assert.equal(withdrawalsEnabled(database), true);
    const withdrawal = requestWithdrawal(
      database,
      investor.id,
      1_000,
      "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    );
    assert.equal(withdrawal.status, "pending");
    assert.equal(accountOf(database, investor.id).pendingCents, 1_000);
  });
});
