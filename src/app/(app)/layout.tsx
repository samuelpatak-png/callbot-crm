import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const running = await prisma.campaign.findFirst({
    where: { status: { in: ["RUNNING", "PAUSED", "STOPPED"] } },
    orderBy: { updatedAt: "desc" },
    select: { status: true },
  });

  const automation =
    running?.status === "RUNNING"
      ? "RUNNING"
      : running?.status === "PAUSED"
        ? "PAUSED"
        : running?.status === "STOPPED"
          ? "STOPPED"
          : "IDLE";

  return (
    <AppShell userName={session.name} automation={automation}>
      {children}
    </AppShell>
  );
}
