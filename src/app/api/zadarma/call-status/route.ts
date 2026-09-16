import { NextResponse } from "next/server";
import { getRuntimeConfig } from "@/lib/settings";
import { ingestZadarmaEvent } from "@/lib/zadarma-ingest";
import { zadarmaSignaturePayload, verifyZadarmaSignature } from "@/lib/zadarma";

export const maxDuration = 30;

async function parseBody(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = (await request.json()) as Record<string, unknown>;
    const body: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value == null) continue;
      body[key] = String(value);
    }
    return body;
  }
  const form = await request.formData();
  const body: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === "string") body[key] = value;
  });
  return body;
}

function echoResponse(request: Request) {
  const echo = new URL(request.url).searchParams.get("zd_echo");
  if (echo === null) return null;
  return new Response(echo, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function GET(request: Request) {
  return echoResponse(request) ?? NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const echoed = echoResponse(request);
  if (echoed) return echoed;

  const body = await parseBody(request);
  if (body.zd_echo) {
    return new Response(body.zd_echo, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const config = await getRuntimeConfig();
  const signature =
    request.headers.get("signature") || request.headers.get("Signature") || body.signature || null;
  const event = String(body.event || "").toUpperCase();
  if (
    !verifyZadarmaSignature({
      secret: config.zadarmaApiSecret,
      signature,
      payload: zadarmaSignaturePayload(event, body),
    })
  ) {
    return NextResponse.json({ error: "Neplatný podpis Zadarma" }, { status: 401 });
  }

  const result = await ingestZadarmaEvent(body);
  return NextResponse.json(result);
}
