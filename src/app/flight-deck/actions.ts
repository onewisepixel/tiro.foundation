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
import { queueDispatch, recordManualPublication, recordManualSend, retryJob } from "@/lib/flightDeck/dispatch";
import { archiveDraft, createContentDraft, createOutreachDraft, editCampaign, editContentDraft, editOutreachDraft, setCampaignState } from "@/lib/flightDeck/drafts";
import { demoIdentity } from "@/lib/flightDeck/identities";
import { liftSuppression } from "@/lib/flightDeck/permissions";
import { createManualProspect, createTask, editProspect, eraseProspect, recordInteraction, resolveTask, reviewPermissionBasis, transitionStage, withdraw } from "@/lib/flightDeck/prospects";
import { getConsoleRuntime, PROD_SESSION_COOKIE } from "@/lib/flightDeck/runtime";
import { completeStep, openCase, redactField, resolveCase } from "@/lib/flightDeck/cases";
import { runWorkerTick } from "@/lib/flightDeck/worker";
import { checkRecovery, reconcile, requireRecovered } from "@/lib/flightDeck/recovery";
import { ProtectiveWriteFailed, RecoveryRequired } from "@/lib/flightDeck/store";
import { signOutUrl } from "@/lib/flightDeck/oidc";
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

// Local demo only: choose a test identity. Production sign-in goes
// through Cognito (/flight-deck/auth/login); this action does not exist
// for it.
export async function signIn(formData: FormData) {
  const rt = await getConsoleRuntime();
  if (!rt || rt.mode !== "local-demo") {
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
  const rt = await getConsoleRuntime();
  const jar = await cookies();
  if (rt?.mode === "production" && rt.identity && rt.cognito) {
    const token = jar.get(PROD_SESSION_COOKIE)?.value;
    if (token) {
      await rt.identity.revokeSession(token, new Date());
    }
    jar.delete({ name: PROD_SESSION_COOKIE, path: "/" });
    redirect(signOutUrl(rt.cognito));
  }
  jar.delete({ name: SESSION_COOKIE, path: "/flight-deck" });
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
    await requireRecovered(rt.store);
    await rt.store.transaction((tx) => queueDispatch(tx, actor, t, s(formData, "id")));
    return "queued";
  });
}

export async function manualSendAction(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    if (s(formData, "attest") !== "yes") {
      throw new GateError("confirm-required");
    }
    await requireRecovered(rt.store);
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
    await requireRecovered(rt.store);
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
    // Only the local demo has a reset; production has no such path.
    if (!rt.resetToSeed) {
      throw new GateError("access-denied");
    }
    await rt.resetToSeed();
    return { notice: "reset", to: "/flight-deck" };
  });
}

// ---------- Exceptions (0.2) ----------

export async function openCaseAction(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    const c = await rt.store.transaction((tx) =>
      openCase(tx, actor, {
        kind: s(formData, "kind"),
        prospectId: opt(formData, "prospectId"),
        receivedVia: s(formData, "receivedVia"),
        summary: s(formData, "summary"),
        optOutScope: opt(formData, "optOutScope"),
        pauseOutbound: s(formData, "pauseOutbound") === "yes" ? "yes" : null,
      }),
    );
    return { notice: "case-opened", to: `/flight-deck/cases/${c.id}` };
  });
}

export async function caseStepAction(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    await rt.store.transaction((tx) => completeStep(tx, actor, s(formData, "id"), num(formData, "version"), s(formData, "step")));
    return "case-step";
  });
}

export async function resolveCaseAction(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    await rt.store.transaction((tx) => resolveCase(tx, actor, s(formData, "id"), num(formData, "version"), s(formData, "outcome")));
    return "case-resolved";
  });
}

export async function redactAction(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    const target = s(formData, "target");
    if (target !== "prospect" && target !== "interaction") {
      throw new GateError("validation-failed");
    }
    await rt.store.transaction((tx) => redactField(tx, actor, s(formData, "caseId"), target, s(formData, "targetId"), s(formData, "field")));
    return "redacted";
  });
}

// ---------- Operators and worker (0.2) ----------

export async function runWorkerAction(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    requireCapability(actor, "dispatch");
    await runWorkerTick({ store: rt.store, providers: rt.providers, purgeRateLimits: rt.purgeRateLimits, acquireLock: rt.acquireWorkerLock, ledgerSink: rt.ledgerSink, identity: rt.identity });
    return "worker-ran";
  });
}

export async function operatorAction(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    requireCapability(actor, "settings");
    if (!rt.identity) {
      throw new GateError("access-denied");
    }
    const id = s(formData, "id");
    const op = s(formData, "op");
    if (id === actor.id && op !== "revoke") {
      throw new GateError("cannot-deactivate-self");
    }
    const now = new Date();
    if (op === "deactivate") {
      try {
        await rt.identity.deactivateOperator(id, now, actor.id);
      } catch (e) {
        if (e instanceof ProtectiveWriteFailed || e instanceof RecoveryRequired) {
          // The deactivation could not be made durable, so it was not
          // applied. Ending every session is still done at once.
          await rt.identity.revokeAllSessions(id, now);
          await rt.store.transaction((tx) => audit(tx, actor, "sessions-revoked", "operator", id, "deactivation-not-durable"));
          return "deactivate-not-durable";
        }
        throw e;
      }
      await rt.store.transaction((tx) => audit(tx, actor, "operator-deactivated", "operator", id, null));
      return "operator-deactivated";
    }
    if (op === "revoke") {
      await rt.identity.revokeAllSessions(id, now);
      await rt.store.transaction((tx) => audit(tx, actor, "sessions-revoked", "operator", id, null));
      return "sessions-revoked";
    }
    const role = s(formData, "role");
    if (op === "role" && (role === "founder" || role === "operator" || role === "reviewer")) {
      await rt.identity.setRole(id, role, actor.id);
      await rt.store.transaction((tx) => audit(tx, actor, "operator-role-changed", "operator", id, role));
      return "saved";
    }
    throw new GateError("validation-failed");
  });
}

// ---------- Recovery (0.2.1) ----------

// Founder: verify the database against the protective log and replay what
// it lacks (recovery.ts). Clears the contact lock only when verification
// succeeds end to end.
export async function reconcileAction(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    if (actor.role !== "founder") {
      throw new GateError("founder-required");
    }
    await checkRecovery(rt.store);
    const report = await reconcile(rt.store, actor, { identity: rt.identity });
    const status = await checkRecovery(rt.store);
    // A successful recovery ends every session, this one included: the
    // founder signs in again (recovery.ts).
    return { notice: report.ok && status.ok ? "recovery-verified" : "recovery-incomplete", to: "/flight-deck/recovery" };
  }, { duringRecovery: true });
}

// Founder: a lift recorded before a restore is NOT replayed automatically;
// confirming it lifts the suppression again, as a new protective event.
export async function confirmLiftAction(formData: FormData) {
  await act(formData, async ({ rt, actor }) => {
    requireCapability(actor, "settings");
    const id = s(formData, "suppressionId");
    await rt.store.transaction((tx) => {
      liftSuppression(tx, actor, id);
      for (const t of tx.list("tasks", (t) => t.dedupeKey === `lift-confirm:${id}` && t.status === "open")) {
        tx.update("tasks", t.id, t.version, { status: "done", resolution: "Lift confirmed by the founder after recovery." });
      }
    });
    return "lift-confirmed";
  });
}
