// Public expression-of-interest intake.
//
// Accepts a small set of short text fields and a fixed topic selection,
// and nothing else: any file, any unexpected field (including the free-text
// note removed in 0.2), or an oversized body is refused before validation.
// There is no field in which to write an account, a story, or testimony.
// Responses never reveal whether an address is already known, and a
// repeated submission never starts a second acknowledgement or sequence.
import { audit, PUBLIC, SYSTEM } from "./access";
import { HONEYPOT_FIELD, LIMITS, type FormTokens, type RateLimiter } from "./abuse";
import { EMAIL_PATTERN, emailKey, newId, normalizeEmail, sha256 } from "./ids";
import { activeSuppressions } from "./permissions";
import { CONSENT_WORDING, PUBLIC_CATEGORIES, PUBLIC_TOPICS, type PublicTopic } from "./pilotCopy";
import { arrayOf, nullable, obj, oneOf, str, type Issue } from "./schema";
import type { OperationsStore, OpsTx } from "./store";
import { PILOT_FORM_VERSION, PRIVACY_NOTICE_VERSION } from "./config";

export const FORM_FIELDS = [
  "displayName",
  "email",
  "category",
  "organization",
  "region",
  "topics",
  "noticeAck",
  "replyConsent",
  "updatesOptIn",
  "noticeVersion",
  "formToken",
  "referral",
  HONEYPOT_FIELD,
] as const;

const MAX_TOTAL_CHARS = 4000;

const optionalText = (max: number, multiline = false) => nullable(str({ max, multiline }));

const InterestFormSchema = obj({
  displayName: str({ min: 1, max: 120 }),
  email: str({ min: 3, max: 254, pattern: EMAIL_PATTERN, code: "invalid-email" }),
  category: oneOf(PUBLIC_CATEGORIES.map((c) => c.value) as ["interested-contributor", "community-partner", "specialist-volunteer"]),
  organization: optionalText(160),
  region: optionalText(80),
  topics: arrayOf(oneOf(PUBLIC_TOPICS.map((t) => t.value) as [PublicTopic, ...PublicTopic[]]), { max: PUBLIC_TOPICS.length }),
  noticeAck: oneOf(["yes"] as const),
  replyConsent: oneOf(["yes"] as const),
  updatesOptIn: nullable(oneOf(["yes"] as const)),
  noticeVersion: str({ max: 32 }),
  referral: nullable(str({ max: 40, pattern: /^[a-z0-9_-]+$/i })),
});

// Outcomes the page renders. "received" is deliberately identical for a
// new address, a known address, a repeat, a suppressed address, and a
// silently dropped bot submission.
export type IntakeResult =
  | { status: "received" }
  | { status: "invalid"; fieldErrors: Record<string, string> }
  | { status: "refused"; message: string }
  | { status: "closed" };

const FIELD_MESSAGES: Record<string, Record<string, string>> = {
  displayName: { required: "Please give a name or how you would like to be addressed.", "too-long": "Please keep this under 120 characters." },
  email: { required: "Please give an email address so we can reply.", "invalid-email": "Please check the email address.", "too-long": "Please check the email address." },
  category: { "not-allowed-value": "Please choose the kind of interest that fits best." },
  organization: { "too-long": "Please keep this under 160 characters." },
  region: { "too-long": "Please keep this under 80 characters." },
  topics: { "not-allowed-value": "Please choose from the listed topics.", "too-many-items": "Please choose from the listed topics." },
  noticeAck: { "not-allowed-value": "Please confirm you have read the privacy notice." },
  replyConsent: { "not-allowed-value": "We need your permission to reply by email. Without it we cannot respond." },
};

