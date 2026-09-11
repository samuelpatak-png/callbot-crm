/** Slovenské čísla v tvare +421XXXXXXXXX. Žiadne AI — čistá normalizácia. */

const SK_AREA = new Set([
  "2",
  "31",
  "32",
  "33",
  "34",
  "35",
  "36",
  "37",
  "38",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "51",
  "52",
  "53",
  "54",
  "55",
  "56",
  "57",
  "58",
]);

export function normalizeSkPhone(raw: string): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (!digits.startsWith("+") && digits.startsWith("421")) digits = `+${digits}`;
  if (!digits.startsWith("+")) {
    if (digits.startsWith("0")) digits = `+421${digits.slice(1)}`;
    else return null;
  }
  if (!digits.startsWith("+421")) return null;

  const national = digits.slice(4);
  if (!/^\d{9}$/.test(national)) return null;
  if (national.startsWith("800") || national.startsWith("900") || national.startsWith("980")) {
    return null;
  }
  if (national.startsWith("9")) return `+421${national}`;
  if (national.startsWith("2") && SK_AREA.has("2")) return `+421${national}`;
  const two = national.slice(0, 2);
  if (SK_AREA.has(two)) return `+421${national}`;
  return null;
}

export function formatPhone(phone: string) {
  return normalizeSkPhone(phone) ?? phone.replace(/\s+/g, "");
}

const PHONE_CHUNK =
  /(?:\+|00)?421[\s./-]*\d(?:[\s./-]*\d){7,10}|0\d{1,3}[\s./-]*\d{2,4}[\s./-]*\d{2,4}(?:[\s./-]*\d{2,3})?/g;

export function extractSkPhones(html: string): string[] {
  const found = new Set<string>();

  for (const match of html.matchAll(/href=["']tel:([^"']+)["']/gi)) {
    const normalized = normalizeSkPhone(decodeHtml(match[1]));
    if (normalized) found.add(normalized);
  }

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ");

  for (const chunk of text.match(PHONE_CHUNK) ?? []) {
    const normalized = normalizeSkPhone(chunk);
    if (normalized) found.add(normalized);
  }

  return [...found];
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#43;/g, "+")
    .replace(/%20/g, " ")
    .trim();
}
