import { after } from "next/server";
import { prisma } from "./prisma";
import { appUrl } from "./utils";
import { cronSecret } from "./cron-auth";
import { DEFAULT_QUERIES, discoverUrls } from "./discover";
import { extractSkPhones } from "./phone";
import { contactPathCandidates, scoreOutdatedSite } from "./site-score";
import { canonicalizeUrl, fetchHtml, hostOf } from "./web-fetch";

function companyNameFrom(title: string | null, domain: string) {
  const cleaned = (title || "")
    .replace(/\s*[|\-–].*$/, "")
    .replace(/kontakt|úvod|home|oficiálna stránka/gi, "")
    .trim();
  if (cleaned.length >= 3 && cleaned.length <= 80) return cleaned;
  const base = domain.split(".")[0] || domain;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

async function scheduleNextTick(delayMs: number) {
  const secret = cronSecret();
  if (!secret) return;
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 8000)));
    await fetch(`${appUrl()}/api/harvest/tick`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ source: "chain" }),
    }).catch(() => undefined);
  });
}

export async function ensureHarvestJob() {
  const existing = await prisma.harvestJob.findUnique({ where: { id: "default" } });
  if (existing) {
    if (!existing.queries.length) {
      return prisma.harvestJob.update({
        where: { id: "default" },
        data: { queries: DEFAULT_QUERIES },
      });
    }
    return existing;
  }
  return prisma.harvestJob.create({
    data: {
      id: "default",
      queries: DEFAULT_QUERIES,
    },
  });
}

async function enqueueUrls(jobId: string, urls: string[]) {
  let queued = 0;
  for (const url of urls) {
    const canonicalUrl = canonicalizeUrl(url);
    if (!canonicalUrl) continue;
    try {
      await prisma.harvestedSite.create({
        data: {
          jobId,
          url,
          canonicalUrl,
          domain: hostOf(canonicalUrl),
          status: "QUEUED",
        },
      });
      queued += 1;
    } catch {
      // unique canonicalUrl — už v zozname
    }
  }
  return queued;
}

async function attachToCampaign(contactId: string) {
  let campaign = await prisma.campaign.findFirst({
    where: { name: "Zber zo zastaraných webov" },
  });
  if (!campaign) {
    campaign = await prisma.campaign.create({
      data: {
        name: "Zber zo zastaraných webov",
        description: "Čísla z webu, ktorý heuristiky označili ako zastaralý, škaredý alebo zlý. Pomalé stránky sem nepatria.",
      },
    });
  }
  const last = await prisma.campaignMember.findFirst({
    where: { campaignId: campaign.id },
    orderBy: { queuePosition: "desc" },
    select: { queuePosition: true },
  });
  try {
    await prisma.campaignMember.create({
      data: {
        campaignId: campaign.id,
        contactId,
        queuePosition: (last?.queuePosition ?? 0) + 1,
      },
    });
    await prisma.contact.updateMany({
      where: { id: contactId, status: "NEW" },
      data: { status: "QUEUED" },
    });
  } catch {
    // duplicate member
  }
}

async function saveContact(opts: {
  phone: string;
  domain: string;
  title: string | null;
  url: string;
  reasons: string[];
  score: number;
}) {
  const existing = await prisma.contact.findUnique({ where: { phone: opts.phone } });
  if (existing) return { duplicate: true as const, contactId: existing.id };

  const companyName = companyNameFrom(opts.title, opts.domain);
  const company =
    (await prisma.company.findFirst({ where: { website: opts.url } })) ??
    (await prisma.company.findFirst({ where: { name: companyName } })) ??
    (await prisma.company.create({
      data: { name: companyName, website: opts.url },
    }));

  const tag = await prisma.tag.upsert({
    where: { name: "zastaraný-web" },
    update: {},
    create: { name: "zastaraný-web", color: "#B45309" },
  });

  try {
    const contact = await prisma.contact.create({
      data: {
        firstName: companyName,
        lastName: opts.domain,
        phone: opts.phone,
        title: "Webový kontakt",
        source: `zber:${opts.domain}`,
        websiteUrl: opts.url,
        companyId: company.id,
      },
    });
    await prisma.contactTag
      .create({
        data: { contactId: contact.id, tagId: tag.id },
      })
      .catch(() => undefined);

    await prisma.note.create({
      data: {
        contactId: contact.id,
        body: `Nájdené na zastaranom webe (${opts.score} b). ${opts.reasons.join("; ")}. ${opts.url}`,
      },
    });

    await prisma.activity.create({
      data: {
        type: "SYSTEM",
        contactId: contact.id,
        message: `Automatický zber: ${opts.phone} z ${opts.domain}`,
        payload: { url: opts.url, score: opts.score, reasons: opts.reasons },
      },
    });

    return { duplicate: false as const, contactId: contact.id };
  } catch {
    const raced = await prisma.contact.findUnique({ where: { phone: opts.phone } });
    if (raced) return { duplicate: true as const, contactId: raced.id };
    throw new Error("Nepodarilo sa uložiť kontakt");
  }
}

