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

test("GET /records/:id requires valid purpose and audience query params", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const missing = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", active.record.recordId],
  }));
  assert.equal(missing.statusCode, 400);

  const invalid = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", active.record.recordId],
    queryParams: { purpose: "not-a-purpose", audience: "public" },
  }));
  assert.equal(invalid.statusCode, 400);
});

test("GET /records/:id returns the FULL detail bundle (content + evidence) when evaluatePermission allows it", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", active.record.recordId],
    queryParams: { purpose: "publication", audience: "public" },
  }));
  assert.equal(response.statusCode, 200);
  const body = response.body as {
    access: { allowed: boolean };
    record: { recordId: string; title: string };
    control: { currentPublicationStatus: string };
    consentGrants: unknown[];
  };
  assert.equal(body.access.allowed, true);
  assert.equal(body.record.recordId, active.record.recordId);
  assert.ok(body.record.title, "allowed access must include full record content, e.g. title");
  assert.equal(body.control.currentPublicationStatus, "published");
  assert.ok(Array.isArray(body.consentGrants) && body.consentGrants.length > 0, "allowed access must include full consent evidence");
});

test(
  "GET /records/:id returns a LIMITED metadata view — no content, no evidence contents — when evaluatePermission denies it (Finding 1)",
  async () => {
    const { fixtureStore, registerStore, expired, disputed } = await setup();
    for (const fixture of [expired, disputed]) {
      const response = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
        method: "GET",
        pathSegments: ["records", fixture.record.recordId],
        queryParams: { purpose: "publication", audience: "public" },
      }));
      assert.equal(response.statusCode, 200);
      const body = response.body as {
        access: { allowed: boolean };
        record: Record<string, unknown>;
        consentGrantCount: number;
        authorityClaimCount: number;
        consentGrants?: unknown;
        authorityClaims?: unknown;
      };
      assert.equal(body.access.allowed, false);
      assert.equal(body.record.title, undefined, "denied access must never include record content like title");
      assert.equal(body.record.summary, undefined);
      assert.equal(body.record.mediaRefs, undefined);
      assert.equal(body.consentGrants, undefined, "denied access must never include raw consent evidence");
      assert.equal(body.authorityClaims, undefined, "denied access must never include raw authority evidence");
      assert.equal(typeof body.consentGrantCount, "number", "a count, not the evidence itself, is the limited view's substitute");
      assert.equal(typeof body.authorityClaimCount, "number");
    }
  },
);

test("GET /records/:id's limited view still carries enough register/lifecycle state for an operator to act", async () => {
  const { fixtureStore, registerStore, disputed } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", disputed.record.recordId],
    queryParams: { purpose: "publication", audience: "public" },
  }));
  const body = response.body as { record: { recordId: string; custodyStatus: string }; control: { currentPublicationStatus: string } };
  assert.equal(body.record.recordId, disputed.record.recordId);
  assert.equal(body.record.custodyStatus, "preserved");
  assert.equal(body.control.currentPublicationStatus, "published");
});

test("GET /records/:id returns 404 for an unknown record", async () => {
  const { fixtureStore, registerStore } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", "does-not-exist"],
    queryParams: { purpose: "publication", audience: "public" },
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

test("POST /records/:id/complete-deletion requires deletionRequestId, then reports outstanding custody copies, then succeeds once reconciled", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const startResponse = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "start-deletion"],
    body: { reason: "[SYNTHETIC] test" },
  }));
  const deletionRequestId = (startResponse.body as { requestId: string }).requestId;

  const missingLink = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "complete-deletion"],
    body: { reason: "[SYNTHETIC] test" },
  }));
  assert.equal(missingLink.statusCode, 400, "deletionRequestId must be required, not optional");

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
    body: { reason: "[SYNTHETIC] test", deletionRequestId },
  }));
  assert.equal((blocked.body as { status: string }).status, "in-progress");

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
    body: { reason: "[SYNTHETIC] test", deletionRequestId, requestId: "req-complete-explicit" },
  }));
  assert.equal((done.body as { status: string }).status, "completed");
  assert.equal(await fixtureStore.getRecord(active.record.recordId), null);
});

