// Manually-invoked script — NOT part of `npm test`, NOT run in CI. Closes
// docs/backend/evidence-matrix.md's "AWS checks still not run" item:
// "Migrating already-live legacy (versionId: null) media references."
//
// What "legacy" means here: every MediaRef buildSeedFixtures() (fixtures/
// seed.ts) produces directly — WITHOUT ever calling fixtures/media.ts's
// bindSeedMedia — is placeholder-shaped: versionId: null, a fixed
// checksumSha256 of "0".repeat(64) (never a real hash of anything), and a
// fixed objectKey ("fixtures/active-authorized/dummy.txt") that nothing has
// actually uploaded to. services/media.ts already fails these closed (409)
// rather than guess a version — this script does not change that; it only
// REPORTS on them and, in --apply mode, rebinds the ones it can trust.
//
// "Known source bytes" is a narrow, exact claim, not a loose heuristic: a
// MediaRef is treated as rebindable ONLY if it matches this project's OWN
// recognized placeholder signature byte-for-byte (objectKey, checksum,
// contentType, versionId:null — KNOWN_PLACEHOLDER_SIGNATURE below). For
// those, and ONLY those, the exact deterministic text bindSeedMedia WOULD
// have uploaded for that record is reconstructable from the record's own
// id (same template as fixtures/media.ts). This is NOT "recovering lost
// original bytes" — the placeholder was never backed by anything real in
// the first place — it is giving a known, synthetic, reconstructable
// placeholder its real analog. A MediaRef that does NOT match the exact
// signature has no trustworthy known origin and is reported as such,
// explicitly left unavailable — never guessed, never rebound.
//
// Default mode is DRY RUN: inventories every legacy reference across every
// record the register knows about and prints a classification report, with
// NO writes to DynamoDB or S3. Pass --apply to actually upload the
// reconstructed bytes and rebind ONLY the entries classified REBINDABLE;
// everything else is left exactly as it was, every time.
//
// Run with (dry run, the default):
// AWS_PROFILE=tiro-fixture-deploy AWS_REGION=us-east-1 \
//   TIRO_PRIMARY_TABLE=... TIRO_REGISTER_TABLE=... TIRO_MEDIA_BUCKET=... \
//   npx tsx backend/src/scripts/realLegacyMediaMigration.ts
//
// Add --apply to actually rebind the REBINDABLE entries:
//   npx tsx backend/src/scripts/realLegacyMediaMigration.ts --apply
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { DynamoFixtureStore, DynamoRestrictionRegisterStore } from "../store/dynamoStore";
import { S3MediaStore } from "../store/s3MediaStore";
import { uuidv7 } from "../domain/id";
import type { MediaRef } from "../domain/types";

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

// The EXACT shape every known-placeholder legacy reference from this
// project's own fixture generator has — see fixtures/seed.ts's
// activeAuthorizedFixture(). Matched field-for-field, not fuzzy: anything
// that differs in even one field (a different objectKey a real upload
// might have used, a real-looking checksum, a different declared size) is
// NOT recognized, on purpose — a near-miss is exactly the case where
// guessing would be most tempting and most wrong.
const KNOWN_PLACEHOLDER_SIGNATURE = {
  objectKey: "fixtures/active-authorized/dummy.txt",
  checksumSha256: "0".repeat(64),
  contentType: "text/plain",
  bytes: 128,
} as const;

// The exact deterministic content fixtures/media.ts's bindSeedMedia would
// have uploaded for this record's text MediaRef, had it been called
// instead of skipped. Reconstructed, not recovered — the placeholder was
// never backed by real bytes to begin with.
function reconstructedPlaceholderContent(recordId: string): Buffer {
  return Buffer.from(`[SYNTHETIC] dummy text content for record ${recordId}.\n`);
}

function isKnownPlaceholder(media: MediaRef): boolean {
  return (
    media.versionId === null &&
    media.objectKey === KNOWN_PLACEHOLDER_SIGNATURE.objectKey &&
    media.checksumSha256 === KNOWN_PLACEHOLDER_SIGNATURE.checksumSha256 &&
    media.contentType === KNOWN_PLACEHOLDER_SIGNATURE.contentType &&
    media.bytes === KNOWN_PLACEHOLDER_SIGNATURE.bytes
  );
}

// This stack's table is deliberately provisioned at the tiny, always-
// free-tier capacity (5 RCU/s — see fixture-backend-stack.ts's
// PrimaryTable). 215 records have accumulated in the live register
// across this engagement's drill history — a plain loop of 215
// sequential strongly-consistent getRecord() calls (DynamoFixtureStore
// uses ConsistentRead: true throughout, correctly, for reasons unrelated
// to this script) reliably throttles. Self-pacing to whatever the table
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

type InventoryEntry = {
  recordId: string;
  mediaId: string;
  objectKey: string;
  bytes: number;
  checksumSha256: string;
  contentType: string;
  classification: "rebindable" | "no-trustworthy-origin";
  reason: string;
};

