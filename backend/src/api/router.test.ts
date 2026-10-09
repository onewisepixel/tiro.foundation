import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryFixtureStore, InMemoryIntakeRegisterCommitter, InMemoryRestrictionRegisterStore } from "../store/memoryStore";
import { InMemoryMediaStore } from "../store/mediaStore";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import { bindSeedMedia } from "../fixtures/media";
import { VersionConflictError, type FixtureStore, type RestrictionRegisterStore } from "../store/store";
import type { RestrictionRegisterEntry } from "../domain/types";
import { isPublicGetRoutePath, PUBLIC_JSON_RESPONSE_HEADERS, routeRequest, wrappedResponseBytes, type ApiRequest } from "./router";
import { correctRecord, redactMedia, restrict } from "../services/lifecycle";
import { LAMBDA_SYNCHRONOUS_RESPONSE_LIMIT_BYTES } from "../services/export";
import { uuidv7 } from "../domain/id";
import { setCursorSecretKey } from "../services/cursorCodec";

// Same fixed, clearly-local test key cursorCodec.test.ts uses — never the
// real deployment secret, which infra generates fresh per deploy. Required
// before any /public/records call below, which encodes/decodes a real
// cursor.
setCursorSecretKey("test-only-fixed-cursor-key-never-used-in-production");

const STAFF_IDENTITY = "staff:test@example.invalid";

async function setup() {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const mediaStore = new InMemoryMediaStore();
  const intakeCommitter = new InMemoryIntakeRegisterCommitter(fixtureStore, registerStore);
  const [active, expired, disputed, preservationOnly] = buildSeedFixtures();
  await bindSeedMedia(mediaStore, active);
  await seedStore(fixtureStore, registerStore, [active, expired, disputed, preservationOnly]);
  return { fixtureStore, registerStore, mediaStore, intakeCommitter, active, expired, disputed, preservationOnly };
}

function req(partial: Partial<ApiRequest> & Pick<ApiRequest, "method" | "pathSegments">): ApiRequest {
  return { queryParams: {}, body: undefined, ...partial };
}

test("GET /records/:id requires valid purpose and audience query params", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
  const missing = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", active.record.recordId],
  }));
  assert.equal(missing.statusCode, 400);

  const invalid = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", active.record.recordId],
    queryParams: { purpose: "not-a-purpose", audience: "public" },
  }));
  assert.equal(invalid.statusCode, 400);
});

test("GET /records/:id returns the FULL detail bundle (content + evidence) when evaluatePermission allows it", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
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
    const { fixtureStore, registerStore, mediaStore, intakeCommitter, expired, disputed } = await setup();
    for (const fixture of [expired, disputed]) {
      const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
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
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, disputed } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
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
  const { fixtureStore, registerStore, mediaStore, intakeCommitter } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", "does-not-exist"],
    queryParams: { purpose: "publication", audience: "public" },
  }));
  assert.equal(response.statusCode, 404);
});

test("GET /lifecycle-requests requires a valid status query param", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter } = await setup();
  const missing = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["lifecycle-requests"],
  }));
  assert.equal(missing.statusCode, 400);

  const invalid = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["lifecycle-requests"],
    queryParams: { status: "not-a-real-status" },
  }));
  assert.equal(invalid.statusCode, 400);
});

test("GET /lifecycle-requests never returns payloadFingerprint — an internal idempotency mechanism, not display content", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
  await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "withdraw"],
    body: { reason: "[SYNTHETIC] api test" },
  }));
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["lifecycle-requests"],
    queryParams: { status: "completed" },
  }));
  const body = response.body as { requests: Record<string, unknown>[] };
  assert.ok(body.requests.length > 0);
  for (const r of body.requests) {
    assert.equal("payloadFingerprint" in r, false);
  }
});

test("POST /records/:id/withdraw performs the action and attributes it to the authenticated caller, not the request body", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
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
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
  const missing = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "restrict"],
    body: { reason: "[SYNTHETIC] test" },
  }));
  assert.equal(missing.statusCode, 400);

  const invalidPurpose = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "restrict"],
    body: { reason: "[SYNTHETIC] test", purposes: ["not-a-real-purpose"] },
  }));
  assert.equal(invalidPurpose.statusCode, 400);

  const ok = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "restrict"],
    body: { reason: "[SYNTHETIC] test", purposes: ["model-training"] },
  }));
  assert.equal(ok.statusCode, 200);
});

