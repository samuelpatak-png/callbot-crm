import { createHmac, timingSafeEqual } from "node:crypto";

function signingKey(secret: string) {
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  return Buffer.from(raw, "base64");
}

export function verifyOpenAiWebhook(rawBody: string, request: Request, secret: string | null) {
  if (!secret?.trim()) return true;
  const id = request.headers.get("webhook-id");
  const timestamp = request.headers.get("webhook-timestamp");
  const signature = request.headers.get("webhook-signature");
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const expected = createHmac("sha256", signingKey(secret))
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);
  for (const part of signature.split(" ")) {
    const [, sig] = part.split(",", 2);
    if (!sig) continue;
    const provided = Buffer.from(sig);
    if (provided.length === expectedBuf.length && timingSafeEqual(provided, expectedBuf)) return true;
  }
  return false;
}
