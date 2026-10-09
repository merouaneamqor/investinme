"use server";

import { redirect } from "next/navigation";
import { clearSession, currentUser, setSession } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { simulateInboundDeposit, syncChain } from "@/lib/chain-sync";
import { formatUsdt, parseUsdt, PlatformError } from "@/lib/money";
import {
  authenticate,
  invest,
  recordProjectRevenue,
  recordRewardBudget,
  registerUser,
  releasePrincipal,
  requestWithdrawal,
  runDailyPayout,
  setWithdrawalsEnabled,
} from "@/lib/platform";
import { assertEthAddress, hasHotWallet } from "@/lib/ethereum";

function redirectError(error: unknown, fallback = "/"): never {
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
  ) {
    throw error;
  }
  console.error(error);
  const message = error instanceof PlatformError ? error.message : "The ledger rejected that entry.";
  redirect(`${fallback}?error=${encodeURIComponent(message)}`);
}

async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/");
  return user;
}

async function requireOperator() {
  const user = await requireUser();
  if (!user.isOperator) {
    redirect("/dashboard?error=Only the project operator can record funding.");
  }
  return user;
}

export async function registerAction(formData: FormData) {
  try {
    const user = registerUser(getDb(), {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      referralCode: String(formData.get("referralCode") ?? ""),
    });
    await setSession(user.id);
  } catch (error) {
    redirectError(error);
  }
  redirect("/dashboard?notice=Account opened. Send USDT on Ethereum to your deposit address.");
}

export async function loginAction(formData: FormData) {
  try {
    const user = authenticate(
      getDb(),
      String(formData.get("email") ?? ""),
      String(formData.get("password") ?? ""),
    );
    await setSession(user.id);
  } catch (error) {
    redirectError(error);
  }
  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSession();
  redirect("/");
}

export async function investAction(formData: FormData) {
  const user = await requireUser();
  try {
    const amount = parseUsdt(String(formData.get("amount") ?? ""));
    invest(getDb(), user.id, amount);
    redirect(
      `/invest?notice=${encodeURIComponent(
        `Invested ${formatUsdt(amount)}. Daily cap is now based on your principal.`,
      )}`,
    );
  } catch (error) {
    if (error instanceof PlatformError) {
      redirect(`/invest?error=${encodeURIComponent(error.message)}`);
    }
    redirectError(error, "/invest");
  }
}

export async function releasePrincipalAction(formData: FormData) {
  const user = await requireUser();
  try {
    releasePrincipal(getDb(), user.id, parseUsdt(String(formData.get("amount") ?? "")));
  } catch (error) {
    if (error instanceof PlatformError) {
      redirect(`/invest?error=${encodeURIComponent(error.message)}`);
    }
    redirectError(error, "/invest");
  }
  redirect("/invest?notice=Principal returned to your wallet.");
}

export async function sendAction(formData: FormData) {
  const user = await requireUser();
  try {
    const amount = parseUsdt(String(formData.get("amount") ?? ""));
    const toAddress = assertEthAddress(String(formData.get("toAddress") ?? ""));
    const confirmed = String(formData.get("confirm") ?? "") === "1";
    if (!confirmed) {
      redirect(
        `/wallet/send?amount=${encodeURIComponent(String(formData.get("amount") ?? ""))}&toAddress=${encodeURIComponent(toAddress)}&step=confirm`,
      );
    }
    const withdrawal = requestWithdrawal(getDb(), user.id, amount, toAddress);
    await syncChain(getDb());
    redirect(
      `/dashboard?notice=${encodeURIComponent(
        `Send of ${formatUsdt(amount)} queued${hasHotWallet() || process.env.ETH_SIMULATE_TRANSFERS === "1" ? " and processed" : ""}. #${withdrawal.id}`,
      )}`,
    );
  } catch (error) {
    if (error instanceof PlatformError) {
      redirect(`/wallet/send?error=${encodeURIComponent(error.message)}`);
    }
    redirectError(error, "/wallet/send");
  }
}

export async function revenueAction(formData: FormData) {
  await requireOperator();
  try {
    recordProjectRevenue(
      getDb(),
      parseUsdt(String(formData.get("amount") ?? "")),
      String(formData.get("note") ?? ""),
    );
  } catch (error) {
    if (error instanceof PlatformError) {
      redirect(`/operations?error=${encodeURIComponent(error.message)}`);
    }
    redirectError(error, "/operations");
  }
  redirect("/operations?notice=Project revenue recorded. It can fund a daily distribution.");
}

export async function budgetAction(formData: FormData) {
  await requireOperator();
  try {
    recordRewardBudget(
      getDb(),
      parseUsdt(String(formData.get("amount") ?? "")),
      String(formData.get("note") ?? ""),
    );
  } catch (error) {
    if (error instanceof PlatformError) {
      redirect(`/operations?error=${encodeURIComponent(error.message)}`);
    }
    redirectError(error, "/operations");
  }
  redirect("/operations?notice=Referral budget recorded. Qualified rewards were settled against it.");
}

export async function payoutAction() {
  await requireOperator();
  try {
    const run = runDailyPayout(getDb());
    redirect(
      `/operations?notice=${encodeURIComponent(
        `Distribution for ${run.runDate} posted ${formatUsdt(run.distributedCents)} from project revenue.`,
      )}`,
    );
  } catch (error) {
    if (error instanceof PlatformError) {
      redirect(`/operations?error=${encodeURIComponent(error.message)}`);
    }
    redirectError(error, "/operations");
  }
}

export async function syncChainAction() {
  await requireOperator();
  try {
    const result = await syncChain(getDb());
    redirect(
      `/operations?notice=${encodeURIComponent(
        `Synced: ${result.depositsCredited} deposits, ${result.withdrawalsBroadcast} broadcasts, ${result.withdrawalsConfirmed} confirms, ${result.withdrawalsFailed} failed.`,
      )}`,
    );
  } catch (error) {
    if (error instanceof PlatformError) {
      redirect(`/operations?error=${encodeURIComponent(error.message)}`);
    }
    redirectError(error, "/operations");
  }
}

export async function setWithdrawalsAction(formData: FormData) {
  await requireOperator();
  const enabled = String(formData.get("enabled") ?? "") === "1";
  setWithdrawalsEnabled(getDb(), enabled);
  redirect(
    `/operations?notice=${encodeURIComponent(
      enabled ? "Withdrawals are open." : "Withdrawals are paused.",
    )}`,
  );
}

export async function simulateDepositAction(formData: FormData) {
  const user = await requireOperator();
  try {
    const targetId = Number(formData.get("userId") ?? user.id);
    simulateInboundDeposit(getDb(), targetId, parseUsdt(String(formData.get("amount") ?? "")));
  } catch (error) {
    if (error instanceof PlatformError) {
      redirect(`/operations?error=${encodeURIComponent(error.message)}`);
    }
    redirectError(error, "/operations");
  }
  redirect("/operations?notice=Simulated Ethereum deposit credited to the wallet.");
}