test("POST /records/:id/revoke-consent requires a consentId, then revokes it", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
  const consentId = active.consentGrants[0].consentId;

  const missing = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "revoke-consent"],
    body: { reason: "[SYNTHETIC] test" },
  }));
  assert.equal(missing.statusCode, 400);

  const ok = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
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
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
  const startResponse = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "start-deletion"],
    body: { reason: "[SYNTHETIC] test" },
  }));
  const deletionRequestId = (startResponse.body as { requestId: string }).requestId;

  const missingLink = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
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
    mediaId: null,
    createdAt: new Date().toISOString(),
    reconciledAt: null,
  });

  const blocked = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "complete-deletion"],
    body: { reason: "[SYNTHETIC] test", deletionRequestId },
  }));
  assert.equal((blocked.body as { status: string }).status, "in-progress");
  // Retrying must reuse the SAME requestId the blocked attempt was assigned
  // (either the caller's own, or — as here, since none was given — the one
  // the server generated and returned) so it resumes the completion the
  // claim is already held for, rather than being refused as a foreign one
  // (lifecycle.ts's completeDeletion()).
  const completionRequestId = (blocked.body as { requestId: string }).requestId;

  await fixtureStore.putCustodyCopy({
    recordId: active.record.recordId,
    copyId: "outstanding",
    location: "backup",
    objectVersionId: null,
    mediaId: null,
    createdAt: new Date().toISOString(),
    reconciledAt: new Date().toISOString(),
  });

  const done = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "complete-deletion"],
    body: { reason: "[SYNTHETIC] test", deletionRequestId, requestId: completionRequestId },
  }));
  assert.equal((done.body as { status: string }).status, "completed");
  assert.equal(await fixtureStore.getRecord(active.record.recordId), null);
});

test(
  "POST /records/:id/complete-deletion refuses a record that never went through startDeletion (Finding 3)",
  async () => {
    const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
    // active is "published"/"preserved" — never had start-deletion called.
    const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
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
    const { fixtureStore, registerStore, mediaStore, intakeCommitter, active, expired } = await setup();
    const startOnExpired = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
      method: "POST",
      pathSegments: ["records", expired.record.recordId, "start-deletion"],
      body: { reason: "[SYNTHETIC] test" },
    }));
    const expiredDeletionRequestId = (startOnExpired.body as { requestId: string }).requestId;

    const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
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
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, disputed } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", disputed.record.recordId, "permission-check"],
    body: { purpose: "publication", audience: "public" },
  }));
  assert.equal(response.statusCode, 200);
  assert.equal((response.body as { allowed: boolean }).allowed, false);
});

test("POST /records/:id/permission-check rejects an invalid purpose/audience", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "permission-check"],
    body: { purpose: "not-a-purpose", audience: "public" },
  }));
  assert.equal(response.statusCode, 400);
});

test("POST /export runs the real scoped export and excludes denied records", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active, expired } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
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
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["export"],
    body: { recordIds: [active.record.recordId], fixtureSetId: "x", destinationAudience: "public" },
  }));
  assert.equal(response.statusCode, 400);
});

test(
  "POST /export rejects an oversized fixtureSetId at the API boundary, before any record is even looked at (reviewer-caught finding)",
  async () => {
    const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
    // Exact reviewer reproduction: a 2 MiB fixtureSetId, which the
    // manifest used to embed verbatim with only a fixed, optimistic
    // budget allowance — this must never reach export logic at all.
    const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
      method: "POST",
      pathSegments: ["export"],
      body: {
        recordIds: [active.record.recordId],
        scope: "public-redacted",
        fixtureSetId: "x".repeat(2 * 1024 * 1024),
        destinationAudience: "public",
      },
    }));
    assert.equal(response.statusCode, 400);
  },
);

test(
  "POST /export rejects an oversized recordIds batch at the API boundary, before any record is even looked at (reviewer-caught finding)",
  async () => {
    const { fixtureStore, registerStore, mediaStore, intakeCommitter } = await setup();
    // Exact reviewer reproduction (scaled only for a fast test run): a
    // batch far larger than this system was ever meant to process in one
    // synchronous call — closing the door on "almost all skipped" response
    // sizes at the input boundary, not just inside the export loop.
    const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
      method: "POST",
      pathSegments: ["export"],
      body: {
        recordIds: Array.from({ length: 2001 }, (_, i) => `does-not-exist-${i}`),
        scope: "public-redacted",
        fixtureSetId: "oversized-batch-api-test",
        destinationAudience: "public",
      },
    }));
    assert.equal(response.statusCode, 400);
  },
);

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
  listPage(query: { limit: number; cursor: string | null }) {
    return this.inner.listPage(query);
  }
}

test("a version conflict from the service layer surfaces as 409, not a 500 or a silent success", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
  const conflicting = new AlwaysConflictingRegisterStore(registerStore);
  const response = await routeRequest(fixtureStore, conflicting, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "withdraw"],
    body: { reason: "[SYNTHETIC] test" },
  }));
  assert.equal(response.statusCode, 409);
});

test(
  "reusing a requestId for a DIFFERENT record returns 409 and leaves the second record untouched (Finding 2)",
  async () => {
    const { fixtureStore, registerStore, mediaStore, intakeCommitter, active, expired } = await setup();
    const reusedId = "req-reused-across-records";

    const first = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
      method: "POST",
      pathSegments: ["records", active.record.recordId, "withdraw"],
      body: { reason: "[SYNTHETIC] first operation", requestId: reusedId },
    }));
    assert.equal(first.statusCode, 200);
    assert.equal((first.body as { status: string }).status, "completed");

    const second = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
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
    const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
    const reusedId = "req-reused-same-record-different-payload";

    const first = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
      method: "POST",
      pathSegments: ["records", active.record.recordId, "restrict"],
      body: { reason: "[SYNTHETIC] first", purposes: ["research"], requestId: reusedId },
    }));
    assert.equal(first.statusCode, 200);

    const second = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
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
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
  const input = { reason: "[SYNTHETIC] replay test", purposes: ["research"], requestId: "req-safe-replay" };

  const first = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "restrict"],
    body: input,
  }));
  const second = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "restrict"],
    body: input,
  }));
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.deepEqual(first.body, second.body, "an exact replay must return the same result, not conflict");
});

