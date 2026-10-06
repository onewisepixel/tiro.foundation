import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryMediaStore } from "../store/mediaStore";
import { checkExpiryObservation, earliestEligibilityUtc, seedExpiryObservation } from "./s3ExpiryObservation";

const OBSERVATION_KEY = "fixtures/ttl-s3-expiry-observation/noncurrent-version-watch.txt";
const SEED_RECORD_KEY = "fixtures/ttl-s3-expiry-observation/seed-record.json";

test("earliestEligibilityUtc rounds up to the next UTC midnight when the raw instant falls mid-day", () => {
  const noncurrentSince = new Date("2026-10-04T22:44:18.761Z");
  const result = earliestEligibilityUtc(noncurrentSince, 30);
  assert.equal(result.toISOString(), "2026-11-04T00:00:00.000Z");
});

test("earliestEligibilityUtc leaves an exact-midnight instant unchanged", () => {
  const noncurrentSince = new Date("2026-10-04T00:00:00.000Z");
  const result = earliestEligibilityUtc(noncurrentSince, 30);
  assert.equal(result.toISOString(), "2026-11-03T00:00:00.000Z");
});

test("checkExpiryObservation reports no-seed-record when nothing was ever seeded", async () => {
  const mediaStore = new InMemoryMediaStore();
  const result = await checkExpiryObservation(mediaStore, SEED_RECORD_KEY, new Date());
  assert.equal(result.kind, "no-seed-record");
});

test("checkExpiryObservation reports too-early when both versions are present and eligibility hasn't been reached", async () => {
  const mediaStore = new InMemoryMediaStore();
  const noncurrentSince = new Date("2026-10-04T22:44:18.761Z");
  await seedExpiryObservation(mediaStore, OBSERVATION_KEY, SEED_RECORD_KEY, 30, noncurrentSince);
  const result = await checkExpiryObservation(mediaStore, SEED_RECORD_KEY, new Date("2026-10-06T00:00:00.000Z"));
  assert.equal(result.kind, "too-early");
});

test("checkExpiryObservation reports eligible-not-yet-removed when both versions are present after eligibility", async () => {
  const mediaStore = new InMemoryMediaStore();
  const noncurrentSince = new Date("2026-10-04T22:44:18.761Z");
  await seedExpiryObservation(mediaStore, OBSERVATION_KEY, SEED_RECORD_KEY, 30, noncurrentSince);
  const result = await checkExpiryObservation(mediaStore, SEED_RECORD_KEY, new Date("2026-11-04T00:00:00.000Z"));
  assert.equal(result.kind, "eligible-not-yet-removed");
});

test("checkExpiryObservation reports expired-observed only once v1 is gone AND eligibility has genuinely been reached", async () => {
  const mediaStore = new InMemoryMediaStore();
  const noncurrentSince = new Date("2026-10-04T22:44:18.761Z");
  const seedRecord = await seedExpiryObservation(mediaStore, OBSERVATION_KEY, SEED_RECORD_KEY, 30, noncurrentSince);
  await mediaStore.deleteObjectVersion(OBSERVATION_KEY, seedRecord.v1VersionId);
  const result = await checkExpiryObservation(mediaStore, SEED_RECORD_KEY, new Date("2026-11-04T00:00:00.000Z"));
  assert.equal(result.kind, "expired-observed");
});

test(
  "checkExpiryObservation reports an ANOMALY, never a pass, when v1 is absent before real eligibility is reached (reviewer-caught finding: the date guard only ran in the v1-present branch)",
  async () => {
    const mediaStore = new InMemoryMediaStore();
    const noncurrentSince = new Date("2026-10-04T22:44:18.761Z");
    const seedRecord = await seedExpiryObservation(mediaStore, OBSERVATION_KEY, SEED_RECORD_KEY, 30, noncurrentSince);
    // v1 disappears for some OTHER reason, well before the real
    // eligibility date (2026-11-04) — exactly the reviewer's repro: "with
    // the persisted seed, v2 present and v1 absent on October 5."
    await mediaStore.deleteObjectVersion(OBSERVATION_KEY, seedRecord.v1VersionId);
    const result = await checkExpiryObservation(mediaStore, SEED_RECORD_KEY, new Date("2026-10-05T00:00:00.000Z"));
    assert.equal(result.kind, "anomaly-early-disappearance");
  },
);

test("checkExpiryObservation reports an anomaly, never a pass, when the positive control (v2) is missing even if v1 is also absent", async () => {
  const mediaStore = new InMemoryMediaStore();
  const noncurrentSince = new Date("2026-10-04T22:44:18.761Z");
  const seedRecord = await seedExpiryObservation(mediaStore, OBSERVATION_KEY, SEED_RECORD_KEY, 30, noncurrentSince);
  await mediaStore.deleteObjectVersion(OBSERVATION_KEY, seedRecord.v1VersionId);
  await mediaStore.deleteObjectVersion(OBSERVATION_KEY, seedRecord.v2VersionId);
  const result = await checkExpiryObservation(mediaStore, SEED_RECORD_KEY, new Date("2026-11-04T00:00:00.000Z"));
  assert.equal(result.kind, "anomaly-missing-positive-control");
});
