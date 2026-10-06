// Core logic for the S3 noncurrent-version expiry observation — extracted
// from backend/src/scripts/realS3ExpiryObservationSeed.ts so it can be
// exercised against the in-memory MediaStore fake, not only against real
// AWS. A reviewer twice caught real false-pass bugs in an earlier,
// inline-only version of this logic — see checkExpiryObservation's
// comment for the exact mechanism of both.
import type { MediaStore } from "../store/mediaStore";

export type SeedRecord = {
  key: string;
  v1VersionId: string;
  v2VersionId: string;
  noncurrentSinceUtc: string;
  earliestEligibleUtc: string;
};

// S3's daily lifecycle sweep runs once around UTC midnight and only acts
// on whole elapsed calendar days — an object is eligible starting the
// FIRST midnight sweep on or after the exact `noncurrentSince + days`
// instant, never before. Reviewer-caught finding: a naive
// `noncurrentSince + days` understates this by treating the rule as if it
// fired at an exact instant mid-day, which no real sweep runs at. If that
// instant already falls exactly on a UTC midnight, that IS the eligibility
// instant; otherwise the next midnight after it is.
export function earliestEligibilityUtc(noncurrentSince: Date, days: number): Date {
  const raw = new Date(noncurrentSince.getTime() + days * 24 * 60 * 60 * 1000);
  const midnightOfRawDay = new Date(Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()));
  return raw.getTime() === midnightOfRawDay.getTime() ? midnightOfRawDay : new Date(midnightOfRawDay.getTime() + 24 * 60 * 60 * 1000);
}

export async function seedExpiryObservation(
  mediaStore: MediaStore,
  observationKey: string,
  seedRecordKey: string,
  days: number,
  now: Date,
): Promise<SeedRecord> {
  // v1: becomes noncurrent the instant v2 lands — its expiration countdown
  // starts at THAT moment, not at v1's own creation time.
  const v1 = await mediaStore.putObject(observationKey, Buffer.from("[SYNTHETIC] v1 — becomes noncurrent immediately below.\n"), "text/plain");
  const v2 = await mediaStore.putObject(observationKey, Buffer.from("[SYNTHETIC] v2 — the current version; v1 is now noncurrent.\n"), "text/plain");
  const seedRecord: SeedRecord = {
    key: observationKey,
    v1VersionId: v1.versionId,
    v2VersionId: v2.versionId,
    noncurrentSinceUtc: now.toISOString(),
    earliestEligibleUtc: earliestEligibilityUtc(now, days).toISOString(),
  };
  await mediaStore.putObject(seedRecordKey, Buffer.from(JSON.stringify(seedRecord, null, 2)), "application/json");
  return seedRecord;
}

export type CheckOutcome =
  | { kind: "no-seed-record" }
  | { kind: "seed-record-unreadable" }
  | { kind: "anomaly-missing-positive-control"; seedRecord: SeedRecord }
  | { kind: "anomaly-early-disappearance"; seedRecord: SeedRecord }
  | { kind: "too-early"; seedRecord: SeedRecord }
  | { kind: "eligible-not-yet-removed"; seedRecord: SeedRecord }
  | { kind: "expired-observed"; seedRecord: SeedRecord };

// Reads the persisted seed record back as ground truth and checks the
// OBSERVATION key's real current versions against it. Two reviewer-caught
// false-pass bugs, both closed by this function's exact structure:
//
// 1. A bare version-count check ("expired if <=1 versions remain") passes
//    for a totally EMPTY listing (proves nothing was ever seeded, not
//    that anything expired) and for the INVERTED case where only the
//    original v1 remains and the current v2 vanished. Fixed by checking
//    for the EXACT persisted v1/v2 ids, and requiring v2 (a positive
//    control — the current version, which this rule must never touch) to
//    be confirmed present before v1's absence means anything at all.
// 2. Even with that fix, a date guard that only runs in the "v1 present"
//    branch misses the case where v1 is ALREADY absent before real
//    eligibility is reached — that is never evidence of the lifecycle
//    rule firing on schedule; it is an anomaly. The date check below
//    applies to BOTH outcomes (v1 present or absent), not just one.
export async function checkExpiryObservation(
  mediaStore: MediaStore,
  seedRecordKey: string,
  now: Date,
): Promise<CheckOutcome> {
  const seedVersions = await mediaStore.listObjectVersions(seedRecordKey);
  const latestSeedVersion = seedVersions.find((v) => v.isLatest && !v.isDeleteMarker);
  if (!latestSeedVersion) {
    return { kind: "no-seed-record" };
  }
  const seedRecordObject = await mediaStore.getObject(seedRecordKey, latestSeedVersion.versionId);
  if (!seedRecordObject) {
    return { kind: "seed-record-unreadable" };
  }
  const seedRecord = JSON.parse(seedRecordObject.body.toString("utf8")) as SeedRecord;

  const liveVersions = await mediaStore.listObjectVersions(seedRecord.key);
  const v1Present = liveVersions.some((v) => v.versionId === seedRecord.v1VersionId);
  const v2Present = liveVersions.some((v) => v.versionId === seedRecord.v2VersionId && v.isLatest);

  if (!v2Present) {
    return { kind: "anomaly-missing-positive-control", seedRecord };
  }

  const eligible = now >= new Date(seedRecord.earliestEligibleUtc);

  if (v1Present) {
    return { kind: eligible ? "eligible-not-yet-removed" : "too-early", seedRecord };
  }

  if (!eligible) {
    return { kind: "anomaly-early-disappearance", seedRecord };
  }

  return { kind: "expired-observed", seedRecord };
}
