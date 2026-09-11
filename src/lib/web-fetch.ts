export type FetchHtmlResult =
  | { ok: true; html: string; loadMs: number; finalUrl: string; status: number }
  | { ok: false; loadMs: number; reason: "slow" | "failed" };

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function fetchHtml(url: string, maxMs: number): Promise<FetchHtmlResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), maxMs);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "sk-SK,sk;q=0.9,en;q=0.6",
      },
      cache: "no-store",
    });
    const loadMs = Date.now() - started;
    if (loadMs > maxMs) {
      return { ok: false, loadMs, reason: "slow" };
    }
    const raw = await response.text();
    const totalMs = Date.now() - started;
    if (totalMs > maxMs) {
      return { ok: false, loadMs: totalMs, reason: "slow" };
    }
    return {
      ok: true,
      html: raw.slice(0, 450_000),
      loadMs: totalMs,
      finalUrl: response.url || url,
      status: response.status,
    };
  } catch {
    return { ok: false, loadMs: Date.now() - started, reason: Date.now() - started >= maxMs - 20 ? "slow" : "failed" };
  } finally {
    clearTimeout(timer);
  }
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function canonicalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    url.hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_)/i.test(key)) url.searchParams.delete(key);
    }
    let path = url.pathname.replace(/\/+$/, "");
    if (!path) path = "/";
    url.pathname = path;
    return url.toString();
  } catch {
    return null;
  }
}