async function processSite(job: Awaited<ReturnType<typeof ensureHarvestJob>>, site: { id: string; url: string; canonicalUrl: string; domain: string }) {
  const fetched = await fetchHtml(site.url, job.maxLoadMs);
  if (!fetched.ok) {
    const field = fetched.reason === "slow" ? "skippedSlow" : "failed";
    await prisma.harvestedSite.update({
      where: { id: site.id },
      data: {
        status: fetched.reason === "slow" ? "SKIPPED_SLOW" : "FAILED",
        loadMs: fetched.loadMs,
        reasons: fetched.reason === "slow" ? ["stránka prekročila limit rýchlosti"] : ["načítanie zlyhalo"],
      },
    });
    await prisma.harvestJob.update({
      where: { id: job.id },
      data: { scanned: { increment: 1 }, [field]: { increment: 1 }, lastRunAt: new Date(), lastError: null },
    });
    return { processed: 1, added: 0 };
  }

  let html = fetched.html;
  let finalUrl = fetched.finalUrl;
  let loadMs = fetched.loadMs;
  let phones = extractSkPhones(html);

  if (phones.length === 0) {
    const extra = contactPathCandidates(html, finalUrl);
    for (const next of extra) {
      const sub = await fetchHtml(next, job.maxLoadMs);
      if (!sub.ok) {
        if (sub.reason === "slow") {
          await prisma.harvestedSite.update({
            where: { id: site.id },
            data: {
              status: "SKIPPED_SLOW",
              loadMs: sub.loadMs,
              title: titleOf(html),
              reasons: ["podstránka kontakt je pomalá"],
            },
          });
          await prisma.harvestJob.update({
            where: { id: job.id },
            data: { scanned: { increment: 1 }, skippedSlow: { increment: 1 }, lastRunAt: new Date() },
          });
          return { processed: 1, added: 0 };
        }
        continue;
      }
      html = sub.html;
      finalUrl = sub.finalUrl;
      loadMs += sub.loadMs;
      phones = extractSkPhones(html);
      if (phones.length) break;
    }
  }

  const title = titleOf(html);
  const judged = scoreOutdatedSite(html, finalUrl);
  if (judged.modern || judged.score < job.minScore) {
    await prisma.harvestedSite.update({
      where: { id: site.id },
      data: {
        status: "SKIPPED_MODERN",
        loadMs,
        title,
        score: judged.score,
        reasons: judged.reasons,
        phones,
      },
    });
    await prisma.harvestJob.update({
      where: { id: job.id },
      data: { scanned: { increment: 1 }, skippedModern: { increment: 1 }, lastRunAt: new Date() },
    });
    return { processed: 1, added: 0 };
  }

  if (phones.length === 0) {
    await prisma.harvestedSite.update({
      where: { id: site.id },
      data: {
        status: "SKIPPED_NO_PHONE",
        loadMs,
        title,
        score: judged.score,
        reasons: [...judged.reasons, "na webe nie je SK telefón"],
      },
    });
    await prisma.harvestJob.update({
      where: { id: job.id },
      data: { scanned: { increment: 1 }, skippedNoPhone: { increment: 1 }, lastRunAt: new Date() },
    });
    return { processed: 1, added: 0 };
  }

  let added = 0;
  let duplicates = 0;
  let firstContactId: string | null = null;
  const kept: string[] = [];
  for (const phone of phones) {
    const result = await saveContact({
      phone,
      domain: site.domain,
      title,
      url: finalUrl,
      reasons: judged.reasons,
      score: judged.score,
    });
    if (result.duplicate) duplicates += 1;
    else {
      added += 1;
      kept.push(phone);
      firstContactId = result.contactId;
      if (job.attachToCampaign) await attachToCampaign(result.contactId);
    }
  }

  await prisma.harvestedSite.update({
    where: { id: site.id },
    data: {
      status: added > 0 ? "ADDED" : "DUPLICATE",
      loadMs,
      title,
      score: judged.score,
      reasons: judged.reasons,
      phones: kept.length ? kept : phones,
      contactId: firstContactId,
    },
  });

  await prisma.harvestJob.update({
    where: { id: job.id },
    data: {
      scanned: { increment: 1 },
      added: { increment: added },
      duplicates: { increment: duplicates },
      lastRunAt: new Date(),
      lastError: null,
    },
  });

  return { processed: 1, added };
}

