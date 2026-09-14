import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { callHistoryWhere, parseCallHistoryFilters } from "@/lib/call-search";
import { callOutcomeLabel, callResultKindLabel, formatDateTime } from "@/lib/utils";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const url = new URL(request.url);
  const filters = parseCallHistoryFilters(Object.fromEntries(url.searchParams.entries()));
  const where = await callHistoryWhere(filters);
  const calls = await prisma.call.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: 2000,
    include: { contact: true, campaign: true },
  });

  const header = ["datum", "meno", "cislo", "email", "kampan", "vysledok", "stav", "trvanie_s", "zhrnutie"];
  const lines = [
    header.join(","),
    ...calls.map((call) =>
      [
        formatDateTime(call.startedAt),
        `${call.contact.firstName} ${call.contact.lastName}`,
        call.contact.phone,
        call.capturedEmail || call.contact.email || "",
        call.campaign?.name || "",
        callResultKindLabel[call.resultKind],
        callOutcomeLabel(call.outcome),
        String(call.durationSec),
        (call.summary || "").replaceAll(/[\r\n,]+/g, " "),
      ]
        .map((value) => `"${value.replaceAll('"', '""')}"`)
        .join(","),
    ),
  ];

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=hovory.csv",
    },
  });
}
