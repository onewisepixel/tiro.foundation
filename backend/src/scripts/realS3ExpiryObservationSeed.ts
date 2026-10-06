// Manually-invoked script — NOT part of `npm test`, NOT run in CI. Seeds a
// dedicated, isolated S3 noncurrent-version to OBSERVE the bucket's real
// `noncurrentVersionExpiration: Duration.days(30)` lifecycle rule
// (infra/lib/fixture-backend-stack.ts) actually firing — the one
// time-dependent item docs/backend/evidence-matrix.md has always left
// "not yet exercised" because every deletion drill so far has purged
// media explicitly (completeDeletion's own purge step), never left a
// version to expire on its own schedule.
//
// This is a TWO-STEP, dated observation, not something one script run can
// complete: this script does step 1 (seed) and prints exactly when step 2
// (check) becomes meaningful. Running --check before that date is
// harmless — it will truthfully report "still too early" rather than a
// fabricated result. See docs/backend/evidence-matrix.md's "S3
// noncurrent-version expiration observation" section for the actual
// dated record of this.
//
// The actual eligibility-date math and --check decision logic live in
// backend/src/services/s3ExpiryObservation.ts, where they are unit-tested
// against the in-memory MediaStore fake — this file is a thin CLI wrapper.
// A reviewer caught THREE real false-pass/miscalculation bugs across two
// rounds in an earlier, inline-only version of this logic; see that
// module's header comment and test file for the full detail and the
// regression tests proving each is closed.
//
// Run with (seed, the default):
// AWS_PROFILE=tiro-fixture-deploy AWS_REGION=us-east-1 \
//   TIRO_MEDIA_BUCKET=... npx tsx backend/src/scripts/realS3ExpiryObservationSeed.ts
//
// Then, on or after the printed eligibility date:
//   npx tsx backend/src/scripts/realS3ExpiryObservationSeed.ts --check
import { S3Client } from "@aws-sdk/client-s3";
import { S3MediaStore } from "../store/s3MediaStore";
import { checkExpiryObservation, seedExpiryObservation } from "../services/s3ExpiryObservation";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const MEDIA_BUCKET = requireEnv("TIRO_MEDIA_BUCKET");
const CHECK = process.argv.includes("--check");
const DAYS = 30;
// Fixed, dedicated key — never touched by any other drill — so nothing
// else's cleanup or re-seeding can accidentally reset this observation's
// clock.
const OBSERVATION_KEY = "fixtures/ttl-s3-expiry-observation/noncurrent-version-watch.txt";
// A SEPARATE key holding the ground truth of exactly which version ids
// were seeded, as JSON — persisted in S3 (not a local file) so --check
// can be run later, from a different machine or session, and still
// verify against the exact ids this seed run actually produced, rather
// than re-deriving anything from a bare version count.
const SEED_RECORD_KEY = "fixtures/ttl-s3-expiry-observation/seed-record.json";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

async function main() {
  const s3Client = new S3Client({ region: REGION });
  const mediaStore = new S3MediaStore({ client: s3Client, bucketName: MEDIA_BUCKET });

  if (!CHECK) {
    const seedRecord = await seedExpiryObservation(mediaStore, OBSERVATION_KEY, SEED_RECORD_KEY, DAYS, new Date());
    console.log("\n==================== S3 EXPIRY OBSERVATION SEEDED ====================");
    console.log(`Key: ${seedRecord.key}`);
    console.log(`v1 (now noncurrent, expected to eventually expire) versionId: ${seedRecord.v1VersionId}`);
    console.log(`v2 (current — the positive control; must NEVER expire) versionId: ${seedRecord.v2VersionId}`);
    console.log(`Noncurrent since (UTC): ${seedRecord.noncurrentSinceUtc}`);
    console.log(`Rule: noncurrentVersionExpiration after ${DAYS} days.`);
    console.log(`Earliest eligible for expiration (UTC): ${seedRecord.earliestEligibleUtc}`);
    console.log(`(AWS's daily lifecycle sweep runs once around UTC midnight on whole elapsed days — this is the first sweep that can pick v1 up, not an exact-instant deadline.)`);
    console.log(`Note: reaching this instant means v1 is ELIGIBLE, not that it is guaranteed removed yet — AWS does not promise immediate physical deletion at eligibility. Re-check with --check until it actually reports expired.`);
    console.log(`Seed record persisted to: ${SEED_RECORD_KEY} (read back by --check — never re-derived from a bare version count).`);
    console.log(`\nRecord this in docs/backend/evidence-matrix.md as PENDING until actually observed. Re-run with --check on or after the eligibility date above.`);
    return;
  }

  console.log("\n==================== S3 EXPIRY OBSERVATION CHECK ====================");
  const result = await checkExpiryObservation(mediaStore, SEED_RECORD_KEY, new Date());

  switch (result.kind) {
    case "no-seed-record":
      console.log(`No seed record found at ${SEED_RECORD_KEY} — this observation was never seeded (or the bucket/key is wrong). This is NOT evidence of expiration. Run this script without --check first.`);
      return;
    case "seed-record-unreadable":
      console.log(`Seed record at ${SEED_RECORD_KEY} could not be read even though a version is listed — treat this as an anomaly needing direct investigation, not a result either way.`);
      return;
    case "anomaly-missing-positive-control":
      console.log(`Key: ${result.seedRecord.key}`);
      console.log(`\nANOMALY: the positive control (v2, the current version) is missing or no longer latest. This must never happen from this lifecycle rule alone. Do NOT record this as a passed observation — investigate directly before concluding anything about v1.`);
      return;
    case "anomaly-early-disappearance":
      console.log(`Key: ${result.seedRecord.key}`);
      console.log(`\nANOMALY: v1 is absent, but eligibility is not reached until ${result.seedRecord.earliestEligibleUtc} — today is ${new Date().toISOString()}. v1 disappearing before that date is NOT evidence of the lifecycle rule firing on schedule; something else removed it, or this ground truth is wrong. Do NOT record this as an observed expiration — investigate directly.`);
      return;
    case "too-early":
      console.log(`Key: ${result.seedRecord.key}`);
      console.log(`\nToo early, as expected: v1 is still present and v2 (positive control) survives intact. Eligibility is not reached until ${result.seedRecord.earliestEligibleUtc}. Do NOT record this as a passed observation; re-check on or after that date.`);
      return;
    case "eligible-not-yet-removed":
      console.log(`Key: ${result.seedRecord.key}`);
      console.log(`\nNot yet expired, though eligibility has been reached: v1 is still present and v2 (positive control) survives intact. This is normal — AWS does not guarantee immediate physical removal at eligibility. Re-check again later; do not record this as a failure.`);
      return;
    case "expired-observed":
      console.log(`Key: ${result.seedRecord.key}`);
      console.log(`\nEXPIRED, OBSERVED FOR REAL: v1 (versionId ${result.seedRecord.v1VersionId}) is gone, eligibility was reached (${result.seedRecord.earliestEligibleUtc}), and v2 (versionId ${result.seedRecord.v2VersionId}, the positive control) survives intact as the current version. Record this OBSERVED result and the current timestamp in docs/backend/evidence-matrix.md — this is no longer pending.`);
      return;
  }
}

main().catch((error) => {
  console.error("S3 expiry observation script failed:", error);
  process.exitCode = 1;
});
