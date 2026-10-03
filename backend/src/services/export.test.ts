// Regression coverage for Finding 3: export previously only checked
// currentPublicationStatus directly (public-redacted) or nothing at all
// (complete-preservation), so a record that evaluatePermission would deny
// (disputed authority, expired consent) could still be exported. Both scopes
// must now run the real scoped permission check per record.
import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryFixtureStore, InMemoryRestrictionRegisterStore } from "../store/memoryStore";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import { exportFixtureSet } from "./export";

test("public-redacted export omits a record whose authority is disputed, even though publicationStatus alone looks published", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [, , disputed] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [disputed]);

  const result = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [disputed.record.recordId],
    "public-redacted",
    "export-test-disputed",
    "public",
  );

  assert.equal(result.records.length, 0);
});

test("public-redacted export omits a record whose consent has expired", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [, expired] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [expired]);

  const result = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [expired.record.recordId],
    "public-redacted",
    "export-test-expired",
    "public",
  );

  assert.equal(result.records.length, 0);
});

test("complete-preservation export also honors the authorization gate, not just public-redacted", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [, , disputed] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [disputed]);

  const result = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [disputed.record.recordId],
    "complete-preservation",
    "export-test-complete",
    "public",
  );

  assert.equal(result.records.length, 0);
});

test("an authorized record is still included — the gate denies correctly, it doesn't deny everything", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [active]);

  const result = await exportFixtureSet(
    fixtureStore,
    registerStore,
    [active.record.recordId],
    "public-redacted",
    "export-test-active",
    "public",
  );

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].consentGrants, "redacted-for-public-export");
});
