import { createHash, createHmac } from "node:crypto";
import { config } from "./config.js";

function encodeRfc1738(value: string) {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

function authHeader(methodPath: string, params: Record<string, string>) {
  const paramsStr = Object.keys(params)
    .sort()
    .map((key) => `${encodeRfc1738(key)}=${encodeRfc1738(params[key] ?? "")}`)
    .join("&");
  const md5 = createHash("md5").update(paramsStr).digest("hex");
  const hmacHex = createHmac("sha1", config.zadarmaApiSecret)
    .update(`${methodPath}${paramsStr}${md5}`)
    .digest("hex");
  const signature = Buffer.from(hmacHex).toString("base64");
  return `${config.zadarmaApiKey}:${signature}`;
}

export function sipToNumber(phone: string) {
  return phone.replace(/[^\d]/g, "").replace(/^00/, "");
}

export async function zadarmaCallback(to: string) {
  if (!config.zadarmaApiKey || !config.zadarmaApiSecret || !config.sipNumber) {
    throw new Error("Zadarma API kľúče nie sú nastavené");
  }
  const methodPath = "/v1/request/callback/";
  const params = {
    from: config.sipNumber,
    to: sipToNumber(to),
    predicted: "1",
  };
  const url = new URL(`https://api.zadarma.com${methodPath}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    headers: { Authorization: authHeader(methodPath, params) },
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Zadarma callback ${response.status}: ${raw.slice(0, 280)}`);
  }
  return raw;
}
