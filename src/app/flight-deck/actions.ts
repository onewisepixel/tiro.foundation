"use server";

// Flight Deck mutations. Each one runs through act() (guard.ts): no
// runtime outside local demo, no session -> sign-in, and the domain
// functions enforce role capabilities themselves. Next.js rejects a
// cross-origin Origin header on every Server Action (CSRF), and the
// session cookie is SameSite=Strict.
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { audit, requireCapability } from "@/lib/flightDeck/access";
import { decide, GateError, submitForReview } from "@/lib/flightDeck/approvals";
import { queueDispatch, recordManualPublication, recordManualSend, retryJob, runDueJobs } from "@/lib/flightDeck/dispatch";
import { archiveDraft, createContentDraft, createOutreachDraft, editCampaign, editContentDraft, editOutreachDraft, setCampaignState } from "@/lib/flightDeck/drafts";
import { demoIdentity } from "@/lib/flightDeck/identities";
import { liftSuppression } from "@/lib/flightDeck/permissions";
import { createManualProspect, createTask, editProspect, eraseProspect, recordInteraction, resolveTask, reviewPermissionBasis, transitionStage, withdraw } from "@/lib/flightDeck/prospects";
import { getRuntime } from "@/lib/flightDeck/runtime";
import { buildSeedState } from "@/lib/flightDeck/seed";
import { issueSession, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/flightDeck/session";
import { CONTENT_TEMPLATES, MESSAGE_TEMPLATES } from "@/lib/flightDeck/templates";
import { act } from "./guard";

const s = (fd: FormData, name: string): string => {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
};
const opt = (fd: FormData, name: string): string | null => {
  const v = s(fd, name).trim();
  return v === "" ? null : v;
};
const num = (fd: FormData, name: string) => Number(s(fd, name));
// <input type="datetime-local"> values are entered and shown as UTC.
const utc = (fd: FormData, name: string): string | null => {
  const v = opt(fd, name);
  if (!v) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) {
    throw new GateError("validation-failed");
  }
  return `${v}:00.000Z`;
};

// ---------- Session (local demo only) ----------

export async function signIn(formData: FormData) {
  if (!(await getRuntime())) {
    notFound();
  }
  const identity = demoIdentity(s(formData, "userId"));
  if (!identity) {
    redirect("/flight-deck/sign-in?error=access-denied");
  }
  (await cookies()).set(SESSION_COOKIE, issueSession(identity.id, Date.now()), {
    httpOnly: true,
    sameSite: "strict",
    // Local demo runs on http://localhost; a production identity provider
    // must set Secure (docs/flight-deck/integrations.md).
    secure: false,
    path: "/flight-deck",
    maxAge: SESSION_TTL_MS / 1000,
  });
  redirect("/flight-deck?notice=signed-in");
}

export async function signOut() {
  (await cookies()).delete({ name: SESSION_COOKIE, path: "/flight-deck" });
  redirect("/flight-deck/sign-in");
}

// ---------- Relationships ----------

export async function createProspectAction(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    const p = await rt.store.transaction((tx) =>
      createManualProspect(tx, actor, {
        kind: s(formData, "kind"),
        displayName: s(formData, "displayName"),
        email: opt(formData, "email"),
        organizationName: opt(formData, "organizationName"),
        region: opt(formData, "region"),
        participationInterest: s(formData, "participationInterest"),
        source: s(formData, "source"),
        sourceEvidenceUrl: s(formData, "sourceEvidenceUrl"),
        sourceObservedOn: s(formData, "sourceObservedOn"),
        contactReason: s(formData, "contactReason"),
        priority: s(formData, "priority"),
      }),
    );
    return { notice: "created", to: `/flight-deck/relationships/${p.id}` };
  });
}

export async function editProspectAction(formData: FormData) {
  await act(formData, ({ rt, actor }) =>
    rt.store.transaction((tx) => {
      editProspect(tx, actor, s(formData, "id"), num(formData, "version"), {
        displayName: s(formData, "displayName"),
        email: opt(formData, "email"),
        organizationName: opt(formData, "organizationName"),
        region: opt(formData, "region"),
        priority: s(formData, "priority"),
        nextAction: opt(formData, "nextAction"),
        nextActionDue: opt(formData, "nextActionDue"),
        ownerId: opt(formData, "ownerId"),
      });
    }),
  );
}

export async function transitionAction(formData: FormData) {
  await act(formData, ({ rt, actor }) =>
    rt.store.transaction((tx) => {
      transitionStage(tx, actor, s(formData, "id"), num(formData, "version"), { to: s(formData, "to"), blockedReason: opt(formData, "blockedReason") });
    }),
  );
}

export async function recordInteractionAction(formData: FormData) {
  await act(formData, ({ rt, actor }) =>
    rt.store.transaction((tx) => {
      recordInteraction(tx, actor, s(formData, "prospectId"), {
        channel: s(formData, "channel"),
        direction: s(formData, "direction"),
        summary: s(formData, "summary"),
        sourceIntegrity: s(formData, "sourceIntegrity"),
        needsResponse: s(formData, "needsResponse") === "yes" ? "yes" : "no",
      });
    }),
  );
}