test("an unknown route returns 404, not a crash", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["not", "a", "real", "route"],
  }));
  assert.equal(response.statusCode, 404);
});

test("an unknown action under /records/:id returns 404", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "not-a-real-action"],
  }));
  assert.equal(response.statusCode, 404);
});

test("GET /records/:id/media/:mediaId requires purpose and audience query params", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", active.record.recordId, "media", active.record.mediaRefs[0].mediaId],
  }));
  assert.equal(response.statusCode, 400);
});

test("GET /records/:id/media/:mediaId returns the exact bytes as a base64 binary body when allowed", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
  const textMedia = active.record.mediaRefs[0];
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", active.record.recordId, "media", textMedia.mediaId],
    queryParams: { purpose: "publication", audience: "public" },
  }));
  assert.equal(response.statusCode, 200);
  assert.ok(response.binary, "a successful media fetch must use the binary response path, not JSON");
  assert.equal(response.binary?.contentType, "text/plain");
  const decoded = Buffer.from(response.binary!.base64Body, "base64");
  assert.equal(decoded.toString("utf8"), `[SYNTHETIC] dummy text content for record ${active.record.recordId}.\n`);
});

test("GET /records/:id/media/:mediaId denies with no bytes and no binary payload when evaluatePermission denies (Finding-1-style gate, applied to media)", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, disputed } = await setup();
  // disputed has no mediaRefs seeded by default; attach one directly so a
  // denial can be proven even though a real bound reference exists.
  const record = await fixtureStore.getRecord(disputed.record.recordId);
  const uploaded = await mediaStore.putObject("fixtures/disputed/x.txt", Buffer.from("secret-ish"), "text/plain");
  record!.mediaRefs.push({
    mediaId: "disputed-media",
    objectKey: "fixtures/disputed/x.txt",
    bytes: 10,
    checksumSha256: uploaded.sha256,
    contentType: "text/plain",
    versionId: uploaded.versionId,
  });
  await fixtureStore.putRecord(record!, record!.version);

  const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", disputed.record.recordId, "media", "disputed-media"],
    queryParams: { purpose: "publication", audience: "public" },
  }));
  assert.equal(response.statusCode, 403);
  assert.equal(response.binary, undefined, "a denial must never carry a binary payload");
  assert.match((response.body as { error: string }).error, /disputed/i);
});

test("GET /records/:id/media/:mediaId returns 409 for a legacy reference with no bound version", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
  const record = await fixtureStore.getRecord(active.record.recordId);
  record!.mediaRefs.push({
    mediaId: "legacy-media",
    objectKey: "fixtures/legacy/x.txt",
    bytes: 5,
    checksumSha256: "0".repeat(64),
    contentType: "text/plain",
    versionId: null,
  });
  await fixtureStore.putRecord(record!, record!.version);

  const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", active.record.recordId, "media", "legacy-media"],
    queryParams: { purpose: "publication", audience: "public" },
  }));
  assert.equal(response.statusCode, 409);
  assert.equal(response.binary, undefined);
});

// ------------------------------------------------- versioned correction --

test("POST /records/:id/correct replaces the field, attributes it to the authenticated caller, and preserves history", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "correct"],
    body: { reason: "[SYNTHETIC] fix", field: "summary", correctedValue: "[SYNTHETIC] corrected via API" },
  }));
  assert.equal(response.statusCode, 200);
  const body = response.body as { status: string; requesterCapacity: string };
  assert.equal(body.status, "completed");
  assert.equal(body.requesterCapacity, STAFF_IDENTITY);

  const record = await fixtureStore.getRecord(active.record.recordId);
  assert.equal(record?.summary, "[SYNTHETIC] corrected via API");
  const corrections = await fixtureStore.listCorrections(active.record.recordId);
  assert.equal(corrections.length, 1);
});

test("POST /records/:id/correct rejects a missing/invalid field", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "correct"],
    body: { reason: "[SYNTHETIC] fix", field: "not-a-real-field", correctedValue: "x" },
  }));
  assert.equal(response.statusCode, 400);
});

test("POST /records/:id/dispute-correction marks it disputed without reverting it", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
  await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "correct"],
    body: { reason: "[SYNTHETIC] fix", field: "title", correctedValue: "[SYNTHETIC] disputed title" },
  }));
  const [correction] = await fixtureStore.listCorrections(active.record.recordId);

  const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "dispute-correction"],
    body: { reason: "[SYNTHETIC] I disagree", correctionId: correction.correctionId },
  }));
  assert.equal(response.statusCode, 200);

  const [afterDispute] = await fixtureStore.listCorrections(active.record.recordId);
  assert.equal(afterDispute.status, "disputed");
  const record = await fixtureStore.getRecord(active.record.recordId);
  assert.equal(record?.title, "[SYNTHETIC] disputed title", "the correction itself must not be reverted");
});

