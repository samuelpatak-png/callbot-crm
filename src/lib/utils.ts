import { ContactStatus, CampaignStatus, DealStage, CallStatus, HarvestStatus, HarvestSiteStatus } from "@prisma/client";
export { formatPhone } from "./phone";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function fullName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim();
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Bratislava",
  }).format(new Date(value));
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "medium",
    timeZone: "Europe/Bratislava",
  }).format(new Date(value));
}

export function formatMoney(value: number | string | { toNumber?: () => number }) {
  const amount =
    typeof value === "object" && value && "toNumber" in value
      ? value.toNumber?.() ?? 0
      : Number(value);
  return new Intl.NumberFormat("sk-SK", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export const contactStatusLabel: Record<ContactStatus, string> = {
  NEW: "Nový",
  QUEUED: "V poradí",
  CALLING: "Volá sa",
  NO_ANSWER: "Nezdvihol",
  VOICEMAIL: "Záznamník",
  CONNECTED: "Spojený",
  CALLBACK: "Spätné volanie",
  INTERESTED: "Záujem",
  NOT_INTERESTED: "Bez záujmu",
  CONVERTED: "Získaný",
  DNC: "Nevolať",
  FAILED: "Zlyhalo",
};

export const contactStatusTone: Record<ContactStatus, string> = {
  NEW: "bg-slate-100 text-slate-700",
  QUEUED: "bg-sky-100 text-sky-800",
  CALLING: "bg-amber-100 text-amber-800",
  NO_ANSWER: "bg-orange-100 text-orange-800",
  VOICEMAIL: "bg-violet-100 text-violet-800",
  CONNECTED: "bg-emerald-100 text-emerald-800",
  CALLBACK: "bg-blue-100 text-blue-800",
  INTERESTED: "bg-teal-100 text-teal-800",
  NOT_INTERESTED: "bg-rose-100 text-rose-800",
  CONVERTED: "bg-green-100 text-green-800",
  DNC: "bg-zinc-200 text-zinc-700",
  FAILED: "bg-red-100 text-red-800",
};

export const campaignStatusLabel: Record<CampaignStatus, string> = {
  DRAFT: "Návrh",
  RUNNING: "Beží",
  PAUSED: "Pozastavená",
  STOPPED: "Zastavená",
  COMPLETED: "Dokončená",
};

export const dealStageLabel: Record<DealStage, string> = {
  LEAD: "Lead",
  QUALIFIED: "Kvalifikovaný",
  PROPOSAL: "Ponuka",
  NEGOTIATION: "Jednanie",
  WON: "Vyhrané",
  LOST: "Stratené",
};

export const callStatusLabel: Record<CallStatus, string> = {
  QUEUED: "V poradí",
  RINGING: "Vyzváňa",
  IN_PROGRESS: "Prebieha",
  COMPLETED: "Dokončený",
  NO_ANSWER: "Nezdvihol",
  BUSY: "Obsadené",
  FAILED: "Zlyhal",
  VOICEMAIL: "Záznamník",
  CANCELED: "Zrušený",
};

export function isCallable(status: ContactStatus, doNotCall: boolean) {
  if (doNotCall || status === "DNC") return false;
  return status !== "CALLING";
}

export const harvestStatusLabel: Record<HarvestStatus, string> = {
  IDLE: "Neaktívny",
  RUNNING: "Beží",
  PAUSED: "Pozastavený",
  STOPPED: "Zastavený",
  COMPLETED: "Cieľ splnený",
};

export const harvestSiteStatusLabel: Record<HarvestSiteStatus, string> = {
  QUEUED: "V poradí",
  ADDED: "Pridané číslo",
  SKIPPED_SLOW: "Pomalý web",
  SKIPPED_MODERN: "Príliš moderný",
  SKIPPED_NO_PHONE: "Bez telefónu",
  DUPLICATE: "Duplicitné číslo",
  FAILED: "Zlyhalo",
};
