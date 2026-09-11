import { NextResponse } from "next/server";
import { tickDialer } from "@/lib/dialer";
import { tickHarvest } from "@/lib/harvest";
import { isCronAuthorized } from "@/lib/cron-auth";

export const maxDuration = 30;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [dialer, harvest] = await Promise.all([tickDialer(), tickHarvest()]);
  return NextResponse.json({ dialer, harvest });
}

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [dialer, harvest] = await Promise.all([tickDialer(), tickHarvest()]);
  return NextResponse.json({ dialer, harvest });
}
