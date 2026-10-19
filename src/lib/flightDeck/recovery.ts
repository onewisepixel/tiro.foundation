// The recovery gate.
//
// checkRecovery() compares this database with the external protective log
// (protective.ts) and, if the log is ahead (a restore, or a crash between
// a log write and its commit) or inconsistent (a missing or altered event
// at the database's head), records a recovery lock in settings. While the
// lock is set, nothing contacts anyone: dispatch, manual sends, manual
// publications, queueing and public intake all refuse (dispatch.ts,
// intake.ts). It is called before every contact path and by the worker.
//
// reconcile() is the only way the lock clears:
//   1. verify the whole chain from the database's head to the end of the
//      log (contiguous, linked, hashes recomputed) BEFORE applying
//      anything; any failure locks for a founder (journal-integrity);
//   2. apply each event in its own transaction that also advances the
//      head by exactly one (an interrupted recovery resumes where it
//      stopped; a concurrent reconciler cannot apply twice);
//   3. apply only events that cannot increase access: opt-outs, erasures,
//      operator deactivations, and role changes to a role with no
//      capability the operator lacks now. An event past the database's
//      head may belong to a transaction that never committed (the log is
//      written first), so anything that would INCREASE access is never
//      re-applied: a suppression lift, a role elevation or lateral change,
//      and every launch-gate approval become founder tasks instead, and
//      the head moves past them in the same transaction;
//   4. confirm the head now equals the end of the log, end every session
//      (a restore could revive one signed out after the backup), bring the
//      restore fence up to the bucket's, then clear the lock.
//
// The restore fence catches a restore that lost no protective event: each
// healthy worker run raises the database's fence and then writes it to the
// bucket. A database whose fence is behind the bucket's is a restored copy.
//
// While any of this is unresolved, the console serves no private data
// (src/app/flight-deck/guard.ts), not merely no contact.
import { audit, roleChangeReducesAccess, SYSTEM, type Actor } from "./access";
import { GateError } from "./approvals";
import type { IdentityStore } from "./identity";
import { requestConfirmation, requestLiftConfirmation } from "./ledger";
import { applySuppression } from "./permissions";
import { EMPTY_HEAD, JournalIntegrityError, SinkUnavailable, verifyChain, type JournalHead, type ProtectiveBody, type ProtectiveEvent } from "./protective";
import { eraseProspectRecord } from "./prospects";
import { ReplayOutOfOrder, type OperationsStore, type OpsTx } from "./store";

type LockReason = "journal-ahead" | "journal-mismatch" | "journal-integrity" | "restore-in-progress" | "sink-unavailable";

export type RecoveryStatus =
  | { ok: true; head: JournalHead; logConfigured: boolean }
  | { ok: false; reason: LockReason; head: JournalHead | null; persisted: boolean };

// Never replaces a lock that needs a founder's investigation.
async function setLock(store: OperationsStore, reason: LockReason) {
  await store.transaction((tx) => {
    const s = tx.settings();
    const held = s.recoveryLock?.reason;
    if ((held === "journal-integrity" || held === "journal-mismatch") && reason !== "journal-integrity") {
      return;
    }
    if (!s.recoveryLock || s.recoveryLock.reason !== reason) {
      tx.updateSettings(s.version, { recoveryLock: { reason, since: s.recoveryLock?.since ?? tx.nowIso } });
      audit(tx, SYSTEM, "recovery-locked", "settings", null, reason);
    }
  });
}

// Run once against a database restored by the provider (point in time or
// snapshot) before it serves traffic. Detection alone (checkRecovery)
// already blocks a database that is behind the log; this also covers a
// restore with nothing to replay, so every restore is verified explicitly
// before contact resumes. An integrity lock is never downgraded.
export async function markRestored(store: OperationsStore): Promise<void> {
  const lock = await store.read((tx) => tx.settings().recoveryLock);
  if (lock?.reason !== "journal-integrity") {
    await setLock(store, "restore-in-progress");
  }
}

