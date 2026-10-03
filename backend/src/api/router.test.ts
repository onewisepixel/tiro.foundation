import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryFixtureStore, InMemoryRestrictionRegisterStore } from "../store/memoryStore";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import { VersionConflictError, type RestrictionRegisterStore } from "../store/store";
import type { RestrictionRegisterEntry } from "../domain/types";
import { routeRequest, type ApiRequest } from "./router";

const STAFF_IDENTITY = "staff:test@example.invalid";

async function setup() {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [active, expired, disputed, preservationOnly] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [active, expired, disputed, preservationOnly]);
  return { fixtureStore, registerStore, active, expired, disputed, preservationOnly };
}

function req(partial: Partial<ApiRequest> & Pick<ApiRequest, "method" | "pathSegments">): ApiRequest {
  return { queryParams: {}, body: undefined, ...partial };
}

test("GET /records/:id returns the full detail bundle for an existing record", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", active.record.recordId],
  }));
  assert.equal(response.statusCode, 200);
  const body = response.body as { record: { recordId: string }; control: { currentPublicationStatus: string } };
  assert.equal(body.record.recordId, active.record.recordId);
  assert.equal(body.control.currentPublicationStatus, "published");
});

test("GET /records/:id returns 404 for an unknown record", async () => {
  const { fixtureStore, registerStore } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", "does-not-exist"],
  }));
  assert.equal(response.statusCode, 404);
});

test("GET /lifecycle-requests requires a valid status query param", async () => {
  const { fixtureStore, registerStore } = await setup();
  const missing = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["lifecycle-requests"],
  }));
  assert.equal(missing.statusCode, 400);

  const invalid = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["lifecycle-requests"],
    queryParams: { status: "not-a-real-status" },
  }));
  assert.equal(invalid.statusCode, 400);
});

test("POST /records/:id/withdraw performs the action and attributes it to the authenticated caller, not the request body", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "withdraw"],
    body: { reason: "[SYNTHETIC] api test", requesterCapacity: "someone-else-entirely" },
  }));
  assert.equal(response.statusCode, 200);
  const body = response.body as { requesterCapacity: string; status: string };
  assert.equal(body.status, "completed");
  assert.equal(
    body.requesterCapacity,
    STAFF_IDENTITY,
    "requesterCapacity must come from the authenticated caller, never the client-supplied body field",
  );

  const current = await registerStore.getCurrent(active.record.recordId);
  assert.equal(current?.currentPublicationStatus, "withdrawn");
});

test("POST /records/:id/restrict requires a non-empty purposes array", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const missing = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "restrict"],
    body: { reason: "[SYNTHETIC] test" },
  }));
  assert.equal(missing.statusCode, 400);

  const invalidPurpose = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "restrict"],
    body: { reason: "[SYNTHETIC] test", purposes: ["not-a-real-purpose"] },
  }));
  assert.equal(invalidPurpose.statusCode, 400);

  const ok = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "restrict"],
    body: { reason: "[SYNTHETIC] test", purposes: ["model-training"] },
  }));
  assert.equal(ok.statusCode, 200);
});

test("POST /records/:id/revoke-consent requires a consentId, then revokes it", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const consentId = active.consentGrants[0].consentId;

  const missing = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "revoke-consent"],
    body: { reason: "[SYNTHETIC] test" },
  }));
  assert.equal(missing.statusCode, 400);

  const ok = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "revoke-consent"],
    body: { reason: "[SYNTHETIC] test", consentId },
  }));
  assert.equal(ok.statusCode, 200);

  const decision = await (await import("../services/permissions")).evaluatePermission(fixtureStore, registerStore, {
    recordId: active.record.recordId,
    purpose: "publication",
    audience: "public",
    now: new Date(),
  });
  assert.equal(decision.allowed, false);
});

test("POST /records/:id/complete-deletion reports outstanding custody copies, then succeeds once reconciled", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "start-deletion"],
    body: { reason: "[SYNTHETIC] test" },
  }));
  await fixtureStore.putCustodyCopy({
    recordId: active.record.recordId,
    copyId: "outstanding",
    location: "backup",
    objectVersionId: null,
    createdAt: new Date().toISOString(),
    reconciledAt: null,
  });

  const blocked = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "complete-deletion"],
  }));
  assert.equal((blocked.body as { deleted: boolean }).deleted, false);

  await fixtureStore.putCustodyCopy({
    recordId: active.record.recordId,
    copyId: "outstanding",
    location: "backup",
    objectVersionId: null,
    createdAt: new Date().toISOString(),
    reconciledAt: new Date().toISOString(),
  });

  const done = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "complete-deletion"],
  }));
  assert.equal((done.body as { deleted: boolean }).deleted, true);
  assert.equal(await fixtureStore.getRecord(active.record.recordId), null);
});

test("POST /records/:id/permission-check evaluates without mutating anything", async () => {
  const { fixtureStore, registerStore, disputed } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", disputed.record.recordId, "permission-check"],
    body: { purpose: "publication", audience: "public" },
  }));
  assert.equal(response.statusCode, 200);
  assert.equal((response.body as { allowed: boolean }).allowed, false);
});

test("POST /records/:id/permission-check rejects an invalid purpose/audience", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "permission-check"],
    body: { purpose: "not-a-purpose", audience: "public" },
  }));
  assert.equal(response.statusCode, 400);
});

test("POST /export runs the real scoped export and excludes denied records", async () => {
  const { fixtureStore, registerStore, active, expired } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["export"],
    body: {
      recordIds: [active.record.recordId, expired.record.recordId],
      scope: "public-redacted",
      fixtureSetId: "api-test-export",
      destinationAudience: "public",
    },
  }));
  assert.equal(response.statusCode, 200);
  const body = response.body as { records: Array<{ record: { recordId: string } }> };
  assert.equal(body.records.length, 1);
  assert.equal(body.records[0].record.recordId, active.record.recordId);
});

test("POST /export rejects a missing/invalid scope", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["export"],
    body: { recordIds: [active.record.recordId], fixtureSetId: "x", destinationAudience: "public" },
  }));
  assert.equal(response.statusCode, 400);
});

// A register store that always rejects the write with VersionConflictError —
// isolates the router's error-translation path (VersionConflictError -> 409)
// from the actual race-condition mechanics, which lifecycle.test.ts already
// covers with a real concurrent-write test against the in-memory fake.
class AlwaysConflictingRegisterStore implements RestrictionRegisterStore {
  constructor(private readonly inner: RestrictionRegisterStore) {}
  getCurrent(recordId: string): Promise<RestrictionRegisterEntry | null> {
    return this.inner.getCurrent(recordId);
  }
  async setCurrent(): Promise<void> {
    throw new VersionConflictError("RestrictionRegisterEntry", "forced-for-test");
  }
  listAll(): Promise<RestrictionRegisterEntry[]> {
    return this.inner.listAll();
  }
}

test("a version conflict from the service layer surfaces as 409, not a 500 or a silent success", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const conflicting = new AlwaysConflictingRegisterStore(registerStore);
  const response = await routeRequest(fixtureStore, conflicting, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "withdraw"],
    body: { reason: "[SYNTHETIC] test" },
  }));
  assert.equal(response.statusCode, 409);
});

test("an unknown route returns 404, not a crash", async () => {
  const { fixtureStore, registerStore } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["not", "a", "real", "route"],
  }));
  assert.equal(response.statusCode, 404);
});

test("an unknown action under /records/:id returns 404", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "not-a-real-action"],
  }));
  assert.equal(response.statusCode, 404);
});
