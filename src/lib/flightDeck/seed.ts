// Synthetic fixtures for the local demo. Every person, organization,
// address, and note here is invented and labeled as such; addresses use
// the reserved .invalid domain so nothing could ever be delivered to them.
// Nothing is read from backend/ or any archival fixture.
//
// The history is produced by running the real services on a controllable
// clock, so the demo shows exactly what the code does.
import { decide, payloadFor, submitForReview } from "./approvals";
import { createContentDraft, createOutreachDraft } from "./drafts";
import { queueDispatch, recordManualSend } from "./dispatch";
import { DEMO_IDENTITIES } from "./identities";
import { recordInterest } from "./intake";
import { createManualProspect, createTask, recordInteraction, reviewPermissionBasis, transitionStage, withdraw } from "./prospects";
import { MemoryOperationsStore, type OpsState, type OpsTx } from "./store";
import { CONTENT_TEMPLATES, MESSAGE_TEMPLATES } from "./templates";
import { newId } from "./ids";

const [FOUNDER, OPERATOR] = DEMO_IDENTITIES;

// Synthetic fillings for every template placeholder the seed uses, so its
// drafts pass the "no unfilled placeholders" review gate honestly.
const SYNTHETIC_FILL: Record<string, string> = {
  "Founder name": "Demo Founder",
  "One or two sentences responding to what they actually said.": "(Synthetic reply text responding to their synthetic note.)",
  "proposed times or a scheduling link approved for use": "(two synthetic time options)",
  "specific public work, with where you saw it": "published guidance on language documentation ethics (synthetic, seen on its public page)",
  "one sentence on the specific relevance": "(Synthetic sentence on why this work is relevant.)",
  "archiving / community stewardship / language work": "language documentation",
};

const fill = (text: string, values: Record<string, string>) => text.replace(/\[([^\]]+)\]/g, (m, k: string) => values[k] ?? SYNTHETIC_FILL[k] ?? m);