test("GET /records/:id includes full correction history when allowed, and a count-only view when denied", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active, disputed } = await setup();
  await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "correct"],
    body: { reason: "[SYNTHETIC] fix", field: "summary", correctedValue: "[SYNTHETIC] corrected" },
  }));

  const allowed = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", active.record.recordId],
    queryParams: { purpose: "publication", audience: "public" },
  }));
  const allowedBody = allowed.body as { corrections: unknown[] };
  assert.equal(allowedBody.corrections.length, 1);

  const denied = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", disputed.record.recordId],
    queryParams: { purpose: "publication", audience: "public" },
  }));
  const deniedBody = denied.body as { correctionCount: number; corrections?: unknown };
  assert.equal(deniedBody.correctionCount, 0);
  assert.equal(deniedBody.corrections, undefined, "the limited view must never carry the raw corrections array");
});

// ------------------------------------------------------------ redaction --

test("POST /records/:id/redact-text masks the field and never exposes the original through GET /records/:id", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
  const original = (await fixtureStore.getRecord(active.record.recordId))?.summary;

  const redactResponse = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "redact-text"],
    body: { reason: "[SYNTHETIC] sensitive detail", field: "summary" },
  }));
  assert.equal(redactResponse.statusCode, 200);

  const getResponse = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", active.record.recordId],
    queryParams: { purpose: "publication", audience: "public" },
  }));
  const body = getResponse.body as { record: { summary: string }; redactions: Array<Record<string, unknown>> };
  assert.equal(body.record.summary, "[REDACTED]");
  assert.equal(body.redactions.length, 1);
  assert.equal(body.redactions[0].previousValue, undefined, "the original value must never appear in the GET response");
  assert.notEqual(original, "[REDACTED]", "sanity check: there really was a different original value");
});

test(
  "correcting a field and then redacting that SAME field masks its correction history too, not just the live value (reviewer-caught finding)",
  async () => {
    const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();

    const correctResponse = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
      method: "POST",
      pathSegments: ["records", active.record.recordId, "correct"],
      body: { reason: "[SYNTHETIC] fixing a typo", field: "title", correctedValue: "[SYNTHETIC] corrected title" },
    }));
    assert.equal(correctResponse.statusCode, 200);

    const redactResponse = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
      method: "POST",
      pathSegments: ["records", active.record.recordId, "redact-text"],
      body: { reason: "[SYNTHETIC] sensitive title", field: "title" },
    }));
    assert.equal(redactResponse.statusCode, 200);

    const getResponse = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
      method: "GET",
      pathSegments: ["records", active.record.recordId],
      queryParams: { purpose: "publication", audience: "public" },
    }));
    const body = getResponse.body as {
      record: { title: string };
      corrections: Array<{ field: string; previousValue: string; correctedValue: string }>;
    };
    assert.equal(body.record.title, "[REDACTED]", "the live field must be masked");
    assert.equal(body.corrections.length, 1);
    assert.equal(
      body.corrections[0].previousValue,
      "[REDACTED]",
      "a redacted field's correction history must be masked too — a reviewer caught this remaining a bypass",
    );
    assert.equal(body.corrections[0].correctedValue, "[REDACTED]", "the corrected value for that same field must be masked too");
  },
);

test("POST /records/:id/redact-media denies the exact mediaId through GET .../media/:mediaId, even though the record is otherwise allowed", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const mediaStore = new InMemoryMediaStore();
  const intakeCommitter = new InMemoryIntakeRegisterCommitter(fixtureStore, registerStore);
  const [active] = buildSeedFixtures();
  await bindSeedMedia(mediaStore, active);
  await seedStore(fixtureStore, registerStore, [active]);
  const textMedia = active.record.mediaRefs[0];

  const before = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", active.record.recordId, "media", textMedia.mediaId],
    queryParams: { purpose: "publication", audience: "public" },
  }));
  assert.equal(before.statusCode, 200);

  const redactResponse = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "redact-media"],
    body: { reason: "[SYNTHETIC] sensitive media", mediaId: textMedia.mediaId },
  }));
  assert.equal(redactResponse.statusCode, 200);

  const after = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", active.record.recordId, "media", textMedia.mediaId],
    queryParams: { purpose: "publication", audience: "public" },
  }));
  assert.equal(after.statusCode, 403);
  assert.match((after.body as { error: string }).error, /redacted/i);
});

// --- Staff intake and review -----------------------------------------------