// Is it safe to contact anyone? Detects a stale or inconsistent database
// and persists a lock if so. A log that cannot be reached blocks contact
// for as long as it is unreachable, without a persisted lock.
export async function checkRecovery(store: OperationsStore): Promise<RecoveryStatus> {
  const sink = store.protectiveSink;
  const lock = await store.read((tx) => tx.settings().recoveryLock);
  const head = await store.protectiveHead();
  if (!sink) {
    // No log configured: only an in-process synthetic store (tests, a demo
    // without one). Production configuration requires a log.
    return lock ? { ok: false, reason: lock.reason, head, persisted: true } : store.synthetic ? { ok: true, head, logConfigured: false } : { ok: false, reason: "sink-unavailable", head, persisted: false };
  }
  let ahead: ProtectiveEvent[];
  let atHead: ProtectiveEvent | null = null;
  let bucketFence: number | null;
  try {
    ahead = await sink.listAfter(head.seq, 1);
    if (head.seq > 0) {
      atHead = await sink.read(head.seq);
    }
    bucketFence = await sink.readFence();
  } catch {
    return { ok: false, reason: "sink-unavailable", head, persisted: false };
  }
  if (head.seq > 0 && (!atHead || atHead.hash !== head.hash)) {
    await setLock(store, "journal-mismatch");
    return { ok: false, reason: "journal-mismatch", head, persisted: true };
  }
  if (ahead.length) {
    if (!lock || lock.reason === "restore-in-progress") {
      await setLock(store, lock?.reason === "restore-in-progress" ? "restore-in-progress" : "journal-ahead");
    }
    return { ok: false, reason: lock?.reason ?? "journal-ahead", head, persisted: true };
  }
  if (lock) {
    return { ok: false, reason: lock.reason, head, persisted: true };
  }
  if (bucketFence !== null && bucketFence > (await store.restoreFence())) {
    // Restored (or otherwise older) copy, even though no event is missing.
    await setLock(store, "restore-in-progress");
    return { ok: false, reason: "restore-in-progress", head, persisted: true };
  }
  return { ok: true, head, logConfigured: true };
}

export type ReconcileReport = {
  ok: boolean;
  fromSeq: number;
  toSeq: number;
  applied: number;
  pendingLifts: string[];
  // Access-increasing events not re-applied (founder tasks opened), as
  // "role:<event id>" or "gate:<gate>".
  notReapplied: string[];
  sessionsEnded: number;
  integrity: { code: string; seq: number } | null;
  interrupted: boolean;
};

const PAGE = 200;

function applyOps(tx: OpsTx, body: ProtectiveBody, actor: Actor): string | null {
  switch (body.kind) {
    case "suppression-added": {
      if (!tx.get("suppressions", body.suppressionId)) {
        tx.insert("suppressions", {
          id: body.suppressionId,
          emailKey: body.emailKey,
          scope: body.scope,
          basis: body.basis,
          effectiveAt: body.effectiveAt,
          createdBy: body.actorId,
          liftedAt: null,
          createdAt: body.at,
          updatedAt: tx.nowIso,
          version: 1,
          synthetic: tx.synthetic,
        });
      }
      const sup = tx.require("suppressions", body.suppressionId);
      if (!sup.liftedAt) {
        // Holds drafts and cancels jobs for the address, as the opt-out did.
        applySuppression(tx, actor, body.emailKey, body.scope, body.basis);
      }
      return null;
    }
    case "erasure": {
      if (tx.get("prospects", body.prospectId)) {
        eraseProspectRecord(tx, actor, body.prospectId, false, body.erasureId);
      } else if (!tx.get("erasures", body.erasureId)) {
        tx.insert("erasures", { id: body.erasureId, prospectId: body.prospectId, erasedAt: body.erasedAt, createdAt: body.at, updatedAt: tx.nowIso, version: 1, synthetic: tx.synthetic });
      }
      return null;
    }
    case "suppression-lifted": {
      // Never automatic: a lift reduces protection. The suppression stays in
      // force until a founder confirms the lift again.
      const sup = tx.get("suppressions", body.suppressionId);
      if (sup && !sup.liftedAt) {
        requestLiftConfirmation(tx, body.suppressionId);
        return body.suppressionId;
      }
      return null;
    }
    default:
      return null;
  }
}

