// The restore-safety ledger.
//
// A database backup taken on Monday knows nothing about an erasure or an
// opt-out on Tuesday. Restoring it on Wednesday would bring the erased
// person back and could let a queued message reach someone who opted out.
//
// So the worker exports, after every tick, the two things that must never
// be undone by a restore: erasure tombstones (opaque ids only) and
// suppressions (keyed hashes only, no addresses). The ledger is written
// OUTSIDE the database (production: a separate, versioned, write-once
// object store; not yet provisioned). After any restore, replayLedger()
// re-applies it before the console or worker is allowed to run.
//
// Recovery point: anything erased or suppressed after the last ledger
// export (at most one worker interval) must be re-entered by hand from the
// exception cases; the restore runbook says so.
import fs from "node:fs";
import path from "node:path";
import { audit, type Actor } from "./access";
import { newId } from "./ids";
import { applySuppression } from "./permissions";
import { eraseProspect } from "./prospects";
import type { OpsTx } from "./store";
import type { SuppressionScope } from "./types";

export type Ledger = {
  version: 1;
  generatedAt: string;
  synthetic: boolean;
  erasures: { prospectId: string; erasedAt: string }[];
  suppressions: { id: string; emailKey: string; scope: SuppressionScope; basis: "unsubscribe" | "withdrawal" | "founder-hold" | "bounce" | "complaint"; effectiveAt: string; liftedAt: string | null }[];
};

export function buildLedger(tx: OpsTx): Ledger {
  return {
    version: 1,
    generatedAt: tx.nowIso,
    synthetic: tx.synthetic,
    erasures: tx.list("erasures").map((e) => ({ prospectId: e.prospectId, erasedAt: e.erasedAt })),
    suppressions: tx.list("suppressions").map((s) => ({ id: s.id, emailKey: s.emailKey, scope: s.scope, basis: s.basis, effectiveAt: s.effectiveAt, liftedAt: s.liftedAt })),
  };
}

export interface LedgerSink {
  readonly label: string;
  write(ledger: Ledger): Promise<void>;
  read(): Promise<Ledger | null>;
}

// Local file sink (local demo and restore drills). Write-then-rename.
export class FileLedgerSink implements LedgerSink {
  readonly label: string;
  constructor(private readonly file: string) {
    this.label = `file ${path.basename(file)}`;
  }
  async write(ledger: Ledger) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(ledger), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
  async read() {
    return fs.existsSync(this.file) ? (JSON.parse(fs.readFileSync(this.file, "utf8")) as Ledger) : null;
  }
}

export type ReplayResult = { erased: number; suppressionsRestored: number; liftsToConfirm: number };

// A lift reduces protection, so no recovery path re-applies one: the
// suppression stays in force and a founder is asked to confirm the lift
// again (Health → Recovery), only if the person asked. Shared by the
// protective-log reconciliation (recovery.ts) and ledger replay below.
export function requestLiftConfirmation(tx: OpsTx, suppressionId: string): boolean {
  return requestConfirmation(tx, `lift-confirm:${suppressionId}`, "After a recovery: an opt-out that had been lifted is back in force. Confirm the lift again only if the person asked");
}

// A founder task, opened once per key, for a decision recovery will not
// re-apply on its own (it would increase access).
export function requestConfirmation(tx: OpsTx, key: string, title: string): boolean {
  if (tx.list("tasks", (t) => t.dedupeKey === key).length) {
    return false;
  }
  tx.insert("tasks", {
    id: newId("tsk"),
    type: "permission-review",
    title,
    dueOn: tx.nowIso.slice(0, 10),
    ownerId: null,
    prospectId: null,
    status: "open",
    priority: "high",
    resolution: null,
    createdBy: "system",
    dedupeKey: key,
    createdAt: tx.nowIso,
    updatedAt: tx.nowIso,
    version: 1,
    synthetic: tx.synthetic,
  });
  return true;
}

// Re-applies a ledger to a (restored) store. Idempotent: replaying twice
// changes nothing the second time. Run by a founder after a restore. Since
// 0.2.1 this is the reconciliation checkpoint behind the protective log
// (recovery.ts), which is the primary mechanism.
export function replayLedger(tx: OpsTx, actor: Actor, ledger: Ledger): ReplayResult {
  if (ledger.version !== 1 || ledger.synthetic !== tx.synthetic) {
    throw new Error("ledger does not match this store");
  }
  const result: ReplayResult = { erased: 0, suppressionsRestored: 0, liftsToConfirm: 0 };
  for (const s of ledger.suppressions) {
    const existing = tx.get("suppressions", s.id);
    if (!existing) {
      tx.insert("suppressions", { ...s, createdBy: actor.id, createdAt: s.effectiveAt, updatedAt: tx.nowIso, version: 1, synthetic: tx.synthetic });
      result.suppressionsRestored++;
    } else if (s.liftedAt && !existing.liftedAt && requestLiftConfirmation(tx, s.id)) {
      result.liftsToConfirm++;
    }
    if (!s.liftedAt || !tx.require("suppressions", s.id).liftedAt) {
      // Holds drafts and cancels jobs for the address, exactly as when the
      // opt-out first happened (no new row: it already exists).
      applySuppression(tx, actor, s.emailKey, s.scope, s.basis);
    }
  }
  for (const e of ledger.erasures) {
    if (tx.get("prospects", e.prospectId)) {
      eraseProspect(tx, actor, e.prospectId, false);
      result.erased++;
    }
  }
  audit(tx, actor, "ledger-replayed", "settings", null, null);
  return result;
}