async function createAndEvidence(deps: Awaited<ReturnType<typeof setup>>) {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter } = deps;
  const createResponse = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["intake"],
    body: {
      reason: "[SYNTHETIC] new submission",
      fixtureSetId: "fixture-set-router-test",
      title: "[SYNTHETIC] router test title",
      summary: "[SYNTHETIC] router test summary",
      provenanceRef: "fixture://invented-router-001",
    },
  }));
  assert.equal(createResponse.statusCode, 200);
  const recordId = (createResponse.body as { recordId: string }).recordId;

  const claimResponse = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", recordId, "add-authority-claim"],
    body: { reason: "[SYNTHETIC] claim", claimant: "[SYNTHETIC] narrator", scope: "full record", evidenceRef: "fixture://invented-claim" },
  }));
  assert.equal(claimResponse.statusCode, 200);

  const grantResponse = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", recordId, "add-consent-grant"],
    body: {
      reason: "[SYNTHETIC] grant",
      signerCapacitySummary: "[SYNTHETIC] self",
      purposes: ["preservation"],
      audience: "staff",
      mandateRef: null,
      expiresAt: null,
      retentionTermsRef: "fixture://invented-retention",
      withdrawalContact: "fixture-steward@example.invalid",
    },
  }));
  assert.equal(grantResponse.statusCode, 200);

  return { recordId, claimId: (claimResponse.body as { requestId: string }).requestId, consentId: (grantResponse.body as { requestId: string }).requestId };
}

test("POST /intake creates a quarantined record; GET /intake/:recordId reads it, GET /records/:id does not", async () => {
  const deps = await setup();
  const { recordId } = await createAndEvidence(deps);

  const intakeView = await routeRequest(deps.fixtureStore, deps.registerStore, deps.mediaStore, deps.intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["intake", recordId],
  }));
  assert.equal(intakeView.statusCode, 200);
  assert.equal((intakeView.body as { record: { title: string } }).record.title, "[SYNTHETIC] router test title");

  const normalView = await routeRequest(deps.fixtureStore, deps.registerStore, deps.mediaStore, deps.intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", recordId],
    queryParams: { purpose: "preservation", audience: "staff" },
  }));
  assert.equal(normalView.statusCode, 200);
  assert.equal((normalView.body as { access: { allowed: boolean } }).access.allowed, false);
});

test("GET /intake/queue lists a pending-preservation submission; it disappears from there and appears under pendingPublication once preserved", async () => {
  const deps = await setup();
  const { recordId, claimId, consentId } = await createAndEvidence(deps);

  const beforeQueue = await routeRequest(deps.fixtureStore, deps.registerStore, deps.mediaStore, deps.intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["intake", "queue"],
  }));
  assert.equal(beforeQueue.statusCode, 200);
  const beforeBody = beforeQueue.body as { pendingPreservation: { recordId: string; controlVersion: number }[] };
  const entry = beforeBody.pendingPreservation.find((e) => e.recordId === recordId);
  assert.ok(entry, "expected the new submission in pendingPreservation");

  const intakeDetail = await routeRequest(deps.fixtureStore, deps.registerStore, deps.mediaStore, deps.intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["intake", recordId],
  }));
  const detailBody = intakeDetail.body as { controlVersion: number; recordVersion: number };

  const approveResponse = await routeRequest(deps.fixtureStore, deps.registerStore, deps.mediaStore, deps.intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", recordId, "approve-preservation"],
    body: {
      reason: "[SYNTHETIC] approve",
      expectedControlVersion: detailBody.controlVersion,
      expectedRecordVersion: detailBody.recordVersion,
      authorityClaimIds: [claimId],
      legalRightIds: [],
      consentGrantIds: [consentId],
    },
  }));
  assert.equal(approveResponse.statusCode, 200);

  const afterQueue = await routeRequest(deps.fixtureStore, deps.registerStore, deps.mediaStore, deps.intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["intake", "queue"],
  }));
  const afterBody = afterQueue.body as {
    pendingPreservation: { recordId: string }[];
    pendingPublication: { recordId: string }[];
  };
  assert.equal(afterBody.pendingPreservation.some((e) => e.recordId === recordId), false);

  const notFoundNow = await routeRequest(deps.fixtureStore, deps.registerStore, deps.mediaStore, deps.intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["intake", recordId],
  }));
  assert.equal(notFoundNow.statusCode, 404);
});

test("GET /intake/:recordId/media/:mediaId previews a quarantined upload the normal media route denies", async () => {
  const deps = await setup();
  const { recordId } = await createAndEvidence(deps);

  const mediaResponse = await routeRequest(deps.fixtureStore, deps.registerStore, deps.mediaStore, deps.intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", recordId, "add-media"],
    body: { reason: "[SYNTHETIC] media", contentType: "text/plain", base64: Buffer.from("[SYNTHETIC] router test file").toString("base64") },
  }));
  assert.equal(mediaResponse.statusCode, 200);
  const record = await deps.fixtureStore.getRecord(recordId);
  const mediaId = record!.mediaRefs[0].mediaId;

  const normalMediaResponse = await routeRequest(deps.fixtureStore, deps.registerStore, deps.mediaStore, deps.intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", recordId, "media", mediaId],
    queryParams: { purpose: "preservation", audience: "staff" },
  }));
  assert.equal(normalMediaResponse.statusCode, 403);

  const intakeMediaResponse = await routeRequest(deps.fixtureStore, deps.registerStore, deps.mediaStore, deps.intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["intake", recordId, "media", mediaId],
  }));
  assert.equal(intakeMediaResponse.statusCode, 200);
  assert.ok(intakeMediaResponse.binary);
});

