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
// Reviewer-caught findings, both fixed here:
//
// 1. Eligibility date. S3's lifecycle engine evaluates "days since
//    noncurrent" in whole calendar days and runs its sweep once daily
//    around UTC midnight — it does NOT fire at the exact instant
//    `noncurrentSince + N days` falls. An object that became noncurrent
//    partway through a day is only PICKED UP by the sweep that runs at
//    the next UTC midnight on/after that exact instant. Naively printing
//    `noncurrentSince + 30 days` understated this by rounding down to an
//    instant mid-day that no sweep actually runs at. Also: reaching
//    eligibility is not a guarantee of IMMEDIATE physical removal — AWS
//    does not promise the sweep purges an eligible version the moment it
//    becomes eligible, only that it becomes eligible for removal at that
//    point. This script now computes and labels that distinction
//    explicitly instead of printing a single "expired by" deadline.
//
// 2. False passes in --check. The previous version reported "expired"
//    for ANY listing of 1 or fewer versions — including a totally EMPTY
//    listing (which proves nothing was ever seeded, or the key/bucket is
//    wrong, not that anything expired) and including the case where only
//    the ORIGINAL noncurrent v1 remains and the current v2 is the one
//    that's gone (an inversion/anomaly, not a pass). Fixed by persisting
//    the EXACT seeded version ids to a dedicated metadata object in S3 at
//    seed time, and having --check verify against those exact ids: v2 (a
//    surviving positive control — the CURRENT version, which this
//    lifecycle rule must never touch) is confirmed present, and ONLY THEN
//    is v1's absence treated as a real, observed expiration. No seed
//    record found, or the positive control missing, are reported as their
//    own distinct, clearly-labeled outcomes — never conflated with a pass.
//
// Run with (seed, the default):
// AWS_PROFILE=tiro-fixture-deploy AWS_REGION=us-east-1 \
//   TIRO_MEDIA_BUCKET=... npx tsx backend/src/scripts/realS3ExpiryObservationSeed.ts
//
// Then, on or after the printed eligibility date:
//   npx tsx backend/src/scripts/realS3ExpiryObservationSeed.ts --check
import { S3Client } from "@aws-sdk/client-s3";
import { S3MediaStore } from "../store/s3MediaStore";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const MEDIA_BUCKET = requireEnv("TIRO_MEDIA_BUCKET");
const CHECK = process.argv.includes("--check");
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

type SeedRecord = {
  key: string;
  v1VersionId: string;
  v2VersionId: string;
  noncurrentSinceUtc: string;
  earliestEligibleUtc: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

// S3's daily lifecycle sweep runs once around UTC midnight and only acts
// on whole elapsed calendar days — an object is eligible starting the
// FIRST midnight sweep on or after the exact `noncurrentSince + days`
// instant, never before. If that instant already falls exactly on a UTC
// midnight, that IS the eligibility instant; otherwise the next midnight
// after it is.
function earliestEligibilityUtc(noncurrentSince: Date, days: number): Date {
  const raw = new Date(noncurrentSince.getTime() + days * 24 * 60 * 60 * 1000);
  const midnightOfRawDay = new Date(Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()));
  return raw.getTime() === midnightOfRawDay.getTime() ? midnightOfRawDay : new Date(midnightOfRawDay.getTime() + 24 * 60 * 60 * 1000);
}

