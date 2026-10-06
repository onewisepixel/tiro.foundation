// Manually-invoked script — NOT part of `npm test`, NOT run in CI. Closes
// docs/backend/evidence-matrix.md's "AWS checks still not run" item:
// "Migrating already-live legacy (versionId: null) media references."
//
// The actual classification/apply logic lives in
// backend/src/services/legacyMediaMigration.ts, where it is unit-tested
// against the in-memory fakes — this file is a thin CLI wrapper that wires
// up real AWS clients, paces every DynamoDB call against this stack's
// deliberately tiny, throttled table, and prints the report.
//
// A reviewer running that service module's logic against local fakes
// reproduced FOUR real bugs across two review rounds, all fixed: (1) it
// would rebind media for a record already in the deletion workflow just
// because the media happened to match the known placeholder signature —
// fixed by checking custody eligibility, freshly, before any upload,
// separately from the signature match; (2) migration could still race
// deletion EVEN with that fresh check — startDeletion()+completeDeletion()
// can run to full completion entirely in the gap between the check and the
// write, since uploading to S3 takes real wall-clock time — fixed by
// store.ts's CustodyCopyCommitter, which asserts custody status as PART OF
// the same atomic cross-table transaction as the record+copy write, not a
// separate earlier read; (3) the cleanup-on-failure path could destroy a
// binding that actually committed (a timeout can report failure even after
// the server applied the write) — fixed by re-checking the record fresh
// before ever deleting the uploaded object, the same idempotent-recovery
// idiom used throughout services/lifecycle.ts. See
// legacyMediaMigration.ts's header comment and its test file for the full
// detail and the regression tests proving each is closed.
//
// "Known source bytes" is a narrow, exact claim, not a loose heuristic: a
// MediaRef is treated as rebindable ONLY if it matches this project's OWN
// recognized placeholder signature byte-for-byte AND the record is not in
// the deletion workflow. A MediaRef that does NOT match the exact
// signature has no trustworthy known origin and is reported as such,
// explicitly left unavailable — never guessed, never rebound. Recognizing
// a placeholder is necessary but not sufficient for eligibility.
//
// Default mode is DRY RUN: inventories every legacy reference across every
// record the register knows about and prints a classification report, with
// NO writes to DynamoDB or S3. Pass --apply to actually upload the
// reconstructed bytes and rebind ONLY the entries still eligible at apply
// time; everything else is left exactly as it was, every time.
//
// Run with (dry run, the default):
// AWS_PROFILE=tiro-fixture-deploy AWS_REGION=us-east-1 \
//   TIRO_PRIMARY_TABLE=... TIRO_REGISTER_TABLE=... TIRO_MEDIA_BUCKET=... \
//   npx tsx backend/src/scripts/realLegacyMediaMigration.ts
//
// Add --apply to actually rebind entries still eligible at apply time:
//   npx tsx backend/src/scripts/realLegacyMediaMigration.ts --apply
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { DynamoCustodyCopyCommitter, DynamoFixtureStore, DynamoRestrictionRegisterStore } from "../store/dynamoStore";
import { S3MediaStore } from "../store/s3MediaStore";
import { applyLegacyMediaRebind, inventoryLegacyMedia, type LegacyMediaInventoryEntry } from "../services/legacyMediaMigration";
import type { CustodyCopyCommitter, FixtureStore, RestrictionRegisterStore } from "../store/store";
import type {
  AuditReceipt,
  AuthorityClaim,
  ConsentGrant,
  Correction,
  CustodyCopy,
  FixtureRecord,
  LegalRight,
  LifecycleRequest,
  LifecycleRequestStatus,
  Redaction,
  RestrictionRegisterEntry,
} from "../domain/types";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const PRIMARY_TABLE = requireEnv("TIRO_PRIMARY_TABLE");
const REGISTER_TABLE = requireEnv("TIRO_REGISTER_TABLE");
const MEDIA_BUCKET = requireEnv("TIRO_MEDIA_BUCKET");
const STATUS_INDEX = process.env.TIRO_STATUS_INDEX ?? "GSI1-status-index";
const APPLY = process.argv.includes("--apply");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