function messageFor(issue: Issue): [string, string] {
  const field = issue.path.split(/[.[]/)[0];
  const message = FIELD_MESSAGES[field]?.[issue.code] ?? (FIELD_MESSAGES[field] ? "Please check this field." : "Please check the form and try again.");
  return [field in FIELD_MESSAGES ? field : "form", message];
}

export type IntakeContext = {
  store: OperationsStore;
  tokens: FormTokens;
  limiter: RateLimiter;
  clientKey: string;
  now: number;
};

type RawEntry = [string, unknown];

function blankToNull(v: unknown) {
  return typeof v === "string" && v.trim() === "" ? null : v ?? null;
}

// Best effort: an aggregate counter must never turn a refusal into an
// error page, so a storage failure here is swallowed.
async function count(store: OperationsStore, event: Parameters<OpsTx["upsertCounter"]>[0]["event"], category: string | null = null, referral: string | null = null) {
  try {
    await store.transaction((tx) => {
      const day = tx.nowIso.slice(0, 10);
      tx.upsertCounter({ id: `${day}:${event}:${category ?? "-"}:${referral ?? "-"}`, day, event, category: category as never, referral, count: 1 });
    });
  } catch {
    // counted nowhere; the outcome returned to the person is unchanged
  }
}

const UNAVAILABLE = "The form could not be saved just now, and nothing was stored. Please try again later, or write to custodians@tiro.foundation.";

export async function processInterest(entries: Iterable<RawEntry>, ctx: IntakeContext): Promise<IntakeResult> {
  // 1. Shape: text fields only; each at most once except the repeatable
  // topic selection; nothing undeclared.
  const raw: Record<string, unknown> = {};
  const topics: string[] = [];
  let total = 0;
  for (const [key, value] of entries) {
    if (key.startsWith("$ACTION")) {
      continue; // Next.js server-action bookkeeping fields
    }
    if (typeof value !== "string") {
      await count(ctx.store, "rejected-attachment");
      return { status: "refused", message: "This form accepts text only. Files and attachments are not accepted." };
    }
    if (key === "topics") {
      topics.push(value);
      total += value.length;
      continue;
    }
    if (!(FORM_FIELDS as readonly string[]).includes(key) || key in raw) {
      await count(ctx.store, "rejected-invalid");
      return { status: "refused", message: "The form could not be processed. Please reload the page and try again." };
    }
    total += value.length;
    raw[key] = value;
  }
  if (total > MAX_TOTAL_CHARS) {
    await count(ctx.store, "rejected-invalid");
    return { status: "refused", message: "The form could not be processed. Please shorten your entries and try again." };
  }

  // 2. Bots: a filled honeypot gets the ordinary success response and
  // nothing is stored.
  if (typeof raw[HONEYPOT_FIELD] === "string" && (raw[HONEYPOT_FIELD] as string).length > 0) {
    await count(ctx.store, "abuse-honeypot");
    return { status: "received" };
  }
  const token = ctx.tokens.check(raw.formToken, ctx.now);
  if (token !== "ok") {
    await count(ctx.store, token === "too-fast" ? "abuse-too-fast" : "abuse-token");
    return {
      status: "refused",
      message: token === "too-fast" ? "That was quicker than we expected. Please check your entries and submit again." : "This form has expired. Please reload the page and submit again.",
    };
  }
  if (!(await ctx.limiter.hit(`client:${ctx.clientKey}`, LIMITS.perClientPerHour, 60 * 60 * 1000, ctx.now))) {
    await count(ctx.store, "abuse-rate-limited");
    return { status: "refused", message: "We have received several submissions from this connection. Please try again later, or write to custodians@tiro.foundation." };
  }

  // 3. Validation.
  const candidate = {
    displayName: raw.displayName ?? "",
    email: raw.email ?? "",
    category: raw.category ?? "",
    organization: blankToNull(raw.organization),
    region: blankToNull(raw.region),
    topics: [...new Set(topics)].length === topics.length ? topics : ["duplicate"],
    noticeAck: raw.noticeAck ?? "",
    replyConsent: raw.replyConsent ?? "",
    updatesOptIn: blankToNull(raw.updatesOptIn),
    noticeVersion: raw.noticeVersion ?? "",
    referral: blankToNull(raw.referral),
  };
  const parsed = InterestFormSchema.parse(candidate);
  const fieldErrors: Record<string, string> = {};
  if (!parsed.ok) {
    for (const issue of parsed.issues) {
      const [field, message] = messageFor(issue);
      fieldErrors[field] ??= message;
    }
  }
  if (Object.keys(fieldErrors).length || !parsed.ok) {
    await count(ctx.store, "rejected-invalid");
    return { status: "invalid", fieldErrors };
  }
  const form = parsed.value;
  // The acknowledgement must be of the notice actually in force.
  if (form.noticeVersion !== PRIVACY_NOTICE_VERSION) {
    await count(ctx.store, "rejected-invalid");
    return { status: "refused", message: "The privacy notice has changed since this page loaded. Please reload, review it, and submit again." };
  }

  const email = normalizeEmail(form.email);
  const referral = form.referral?.toLowerCase() ?? null;

  // Per-address limit: past it, the response is still "received" (so the
  // limit reveals nothing about the address) and nothing more is stored.
  // The key is a hash held in memory only; the address is not kept here.
  if (!(await ctx.limiter.hit(`addr:${sha256(email)}`,LIMITS.perAddressPerDay, 24 * 60 * 60 * 1000, ctx.now))) {
    await count(ctx.store, "abuse-rate-limited");
    return { status: "received" };
  }

  // 4. Persist, in one transaction. If storage fails, say so: nothing is
  // half-saved (the transaction is all or nothing) and nothing is retried
  // behind the person's back.
  try {
    await ctx.store.transaction((tx) => recordInterest(tx, { ...form, email, referral }));
  } catch {
    return { status: "refused", message: UNAVAILABLE };
  }
  return { status: "received" };
}

type ValidInterest = {
  displayName: string;
  email: string;
  category: "interested-contributor" | "community-partner" | "specialist-volunteer";
  organization: string | null;
  region: string | null;
  topics: PublicTopic[];
  updatesOptIn: "yes" | null;
  referral: string | null;
};

const ACK_WINDOW_DAYS = 30;

function addDays(iso: string, days: number) {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString();
}

export function recordInterest(tx: OpsTx, form: ValidInterest) {
  const key = emailKey(form.email, tx.pepper);
  const base = { createdAt: tx.nowIso, updatedAt: tx.nowIso, version: 1, synthetic: tx.synthetic };
  const existing = tx.list("prospects", (p) => p.emailKey === key)[0] ?? null;
  const suppressed = activeSuppressions(tx, key).length > 0;

  const prospect =
    existing ??
    tx.insert("prospects", {
      id: newId("prs"),
      kind: "person",
      displayName: form.displayName,
      email: form.email,
      emailKey: key,
      organizationId: null,
      organizationName: form.organization,
      region: form.region,
      participationInterest: form.category,
      source: "inbound-form",
      sourceEvidenceUrl: null,
      sourceObservedOn: null,
      contactReason: null,
      stage: "received",
      blockedReason: null,
      ownerId: null,
      nextAction: "Triage new inquiry",
      nextActionDue: addDays(tx.nowIso, 7).slice(0, 10),
      priority: "normal",
      authorityStatus: "unverified",
      retentionClass: "inquiry-12m",
      retainUntil: addDays(tx.nowIso, 365).slice(0, 10),
      lastInboundAt: tx.nowIso,
      lastOutboundAt: null,
      ...base,
    });
  if (existing) {
    // A repeat refreshes recency and retention; it never overwrites the
    // name or details already on file (the founder sees the new
    // submission alongside them instead).
    tx.update("prospects", existing.id, existing.version, {
      lastInboundAt: tx.nowIso,
      retainUntil: existing.retentionClass === "inquiry-12m" ? addDays(tx.nowIso, 365).slice(0, 10) : existing.retainUntil,
    });
  }

  const submission = tx.insert("submissions", {
    id: newId("sub"),
    prospectId: prospect.id,
    formVersion: PILOT_FORM_VERSION,
    noticeVersion: PRIVACY_NOTICE_VERSION,
    category: form.category,
    topics: form.topics,
    referral: form.referral,
    outcome: existing ? "accepted-repeat" : "accepted",
    submittedAt: tx.nowIso,
    ...base,
  });

  const perms = tx.list("permissions", (p) => p.prospectId === prospect.id);
  const grant = (purpose: "direct-response" | "newsletter", basis: "form-request-reply" | "form-opt-in", wording: string) => {
    if (perms.some((p) => p.purpose === purpose && p.state === "active")) {
      return;
    }
    tx.insert("permissions", {
      id: newId("perm"),
      prospectId: prospect.id,
      purpose,
      basis,
      capturedWording: wording,
      wordingVersion: PRIVACY_NOTICE_VERSION,
      captureChannel: "web-form",
      capturedAt: tx.nowIso,
      state: "active",
      reviewedBy: null,
      reviewedAt: null,
      withdrawnAt: null,
      // Permission to reply lasts as long as the inquiry is retained.
      expiresAt: purpose === "direct-response" ? addDays(tx.nowIso, 365) : null,
      ...base,
    });
  };
  grant("direct-response", "form-request-reply", CONSENT_WORDING.replyConsent);
  if (form.updatesOptIn === "yes") {
    grant("newsletter", "form-opt-in", CONSENT_WORDING.updatesOptIn);
  }

  // One open task per inquiry, never a pile of duplicates. Someone who
  // opted out and writes again always gets a review task of their own.
  const openTask = tx.list("tasks", (t) => t.prospectId === prospect.id && t.status === "open" && (suppressed ? t.type === "permission-review" : t.type === "triage" || t.type === "permission-review"))[0];
  if (!openTask) {
    tx.insert("tasks", {
      id: newId("tsk"),
      type: suppressed ? "permission-review" : "triage",
      title: suppressed ? "Wrote again after opting out: review before any reply" : existing ? "Repeat inquiry: review the new submission" : "Triage new inquiry",
      dueOn: addDays(tx.nowIso, suppressed ? 3 : 7).slice(0, 10),
      ownerId: null,
      prospectId: prospect.id,
      status: "open",
      priority: suppressed ? "high" : "normal",
      resolution: null,
      createdBy: "system",
      dedupeKey: `intake:${submission.id}`,
      ...base,
    });
  }

  // At most one acknowledgement per address per window. Not queued at all
  // for a suppressed address.
  const recentAck = tx.list("jobs", (j) => {
    if (j.kind !== "send-acknowledgement" || j.createdAt < addDays(tx.nowIso, -ACK_WINDOW_DAYS)) {
      return false;
    }
    return tx.get("submissions", j.subjectId)?.prospectId === prospect.id;
  });
  if (!suppressed && recentAck.length === 0) {
    tx.insert("jobs", {
      id: newId("job"),
      kind: "send-acknowledgement",
      subjectId: submission.id,
      subjectVersion: 1,
      approvalId: null,
      idempotencyKey: `ack:${submission.id}`,
      status: "queued",
      attempts: 0,
      maxAttempts: 3,
      nextAttemptAt: tx.nowIso,
      lastErrorCode: null,
      holdReason: null,
      ...base,
    });
  }

  const day = tx.nowIso.slice(0, 10);
  const event = existing ? "interest-repeat" : "interest-accepted";
  tx.upsertCounter({ id: `${day}:${event}:${form.category}:${form.referral ?? "-"}`, day, event, category: form.category, referral: form.referral, count: 1 });
  audit(tx, PUBLIC, "interest-received", "prospect", prospect.id, existing ? "repeat" : "new");
  if (suppressed) {
    audit(tx, SYSTEM, "review-required", "prospect", prospect.id, "previously-suppressed");
  }
  return { prospectId: prospect.id, submissionId: submission.id, repeat: !!existing };
}
