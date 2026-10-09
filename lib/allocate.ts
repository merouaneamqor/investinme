import { dailyCapCents } from "./money";

export type Holder = {
  userId: number;
  principalCents: number;
};

export type Allocation = {
  userId: number;
  principalCents: number;
  capCents: number;
  amountCents: number;
};

function mulDivFloor(amount: number, numerator: number, denominator: number): number {
  return Number((BigInt(amount) * BigInt(numerator)) / BigInt(denominator));
}

export function allocateDailyReturns(holders: Holder[], revenueCents: number): Allocation[] {
  const active = holders
    .filter((holder) => holder.principalCents > 0)
    .map((holder) => ({
      ...holder,
      capCents: dailyCapCents(holder.principalCents),
    }))
    .filter((holder) => holder.capCents > 0)
    .sort((a, b) => a.userId - b.userId);

  if (active.length === 0 || revenueCents <= 0) {
    return active.map((holder) => ({ ...holder, amountCents: 0 }));
  }

  const totalPrincipal = active.reduce((sum, holder) => sum + holder.principalCents, 0);
  const totalCap = active.reduce((sum, holder) => sum + holder.capCents, 0);
  const distributable = Math.min(revenueCents, totalCap);

  const parts = active.map((holder) => {
    const product = BigInt(distributable) * BigInt(holder.principalCents);
    const floor = mulDivFloor(distributable, holder.principalCents, totalPrincipal);
    const remainder = product % BigInt(totalPrincipal);
    const amountCents = Math.min(floor, holder.capCents);
    return { ...holder, amountCents, remainder };
  });

  let leftover = distributable - parts.reduce((sum, part) => sum + part.amountCents, 0);
  const byRemainder = [...parts].sort((a, b) => {
    if (a.remainder === b.remainder) return a.userId - b.userId;
    return a.remainder > b.remainder ? -1 : 1;
  });

  for (const part of byRemainder) {
    if (leftover <= 0) break;
    if (part.amountCents >= part.capCents) continue;
    part.amountCents += 1;
    leftover -= 1;
  }

  return parts.map(({ remainder: _remainder, ...part }) => part);
}
