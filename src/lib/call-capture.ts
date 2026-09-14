import type { CallResultKind, ContactStatus } from "@prisma/client";

const EMAIL_RE = /[A-Za-zÀ-ž0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u;

export function normalizeEmail(value: string | null | undefined) {
  const trimmed = String(value || "").trim().toLowerCase();
  if (!trimmed || trimmed.length > 120) return null;
  if (!EMAIL_RE.test(trimmed)) return null;
  return trimmed.match(EMAIL_RE)?.[0] ?? null;
}

export function extractEmailFromTranscript(transcript: string) {
  const spoken = transcript
    .replace(/\s+(zavináč|zavinac|at)\s+/gi, "@")
    .replace(/\s+bodka\s+/gi, ".")
    .replace(/\s+pomlčka\s+/gi, "-");
  return normalizeEmail(spoken.match(EMAIL_RE)?.[0] ?? null);
}

export function classifyCallResult(opts: {
  outcome: string;
  contactStatus: ContactStatus;
  capturedEmail: string | null;
}): CallResultKind {
  if (opts.contactStatus === "INTERESTED" || opts.contactStatus === "CONVERTED") return "SUCCESS";
  if (opts.contactStatus === "CALLBACK") return "SUCCESS";
  if (opts.outcome === "interested" || opts.outcome === "callback") return "SUCCESS";
  if (opts.capturedEmail) return "SUCCESS";
  if (opts.contactStatus === "CONNECTED" && opts.outcome === "connected") return "SUCCESS";
  return "FAILURE";
}

export function demoSpokenEmail(name: string, existing?: string | null) {
  const known = normalizeEmail(existing);
  if (known) return known;
  const slug =
    name
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.|\.$/g, "")
      .slice(0, 40) || "kontakt";
  return `${slug}@firma.sk`;
}
