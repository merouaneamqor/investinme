export const CURRENCY = "USDT";
export const DAILY_CAP_CENTS_PER_100 = 300;
export const REFERRAL_REWARD_CENTS = 1000;
export const QUALIFYING_PRINCIPAL_CENTS = 10_000;
export const DEMO_OPERATOR_EMAIL = "operator@investinme.local";
export const DEMO_OPERATOR_PASSWORD = "demo-operator";

export class PlatformError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformError";
  }
}

export function dailyCapCents(principalCents: number): number {
  if (principalCents <= 0) return 0;
  return Math.floor((principalCents * DAILY_CAP_CENTS_PER_100) / 10_000);
}

export function formatUsdt(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  return `${sign}${whole.toLocaleString("en-US")}.${String(remainder).padStart(2, "0")} ${CURRENCY}`;
}

export function parseUsdt(input: string): number {
  const trimmed = input.trim().replace(/usdt$/i, "").trim();
  if (trimmed.includes("$")) {
    throw new PlatformError("Enter the amount in USDT, without a dollar sign.");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new PlatformError("Enter an amount in USDT, such as 100 or 100.00.");
  }
  const [whole, fraction = ""] = trimmed.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new PlatformError("Amount must be greater than zero.");
  }
  if (cents > 100_000_000) {
    throw new PlatformError("Amount exceeds the 1,000,000.00 USDT limit for a single entry.");
  }
  return cents;
}

export function formatWhen(iso: string): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(iso)) + " UTC"
  );
}

export function todayUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function assertPositiveCents(amount: number, label: string): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new PlatformError(`${label} must be a positive amount.`);
  }
  if (amount > 100_000_000) {
    throw new PlatformError(`${label} exceeds the 1,000,000.00 USDT limit for a single entry.`);
  }
}