// Re-applies everything the log holds that this database lacks, after
// verifying it. Founder or the scheduled worker (SYSTEM) only.
export async function reconcile(store: OperationsStore, actor: Actor, opts: { identity?: IdentityStore | null; now?: () => Date; failAfter?: number } = {}): Promise<ReconcileReport> {
  if (actor.role !== "founder" && actor.role !== "system") {
    throw new Error("only the founder or the scheduled worker may reconcile");
  }
  const sink = store.protectiveSink;
  const start = await store.protectiveHead();
  // An integrity failure means the history itself is in doubt: only a
  // founder, after investigating, may run reconciliation again.
  const lock = await store.read((tx) => tx.settings().recoveryLock);
  if (lock?.reason === "journal-integrity" && actor.role !== "founder") {
    return { ok: false, fromSeq: start.seq, toSeq: start.seq, applied: 0, pendingLifts: [], notReapplied: [], sessionsEnded: 0, integrity: { code: "founder-required", seq: start.seq }, interrupted: false };
  }
  const now = opts.now ?? (() => new Date());
  const report: ReconcileReport = { ok: false, fromSeq: start.seq, toSeq: start.seq, applied: 0, pendingLifts: [], notReapplied: [], sessionsEnded: 0, integrity: null, interrupted: false };
  if (!sink) {
    await store.transaction((tx) => {
      const s = tx.settings();
      if (s.recoveryLock) {
        tx.updateSettings(s.version, { recoveryLock: null });
      }
    });
    report.ok = true;
    return report;
  }

  // 1. Verify everything first.
  const events: ProtectiveEvent[] = [];
  try {
    if (start.seq > 0) {
      const atHead = await sink.read(start.seq);
      if (!atHead || atHead.hash !== start.hash) {
        throw new JournalIntegrityError(atHead ? "head-mismatch" : "head-missing", start.seq);
      }
    }
    let after = start.seq;
    for (;;) {
      const page = await sink.listAfter(after, PAGE);
      if (!page.length) {
        break;
      }
      // An object whose own sequence number does not move forward (swapped
      // or relabelled events) is an integrity failure, and must not send
      // this loop back over the same page forever.
      for (const e of page) {
        if (typeof e?.seq !== "number" || e.seq <= after) {
          throw new JournalIntegrityError("out-of-order", typeof e?.seq === "number" ? e.seq : after + 1);
        }
        events.push(e);
        after = e.seq;
      }
      if (events.length > 1_000_000) {
        throw new JournalIntegrityError("malformed", after);
      }
    }
    verifyChain(start.seq === 0 ? EMPTY_HEAD : start, events);
  } catch (e) {
    if (e instanceof JournalIntegrityError) {
      report.integrity = { code: e.code, seq: e.seq };
      await setLock(store, "journal-integrity");
      await store.transaction((tx) => audit(tx, actor, "recovery-integrity-failure", "settings", null, e.code));
      return report;
    }
    if (e instanceof SinkUnavailable) {
      return report;
    }
    throw e;
  }

  // 2-3. Apply one event per transaction, advancing the head by one.
  let n = 0;
  for (const e of events) {
    if (opts.failAfter !== undefined && n >= opts.failAfter) {
      report.interrupted = true;
      return report; // simulated interruption (tests)
    }
    const replayHead = { seq: e.seq, hash: e.hash };
    try {
      const body = e.body;
      if (body.kind === "operator-deactivated") {
        // Reduces access: re-apply (idempotent), THEN advance the head. An
        // interruption between the two re-applies it, harmlessly.
        if (opts.identity) {
          await opts.identity.replay(body, now());
        }
        await store.transaction(() => undefined, { replayHead });
      } else if (body.kind === "operator-role-changed") {
        const op = opts.identity ? await opts.identity.findOperator(body.operatorId) : null;
        if (op && roleChangeReducesAccess(op.role, body.role)) {
          // A demotion (or no change): re-apply by compare-and-set, then
          // advance. A re-run finds the role already changed: a no-op.
          if (op.role !== body.role) {
            await opts.identity!.replay(body, now(), op.role);
          }
          await store.transaction(() => undefined, { replayHead });
        } else {
          // Would increase access, and may never have committed: not
          // re-applied. The task and the head move in one transaction.
          await store.transaction(
            (tx) =>
              requestConfirmation(tx, `role-confirm:${body.id}`, `After a recovery: ${body.operatorId} was not made ${body.role} (it adds access). Redo it in Health only if still intended`),
            { replayHead },
          );
          report.notReapplied.push(`role:${body.id}`);
        }
      } else if (body.kind === "gate-recorded") {
        // A launch approval is never re-applied from the log: the founder
        // approves again at /flight-deck/gates if it is still intended.
        await store.transaction(
          (tx) => requestConfirmation(tx, `gate-confirm:${body.id}`, `After a recovery: the ${body.gate} gate approval was not re-applied. Approve again at /flight-deck/gates only if intended`),
          { replayHead },
        );
        report.notReapplied.push(`gate:${body.gate}`);
      } else {
        const pending = await store.transaction((tx) => applyOps(tx, e.body, actor), { replayHead });
        if (pending) {
          report.pendingLifts.push(pending);
        }
      }
    } catch (err) {
      if (err instanceof ReplayOutOfOrder) {
        // Another reconciler applied this one; continue from the new head.
        const head = await store.protectiveHead();
        if (head.seq >= e.seq) {
          continue;
        }
      }
      report.interrupted = true;
      throw err;
    }
    n++;
    report.applied++;
    report.toSeq = e.seq;
  }

  // 4. Confirm and unlock.
  const end = await store.protectiveHead();
  const tail = await sink.listAfter(end.seq, 1).catch(() => null);
  const bucketFence = await sink.readFence().catch(() => undefined);
  if (!tail || tail.length || bucketFence === undefined) {
    report.interrupted = true;
    return report;
  }
  const wasLocked = (await store.read((tx) => tx.settings().recoveryLock)) !== null || (bucketFence ?? 0) > (await store.restoreFence());
  if (wasLocked && opts.identity) {
    // Before unlocking: a session signed out after the restored backup
    // would otherwise be valid again. Everyone signs in afresh.
    report.sessionsEnded = await opts.identity.revokeEverySession(now());
  }
  await store.raiseFence(bucketFence ?? 0);
  await store.transaction((tx) => {
    const s = tx.settings();
    if (s.recoveryLock) {
      tx.updateSettings(s.version, { recoveryLock: null });
    }
    audit(tx, actor, "recovery-verified", "settings", null, report.applied ? "events-replayed" : "nothing-to-replay");
  });
  report.toSeq = end.seq;
  report.ok = true;
  return report;
}

// Advances the restore fence: database first, then the bucket, so the live
// database is never behind its own copy. Called by healthy worker runs.
export async function advanceFence(store: OperationsStore): Promise<number | null> {
  const sink = store.protectiveSink;
  if (!sink) {
    return null;
  }
  const next = await store.raiseFence((await store.restoreFence()) + 1);
  await sink.writeFence(next);
  return next;
}

// For contact paths outside the scheduled worker (manual sends, manual
// publications, queueing): refuse unless the check passes right now,
// including while the log is merely unreachable (not persisted as a lock).
export async function requireRecovered(store: OperationsStore) {
  const status = await checkRecovery(store);
  if (!status.ok) {
    throw new GateError("recovery-unverified");
  }
}
