import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { tickHarvest } from "@/lib/harvest";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await tickHarvest({ chain: false });
  return NextResponse.json(result);
}
