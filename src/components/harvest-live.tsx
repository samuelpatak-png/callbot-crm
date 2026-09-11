"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function HarvestLive({ running }: { running: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!running) return;
    let cancelled = false;

    const loop = async () => {
      while (!cancelled) {
        try {
          await fetch("/api/harvest/pulse", { method: "POST" });
        } catch {
          // ďalší cyklus to skúsi znova
        }
        if (cancelled) return;
        router.refresh();
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    };

    void loop();
    return () => {
      cancelled = true;
    };
  }, [running, router]);

  if (!running) return null;

  return (
    <p className="mt-2 text-sm text-emerald-800">
      Práve prehliada weby. Štatistiky a tabuľka sa obnovujú samy — nechaj túto kartu otvorenú.
    </p>
  );
}
