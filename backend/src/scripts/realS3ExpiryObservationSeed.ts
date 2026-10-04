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
// Run with (seed, the default):
// AWS_PROFILE=tiro-fixture-deploy AWS_REGION=us-east-1 \
//   TIRO_MEDIA_BUCKET=... npx tsx backend/src/scripts/realS3ExpiryObservationSeed.ts
//
// Then, on or after the printed expiry date:
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

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
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
    const expectedExpiry = new Date(noncurrentSince.getTime() + 30 * 24 * 60 * 60 * 1000);
    console.log("\n==================== S3 EXPIRY OBSERVATION SEEDED ====================");
    console.log(`Key: ${OBSERVATION_KEY}`);
    console.log(`v1 (now noncurrent) versionId: ${v1.versionId}`);
    console.log(`v2 (current) versionId: ${v2.versionId}`);
    console.log(`Noncurrent since (UTC): ${noncurrentSince.toISOString()}`);
    console.log(`Rule: noncurrentVersionExpiration after 30 days.`);
    console.log(`Expected to have expired by (UTC): ${expectedExpiry.toISOString()}`);
    console.log(`\nRecord this in docs/backend/evidence-matrix.md as PENDING until that date. Re-run with --check on or after it.`);
    return;
  }

  const versions = await mediaStore.listObjectVersions(OBSERVATION_KEY);
  console.log("\n==================== S3 EXPIRY OBSERVATION CHECK ====================");
  console.log(`Key: ${OBSERVATION_KEY}`);
  console.log(`Current real version count at this key: ${versions.length}`);
  for (const v of versions) {
    console.log(`  versionId=${v.versionId} isLatest=${v.isLatest} isDeleteMarker=${v.isDeleteMarker} lastModified=${v.lastModified}`);
  }
  if (versions.length <= 1) {
    console.log("\nOnly the current version remains (or none) — the noncurrent v1 has actually expired. Record the OBSERVED result and date in docs/backend/evidence-matrix.md — this is no longer pending.");
  } else {
    console.log("\nMore than one version still present — either it's too early (check the seed run's printed expiry date) or the rule hasn't fired yet. Do NOT record this as a passed observation; re-check later.");
  }
}

main().catch((error) => {
  console.error("S3 expiry observation script failed:", error);
  process.exitCode = 1;
});
