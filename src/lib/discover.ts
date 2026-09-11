import { canonicalizeUrl, fetchHtml, hostOf } from "./web-fetch";

export const DEFAULT_QUERIES = [
  'kontakt telefón site:.sk "joomla"',
  'kontakt telefón site:.sk "frontpage"',
  'kontakt telefón site:.sk dreamweaver',
  'kontakt "telefón" site:.sk "internet explorer"',
  '"copyright 2012" OR "copyright 2013" kontakt telefón site:.sk',
  '"copyright 2014" kontakt telefón site:.sk',
  'autoservis kontakt telefón site:.sk joomla',
  'kaderníctvo kontakt telefón site:.sk',
  'penzión kontakt telefón site:.sk',
  'reštaurácia kontakt telefón site:.sk "joomla"',
  'inurl:index.php?option=com_contact site:.sk',
  '"powered by joomla" kontakt site:.sk',
  'firma kontakt telefón site:.sk webnode',
  'tesárstvo OR stolárstvo kontakt telefón site:.sk',
  'instalatér kontakt telefón site:.sk',
];

const BLOCKED_HOSTS = new Set([
  "google.com",
  "google.sk",
  "bing.com",
  "duckduckgo.com",
  "yahoo.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "wikipedia.org",
  "wikimedia.org",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "apple.com",
  "microsoft.com",
  "amazon.com",
  "booking.com",
  "heureka.sk",
  "bazos.sk",
  "github.com",
  "stackoverflow.com",
  "w3schools.com",
  "reddit.com",
  "pinterest.com",
  "callbot-crm.vercel.app",
]);

function isBlocked(url: string) {
  const host = hostOf(url);
  if (!host) return true;
  if (!host.endsWith(".sk")) return true;
  return [...BLOCKED_HOSTS].some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

function extractHrefs(html: string): string[] {
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
  const out: string[] = [];
  for (const raw of hrefs) {
    let href = raw.replace(/&amp;/g, "&");
    try {
      const parsed = new URL(href, "https://example.com");
      const uddg = parsed.searchParams.get("uddg");
      if (uddg) href = uddg;
      else if (parsed.searchParams.get("u")) href = parsed.searchParams.get("u") || href;
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(href)) continue;
    if (/\.(pdf|jpg|jpeg|png|gif|webp|zip|mp4)(\?|$)/i.test(href)) continue;
    const canonical = canonicalizeUrl(href);
    if (!canonical || isBlocked(canonical)) continue;
    out.push(canonical);
  }
  return [...new Set(out)];
}

async function searchOnce(url: string, maxMs: number) {
  const result = await fetchHtml(url, maxMs);
  if (!result.ok) return [] as string[];
  return extractHrefs(result.html);
}

export async function discoverUrls(query: string, maxMs = 4500): Promise<string[]> {
  const q = encodeURIComponent(query);
  const sources = [
    `https://html.duckduckgo.com/html/?q=${q}`,
    `https://www.bing.com/search?q=${q}&setlang=sk`,
    `https://search.brave.com/search?q=${q}`,
  ];

  const batches = await Promise.all(sources.map((source) => searchOnce(source, maxMs)));
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const batch of batches) {
    for (const url of batch) {
      if (seen.has(url)) continue;
      seen.add(url);
      merged.push(url);
    }
  }
  return merged.slice(0, 25);
}