export async function createTaskAction(formData: FormData) {
  await act(formData, ({ rt, actor }) =>
    rt.store.transaction((tx) => {
      createTask(tx, actor, opt(formData, "prospectId"), { type: s(formData, "type"), title: s(formData, "title"), dueOn: opt(formData, "dueOn"), priority: s(formData, "priority") });
    }),
  );
}

export async function resolveTaskAction(formData: FormData) {
  await act(formData, ({ rt, actor }) =>
    rt.store.transaction((tx) => {
      const outcome = s(formData, "outcome");
      resolveTask(tx, actor, s(formData, "id"), num(formData, "version"), outcome === "cancelled" ? "cancelled" : outcome === "escalated" ? "escalated" : "done");
    }),
  );
}

export async function reviewBasisAction(formData: FormData) {
  await act(formData, ({ rt, actor }) =>
    rt.store.transaction((tx) => reviewPermissionBasis(tx, actor, s(formData, "permissionId"), s(formData, "decision") === "accept" ? "accept" : "reject")),
  );
}

export async function withdrawAction(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    const scope = s(formData, "scope");
    if (scope !== "all" && scope !== "outreach" && scope !== "newsletter") {
      throw new GateError("validation-failed");
    }
    await rt.store.transaction((tx) => withdraw(tx, actor, s(formData, "prospectId"), scope, scope === "newsletter" ? "unsubscribe" : "withdrawal"));
    return "withdrawn";
  });
}

export async function eraseAction(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    if (s(formData, "confirm") !== "ERASE") {
      throw new GateError("confirm-required");
    }
    await rt.store.transaction((tx) => eraseProspect(tx, actor, s(formData, "prospectId"), s(formData, "keepSuppression") === "yes"));
    return { notice: "erased", to: "/flight-deck/relationships" };
  });
}

export async function liftSuppressionAction(formData: FormData) {
  await act(formData, ({ rt, actor }) =>
    rt.store.transaction((tx) => {
      requireCapability(actor, "settings");
      liftSuppression(tx, actor, s(formData, "id"));
    }),
  );
}

// ---------- Drafts and approvals ----------

export async function createOutreachFromTemplate(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    const t = MESSAGE_TEMPLATES.find((m) => m.key === s(formData, "templateKey"));
    if (!t) {
      throw new GateError("unknown-template");
    }
    const d = await rt.store.transaction((tx) => {
      const p = tx.require("prospects", s(formData, "prospectId"));
      const prior = t.purpose === "follow-up" ? tx.list("outreach", (o) => o.prospectId === p.id && o.purpose !== "follow-up" && o.status === "sent")[0] : null;
      return createOutreachDraft(
        tx,
        actor,
        { prospectId: p.id, purpose: t.purpose, subject: t.subject, body: t.body.replaceAll("[name]", p.displayName), campaignId: opt(formData, "campaignId"), followUpOf: prior?.id ?? null, scheduledFor: null },
        "template",
      );
    });
    return { notice: "created", to: `/flight-deck/outreach/${d.id}` };
  });
}

export async function editOutreachAction(formData: FormData) {
  await act(formData, ({ rt, actor }) =>
    rt.store.transaction((tx) => {
      editOutreachDraft(tx, actor, s(formData, "id"), num(formData, "version"), { subject: s(formData, "subject"), body: s(formData, "body"), scheduledFor: utc(formData, "scheduledFor") });
    }),
  );
}

export async function createContentFromTemplate(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    const key = s(formData, "templateKey");
    const t = CONTENT_TEMPLATES.find((c) => c.key === key);
    const c = await rt.store.transaction((tx) =>
      createContentDraft(
        tx,
        actor,
        t
          ? { campaignId: opt(formData, "campaignId"), title: t.title, channel: t.channel, originCategory: t.originCategory, sourceReference: t.sourceReference, assetDescription: t.assetDescription, assetPermission: null, body: t.body, scheduledFor: null }
          : { campaignId: opt(formData, "campaignId"), title: "Untitled draft", channel: "linkedin", originCategory: "abstraction", sourceReference: "[Name the public, accepted source this draws on]", assetDescription: null, assetPermission: null, body: "[Draft text]", scheduledFor: null },
        t ? "template" : "human",
      ),
    );
    return { notice: "created", to: `/flight-deck/content/${c.id}` };
  });
}

export async function editContentAction(formData: FormData) {
  await act(formData, ({ rt, actor }) =>
    rt.store.transaction((tx) => {
      editContentDraft(tx, actor, s(formData, "id"), num(formData, "version"), {
        title: s(formData, "title"),
        channel: s(formData, "channel"),
        originCategory: s(formData, "originCategory"),
        sourceReference: s(formData, "sourceReference"),
        assetDescription: opt(formData, "assetDescription"),
        assetPermission: opt(formData, "assetPermission"),
        body: s(formData, "body"),
        scheduledFor: utc(formData, "scheduledFor"),
      });
    }),
  );
}