async function main() {
  const s3Client = new S3Client({ region: REGION });
  const mediaStore = new S3MediaStore({ client: s3Client, bucketName: MEDIA_BUCKET });

  if (!CHECK) {
    // v1: becomes noncurrent the instant v2 lands — its 30-day expiration
    // countdown starts at THAT moment, not at v1's own creation time.
    const v1 = await mediaStore.putObject(OBSERVATION_KEY, Buffer.from("[SYNTHETIC] v1 — becomes noncurrent immediately below.\n"), "text/plain");
    const v2 = await mediaStore.putObject(OBSERVATION_KEY, Buffer.from("[SYNTHETIC] v2 — the current version; v1 is now noncurrent.\n"), "text/plain");
    const noncurrentSince = new Date();
    const earliestEligible = earliestEligibilityUtc(noncurrentSince, 30);

    const seedRecord: SeedRecord = {
      key: OBSERVATION_KEY,
      v1VersionId: v1.versionId,
      v2VersionId: v2.versionId,
      noncurrentSinceUtc: noncurrentSince.toISOString(),
      earliestEligibleUtc: earliestEligible.toISOString(),
    };
    await mediaStore.putObject(SEED_RECORD_KEY, Buffer.from(JSON.stringify(seedRecord, null, 2)), "application/json");

    console.log("\n==================== S3 EXPIRY OBSERVATION SEEDED ====================");
    console.log(`Key: ${OBSERVATION_KEY}`);
    console.log(`v1 (now noncurrent, expected to eventually expire) versionId: ${v1.versionId}`);
    console.log(`v2 (current — the positive control; must NEVER expire) versionId: ${v2.versionId}`);
    console.log(`Noncurrent since (UTC): ${noncurrentSince.toISOString()}`);
    console.log(`Rule: noncurrentVersionExpiration after 30 days.`);
    console.log(`Earliest eligible for expiration (UTC): ${earliestEligible.toISOString()}`);
    console.log(`(AWS's daily lifecycle sweep runs once around UTC midnight on whole elapsed days — this is the first sweep that can pick v1 up, not an exact-instant deadline.)`);
    console.log(`Note: reaching this instant means v1 is ELIGIBLE, not that it is guaranteed removed yet — AWS does not promise immediate physical deletion at eligibility. Re-check with --check until it actually reports expired.`);
    console.log(`Seed record persisted to: ${SEED_RECORD_KEY} (read back by --check — never re-derived from a bare version count).`);
    console.log(`\nRecord this in docs/backend/evidence-matrix.md as PENDING until actually observed. Re-run with --check on or after the eligibility date above.`);
    return;
  }

  console.log("\n==================== S3 EXPIRY OBSERVATION CHECK ====================");
  const seedVersions = await mediaStore.listObjectVersions(SEED_RECORD_KEY);
  const latestSeedVersion = seedVersions.find((v) => v.isLatest && !v.isDeleteMarker);
  if (!latestSeedVersion) {
    console.log(`No seed record found at ${SEED_RECORD_KEY} — this observation was never seeded (or the bucket/key is wrong). This is NOT evidence of expiration. Run this script without --check first.`);
    return;
  }
  const seedRecordObject = await mediaStore.getObject(SEED_RECORD_KEY, latestSeedVersion.versionId);
  if (!seedRecordObject) {
    console.log(`Seed record at ${SEED_RECORD_KEY} could not be read even though a version is listed — treat this as an anomaly needing direct investigation, not a result either way.`);
    return;
  }
  const seedRecord = JSON.parse(seedRecordObject.body.toString("utf8")) as SeedRecord;

  const liveVersions = await mediaStore.listObjectVersions(seedRecord.key);
  console.log(`Key: ${seedRecord.key}`);
  console.log(`Seeded noncurrent since (UTC): ${seedRecord.noncurrentSinceUtc}`);
  console.log(`Earliest eligible for expiration (UTC): ${seedRecord.earliestEligibleUtc}`);
  console.log(`Current real version count at this key: ${liveVersions.length}`);
  for (const v of liveVersions) {
    console.log(`  versionId=${v.versionId} isLatest=${v.isLatest} isDeleteMarker=${v.isDeleteMarker} lastModified=${v.lastModified}`);
  }

  const v1Present = liveVersions.some((v) => v.versionId === seedRecord.v1VersionId);
  const v2Present = liveVersions.some((v) => v.versionId === seedRecord.v2VersionId && v.isLatest);

  if (!v2Present) {
    // The positive control itself is missing or no longer current — the
    // CURRENT version must never be touched by a noncurrent-version
    // expiration rule. This is an anomaly (wrong key/bucket, a version
    // removed through some other path, or something else is wrong), and
    // must NEVER be read as evidence that v1 expired — regardless of
    // whether v1 also happens to be absent.
    console.log(`\nANOMALY: the positive control (v2, the current version) is missing or no longer latest. This must never happen from this lifecycle rule alone. Do NOT record this as a passed observation — investigate directly before concluding anything about v1.`);
    return;
  }

  if (v1Present) {
    const now = new Date();
    const eligible = now >= new Date(seedRecord.earliestEligibleUtc);
    if (eligible) {
      console.log(`\nNot yet expired, though eligibility has been reached: v1 is still present and v2 (positive control) survives intact. This is normal — AWS does not guarantee immediate physical removal at eligibility. Re-check again later; do not record this as a failure.`);
    } else {
      console.log(`\nToo early, as expected: v1 is still present and v2 (positive control) survives intact. Eligibility is not reached until ${seedRecord.earliestEligibleUtc}. Do NOT record this as a passed observation; re-check on or after that date.`);
    }
    return;
  }

  console.log(`\nEXPIRED, OBSERVED FOR REAL: v1 (versionId ${seedRecord.v1VersionId}) is gone, and v2 (versionId ${seedRecord.v2VersionId}, the positive control) survives intact as the current version. Record this OBSERVED result and the current timestamp in docs/backend/evidence-matrix.md — this is no longer pending.`);
}

main().catch((error) => {
  console.error("S3 expiry observation script failed:", error);
  process.exitCode = 1;
});
