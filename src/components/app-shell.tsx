"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Phone,
  GitBranch,
  Megaphone,
  PhoneCall,
  ListTodo,
  Radar,
  ScrollText,
  Settings,
  LogOut,
} from "lucide-react";
import { logoutAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Prehľad", icon: LayoutDashboard },
  { href: "/kontakty", label: "Čísla", icon: Phone },
  { href: "/pipeline", label: "Pipeline", icon: GitBranch },
  { href: "/kampane", label: "Kampane", icon: Megaphone },
  { href: "/skript", label: "Skript", icon: ScrollText },
  { href: "/zber", label: "Zber čísiel", icon: Radar },
  { href: "/hovory", label: "Hovory", icon: PhoneCall },
  { href: "/ulohy", label: "Úlohy", icon: ListTodo },
  { href: "/nastavenia", label: "Nastavenia", icon: Settings },
];

export function AppShell({
  children,
  userName,
  automation,
}: {
  children: React.ReactNode;
  userName: string;
  automation: "RUNNING" | "PAUSED" | "STOPPED" | "IDLE";
}) {
  const pathname = usePathname();
  const railClass =
    automation === "RUNNING" ? "rail-run" : automation === "PAUSED" ? "rail-pause" : "rail-stop";
  const railLabel =
    automation === "RUNNING"
      ? "Automatizácia beží"
      : automation === "PAUSED"
        ? "Pozastavená"
        : automation === "STOPPED"
          ? "Zastavená"
          : "Čaká na spustenie";

  return (
    <div className="min-h-screen bg-background">
      <div className={cn("fixed inset-y-0 left-0 z-30 w-1.5", railClass)} aria-hidden />
      <aside className="fixed inset-y-0 left-1.5 z-20 hidden w-60 border-r border-border bg-white/90 px-4 py-5 backdrop-blur md:flex md:flex-col">
        <div className="mb-6">
          <p className="number-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
            CallBot
          </p>
          <h1 className="text-lg font-semibold tracking-tight">Outbound CRM</h1>
          <p className="mt-1 text-xs text-slate-500">{railLabel}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Hlavná navigácia">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-200",
                  active ? "bg-muted text-primary" : "text-slate-600 hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border pt-4">
          <p className="truncate text-sm font-medium">{userName}</p>
          <form action={logoutAction}>
            <button
              type="submit"
              className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm text-slate-500 transition-colors duration-200 hover:text-destructive"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Odhlásiť
            </button>
          </form>
        </div>
      </aside>
      <div className="md:pl-[calc(15rem+6px)]">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white/85 px-4 py-3 backdrop-blur md:hidden">
          <span className="font-semibold">CallBot CRM</span>
          <span className="text-xs text-slate-500">{railLabel}</span>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-white px-2 py-2 md:hidden" aria-label="Mobilná navigácia">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="min-h-11 shrink-0 rounded-lg px-3 py-2 text-sm text-slate-600"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