const subjectType = (fd: FormData) => {
  const t = s(fd, "type");
  if (t !== "outreach" && t !== "content" && t !== "campaign") {
    throw new GateError("validation-failed");
  }
  return t;
};

export async function submitForReviewAction(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    await rt.store.transaction((tx) => submitForReview(tx, actor, subjectType(formData), s(formData, "id")));
    return "submitted";
  });
}

export async function decideAction(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    const outcome = s(formData, "outcome");
    if (outcome !== "approved" && outcome !== "rejected" && outcome !== "revision-requested") {
      throw new GateError("validation-failed");
    }
    await rt.store.transaction((tx) => decide(tx, actor, subjectType(formData), s(formData, "id"), outcome, s(formData, "hash"), { secondReviewerId: opt(formData, "secondReviewerId") }));
    return outcome;
  });
}

export async function queueDispatchAction(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    const t = subjectType(formData);
    if (t === "campaign") {
      throw new GateError("validation-failed");
    }
    await rt.store.transaction((tx) => queueDispatch(tx, actor, t, s(formData, "id")));
    return "queued";
  });
}

export async function manualSendAction(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    if (s(formData, "attest") !== "yes") {
      throw new GateError("confirm-required");
    }
    await rt.store.transaction((tx) => recordManualSend(tx, actor, s(formData, "id")));
    return "manual-sent";
  });
}

export async function manualPublishAction(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    if (s(formData, "attest") !== "yes") {
      throw new GateError("confirm-required");
    }
    const url = opt(formData, "externalUrl");
    if (url && !/^https:\/\/\S+$/.test(url)) {
      throw new GateError("validation-failed");
    }
    await rt.store.transaction((tx) => recordManualPublication(tx, actor, s(formData, "id"), url));
    return "manual-published";
  });
}

export async function archiveDraftAction(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    const t = subjectType(formData);
    if (t === "campaign") {
      throw new GateError("validation-failed");
    }
    await rt.store.transaction((tx) => archiveDraft(tx, actor, t, s(formData, "id")));
    return "archived";
  });
}

// ---------- Campaigns ----------

export async function editCampaignAction(formData: FormData) {
  await act(formData, ({ rt, actor }) =>
    rt.store.transaction((tx) => {
      editCampaign(tx, actor, s(formData, "id"), num(formData, "version"), {
        name: s(formData, "name"),
        purpose: s(formData, "purpose"),
        audience: s(formData, "audience"),
        postsPerWeekCap: s(formData, "postsPerWeekCap"),
        introductionsPerWeekCap: s(formData, "introductionsPerWeekCap"),
        metricsDefinition: s(formData, "metricsDefinition"),
        consentReviewStatus: s(formData, "consentReviewStatus"),
        legalReviewStatus: s(formData, "legalReviewStatus"),
      });
    }),
  );
}

export async function campaignStateAction(formData: FormData) {
  await act(formData, ({ rt, actor }) =>
    rt.store.transaction((tx) => {
      const next = s(formData, "state");
      if (next !== "active" && next !== "paused" && next !== "closed") {
        throw new GateError("validation-failed");
      }
      setCampaignState(tx, actor, s(formData, "id"), next);
    }),
  );
}

// ---------- Operations ----------

export async function runJobsAction(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    requireCapability(actor, "dispatch");
    await runDueJobs(rt.store, rt.providers, actor);
    return "jobs-run";
  });
}

export async function retryJobAction(formData: FormData) {
  await act(formData, ({ rt, actor }) => rt.store.transaction((tx) => retryJob(tx, actor, s(formData, "id"))));
}

export async function pauseAction(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    const pause = s(formData, "pause") === "yes";
    requireCapability(actor, pause ? "pause" : "resume");
    await rt.store.transaction((tx) => {
      tx.updateSettings(tx.settings().version, { allOutboundPaused: pause, pausedAt: pause ? tx.nowIso : null, pausedBy: pause ? actor.id : null });
      audit(tx, actor, pause ? "outbound-paused" : "outbound-resumed", "settings", null);
    });
    return pause ? "paused" : "resumed";
  });
}

export async function markReviewCompleteAction(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    requireCapability(actor, "read");
    await rt.store.transaction((tx) => {
      tx.updateSettings(tx.settings().version, { lastReviewAt: tx.nowIso });
      audit(tx, actor, "review-completed", "settings", null);
    });
    return "review-complete";
  });
}

export async function resetSeedAction(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    requireCapability(actor, "settings");
    if (s(formData, "confirm") !== "RESET") {
      throw new GateError("confirm-required");
    }
    await rt.store.replace(await buildSeedState());
    rt.limiter.clear();
    return { notice: "reset", to: "/flight-deck" };
  });
}
