import { createHash, createHmac, timingSafeEqual } from "crypto";
import { normalizeSkPhone } from "./phone";

function encodeRfc1738(value: string) {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

function hmacHexBase64(secret: string, payload: string) {
  return createHmac("sha1", secret).update(payload).digest("hex");
}

export function zadarmaAuthHeader(opts: {
  apiKey: string;
  apiSecret: string;
  methodPath: string;
  params?: Record<string, string>;
}) {
  const params = opts.params || {};
  const paramsStr = Object.keys(params)
    .sort()
    .map((key) => `${encodeRfc1738(key)}=${encodeRfc1738(params[key] ?? "")}`)
    .join("&");
  const md5 = createHash("md5").update(paramsStr).digest("hex");
  const signature = Buffer.from(hmacHexBase64(opts.apiSecret, `${opts.methodPath}${paramsStr}${md5}`)).toString(
    "base64",
  );
  return `${opts.apiKey}:${signature}`;
}

export async function zadarmaRequest<T = unknown>(opts: {
  apiKey: string;
  apiSecret: string;
  methodPath: string;
  params?: Record<string, string>;
  http?: "GET" | "POST";
}) {
  const params = opts.params || {};
  const http = opts.http || "GET";
  const url = new URL(`https://api.zadarma.com${opts.methodPath}`);
  const headers: Record<string, string> = {
    Authorization: zadarmaAuthHeader({
      apiKey: opts.apiKey,
      apiSecret: opts.apiSecret,
      methodPath: opts.methodPath,
      params,
    }),
  };
  let response: Response;
  if (http === "GET") {
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    response = await fetch(url, { headers });
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    response = await fetch(url, {
      method: "POST",
      headers,
      body: new URLSearchParams(params),
    });
  }
  const raw = await response.text();
  let data: T | null = null;
  try {
    data = JSON.parse(raw) as T;
  } catch {
    data = null;
  }
  return { ok: response.ok, status: response.status, raw, data };
}

export function zadarmaWebhookSignature(secret: string, payload: string) {
  return Buffer.from(hmacHexBase64(secret, payload)).toString("base64");
}

export function verifyZadarmaSignature(opts: {
  secret: string | null;
  signature: string | null;
  payload: string;
}) {
  if (!opts.secret) return true;
  if (!opts.signature) return false;
  const expected = zadarmaWebhookSignature(opts.secret, opts.payload);
  const a = Buffer.from(expected);
  const b = Buffer.from(opts.signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function zadarmaSignaturePayload(event: string, body: Record<string, string>) {
  switch (event) {
    case "NOTIFY_ANSWER":
      return `${body.caller_id || ""}${body.destination || ""}${body.call_start || ""}`;
    case "NOTIFY_OUT_START":
    case "NOTIFY_OUT_END":
      return `${body.internal || ""}${body.destination || ""}${body.call_start || ""}`;
    case "NOTIFY_RECORD":
      return `${body.pbx_call_id || ""}${body.call_id_with_rec || ""}`;
    default:
      return `${body.caller_id || ""}${body.called_did || ""}${body.call_start || ""}`;
  }
}

export function normalizeZadarmaPhone(raw?: string | null) {
  const value = String(raw || "").trim();
  if (!value) return null;
  return (
    normalizeSkPhone(value) ||
    normalizeSkPhone(`+${value.replace(/\D/g, "")}`) ||
    (value.replace(/\D/g, "").startsWith("421") ? `+${value.replace(/\D/g, "")}` : null) ||
    (value.startsWith("+") ? value.replace(/\s+/g, "") : `+${value.replace(/\D/g, "")}`)
  );
}

export function sipToNumber(phone: string) {
  return phone.replace(/^\+/, "");
}

export function isBlobRecordingUrl(url: string) {
  return /vercel-storage\.com|blob\.vercel-storage\.com/i.test(url);
}
