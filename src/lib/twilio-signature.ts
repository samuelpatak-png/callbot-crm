import { createHmac, timingSafeEqual } from "crypto";
import { getRuntimeConfig } from "./settings";
import { appUrl } from "./utils";

function expectedSignature(authToken: string, url: string, params: Record<string, string>) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
}

function signaturesMatch(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function parseTwilioForm(request: Request) {
  const params: Record<string, string> = {};
  if (request.method === "POST") {
    try {
      const form = await request.formData();
      form.forEach((value, key) => {
        if (typeof value === "string") params[key] = value;
      });
      return params;
    } catch {
      return params;
    }
  }
  return params;
}

export async function assertTwilioSignature(request: Request, params: Record<string, string>) {
  if (process.env.TWILIO_SKIP_VALIDATION === "1") return;
  const config = await getRuntimeConfig();
  if (!config.twilioAuthToken) return;

  const given = request.headers.get("x-twilio-signature") || "";
  if (!given) {
    throw new Error("TWILIO_SIGNATURE");
  }

  const incoming = new URL(request.url);
  const publicOrigin = appUrl();
  const candidates = Array.from(
    new Set([
      incoming.href,
      `${publicOrigin}${incoming.pathname}${incoming.search}`,
      incoming.href.replace(/\/$/, ""),
      `${publicOrigin}${incoming.pathname}${incoming.search}`.replace(/\/$/, ""),
    ]),
  );

  const ok = candidates.some((url) => signaturesMatch(given, expectedSignature(config.twilioAuthToken!, url, params)));
  if (!ok) {
    throw new Error("TWILIO_SIGNATURE");
  }
}

export function twilioUnauthorized() {
  return new Response("Neplatný podpis Twilio", { status: 403 });
}
