import { NextResponse } from "next/server";
import { tickHarvest } from "@/lib/harvest";
import { isCronAuthorized } from "@/lib/cron-auth";

export const maxDuration = 30;

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await tickHarvest();
  return NextResponse.json(result);
}
