import { createHmac, timingSafeEqual } from "node:crypto";

function signingKey(secret: string) {
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  return Buffer.from(raw, "base64");
}

export function verifyOpenAiWebhook(rawBody: string, request: Request, secret: string | null) {
  return verifyOpenAiWebhookDetailed(rawBody, request, secret).ok;
}

export type WebhookVerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing_headers" | "invalid_timestamp" | "invalid_signature" };

export function verifyOpenAiWebhookDetailed(
  rawBody: string,
  request: Request,
  secret: string | null,
): WebhookVerifyResult {
  if (!secret?.trim()) return { ok: true };
  const id = request.headers.get("webhook-id");
  const timestamp = request.headers.get("webhook-timestamp");
  const signature = request.headers.get("webhook-signature");
  if (!id || !timestamp || !signature) return { ok: false, reason: "missing_headers" };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    return { ok: false, reason: "invalid_timestamp" };
  }
  const expected = createHmac("sha256", signingKey(secret))
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);
  for (const part of signature.split(" ")) {
    const [, sig] = part.split(",", 2);
    if (!sig) continue;
    const provided = Buffer.from(sig);
    if (provided.length === expectedBuf.length && timingSafeEqual(provided, expectedBuf)) return { ok: true };
  }
  return { ok: false, reason: "invalid_signature" };
}
