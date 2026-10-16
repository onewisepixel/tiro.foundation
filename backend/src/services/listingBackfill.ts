// Backfill engine for listing items (publicListingItem.ts) on records
// written before the store began maintaining them. Storage-agnostic: the
// DynamoDB implementation of BackfillDeps lives in
// scripts/backfillPublicListingItems.ts; tests drive it with in-memory deps.
//
// Safety model:
// - Dry run unless `apply` is set: reads only, and reports what it WOULD do.
// - Every write is conditional, so it can never move a listing item
//   backwards or overwrite one it didn't plan against: a create requires the
//   item to be absent, and a replace requires its recordVersion to equal the
//   exact stale version that was planned against. Each write also asserts,
//   in the same transaction, that the register entry exists and is not
//   deletion-pending/deleted, so it can't leave an orphan listing for a
//   record being deleted.
// - It must run AFTER listing maintenance is deployed. Then any record
//   write racing the backfill has already written its own (newer) listing
//   item, and the backfill's conditional write fails instead of overwriting
//   it. It does not condition-check the record's own version: in a
//   transaction that consumes write capacity by item size (~800 WCU for a
//   near-400 KB record).
// - A listing item that exists but is invalid, or has the same version with
//   different content, is reported for review and never touched.
// - Paced from each operation's reported ConsumedCapacity, separately for
//   reads and writes, and resumable from the last completed register key.
import type { FixtureRecord, RestrictionRegisterEntry } from "../domain/types";
import { deriveListingItem, parseListingItem, type PublicListingItem } from "./publicListingItem";
import { isDeepStrictEqual } from "node:util";

export type BackfillPlan =
  | { action: "create"; item: PublicListingItem }
  | { action: "replace-stale"; item: PublicListingItem; existingVersion: number }
  | { action: "up-to-date" }
  | { action: "skip-no-record" }
  | { action: "skip-deleting"; custody: string }
  | { action: "skip-newer"; existingVersion: number; recordVersion: number }
  | { action: "needs-review"; reason: string };

export function planListingBackfill(
  record: FixtureRecord | null,
  existingRaw: unknown | null,
  custody: RestrictionRegisterEntry["currentCustodyStatus"] | null,
): BackfillPlan {
  if (custody === "deletion-pending" || custody === "deleted") {
    return { action: "skip-deleting", custody };
  }
  if (!record) {
    return { action: "skip-no-record" };
  }
  const derived = deriveListingItem(record, record.version);
  if (existingRaw === null) {
    return { action: "create", item: derived };
  }
  const existing = parseListingItem(existingRaw, record.recordId);
  if (!existing) {
    return { action: "needs-review", reason: "an existing listing item is invalid; not overwriting it automatically" };
  }
  if (existing.recordVersion > record.version) {
    return { action: "skip-newer", existingVersion: existing.recordVersion, recordVersion: record.version };
  }
  if (existing.recordVersion < record.version) {
    return { action: "replace-stale", item: derived, existingVersion: existing.recordVersion };
  }
  return isDeepStrictEqual(existing, derived)
    ? { action: "up-to-date" }
    : { action: "needs-review", reason: "same recordVersion but different content (derivation changed?); not overwriting automatically" };
}

export type BackfillDeps = {
  // Register scan in its natural order; `cursor` is the last recordId
  // completed (the same resume key semantics as DynamoDB's ExclusiveStartKey).
  listRegisterPage(cursor: string | null, limit: number): Promise<{
    entries: { recordId: string; currentCustodyStatus: RestrictionRegisterEntry["currentCustodyStatus"] }[];
    nextCursor: string | null;
    consumedRcu: number;
  }>;
  // Strongly consistent reads.
  readRecord(recordId: string): Promise<{ record: FixtureRecord | null; consumedRcu: number }>;
  readListing(recordId: string): Promise<{ raw: unknown | null; consumedRcu: number }>;
  // Conditional write as described in the module comment.
  writeListing(input: { item: PublicListingItem; expectedExistingVersion: number | null }): Promise<{
    outcome: "written" | "condition-failed";
    consumedWcu: number;
    detail?: string;
  }>;
  sleep(ms: number): Promise<void>;
};

