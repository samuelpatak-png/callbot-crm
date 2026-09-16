/**
 * Zadarma PBX event notifications — /api/zadarma/call-status
 *
 * Handshake: Zadarma saves the URL only if a request with `zd_echo=<token>`
 * (GET query or POST form) gets HTTP 200 and the raw token as the body.
 * That probe is unsigned. Do not wrap it in JSON, do not redirect, do not auth.
 *
 * Later events arrive as POST application/x-www-form-urlencoded plus a
 * `Signature` header:
 *   concat = values of payload keys sorted alphabetically, joined with no separator
 *   signature = base64( hmac_sha1( md5(concat), ZADARMA_API_SECRET ) )
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ingestZadarmaEvent } from "@/lib/zadarma-ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function echoReply(value: string) {
  return new NextResponse(value, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

function parseForm(raw: string) {
  const body: Record<string, string> = {};
  const params = new URLSearchParams(raw);
  params.forEach((value, key) => {
    body[key] = value;
  });
  return body;
}

function expectedSignature(secret: string, body: Record<string, string>) {
  const concat = Object.keys(body)
    .filter((key) => key.toLowerCase() !== "signature")
    .sort()
    .map((key) => body[key] ?? "")
    .join("");
  const md5 = createHash("md5").update(concat).digest("hex");
  return createHmac("sha1", secret).update(md5).digest("base64");
}

function signaturesMatch(expected: string, received: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function handle(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.has("zd_echo")) {
    return echoReply(url.searchParams.get("zd_echo") ?? "");
  }

  let raw = "";
  if (request.method !== "GET") {
    raw = await request.text();
  }
  const body = parseForm(raw);
  if (Object.prototype.hasOwnProperty.call(body, "zd_echo")) {
    return echoReply(body.zd_echo);
  }

  const secret = process.env.ZADARMA_API_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "server not configured" }, { status: 500 });
  }

  const signature = request.headers.get("signature");
  if (!signature) {
    console.warn("Zadarma webhook: missing signature header");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const expected = expectedSignature(secret, body);
  if (!signaturesMatch(expected, signature)) {
    console.warn("Zadarma webhook: signature mismatch");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  console.log("Zadarma webhook", body);
  await ingestZadarmaEvent(body);
  return new NextResponse("ok", { status: 200 });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