export async function buildSeedState(now: Date = new Date()): Promise<OpsState> {
  let clock = new Date(now);
  const store = new MemoryOperationsStore(() => clock);
  const at = (daysAgo: number, hour = 10) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - daysAgo);
    d.setUTCHours(hour, 0, 0, 0);
    clock = d;
  };
  const run = <T>(fn: (tx: OpsTx) => T) => store.transaction(fn);
  const byName = (tx: OpsTx, name: string) => tx.list("prospects", (p) => p.displayName === name)[0];
  const inquiry = (name: string, local: string, category: "interested-contributor" | "community-partner" | "specialist-volunteer", extra: { organization?: string; region?: string; note?: string; updates?: boolean; referral?: string } = {}) =>
    run((tx) =>
      recordInterest(tx, {
        displayName: name,
        email: `${local}@example.invalid`,
        category,
        organization: extra.organization ?? null,
        region: extra.region ?? null,
        note: extra.note ?? null,
        updatesOptIn: extra.updates ? "yes" : null,
        referral: extra.referral ?? null,
      }),
    );

  // ---- Ten days ago: the campaign plan and its sample content ----
  at(10);
  const campaignId = await run((tx) => {
    const c = tx.insert("campaigns", {
      id: newId("cmp"),
      name: "Pilot listening: introductions (synthetic plan)",
      purpose: "Invite exploratory conversations about a bounded pilot with community, archival, research and language practitioners. No collection, no requests for material.",
      audience: "A small, individually researched set of public institutional contacts, plus people who wrote to TIRO first.",
      channels: ["linkedin", "instagram", "newsletter", "email-introduction"],
      postsPerWeekCap: 2,
      introductionsPerWeekCap: 5,
      reviewOwnerId: FOUNDER.id,
      startsOn: null,
      endsOn: null,
      status: "draft",
      metricsDefinition: "Count only: conversations held, inquiries answered, opt-outs honoured. No reach, follower, or engagement targets; no counts are published without evidence.",
      consentReviewStatus: "not-started",
      legalReviewStatus: "not-started",
      createdAt: tx.nowIso,
      updatedAt: tx.nowIso,
      version: 1,
      synthetic: true,
    });
    for (const t of CONTENT_TEMPLATES) {
      createContentDraft(tx, FOUNDER, { campaignId: c.id, title: t.title, channel: t.channel, originCategory: t.originCategory, sourceReference: t.sourceReference, assetDescription: t.assetDescription, assetPermission: t.originCategory === "evidence" ? "Founder's own screenshots of TIRO's public site; no third-party material." : null, body: t.body, scheduledFor: null }, "template");
    }
    return c.id;
  });

  // ---- Nine to six days ago: inquiries arrive through the real intake path ----
  at(9, 9);
  await inquiry("Synthetic Prospect A-04", "a04", "specialist-volunteer", { region: "Example region", note: "Synthetic note: has worked on oral-history transcription and would like to talk." });
  at(8, 14);
  await inquiry("Synthetic Prospect A-05", "a05", "community-partner", { organization: "Example Community Association (synthetic)", region: "Example region", note: "Synthetic note: asks how communities would be consulted.", updates: true });
  at(8, 16);
  await inquiry("Synthetic Prospect A-06", "a06", "community-partner", { region: "Example region", note: "Synthetic note: says they speak for a community; nothing about that is verified." });
  at(7, 11);
  await inquiry("Synthetic Prospect A-07", "a07", "interested-contributor", { updates: true });
  at(6, 15);
  await inquiry("Synthetic Prospect A-08", "a08", "specialist-volunteer", { organization: "Example University Language Lab (synthetic)", note: "Synthetic note: translator, interested in consultation." });

  // Triage and replies, a few days back.
  at(6, 17);
  await run((tx) => {
    for (const name of ["Synthetic Prospect A-04", "Synthetic Prospect A-05", "Synthetic Prospect A-06", "Synthetic Prospect A-08"]) {
      const p = byName(tx, name);
      transitionStage(tx, FOUNDER, p.id, p.version, { to: "triage-ready", blockedReason: null });
    }
    for (const name of ["Synthetic Prospect A-04", "Synthetic Prospect A-05", "Synthetic Prospect A-08"]) {
      const p = byName(tx, name);
      transitionStage(tx, FOUNDER, p.id, p.version, { to: "qualified-for-conversation", blockedReason: null });
    }
    const a06 = byName(tx, "Synthetic Prospect A-06");
    transitionStage(tx, FOUNDER, a06.id, a06.version, { to: "needs-review", blockedReason: "community-authority" });
  });

  const reply = MESSAGE_TEMPLATES.find((t) => t.key === "inquiry-reply")!;
  for (const [name, daysAgo] of [["Synthetic Prospect A-04", 5], ["Synthetic Prospect A-05", 5], ["Synthetic Prospect A-08", 4]] as const) {
    at(daysAgo, 10);
    await run((tx) => {
      const p = byName(tx, name);
      const d = createOutreachDraft(tx, OPERATOR, { prospectId: p.id, purpose: "reply", subject: reply.subject, body: fill(reply.body, { name, "Founder name": "Demo Founder" }), campaignId: null, followUpOf: null, scheduledFor: null }, "template");
      submitForReview(tx, OPERATOR, "outreach", d.id);
      decide(tx, FOUNDER, "outreach", d.id, "approved", payloadFor(tx, "outreach", d.id).hash);
      recordManualSend(tx, FOUNDER, d.id);
    });
  }
  // A-05 and A-08 replied; conversations followed.
  at(3, 12);
  await run((tx) => {
    const a05 = byName(tx, "Synthetic Prospect A-05");
    recordInteraction(tx, FOUNDER, a05.id, { channel: "email", direction: "inbound", summary: "Synthetic: agreed to a short call; asked for the stewardship principles first.", sourceIntegrity: "verified-sender", needsResponse: "no" });
    const t = tx.list("tasks", (t) => t.prospectId === a05.id && t.status === "open");
    for (const task of t) {
      tx.update("tasks", task.id, task.version, { status: "done", resolution: "Call arranged." });
    }
    const fresh = byName(tx, "Synthetic Prospect A-05");
    transitionStage(tx, FOUNDER, fresh.id, fresh.version, { to: "conversation-scheduled", blockedReason: null });
    const p = byName(tx, "Synthetic Prospect A-05");
    tx.update("prospects", p.id, p.version, { nextAction: "Introductory call (synthetic)", nextActionDue: new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10), ownerId: FOUNDER.id });
    createTask(tx, FOUNDER, p.id, { type: "schedule-conversation", title: "Hold the introductory call; record a high-level summary only", dueOn: new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10), priority: "high" });

    const a08 = byName(tx, "Synthetic Prospect A-08");
    recordInteraction(tx, FOUNDER, a08.id, { channel: "video", direction: "outbound", summary: "Synthetic: introductory conversation held. Interested in advising on translation practice. No material discussed or requested.", sourceIntegrity: "not-applicable", needsResponse: "no" });
    transitionStage(tx, FOUNDER, a08.id, byName(tx, "Synthetic Prospect A-08").version, { to: "conversation-scheduled", blockedReason: null });
    transitionStage(tx, FOUNDER, a08.id, byName(tx, "Synthetic Prospect A-08").version, { to: "consultation-underway", blockedReason: null });
  });

  // A-07 opted out of everything.
  at(3, 15);
  await run((tx) => withdraw(tx, FOUNDER, byName(tx, "Synthetic Prospect A-07").id, "all", "withdrawal"));

  // ---- Researched institutional contacts ----
  at(4, 9);
  await run((tx) => {
    createManualProspect(tx, OPERATOR, {
      kind: "organization",
      displayName: "Synthetic Prospect B-01",
      email: "enquiries-b01@example.invalid",
      organizationName: "Example Regional Archive (synthetic)",
      region: "Example region",
      participationInterest: "institution",
      source: "manual-research",
      sourceEvidenceUrl: "https://example.org/synthetic-archive/contact",
      sourceObservedOn: new Date(now.getTime() - 4 * 86_400_000).toISOString().slice(0, 10),
      contactReason: "Synthetic: publishes guidance on community consultation for oral-history collections; its public enquiries address invites professional contact.",
      priority: "normal",
    });
    const b02 = createManualProspect(tx, OPERATOR, {
      kind: "person",
      displayName: "Synthetic Prospect B-02",
      email: "b02@example.invalid",
      organizationName: "Example University Language Lab (synthetic)",
      region: "Example region",
      participationInterest: "institution",
      source: "referral",
      sourceEvidenceUrl: "https://example.org/synthetic-lab/people",
      sourceObservedOn: new Date(now.getTime() - 4 * 86_400_000).toISOString().slice(0, 10),
      contactReason: "Synthetic: introduced by Synthetic Prospect A-08, who suggested an exploratory conversation about language documentation ethics.",
      priority: "high",
    });
    const perm = tx.list("permissions", (p) => p.prospectId === b02.id)[0];
    reviewPermissionBasis(tx, FOUNDER, perm.id, "accept");
  });

  // ---- Yesterday and today: the work waiting for the founder ----
  at(2, 9);
  await run((tx) => tx.updateSettings(tx.settings().version, { lastReviewAt: tx.nowIso }));

  at(1, 11);
  await inquiry("Synthetic Prospect A-01", "a01", "interested-contributor", { region: "Example region", note: "Synthetic note: would like to understand what a pilot involves before deciding anything.", referral: "linkedin" });
  at(1, 13);
  await inquiry("Synthetic Prospect A-02", "a02", "community-partner", { organization: "Example Community Association (synthetic)", note: "Synthetic note: asks whether TIRO works with existing community archives.", updates: true });
  at(1, 18);
  // A-02 submits again: the repeat is linked, with no second acknowledgement.
  await inquiry("Synthetic Prospect A-02", "a02", "community-partner", { note: "Synthetic note: second submission, same address." });

  at(0, 8);
  await run((tx) => {
    const intro = MESSAGE_TEMPLATES.find((t) => t.key === "institutional-introduction")!;
    const b02 = byName(tx, "Synthetic Prospect B-02");
    const d = createOutreachDraft(tx, OPERATOR, { prospectId: b02.id, purpose: "first-contact", subject: intro.subject, body: fill(intro.body, { name: "Synthetic Prospect B-02", organization: "Example University Language Lab (synthetic)", "Founder name": "Demo Founder" }), campaignId: null, followUpOf: null, scheduledFor: null }, "template");
    submitForReview(tx, OPERATOR, "outreach", d.id);

    for (const c of tx.list("content", (c) => c.campaignId === campaignId).slice(0, 2)) {
      submitForReview(tx, FOUNDER, "content", c.id);
    }
  });

  // An approved message whose dispatch is held because no provider is
  // configured: the honest "manual-ready" state.
  at(0, 9);
  await run((tx) => {
    const a04 = byName(tx, "Synthetic Prospect A-04");
    const follow = MESSAGE_TEMPLATES.find((t) => t.key === "single-follow-up")!;
    const first = tx.list("outreach", (d) => d.prospectId === a04.id)[0];
    const d = createOutreachDraft(tx, OPERATOR, { prospectId: a04.id, purpose: "follow-up", subject: follow.subject, body: fill(follow.body, { name: "Synthetic Prospect A-04", date: first.createdAt.slice(0, 10), topic: "a conversation about the pilot", "Founder name": "Demo Founder" }), campaignId: null, followUpOf: first.id, scheduledFor: null }, "template");
    submitForReview(tx, OPERATOR, "outreach", d.id);
    decide(tx, FOUNDER, "outreach", d.id, "approved", payloadFor(tx, "outreach", d.id).hash);
    queueDispatch(tx, FOUNDER, "outreach", d.id);
  });

  clock = new Date(now);
  return store.snapshot();
}
