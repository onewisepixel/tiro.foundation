import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryFixtureStore, InMemoryRestrictionRegisterStore } from "../store/memoryStore";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import { evaluatePermission } from "./permissions";

async function setup() {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active, expired, disputed, preservationOnly] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [active, expired, disputed, preservationOnly]);
  return { fixtureStore, registerStore, active, expired, disputed, preservationOnly };
}

test("active publication consent is allowed", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: active.record.recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  assert.equal(decision.allowed, true);
});

test("preservation-only permission denies publication purpose", async () => {
  const { fixtureStore, registerStore, preservationOnly } = await setup();
  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: preservationOnly.record.recordId,
    purpose: "publication",
    audience: "staff",
    now: new Date(),
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /No active consent grant/);
});

test("preservation-only permission allows preservation purpose for staff", async () => {
  const { fixtureStore, registerStore, preservationOnly } = await setup();
  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: preservationOnly.record.recordId,
    purpose: "preservation",
    audience: "staff",
    now: new Date(),
  });
  assert.equal(decision.allowed, true);
});

test("wrong purpose denies even with an active grant for a different purpose", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: active.record.recordId,
    purpose: "model-training",
    audience: "public",
    now: new Date(),
  });
  assert.equal(decision.allowed, false);
});

test("wrong audience denies even with an active grant for a different audience", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: active.record.recordId,
    purpose: "publication",
    audience: "research-partner",
    now: new Date(),
  });
  assert.equal(decision.allowed, false);
});

test("expired consent denies", async () => {
  const { fixtureStore, registerStore, expired } = await setup();
  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: expired.record.recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /No active consent grant/);
});

test("disputed authority denies regardless of consent", async () => {
  const { fixtureStore, registerStore, disputed } = await setup();
  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: disputed.record.recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /disputed/);
});

test("wrong signer capacity (unverified) denies even with matching purpose/audience", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active] = buildSeedFixtures();
  const unverified = {
    ...active,
    consentGrants: active.consentGrants.map((g) => ({ ...g, signerCapacityVerified: false })),
  };
  await seedStore(fixtureStore, registerStore, [unverified]);

  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: unverified.record.recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /signer capacity is not verified/);
});

test("missing control state denies, not defaults to allowed", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active] = buildSeedFixtures();
  // Seed the fixture store directly, skip the register — simulates a
  // record that exists but has no control entry yet.
  await fixtureStore.putRecord(active.record, undefined);
  for (const grant of active.consentGrants) {
    await fixtureStore.putConsentGrant(grant, undefined);
  }
  for (const claim of active.authorityClaims) {
    await fixtureStore.putAuthorityClaim(claim);
  }

  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: active.record.recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /missing control state denies/);
});

test("disputed legal right denies, mirroring disputed authority (Finding 4)", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active] = buildSeedFixtures();
  const withDisputedRight = {
    ...active,
    legalRights: [
      {
        recordId: active.record.recordId,
        rightId: "right-disputed-1",
        status: "disputed" as const,
        holder: "[SYNTHETIC] Invented Rightsholder",
        rightType: "publication",
        jurisdiction: null,
        evidenceRef: "fixture://invented-legal-evidence-001",
        createdAt: new Date().toISOString(),
      },
    ],
  };
  await seedStore(fixtureStore, registerStore, [withDisputedRight]);

  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: active.record.recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /Legal right .* is "disputed"/);
});

test("a staff role alone does not substitute for a scoped grant", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  // "active" has no "staff"-audience grant at all, only "public".
  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: active.record.recordId,
    purpose: "publication",
    audience: "staff",
    now: new Date(),
  });
  assert.equal(decision.allowed, false);
});
