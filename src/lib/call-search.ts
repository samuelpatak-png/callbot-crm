import { CallResultKind, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizeSkPhone } from "./phone";

const TZ = "Europe/Bratislava";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export type CallHistoryFilters = {
  meno: string;
  cislo: string;
  mail: string;
  od: string;
  do: string;
  casOd: string;
  casDo: string;
  vysledok: "" | "uspech" | "neuspech" | "prebieha";
};

export type CallHistoryStats = {
  total: number;
  success: number;
  failure: number;
  pending: number;
  withEmail: number;
  avgDurationSec: number;
};

function firstParam(value?: string | string[]) {
  return (Array.isArray(value) ? value[0] : value)?.trim() || "";
}

function validDate(value: string) {
  return DATE_RE.test(value) ? value : "";
}

function validTime(value: string) {
  if (!TIME_RE.test(value)) return "";
  const [h, m] = value.split(":").map(Number);
  if (h > 23 || m > 59) return "";
  return value;
}

function tzOffsetMs(instant: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const map = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - instant.getTime();
}

export function bratislavaToUtc(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  return new Date(naive - tzOffsetMs(new Date(naive)));
}

export function parseCallHistoryFilters(params: Record<string, string | string[] | undefined>): CallHistoryFilters {
  const vysledok = firstParam(params.vysledok);
  return {
    meno: firstParam(params.meno),
    cislo: firstParam(params.cislo),
    mail: firstParam(params.mail),
    od: validDate(firstParam(params.od)),
    do: validDate(firstParam(params.do)),
    casOd: validTime(firstParam(params.casOd)),
    casDo: validTime(firstParam(params.casDo)),
    vysledok: vysledok === "uspech" || vysledok === "neuspech" || vysledok === "prebieha" ? vysledok : "",
  };
}

export function callHistoryHasFilters(filters: CallHistoryFilters) {
  return Boolean(
    filters.meno ||
      filters.cislo ||
      filters.mail ||
      filters.od ||
      filters.do ||
      filters.casOd ||
      filters.casDo ||
      filters.vysledok,
  );
}

function phoneNeedle(value: string) {
  const normalized = normalizeSkPhone(value);
  if (normalized) return normalized.replace(/^\+/, "");
  const digits = value.replace(/\D/g, "");
  return digits.slice(-9) || digits;
}

export async function callHistoryWhere(filters: CallHistoryFilters): Promise<Prisma.CallWhereInput> {
  const where: Prisma.CallWhereInput = {};
  const and: Prisma.CallWhereInput[] = [];

  if (filters.vysledok === "uspech") where.resultKind = CallResultKind.SUCCESS;
  if (filters.vysledok === "neuspech") where.resultKind = CallResultKind.FAILURE;
  if (filters.vysledok === "prebieha") where.resultKind = CallResultKind.PENDING;

  const contactAnd: Prisma.ContactWhereInput[] = [];
  if (filters.meno) {
    contactAnd.push({
      OR: [
        { firstName: { contains: filters.meno, mode: "insensitive" } },
        { lastName: { contains: filters.meno, mode: "insensitive" } },
      ],
    });
  }
  if (filters.cislo) {
    const needle = phoneNeedle(filters.cislo);
    if (needle) contactAnd.push({ phone: { contains: needle } });
  }
  if (contactAnd.length) where.contact = { AND: contactAnd };

  if (filters.mail) {
    and.push({
      OR: [
        { capturedEmail: { contains: filters.mail, mode: "insensitive" } },
        { contact: { email: { contains: filters.mail, mode: "insensitive" } } },
      ],
    });
  }

  if (filters.od || filters.do) {
    const fromDate = filters.od || filters.do;
    const toDate = filters.do || filters.od;
    const gte = bratislavaToUtc(fromDate, filters.casOd || "00:00");
    const lte = bratislavaToUtc(toDate, filters.casDo || "23:59");
    if (!filters.casDo) lte.setUTCSeconds(59, 999);
    where.startedAt = gte <= lte ? { gte, lte } : { gte: lte, lte: gte };
  } else if (filters.casOd || filters.casDo) {
    const ids = await callIdsInLocalTime(filters.casOd || "00:00", filters.casDo || "23:59");
    and.push({ id: { in: ids.length ? ids : ["__none__"] } });
  }

  if (and.length) where.AND = and;
  return where;
}

async function callIdsInLocalTime(from: string, to: string) {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Call"
    WHERE (("startedAt" AT TIME ZONE 'Europe/Bratislava')::time >= ${from}::time)
      AND (("startedAt" AT TIME ZONE 'Europe/Bratislava')::time <= ${to}::time)
  `;
  return rows.map((row) => row.id);
}

export async function callHistoryStats(where: Prisma.CallWhereInput): Promise<CallHistoryStats> {
  const [grouped, withEmail] = await Promise.all([
    prisma.call.groupBy({
      by: ["resultKind"],
      where,
      _count: { _all: true },
      _avg: { durationSec: true },
    }),
    prisma.call.count({
      where: { AND: [where, { capturedEmail: { not: null } }] },
    }),
  ]);

  const stats: CallHistoryStats = {
    total: 0,
    success: 0,
    failure: 0,
    pending: 0,
    withEmail,
    avgDurationSec: 0,
  };
  let durationWeight = 0;
  let durationSum = 0;
  for (const row of grouped) {
    const count = row._count._all;
    stats.total += count;
    if (row.resultKind === "SUCCESS") stats.success = count;
    if (row.resultKind === "FAILURE") stats.failure = count;
    if (row.resultKind === "PENDING") stats.pending = count;
    if (row._avg.durationSec != null) {
      durationSum += row._avg.durationSec * count;
      durationWeight += count;
    }
  }
  stats.avgDurationSec = durationWeight ? durationSum / durationWeight : 0;
  return stats;
}