async function main() {
  const dynamoClient = new DynamoDBClient({ region: REGION });
  const s3Client = new S3Client({ region: REGION });
  const fixtureStore = new DynamoFixtureStore({ client: dynamoClient, primaryTableName: PRIMARY_TABLE, statusIndexName: STATUS_INDEX });
  const registerStore = new DynamoRestrictionRegisterStore({ client: dynamoClient, tableName: REGISTER_TABLE });
  const mediaStore = new S3MediaStore({ client: s3Client, bucketName: MEDIA_BUCKET });

  log("MODE", APPLY ? "APPLY — rebindable entries WILL be uploaded and rewritten" : "DRY RUN — no writes to DynamoDB or S3 will be made (pass --apply to actually migrate)");

  // Enumerate every recordId the system knows about via the restriction
  // register's own listAll() — a full table scan, same "fixture-scale
  // only" precedent that method's own comment already documents. The
  // register has exactly one item per record (PK = recordId only), so
  // this is the cheapest complete inventory of every record id, without
  // needing a NEW scan method on the much larger primary table.
  const allEntries = await registerStore.listAll();
  log("INVENTORY", `Found ${allEntries.length} record(s) in the restriction register`);

  const inventory: InventoryEntry[] = [];
  for (let i = 0; i < allEntries.length; i++) {
    const entry = allEntries[i];
    const record = await withThrottleRetry(() => fixtureStore.getRecord(entry.recordId), `getRecord ${i + 1}/${allEntries.length}`);
    if (!record) {
      continue; // Register entry with no corresponding record — not this script's concern.
    }
    for (const media of record.mediaRefs) {
      if (media.versionId !== null) {
        continue; // Already bound to a real S3 version — not legacy.
      }
      if (isKnownPlaceholder(media)) {
        inventory.push({
          recordId: record.recordId,
          mediaId: media.mediaId,
          objectKey: media.objectKey,
          bytes: media.bytes,
          checksumSha256: media.checksumSha256,
          contentType: media.contentType,
          classification: "rebindable",
          reason: "Matches this project's known placeholder signature exactly — the deterministic synthetic content bindSeedMedia would have uploaded is reconstructable from the record id.",
        });
      } else {
        inventory.push({
          recordId: record.recordId,
          mediaId: media.mediaId,
          objectKey: media.objectKey,
          bytes: media.bytes,
          checksumSha256: media.checksumSha256,
          contentType: media.contentType,
          classification: "no-trustworthy-origin",
          reason: "versionId is null but the reference does not match the known placeholder signature — no trustworthy known origin for its bytes. Stays unavailable; never guessed.",
        });
      }
    }
  }

  // ------------------------------------------------------- the report ----
  console.log("\n==================== LEGACY MEDIA INVENTORY ====================");
  console.log(`Total legacy (versionId: null) references found: ${inventory.length}`);
  const rebindable = inventory.filter((i) => i.classification === "rebindable");
  const stuck = inventory.filter((i) => i.classification === "no-trustworthy-origin");
  console.log(`  Rebindable (known placeholder signature):     ${rebindable.length}`);
  console.log(`  No trustworthy origin (stays unavailable):    ${stuck.length}`);
  for (const item of inventory) {
    console.log(
      `\n[${item.classification.toUpperCase()}] record=${item.recordId} mediaId=${item.mediaId}\n  objectKey=${item.objectKey} bytes=${item.bytes} contentType=${item.contentType}\n  checksumSha256=${item.checksumSha256}\n  ${item.reason}`,
    );
  }

  if (!APPLY) {
    console.log("\nDry run complete — no writes were made. Re-run with --apply to rebind the REBINDABLE entries listed above.");
    return;
  }

  if (rebindable.length === 0) {
    console.log("\n--apply was passed, but there is nothing rebindable to do.");
    return;
  }

  // ------------------------------------------------------------ apply ----
  console.log(`\n==================== APPLYING: ${rebindable.length} rebind(s) ====================`);
  for (const item of rebindable) {
    const body = reconstructedPlaceholderContent(item.recordId);
    const key = `fixtures/legacy-migration/${item.recordId}/${item.mediaId}.txt`;
    const uploaded = await mediaStore.putObject(key, body, "text/plain");
    log("UPLOAD", `Uploaded reconstructed placeholder content for record ${item.recordId}`, {
      key,
      versionId: uploaded.versionId,
      bytes: uploaded.bytes,
      sha256: uploaded.sha256,
    });

    const fresh = await withThrottleRetry(() => fixtureStore.getRecord(item.recordId), `apply: re-read ${item.recordId}`);
    if (!fresh) {
      log("SKIP", `Record ${item.recordId} no longer exists — leaving the uploaded object in place, not rewriting anything.`);
      continue;
    }
    const updatedMediaRefs = fresh.mediaRefs.map((m) =>
      m.mediaId === item.mediaId
        ? { ...m, objectKey: key, bytes: uploaded.bytes, checksumSha256: uploaded.sha256, versionId: uploaded.versionId }
        : m,
    );
    await withThrottleRetry(
      () => fixtureStore.putRecord({ ...fresh, mediaRefs: updatedMediaRefs, updatedAt: new Date().toISOString() }, fresh.version),
      `apply: rewrite ${item.recordId}`,
    );
    // Mirrors bindSeedMedia's own side effect — without this, completeDeletion's
    // media-aware purge would never learn this object needs tracking.
    await fixtureStore.putCustodyCopy({
      recordId: item.recordId,
      copyId: uuidv7(),
      location: "primary",
      objectVersionId: uploaded.versionId,
      mediaId: item.mediaId,
      createdAt: new Date().toISOString(),
      reconciledAt: null,
    });
    log("REBOUND", `Record ${item.recordId}'s media ${item.mediaId} is now bound to a real S3 version`, { versionId: uploaded.versionId });
  }

  console.log(`\n${rebindable.length} reference(s) rebound. ${stuck.length} reference(s) left unavailable (no trustworthy origin).`);
}

main().catch((error) => {
  console.error("Legacy media migration script failed:", error);
  process.exitCode = 1;
});
