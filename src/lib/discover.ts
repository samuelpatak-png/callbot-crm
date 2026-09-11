import { canonicalizeUrl, fetchHtml, hostOf } from "./web-fetch";

/** Katalóg Zoznam.sk — verejné weby malých firiem. Vyhľadávače z Vercelu blokujú botov. */
export const DEFAULT_QUERIES = [
  "https://www.zoznam.sk/katalog/Sluzby-remesla/Hodinarstva/",
  "https://www.zoznam.sk/katalog/Sluzby-remesla/Brusenie-nozov/",
  "https://www.zoznam.sk/katalog/Sluzby-remesla/Hodinovy-manzel/",
  "https://www.zoznam.sk/katalog/Sluzby-remesla/Fotosluzby-fotoateliery/",
  "https://www.zoznam.sk/katalog/Sluzby-remesla/Klucova-sluzba/",
  "https://www.zoznam.sk/katalog/Sluzby-remesla/Kovacske-prace/",
  "https://www.zoznam.sk/katalog/Sluzby-remesla/Kvetinarstva/",
  "https://www.zoznam.sk/katalog/Sluzby-remesla/Sklenarstva-ramovanie/",
  "https://www.zoznam.sk/katalog/Sluzby-remesla/Restaurovanie/",
  "https://www.zoznam.sk/katalog/Sluzby-remesla/Umelecke-remesla/",
  "https://www.zoznam.sk/katalog/Sluzby-remesla/Peciatky/",
  "https://www.zoznam.sk/katalog/Sluzby-remesla/Knihviazacstva/",
  "https://www.zoznam.sk/katalog/Sluzby-remesla/Tlaciarne/",
  "https://www.zoznam.sk/katalog/Sluzby-remesla/Upratovanie-cistenie/",
  "https://www.zoznam.sk/katalog/Sluzby-remesla/Montazne-prace/",
  "https://www.zoznam.sk/katalog/Sluzby-remesla/Remesla-ine/",
  "https://www.zoznam.sk/katalog/Domacnost-zahrada-kancelaria/Calunnictva/",
  "https://www.zoznam.sk/katalog/Moda-textil-detske-potreby/Krajcirske-sluzby/",
  "https://www.zoznam.sk/katalog/Moda-textil-detske-potreby/Cistiarne-satstva/",
  "https://www.zoznam.sk/katalog/Stavba-dom-dielna/Stavebna-cinnost/Tesarske-prace/",
  "https://www.zoznam.sk/katalog/Stavba-dom-dielna/Stavebna-cinnost/Malovanie-stierkovanie-tapetovanie/",
  "https://www.zoznam.sk/katalog/Stavba-dom-dielna/Stavebniny/Kamenarstva/",
  "https://www.zoznam.sk/katalog/Cestovanie-ubytovanie-turizmus/Ubytovanie/Motely/",
  "https://www.zoznam.sk/katalog/Cestovanie-ubytovanie-turizmus/Ubytovanie/Autokempy/",
  "https://www.zoznam.sk/katalog/Auto-moto-preprava-logistika/Autobazare-dovoz-automobilov/",
];

const BLOCKED_HOSTS = [
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
  "zoznam.sk",
  "topky.sk",
  "azet.sk",
  "websupport.sk",
  "callbot-crm.vercel.app",
];

function isBlocked(url: string) {
  const host = hostOf(url);
  if (!host) return true;
  if (!host.endsWith(".sk")) return true;
  return BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

function absolutize(href: string, base: string) {
  try {
    if (href.startsWith("//")) return `https:${href}`;
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function extractCompanySites(html: string, pageUrl: string): string[] {
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of hrefs) {
    const absolute = absolutize(raw, pageUrl);
    if (!absolute || !/^https?:\/\//i.test(absolute)) continue;
    if (/\.(pdf|jpg|jpeg|png|gif|webp|zip|mp4)(\?|$)/i.test(absolute)) continue;
    const canonical = canonicalizeUrl(absolute);
    if (!canonical || isBlocked(canonical) || seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

function extractLeafCategories(html: string, pageUrl: string): string[] {
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of hrefs) {
    const absolute = absolutize(raw, pageUrl);
    if (!absolute || !absolute.includes("zoznam.sk/katalog/")) continue;
    const canonical = canonicalizeUrl(absolute);
    if (!canonical || seen.has(canonical)) continue;
    const path = new URL(canonical).pathname.replace(/\/+$/, "");
    if (path.split("/").filter(Boolean).length < 3) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

function directoryUrlFor(query: string) {
  const trimmed = query.trim();
  if (trimmed.startsWith("http")) return trimmed;
  const hint = trimmed.toLowerCase();
  const match = DEFAULT_QUERIES.find((url) => {
    const slug = url.split("/katalog/")[1] ?? "";
    return hint.split(/\s+/).some((word) => word.length > 4 && slug.toLowerCase().includes(word.slice(0, 6)));
  });
  return match ?? DEFAULT_QUERIES[0];
}

export function usesLegacySearchQueries(queries: string[]) {
  if (!queries.length) return true;
  return queries.every((query) => !query.includes("zoznam.sk/katalog"));
}

export async function discoverUrls(query: string, maxMs = 6000): Promise<string[]> {
  const url = directoryUrlFor(query);
  const page = await fetchHtml(url, maxMs);
  if (!page.ok) return [];

  let sites = extractCompanySites(page.html, page.finalUrl);
  if (sites.length > 0) return sites.slice(0, 30);

  const leaves = extractLeafCategories(page.html, page.finalUrl);
  for (const leaf of leaves.slice(0, 2)) {
    const nested = await fetchHtml(leaf, maxMs);
    if (!nested.ok) continue;
    sites = extractCompanySites(nested.html, nested.finalUrl);
    if (sites.length) return sites.slice(0, 30);
  }
  return [];
}