function log(step: string, message: string, data?: unknown): void {
  console.log(`\n[${step}] ${message}`, data !== undefined ? JSON.stringify(data, null, 2) : "");
}

// This stack's table is deliberately provisioned at the tiny, always-
// free-tier capacity (5 RCU/s — see fixture-backend-stack.ts's
// PrimaryTable). Hundreds of records have accumulated in the live register
// across this engagement's drill history — a plain loop of sequential
// strongly-consistent getRecord() calls (DynamoFixtureStore uses
// ConsistentRead: true throughout, correctly, for reasons unrelated to
// this script) reliably throttles. Self-pacing to whatever the table
// actually grants, rather than guessing a fixed delay, keeps this correct
// without needing to touch the table's deliberately small provisioning.
async function withThrottleRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isThrottling = error instanceof Error && error.name === "ProvisionedThroughputExceededException";
      if (!isThrottling || attempt > 30) throw error;
      const delayMs = Math.min(1000 * attempt, 8000);
      console.log(`[THROTTLE BACKOFF] ${label}: the table's small provisioned capacity was exceeded; waiting ${delayMs}ms before retry ${attempt}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

// Delegates every FixtureStore method to the real adapter unchanged,
// except getRecord — throttle-paced here so the shared service module
// (services/legacyMediaMigration.ts) stays AWS-pacing-agnostic and
// testable against instant in-memory fakes; only this live-AWS wrapper
// needs to know about backoff at all. Same delegate-wrapper shape as the
// failure-injection test doubles in services/lifecycle.test.ts. The
// record+copy write itself no longer goes through this class at all — see
// ThrottledCustodyCopyCommitter below, which throttle-paces the atomic
// cross-table commit instead.
//
// Deliberately NOT done by wrapping the whole applyLegacyMediaRebind()
// call in withThrottleRetry: a throttling error from the FINAL write (the
// atomic record+copy transaction) happens AFTER the S3 upload already
// created real bytes — retrying the whole function from scratch would
// upload a SECOND object and orphan the first, reintroducing a milder
// version of the exact untracked-media bug this round fixed. Retrying
// only the specific DynamoDB call that throttled avoids that.
class ThrottledFixtureStore implements FixtureStore {
  private callIndex = 0;
  constructor(private readonly inner: FixtureStore, private readonly totalExpected: number) {}
  getRecord(recordId: string) {
    this.callIndex += 1;
    return withThrottleRetry(() => this.inner.getRecord(recordId), `getRecord ${this.callIndex}/${this.totalExpected}`);
  }
  putRecordWithCustodyCopy(record: FixtureRecord, expectedVersion: number | undefined, copy: CustodyCopy) {
    return this.inner.putRecordWithCustodyCopy(record, expectedVersion, copy);
  }
  putRecord(record: FixtureRecord, expectedVersion: number | undefined) {
    return this.inner.putRecord(record, expectedVersion);
  }
  deleteRecord(recordId: string, expectedVersion: number) {
    return this.inner.deleteRecord(recordId, expectedVersion);
  }
  listAuthorityClaims(recordId: string) {
    return this.inner.listAuthorityClaims(recordId);
  }
  putAuthorityClaim(claim: AuthorityClaim) {
    return this.inner.putAuthorityClaim(claim);
  }
  listLegalRights(recordId: string) {
    return this.inner.listLegalRights(recordId);
  }
  putLegalRight(right: LegalRight) {
    return this.inner.putLegalRight(right);
  }
  listConsentGrants(recordId: string) {
    return this.inner.listConsentGrants(recordId);
  }
  putConsentGrant(grant: ConsentGrant, expectedVersion: number | undefined) {
    return this.inner.putConsentGrant(grant, expectedVersion);
  }
  listCustodyCopies(recordId: string) {
    return this.inner.listCustodyCopies(recordId);
  }
  putCustodyCopy(copy: CustodyCopy) {
    return this.inner.putCustodyCopy(copy);
  }
  createLifecycleRequest(request: LifecycleRequest) {
    return this.inner.createLifecycleRequest(request);
  }
  getLifecycleRequest(requestId: string) {
    return this.inner.getLifecycleRequest(requestId);
  }
  updateLifecycleRequest(request: LifecycleRequest) {
    return this.inner.updateLifecycleRequest(request);
  }
  listLifecycleRequestsByStatus(status: LifecycleRequestStatus) {
    return this.inner.listLifecycleRequestsByStatus(status);
  }
  putAuditReceipt(receipt: AuditReceipt) {
    return this.inner.putAuditReceipt(receipt);
  }
  listAuditReceipts(recordId: string) {
    return this.inner.listAuditReceipts(recordId);
  }
  putCorrection(correction: Correction) {
    return this.inner.putCorrection(correction);
  }
  listCorrections(recordId: string) {
    return this.inner.listCorrections(recordId);
  }
  getCorrection(recordId: string, correctionId: string) {
    return this.inner.getCorrection(recordId, correctionId);
  }
  putRedaction(redaction: Redaction) {
    return this.inner.putRedaction(redaction);
  }
  listRedactions(recordId: string) {
    return this.inner.listRedactions(recordId);
  }
  getRedaction(recordId: string, redactionId: string) {
    return this.inner.getRedaction(recordId, redactionId);
  }
  putRecordWithCorrection(record: FixtureRecord, expectedVersion: number | undefined, correction: Correction) {
    return this.inner.putRecordWithCorrection(record, expectedVersion, correction);
  }
  putRecordWithRedaction(record: FixtureRecord, expectedVersion: number | undefined, redaction: Redaction) {
    return this.inner.putRecordWithRedaction(record, expectedVersion, redaction);
  }
}

// Same throttle-pacing rationale as ThrottledFixtureStore above, for the
// one register call applyLegacyMediaRebind() makes per item (the fresh
// eligibility re-check) — getCurrent is a strongly consistent GetItem and
// can throttle exactly like every other read against this table.
class ThrottledRegisterStore implements RestrictionRegisterStore {
  constructor(private readonly inner: RestrictionRegisterStore) {}
  getCurrent(recordId: string) {
    return withThrottleRetry(() => this.inner.getCurrent(recordId), `registerStore.getCurrent ${recordId}`);
  }
  setCurrent(entry: RestrictionRegisterEntry, expectedVersion: number | undefined) {
    return this.inner.setCurrent(entry, expectedVersion);
  }
  listAll() {
    return this.inner.listAll();
  }
}

// Same throttle-pacing rationale again, for the atomic cross-table commit
// itself (store.ts's CustodyCopyCommitter). Retrying the WHOLE commit on a
// throttling error is safe here — unlike retrying the whole
// applyLegacyMediaRebind() call, this happens strictly AFTER the S3
// upload already completed, so a retry re-attempts only the DynamoDB
// transaction, never a second upload.
class ThrottledCustodyCopyCommitter implements CustodyCopyCommitter {
  constructor(private readonly inner: CustodyCopyCommitter) {}
  commitIfNotDeleting(record: FixtureRecord, expectedVersion: number | undefined, copy: CustodyCopy) {
    return withThrottleRetry(
      () => this.inner.commitIfNotDeleting(record, expectedVersion, copy),
      `custodyCopyCommitter.commitIfNotDeleting ${record.recordId}`,
    );
  }
}

async function main() {
  const dynamoClient = new DynamoDBClient({ region: REGION });
  const s3Client = new S3Client({ region: REGION });
  const fixtureStore = new DynamoFixtureStore({ client: dynamoClient, primaryTableName: PRIMARY_TABLE, statusIndexName: STATUS_INDEX });
  const registerStore = new DynamoRestrictionRegisterStore({ client: dynamoClient, tableName: REGISTER_TABLE });
  const mediaStore = new S3MediaStore({ client: s3Client, bucketName: MEDIA_BUCKET });
  const custodyCopyCommitter = new DynamoCustodyCopyCommitter({
    client: dynamoClient,
    primaryTableName: PRIMARY_TABLE,
    registerTableName: REGISTER_TABLE,
  });

  log("MODE", APPLY ? "APPLY — eligible entries WILL be uploaded and rewritten" : "DRY RUN — no writes to DynamoDB or S3 will be made (pass --apply to actually migrate)");

  // Enumerate every recordId the system knows about via the restriction
  // register's own listAll() — a full table scan, same "fixture-scale
  // only" precedent that method's own comment already documents. The
  // register has exactly one item per record (PK = recordId only), so
  // this is the cheapest complete inventory of every record id, without
  // needing a NEW scan method on the much larger primary table. Each
  // entry's own currentCustodyStatus is read right here, at no extra cost.
  const allEntries = await registerStore.listAll();
  log("INVENTORY", `Found ${allEntries.length} record(s) in the restriction register`);

  const throttledFixtureStore = new ThrottledFixtureStore(fixtureStore, allEntries.length);
  const inventory = await inventoryLegacyMedia(throttledFixtureStore, allEntries);

  // ------------------------------------------------------- the report ----
  console.log("\n==================== LEGACY MEDIA INVENTORY ====================");
  console.log(`Total legacy (versionId: null) references found: ${inventory.length}`);
  const rebindable = inventory.filter((i) => i.classification === "rebindable");
  const ineligible = inventory.filter((i) => i.classification === "ineligible-deletion-in-progress");
  const stuck = inventory.filter((i) => i.classification === "no-trustworthy-origin");
  console.log(`  Rebindable (known placeholder signature, not in the deletion workflow): ${rebindable.length}`);
  console.log(`  Ineligible (deletion in progress or complete):                          ${ineligible.length}`);
  console.log(`  No trustworthy origin (stays unavailable):                              ${stuck.length}`);
  for (const item of inventory) {
    console.log(
      `\n[${item.classification.toUpperCase()}] record=${item.recordId} mediaId=${item.mediaId}\n  objectKey=${item.objectKey} bytes=${item.bytes} contentType=${item.contentType}\n  checksumSha256=${item.checksumSha256}\n  ${item.reason}`,
    );
  }

  if (!APPLY) {
    console.log("\nDry run complete — no writes were made. Re-run with --apply to rebind entries still eligible at apply time.");
    return;
  }

  if (rebindable.length === 0) {
    console.log("\n--apply was passed, but there is nothing rebindable to do.");
    return;
  }

  // ------------------------------------------------------------ apply ----
  console.log(`\n==================== APPLYING: up to ${rebindable.length} rebind(s) ====================`);
  const throttledRegisterStore = new ThrottledRegisterStore(registerStore);
  const throttledCommitter = new ThrottledCustodyCopyCommitter(custodyCopyCommitter);
  const outcomes: Awaited<ReturnType<typeof applyLegacyMediaRebind>>[] = [];
  for (const item of rebindable) {
    // Throttle pacing happens INSIDE each individual DynamoDB call now
    // (ThrottledFixtureStore/ThrottledRegisterStore/
    // ThrottledCustodyCopyCommitter above), not around this whole call —
    // see those classes' comments for why wrapping the whole function
    // here would be wrong once an upload has already happened.
    const outcome = await applyLegacyMediaRebind(item, throttledFixtureStore, throttledRegisterStore, mediaStore, throttledCommitter);
    outcomes.push(outcome);
    if (outcome.outcome === "rebound") {
      log("REBOUND", `Record ${outcome.recordId}'s media ${outcome.mediaId} is now bound to a real S3 version`, { objectKey: outcome.objectKey, versionId: outcome.versionId });
    } else if (outcome.outcome === "skipped-ineligible") {
      log("SKIPPED", `Record ${outcome.recordId}'s media ${outcome.mediaId} was not applied`, { reason: outcome.reason, cleanedUp: outcome.cleanedUp });
    } else {
      log("FAILED", `Record ${outcome.recordId}'s media ${outcome.mediaId} failed to rebind`, { reason: outcome.reason, cleanedUp: outcome.cleanedUp });
    }
  }

  const rebound = outcomes.filter((o) => o.outcome === "rebound").length;
  const skipped = outcomes.filter((o) => o.outcome === "skipped-ineligible").length;
  const failed = outcomes.filter((o) => o.outcome === "failed").length;
  console.log(`\n${rebound} reference(s) rebound. ${skipped} skipped (became ineligible since the inventory snapshot). ${failed} failed. ${stuck.length} left unavailable (no trustworthy origin).`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Legacy media migration script failed:", error);
  process.exitCode = 1;
});

export type { LegacyMediaInventoryEntry };