test("POST /records/:id/approve-publication is denied with no publication-purpose grant, confirming the completion test's core guarantee", async () => {
  const deps = await setup();
  const { recordId, claimId, consentId } = await createAndEvidence(deps);
  const detail = await routeRequest(deps.fixtureStore, deps.registerStore, deps.mediaStore, deps.intakeCommitter, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["intake", recordId],
  }));
  const { controlVersion, recordVersion } = detail.body as { controlVersion: number; recordVersion: number };

  await routeRequest(deps.fixtureStore, deps.registerStore, deps.mediaStore, deps.intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", recordId, "approve-preservation"],
    body: {
      reason: "[SYNTHETIC] approve",
      expectedControlVersion: controlVersion,
      expectedRecordVersion: recordVersion,
      authorityClaimIds: [claimId],
      legalRightIds: [],
      consentGrantIds: [consentId],
    },
  }));

  const publishAttempt = await routeRequest(deps.fixtureStore, deps.registerStore, deps.mediaStore, deps.intakeCommitter, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", recordId, "approve-publication"],
    body: { reason: "[SYNTHETIC] publish", expectedControlVersion: controlVersion + 1, expectedRecordVersion: recordVersion, consentGrantIds: [consentId] },
  }));
  assert.equal(publishAttempt.statusCode, 200);
  assert.equal((publishAttempt.body as { status: string }).status, "denied");
});

// ---------------------------------------------------------------------------
// Public, unauthenticated Memory-site routes
// ---------------------------------------------------------------------------

test("isPublicGetRoutePath matches exactly the three public GET shapes, never a bare /public prefix", () => {
  assert.equal(isPublicGetRoutePath(["public", "records"]), true);
  assert.equal(isPublicGetRoutePath(["public", "records", "abc"]), true);
  assert.equal(isPublicGetRoutePath(["public", "records", "abc", "media", "def"]), true);

  // Not the three exact shapes — a HYPOTHETICAL future mutating addition
  // under /public/* must never silently inherit the anonymous exemption
  // just because it shares the prefix.
  assert.equal(isPublicGetRoutePath(["public", "records", "abc", "something-else", "def"]), false);
  assert.equal(isPublicGetRoutePath(["public", "something-else"]), false);
  assert.equal(isPublicGetRoutePath(["public"]), false);
  assert.equal(isPublicGetRoutePath(["public", "records", "abc", "media"]), false);
  assert.equal(isPublicGetRoutePath([]), false);
  assert.equal(isPublicGetRoutePath(["records"]), false);
});

test("GET /public/records rejects a malformed limit", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter } = await setup();
  const negative = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, "public:anonymous", req({
    method: "GET",
    pathSegments: ["public", "records"],
    queryParams: { limit: "-1" },
  }));
  assert.equal(negative.statusCode, 400);

  const nonNumeric = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, "public:anonymous", req({
    method: "GET",
    pathSegments: ["public", "records"],
    queryParams: { limit: "not-a-number" },
  }));
  assert.equal(nonNumeric.statusCode, 400);
});

test("GET /public/records rejects a malformed cursor with 400, never silently restarting at page one", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, "public:anonymous", req({
    method: "GET",
    pathSegments: ["public", "records"],
    queryParams: { cursor: "not-a-real-cursor" },
  }));
  assert.equal(response.statusCode, 400);
});

test("GET /public/records returns only the publicly eligible fixture, with the public-safe shape", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, "public:anonymous", req({
    method: "GET",
    pathSegments: ["public", "records"],
  }));
  assert.equal(response.statusCode, 200);
  const body = response.body as { items: { recordId: string }[]; nextCursor: string | null };
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].recordId, active.record.recordId);
});