function titleOf(html: string) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].replace(/\s+/g, " ").trim().slice(0, 180) : null;
}

export async function tickHarvest() {
  const job = await ensureHarvestJob();
  if (job.status !== "RUNNING") {
    return { ok: true, processed: 0, reason: "not_running" };
  }
  if (job.added >= job.targetNewContacts) {
    await prisma.harvestJob.update({
      where: { id: job.id },
      data: { status: "COMPLETED", stoppedAt: new Date() },
    });
    return { ok: true, processed: 0, reason: "target_reached", added: job.added };
  }

  let queued = await prisma.harvestedSite.findFirst({
    where: { jobId: job.id, status: "QUEUED" },
    orderBy: { createdAt: "asc" },
  });

  if (!queued) {
    const queries = job.queries.length ? job.queries : DEFAULT_QUERIES;
    const query = queries[job.queryIndex % queries.length];
    const urls = await discoverUrls(query);
    const enqueued = await enqueueUrls(job.id, urls);
    await prisma.harvestJob.update({
      where: { id: job.id },
      data: {
        queryIndex: (job.queryIndex + 1) % queries.length,
        lastRunAt: new Date(),
        lastError: enqueued ? null : `Vyhľadávanie „${query}“ nenašlo nové weby`,
      },
    });
    queued = await prisma.harvestedSite.findFirst({
      where: { jobId: job.id, status: "QUEUED" },
      orderBy: { createdAt: "asc" },
    });
    if (!queued) {
      await scheduleNextTick(Math.max(job.delayMs, 8000));
      return { ok: true, processed: 0, reason: "search_empty", query };
    }
  }

  const result = await processSite(job, queued);
  const fresh = await prisma.harvestJob.findUniqueOrThrow({ where: { id: job.id } });
  if (fresh.status === "RUNNING" && fresh.added < fresh.targetNewContacts) {
    await scheduleNextTick(job.delayMs);
  } else if (fresh.added >= fresh.targetNewContacts) {
    await prisma.harvestJob.update({
      where: { id: job.id },
      data: { status: "COMPLETED", stoppedAt: new Date() },
    });
  }
  return { ok: true, ...result };
}

export async function startHarvest() {
  const job = await prisma.harvestJob.update({
    where: { id: (await ensureHarvestJob()).id },
    data: { status: "RUNNING", startedAt: new Date(), pausedAt: null, stoppedAt: null, lastError: null },
  });
  await tickHarvest();
  return job;
}

export async function pauseHarvest() {
  return prisma.harvestJob.update({
    where: { id: "default" },
    data: { status: "PAUSED", pausedAt: new Date() },
  });
}

export async function resumeHarvest() {
  await prisma.harvestJob.update({
    where: { id: "default" },
    data: { status: "RUNNING", pausedAt: null },
  });
  await tickHarvest();
}

export async function stopHarvest() {
  return prisma.harvestJob.update({
    where: { id: "default" },
    data: { status: "STOPPED", stoppedAt: new Date() },
  });
}
