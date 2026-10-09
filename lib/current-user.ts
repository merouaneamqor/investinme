import { cookies } from "next/headers";
import { getDb } from "./db";
import { findUserById, type User } from "./platform";
import { readSession, signSession } from "./session";

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const userId = readSession(jar.get("session")?.value);
  if (!userId) return null;
  return findUserById(getDb(), userId);
}

export async function setSession(userId: number): Promise<void> {
  const jar = await cookies();
  jar.set("session", signSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete("session");
}