// Reviewer-caught finding: when every candidate on a page fails to
// evaluate, the listing must never come back as a confident 200 with an
// empty array — that reads identically to "nothing is published," which
// it is NOT provably true. 503 is the same signal
// fetchPublicMemoryListing (frontend) already treats any non-2xx as; no
// new frontend state needed.
test("GET /public/records returns 503, not a confident empty 200, when every candidate fails to evaluate", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();

  class AlwaysThrowsFixtureStore implements FixtureStore {
    constructor(private readonly inner: FixtureStore) {}
    getRecord(recordId: string) {
      if (recordId === active.record.recordId) {
        throw new Error("simulated ProvisionedThroughputExceededException");
      }
      return this.inner.getRecord(recordId);
    }
    listAuthorityClaims(...a: Parameters<FixtureStore["listAuthorityClaims"]>) { return this.inner.listAuthorityClaims(...a); }
    putRecord(...a: Parameters<FixtureStore["putRecord"]>) { return this.inner.putRecord(...a); }
    deleteRecord(...a: Parameters<FixtureStore["deleteRecord"]>) { return this.inner.deleteRecord(...a); }
    putAuthorityClaim(...a: Parameters<FixtureStore["putAuthorityClaim"]>) { return this.inner.putAuthorityClaim(...a); }
    getAuthorityClaim(...a: Parameters<FixtureStore["getAuthorityClaim"]>) { return this.inner.getAuthorityClaim(...a); }
    listLegalRights(...a: Parameters<FixtureStore["listLegalRights"]>) { return this.inner.listLegalRights(...a); }
    putLegalRight(...a: Parameters<FixtureStore["putLegalRight"]>) { return this.inner.putLegalRight(...a); }
    getLegalRight(...a: Parameters<FixtureStore["getLegalRight"]>) { return this.inner.getLegalRight(...a); }
    listConsentGrants(...a: Parameters<FixtureStore["listConsentGrants"]>) { return this.inner.listConsentGrants(...a); }
    getConsentGrant(...a: Parameters<FixtureStore["getConsentGrant"]>) { return this.inner.getConsentGrant(...a); }
    putConsentGrant(...a: Parameters<FixtureStore["putConsentGrant"]>) { return this.inner.putConsentGrant(...a); }
    listCustodyCopies(...a: Parameters<FixtureStore["listCustodyCopies"]>) { return this.inner.listCustodyCopies(...a); }
    putCustodyCopy(...a: Parameters<FixtureStore["putCustodyCopy"]>) { return this.inner.putCustodyCopy(...a); }
    createLifecycleRequest(...a: Parameters<FixtureStore["createLifecycleRequest"]>) { return this.inner.createLifecycleRequest(...a); }
    getLifecycleRequest(...a: Parameters<FixtureStore["getLifecycleRequest"]>) { return this.inner.getLifecycleRequest(...a); }
    updateLifecycleRequest(...a: Parameters<FixtureStore["updateLifecycleRequest"]>) { return this.inner.updateLifecycleRequest(...a); }
    listLifecycleRequestsByStatus(...a: Parameters<FixtureStore["listLifecycleRequestsByStatus"]>) { return this.inner.listLifecycleRequestsByStatus(...a); }
    putAuditReceipt(...a: Parameters<FixtureStore["putAuditReceipt"]>) { return this.inner.putAuditReceipt(...a); }
    listAuditReceipts(...a: Parameters<FixtureStore["listAuditReceipts"]>) { return this.inner.listAuditReceipts(...a); }
    listCorrections(...a: Parameters<FixtureStore["listCorrections"]>) { return this.inner.listCorrections(...a); }
    putCorrection(...a: Parameters<FixtureStore["putCorrection"]>) { return this.inner.putCorrection(...a); }
    getCorrection(...a: Parameters<FixtureStore["getCorrection"]>) { return this.inner.getCorrection(...a); }
    listRedactions(...a: Parameters<FixtureStore["listRedactions"]>) { return this.inner.listRedactions(...a); }
    putRedaction(...a: Parameters<FixtureStore["putRedaction"]>) { return this.inner.putRedaction(...a); }
    getRedaction(...a: Parameters<FixtureStore["getRedaction"]>) { return this.inner.getRedaction(...a); }
    putRecordWithCorrection(...a: Parameters<FixtureStore["putRecordWithCorrection"]>) { return this.inner.putRecordWithCorrection(...a); }
    putRecordWithRedaction(...a: Parameters<FixtureStore["putRecordWithRedaction"]>) { return this.inner.putRecordWithRedaction(...a); }
    putRecordWithCustodyCopy(...a: Parameters<FixtureStore["putRecordWithCustodyCopy"]>) { return this.inner.putRecordWithCustodyCopy(...a); }
  }

  const response = await routeRequest(new AlwaysThrowsFixtureStore(fixtureStore), registerStore, mediaStore, intakeCommitter, "public:anonymous", req({
    method: "GET",
    pathSegments: ["public", "records"],
  }));
  assert.equal(response.statusCode, 503);
  const body = response.body as { error: string };
  assert.equal(typeof body.error, "string");
  assert.equal(body.error.includes(active.record.recordId), false, "the failed recordId must never appear in the response");
});

test("GET /public/records/:recordId returns a flat 404 — never the staff limited-metadata shape — for a denied record", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
  await restrict(fixtureStore, registerStore, { requestId: uuidv7(), recordId: active.record.recordId, requesterCapacity: STAFF_IDENTITY, reason: "[SYNTHETIC] test" }, ["publication"]);
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, "public:anonymous", req({
    method: "GET",
    pathSegments: ["public", "records", active.record.recordId],
  }));
  assert.equal(response.statusCode, 404);
  const body = response.body as Record<string, unknown>;
  assert.equal("access" in body, false, "the public route must never return the staff route's access/control shape");
  assert.equal("control" in body, false);
});

test("GET /public/records/:recordId returns a flat 404 for a nonexistent record", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, "public:anonymous", req({
    method: "GET",
    pathSegments: ["public", "records", "does-not-exist"],
  }));
  assert.equal(response.statusCode, 404);
});

