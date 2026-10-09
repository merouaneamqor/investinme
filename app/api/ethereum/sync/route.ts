import { NextResponse } from "next/server";
import { syncChain } from "@/lib/chain-sync";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.ETH_SYNC_SECRET;
  if (secret) {
    const header = request.headers.get("x-ethereum-sync-secret");
    if (header !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const result = await syncChain(getDb());
  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return POST(request);
}
