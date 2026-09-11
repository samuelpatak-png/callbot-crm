export type SiteScore = {
  score: number;
  reasons: string[];
  modern: boolean;
};

const MODERN_MARKERS = [
  /_next\/static/i,
  /__NEXT_DATA__/i,
  /wp-content\/themes\/hello-elementor/i,
  /cdn\.shopify\.com/i,
  /webflow\.js/i,
  /framerusercontent/i,
  /vite|nuxt|gatsby|astro/i,
  /tailwindcss/i,
  /react-dom/i,
  /webpackJsonp|webpackChunk/i,
];

export function scoreOutdatedSite(html: string, finalUrl: string): SiteScore {
  const reasons: string[] = [];
  let score = 0;
  const lower = html.toLowerCase();

  const add = (points: number, reason: string, hit: boolean) => {
    if (!hit) return;
    score += points;
    reasons.push(reason);
  };

  add(14, "chýba viewport / nie je responzívna", !/name=["']viewport["']/i.test(html));
  add(12, "starý doctype (HTML 4 / XHTML)", /<!doctype html public/i.test(html) || /html 4\.0/i.test(html));
  add(10, "bez HTTPS", finalUrl.startsWith("http://"));
  add(12, "FrontPage / Dreamweaver pozostatky", /webbot bot|_vti_|dreamweaver/i.test(html));
  add(10, "značky <font>, <center>, <marquee>", /<(font|center|marquee|blink)\b/i.test(html));
  add(8, "tabuľkový layout", (html.match(/<table\b/gi) ?? []).length >= 6);
  add(8, "bgcolor / align v HTML", /\s(bgcolor|background|align)=/i.test(html));
  add(10, "Flash / frameset", /\.swf\b|<(frameset|frame)\b/i.test(html));
  add(8, "Joomla 1/2 alebo starý WordPress", /joomla!?\s*[12]\.|wordpress\s*3\.|generator" content="joomla/i.test(lower));
  add(8, "Internet Explorer / najlepšie zobrazené v", /internet explorer|najlepšie zobrazené|best viewed in/i.test(html));
  add(6, "návštevný pult / guestbook", /hit counter|návštevník|guestbook|počet prístupov/i.test(html));
  add(6, "spacer.gif a 1px triky", /spacer\.gif|transparent\.gif/i.test(html));
  add(5, "Comic Sans / Times ako hlavné písmo", /comic sans|font-family:\s*times/i.test(html));
  add(6, "jQuery 1.x", /jquery[-.]1\.\d/i.test(html));
  add(5, "Webnode / e-stránky šablóna bez úprav", /webnode|e-stránky|webgarden/i.test(html));

  const years = [...html.matchAll(/©\s*((?:19|20)\d{2})/gi), ...html.matchAll(/copyright\s*((?:19|20)\d{2})/gi)].map(
    (m) => Number(m[1]),
  );
  const oldest = years.length ? Math.min(...years) : null;
  const newest = years.length ? Math.max(...years) : null;
  add(8, `starý copyright (${oldest})`, oldest !== null && oldest <= 2016);
  if (newest !== null && newest >= 2025) score -= 6;

  const cssHasModernLayout = /display\s*:\s*(flex|grid)|@media/i.test(html);
  add(7, "žiadny flex/grid ani media query", !cssHasModernLayout);

  const modernHits = MODERN_MARKERS.filter((re) => re.test(html));
  const modern = modernHits.length >= 2 || /_next\/static/i.test(html) || /cdn\.shopify\.com/i.test(html);
  if (modern) {
    score -= 28;
    reasons.push("vyzerá ako moderný framework — preskočiť");
  }

  if (score < 0) score = 0;
  if (score > 100) score = 100;
  return { score, reasons: reasons.slice(0, 8), modern };
}

export function contactPathCandidates(html: string, pageUrl: string): string[] {
  const origin = (() => {
    try {
      return new URL(pageUrl).origin;
    } catch {
      return "";
    }
  })();
  const hrefs = [...html.matchAll(/href=["']([^"'#]+)["']/gi)].map((m) => m[1]);
  const wanted = /kontakt|contact|o-nas|o_nas|onas|firma|about/i;
  const out: string[] = [];
  for (const href of hrefs) {
    if (!wanted.test(href)) continue;
    try {
      const absolute = new URL(href, pageUrl).toString();
      if (origin && new URL(absolute).origin !== new URL(pageUrl).origin) continue;
      out.push(absolute);
    } catch {
      continue;
    }
    if (out.length >= 3) break;
  }
  return out;
}