test("GET /public/records/:recordId returns the public-safe view for an eligible record, ignoring any purpose/audience query params", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, "public:anonymous", req({
    method: "GET",
    pathSegments: ["public", "records", active.record.recordId],
    // Even if a caller supplies these, they must be ignored — purpose/
    // audience are hardcoded server-side for every /public/* route.
    queryParams: { purpose: "research", audience: "research-partner" },
  }));
  assert.equal(response.statusCode, 200);
  const body = response.body as { recordId: string; recordKind: string };
  assert.equal(body.recordId, active.record.recordId);
  assert.equal(body.recordKind, "demo");
});

test("GET /public/records/:recordId/media/:mediaId serves bytes for an eligible record, and 404s (never 403) once redacted", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();
  const mediaId = active.record.mediaRefs[0].mediaId;

  const ok = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, "public:anonymous", req({
    method: "GET",
    pathSegments: ["public", "records", active.record.recordId, "media", mediaId],
  }));
  assert.equal(ok.statusCode, 200);
  assert.ok(ok.binary);

  await redactMedia(fixtureStore, registerStore, { requestId: uuidv7(), recordId: active.record.recordId, requesterCapacity: STAFF_IDENTITY, reason: "[SYNTHETIC] test", mediaId });

  const denied = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, "public:anonymous", req({
    method: "GET",
    pathSegments: ["public", "records", active.record.recordId, "media", mediaId],
  }));
  assert.equal(denied.statusCode, 404);
});

// ---------------------------------------------------------------------------
// Response-size guard must measure the REAL wrapped response, headers included
// ---------------------------------------------------------------------------

test(
  "wrappedResponseBytes accounts for the full real headers object — the exact 27-byte cache-control gap a reviewer reproduced",
  () => {
    // A body sized so the response sits EXACTLY at Lambda's limit when
    // measured with only {"content-type": "application/json"} — this was
    // the OLD guard's blind spot: it would have reported this as safely
    // at-or-under budget, when the REAL response (with cache-control
    // actually added) was already over.
    const overheadWithEmptyTitle = wrappedResponseBytes({ title: "" });
    const paddingNeeded = LAMBDA_SYNCHRONOUS_RESPONSE_LIMIT_BYTES - overheadWithEmptyTitle;
    const body = { title: "a".repeat(paddingNeeded) };

    const oldStyleBytes = wrappedResponseBytes(body);
    assert.equal(
      oldStyleBytes,
      LAMBDA_SYNCHRONOUS_RESPONSE_LIMIT_BYTES,
      "sanity: this body sits exactly at the limit under the OLD, header-blind measurement",
    );

    const realBytes = wrappedResponseBytes(body, PUBLIC_JSON_RESPONSE_HEADERS);
    assert.equal(
      realBytes,
      LAMBDA_SYNCHRONOUS_RESPONSE_LIMIT_BYTES + 27,
      'the real, fully-wrapped response is exactly 27 bytes larger — ,"cache-control":"no-store"\'s own encoded size',
    );
    assert.ok(realBytes > LAMBDA_SYNCHRONOUS_RESPONSE_LIMIT_BYTES, "a response the old guard would have let through now correctly exceeds the real limit");
  },
);

test("GET /public/records/:recordId 413s at the real boundary the old, header-blind guard would have missed", async () => {
  const { fixtureStore, registerStore, mediaStore, intakeCommitter, active } = await setup();

  const baseline = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, "public:anonymous", req({
    method: "GET",
    pathSegments: ["public", "records", active.record.recordId],
  }));
  assert.equal(baseline.statusCode, 200);
  const baselineBytes = wrappedResponseBytes(baseline.body, PUBLIC_JSON_RESPONSE_HEADERS);

  // Append (never replace outright) enough plain-ASCII padding to the
  // title to push the REAL wrapped response to exactly one byte over the
  // limit — each appended character contributes exactly one byte to the
  // final count (no escaping-sensitive characters involved).
  const extraCharsNeeded = LAMBDA_SYNCHRONOUS_RESPONSE_LIMIT_BYTES + 1 - baselineBytes;
  await correctRecord(fixtureStore, {
    requestId: uuidv7(),
    recordId: active.record.recordId,
    requesterCapacity: STAFF_IDENTITY,
    reason: "[SYNTHETIC] pad title to the exact response-size boundary for a regression test",
    field: "title",
    correctedValue: active.record.title + "a".repeat(extraCharsNeeded),
  });

  const overLimit = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, "public:anonymous", req({
    method: "GET",
    pathSegments: ["public", "records", active.record.recordId],
  }));
  assert.equal(overLimit.statusCode, 413, "one byte over the REAL limit must be rejected, not silently let through by an undercounting guard");

  // Negative control: one byte less padding lands exactly AT the limit,
  // which must still succeed — the fix must not over-reject either.
  await correctRecord(fixtureStore, {
    requestId: uuidv7(),
    recordId: active.record.recordId,
    requesterCapacity: STAFF_IDENTITY,
    reason: "[SYNTHETIC] pad title to exactly the response-size limit for a regression test",
    field: "title",
    correctedValue: active.record.title + "a".repeat(extraCharsNeeded - 1),
  });
  const atLimit = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, "public:anonymous", req({
    method: "GET",
    pathSegments: ["public", "records", active.record.recordId],
  }));
  assert.equal(atLimit.statusCode, 200, "exactly at the limit must still succeed");
});
