import { canonicalizeUrl, fetchHtml, hostOf } from "./web-fetch";

export const HARVEST_SOURCES = [
  {
    id: "zoznam",
    label: "Zoznam.sk",
    hint: "Katalóg malých firiem a remesiel",
  },
  {
    id: "azet",
    label: "Azet.sk",
    hint: "Katalóg slovenských webov",
  },
] as const;

export type HarvestSourceId = (typeof HARVEST_SOURCES)[number]["id"];

export const ZOZNAM_QUERIES = [
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

export const AZET_QUERIES = [
  "https://www.azet.sk/katalog/fotografovanie/",
  "https://www.azet.sk/katalog/fotografovanie/2/",
  "https://www.azet.sk/katalog/remesla/",
  "https://www.azet.sk/katalog/remesla/2/",
  "https://www.azet.sk/katalog/auto-moto/",
  "https://www.azet.sk/katalog/auto-moto/2/",
  "https://www.azet.sk/katalog/bazare/",
  "https://www.azet.sk/katalog/byvanie-a-zahrada/",
  "https://www.azet.sk/katalog/fitness-centra/",
  "https://www.azet.sk/katalog/graficke-studia/",
  "https://www.azet.sk/katalog/autobazare/",
  "https://www.azet.sk/katalog/cestovne-kancelarie-a-zajazdy/",
  "https://www.azet.sk/katalog/dlazby-a-obklady_4/",
  "https://www.azet.sk/katalog/ambulancie-a-lekari/",
];

/** @deprecated použije sa, keď nie je vybraný žiadny zdroj */
export const DEFAULT_QUERIES = [...ZOZNAM_QUERIES, ...AZET_QUERIES];

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
  "aimg.sk",
  "ringier.sk",
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

function extractAzetProfiles(html: string, pageUrl: string): string[] {
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of hrefs) {
    const absolute = absolutize(raw, pageUrl);
    if (!absolute || !/azet\.sk\/firma\/\d+/.test(absolute)) continue;
    const canonical = canonicalizeUrl(absolute.split("#")[0]);
    if (!canonical || seen.has(canonical)) continue;
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

export function queryPool(sources: string[], extraQueries: string[]) {
  const selected = sources.length ? sources : ["zoznam", "azet"];
  const pool: string[] = [];
  if (selected.includes("zoznam")) pool.push(...ZOZNAM_QUERIES);
  if (selected.includes("azet")) pool.push(...AZET_QUERIES);
  for (const query of extraQueries) {
    const trimmed = query.trim();
    if (!trimmed.startsWith("http")) continue;
    if (pool.includes(trimmed)) continue;
    pool.push(trimmed);
  }
  return pool.length ? pool : DEFAULT_QUERIES;
}

export function usesLegacySearchQueries(queries: string[]) {
  if (!queries.length) return false;
  return queries.every((query) => !query.startsWith("http"));
}

export async function discoverUrls(query: string, maxMs = 6000): Promise<string[]> {
  const url = query.trim();
  if (!url.startsWith("http")) return [];
  const page = await fetchHtml(url, maxMs);
  if (!page.ok) return [];

  let sites = extractCompanySites(page.html, page.finalUrl);

  if (url.includes("azet.sk/katalog") && sites.length < 8) {
    const profiles = extractAzetProfiles(page.html, page.finalUrl).slice(0, 3);
    for (const profile of profiles) {
      const nested = await fetchHtml(profile, maxMs);
      if (!nested.ok) continue;
      sites.push(...extractCompanySites(nested.html, nested.finalUrl));
    }
  }

  if (sites.length === 0 && url.includes("zoznam.sk/katalog")) {
    const leaves = extractLeafCategories(page.html, page.finalUrl);
    for (const leaf of leaves.slice(0, 2)) {
      const nested = await fetchHtml(leaf, maxMs);
      if (!nested.ok) continue;
      sites = extractCompanySites(nested.html, nested.finalUrl);
      if (sites.length) break;
    }
  }

  return [...new Set(sites)].slice(0, 30);
}
