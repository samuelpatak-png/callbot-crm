import { NextResponse } from "next/server";
import { tickDialer } from "@/lib/dialer";

export const maxDuration = 30;

function authorized(request: Request) {
  const header = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return header === `Bearer ${secret}` || request.headers.get("x-cron-secret") === secret;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await tickDialer();
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await tickDialer();
  return NextResponse.json(result);
}