export type BackfillOptions = {
  apply: boolean;
  resumeAfter: string | null;
  maxRecords: number | null;
  readRcuPerSecond: number;
  writeWcuPerSecond: number;
  pageSize: number;
  onRecord(entry: BackfillLogEntry): void | Promise<void>;
};

export type BackfillLogEntry = {
  recordId: string;
  plan: BackfillPlan["action"];
  detail?: string;
  recordVersion?: number;
  write?: "written" | "condition-failed" | "dry-run";
  consumedRcu: number;
  consumedWcu: number;
};

export type BackfillSummary = {
  processed: number;
  counts: Record<string, number>;
  written: number;
  conditionFailed: number;
  totalRcu: number;
  totalWcu: number;
  lastCompletedRecordId: string | null;
  finished: boolean;
};

export async function runListingBackfill(deps: BackfillDeps, options: BackfillOptions): Promise<BackfillSummary> {
  const summary: BackfillSummary = {
    processed: 0,
    counts: {},
    written: 0,
    conditionFailed: 0,
    totalRcu: 0,
    totalWcu: 0,
    lastCompletedRecordId: options.resumeAfter,
    finished: false,
  };
  const payRead = async (rcu: number) => {
    summary.totalRcu += rcu;
    if (rcu > 0) await deps.sleep((rcu / options.readRcuPerSecond) * 1000);
  };
  const payWrite = async (wcu: number) => {
    summary.totalWcu += wcu;
    if (wcu > 0) await deps.sleep((wcu / options.writeWcuPerSecond) * 1000);
  };

  let cursor = options.resumeAfter;
  for (;;) {
    const page = await deps.listRegisterPage(cursor, options.pageSize);
    await payRead(page.consumedRcu);
    for (const entry of page.entries) {
      if (options.maxRecords !== null && summary.processed >= options.maxRecords) {
        return summary;
      }
      const { record, consumedRcu: recordRcu } = await deps.readRecord(entry.recordId);
      await payRead(recordRcu);
      const { raw, consumedRcu: listingRcu } = await deps.readListing(entry.recordId);
      await payRead(listingRcu);
      const plan = planListingBackfill(record, raw, entry.currentCustodyStatus);

      const log: BackfillLogEntry = {
        recordId: entry.recordId,
        plan: plan.action,
        recordVersion: record?.version,
        consumedRcu: recordRcu + listingRcu,
        consumedWcu: 0,
      };
      if (plan.action === "needs-review") log.detail = plan.reason;
      if (plan.action === "skip-deleting") log.detail = plan.custody;
      if (plan.action === "skip-newer") log.detail = `listing v${plan.existingVersion} > record v${plan.recordVersion}`;

      if (plan.action === "create" || plan.action === "replace-stale") {
        if (!options.apply) {
          log.write = "dry-run";
        } else {
          const result = await deps.writeListing({
            item: plan.item,
            expectedExistingVersion: plan.action === "replace-stale" ? plan.existingVersion : null,
          });
          log.write = result.outcome;
          log.consumedWcu = result.consumedWcu;
          if (result.detail) log.detail = result.detail;
          if (result.outcome === "written") summary.written++;
          else summary.conditionFailed++;
          await payWrite(result.consumedWcu);
        }
      }

      summary.counts[plan.action] = (summary.counts[plan.action] ?? 0) + 1;
      summary.processed++;
      summary.lastCompletedRecordId = entry.recordId;
      await options.onRecord(log);
    }
    if (page.nextCursor === null) {
      summary.finished = true;
      return summary;
    }
    cursor = page.nextCursor;
  }
}