test(
  "POST /records/:id/complete-deletion refuses a record that never went through startDeletion (Finding 3)",
  async () => {
    const { fixtureStore, registerStore, active } = await setup();
    // active is "published"/"preserved" — never had start-deletion called.
    const response = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
      method: "POST",
      pathSegments: ["records", active.record.recordId, "complete-deletion"],
      body: { reason: "[SYNTHETIC] attack test", deletionRequestId: "does-not-exist" },
    }));
    assert.equal((response.body as { status: string }).status, "denied");
    const record = await fixtureStore.getRecord(active.record.recordId);
    assert.ok(record, "the record must still exist — completion must never delete without a real prior deletion request");
    const current = await registerStore.getCurrent(active.record.recordId);
    assert.equal(current?.currentCustodyStatus, "preserved", "custody status must be untouched");
  },
);

test(
  "POST /records/:id/complete-deletion refuses a deletionRequestId that belongs to a DIFFERENT record",
  async () => {
    const { fixtureStore, registerStore, active, expired } = await setup();
    const startOnExpired = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
      method: "POST",
      pathSegments: ["records", expired.record.recordId, "start-deletion"],
      body: { reason: "[SYNTHETIC] test" },
    }));
    const expiredDeletionRequestId = (startOnExpired.body as { requestId: string }).requestId;

    const response = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
      method: "POST",
      // Attempting to complete ACTIVE's deletion using EXPIRED's deletion request id.
      pathSegments: ["records", active.record.recordId, "complete-deletion"],
      body: { reason: "[SYNTHETIC] cross-record test", deletionRequestId: expiredDeletionRequestId },
    }));
    assert.equal((response.body as { status: string }).status, "denied");
    assert.ok(await fixtureStore.getRecord(active.record.recordId), "active must be untouched by a deletion request that belongs to a different record");
  },
);

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

test(
  "reusing a requestId for a DIFFERENT record returns 409 and leaves the second record untouched (Finding 2)",
  async () => {
    const { fixtureStore, registerStore, active, expired } = await setup();
    const reusedId = "req-reused-across-records";

    const first = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
      method: "POST",
      pathSegments: ["records", active.record.recordId, "withdraw"],
      body: { reason: "[SYNTHETIC] first operation", requestId: reusedId },
    }));
    assert.equal(first.statusCode, 200);
    assert.equal((first.body as { status: string }).status, "completed");

    const second = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
      method: "POST",
      pathSegments: ["records", expired.record.recordId, "withdraw"],
      body: { reason: "[SYNTHETIC] second operation, different record, same id", requestId: reusedId },
    }));
    assert.equal(second.statusCode, 409, "a requestId reused for a different record must conflict, not silently return the first record's result");

    const expiredControl = await registerStore.getCurrent(expired.record.recordId);
    assert.notEqual(
      expiredControl?.currentPublicationStatus,
      "withdrawn",
      "the second record must NOT have been withdrawn — the reused id must not silently no-op onto the wrong record",
    );
  },
);

test(
  "reusing a requestId for the SAME record and action but a DIFFERENT payload (different purposes) returns 409",
  async () => {
    const { fixtureStore, registerStore, active } = await setup();
    const reusedId = "req-reused-same-record-different-payload";

    const first = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
      method: "POST",
      pathSegments: ["records", active.record.recordId, "restrict"],
      body: { reason: "[SYNTHETIC] first", purposes: ["research"], requestId: reusedId },
    }));
    assert.equal(first.statusCode, 200);

    const second = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
      method: "POST",
      pathSegments: ["records", active.record.recordId, "restrict"],
      body: { reason: "[SYNTHETIC] second", purposes: ["model-training"], requestId: reusedId },
    }));
    assert.equal(second.statusCode, 409);

    const control = await registerStore.getCurrent(active.record.recordId);
    assert.ok(control?.restrictedPurposes.includes("research"));
    assert.ok(
      !control?.restrictedPurposes.includes("model-training"),
      "the second (conflicting) payload must never have been applied",
    );
  },
);

test("replaying the exact SAME requestId, record, and payload is still a safe idempotent no-op", async () => {
  const { fixtureStore, registerStore, active } = await setup();
  const input = { reason: "[SYNTHETIC] replay test", purposes: ["research"], requestId: "req-safe-replay" };

  const first = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "restrict"],
    body: input,
  }));
  const second = await routeRequest(fixtureStore, registerStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "restrict"],
    body: input,
  }));
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.deepEqual(first.body, second.body, "an exact replay must return the same result, not conflict");
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
