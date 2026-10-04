import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryFixtureStore, InMemoryRestrictionRegisterStore } from "../store/memoryStore";
import { InMemoryMediaStore } from "../store/mediaStore";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import { bindSeedMedia } from "../fixtures/media";
import { VersionConflictError, type RestrictionRegisterStore } from "../store/store";
import type { RestrictionRegisterEntry } from "../domain/types";
import { routeRequest, type ApiRequest } from "./router";

const STAFF_IDENTITY = "staff:test@example.invalid";

async function setup() {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const mediaStore = new InMemoryMediaStore();
  const [active, expired, disputed, preservationOnly] = buildSeedFixtures();
  await bindSeedMedia(mediaStore, active);
  await seedStore(fixtureStore, registerStore, [active, expired, disputed, preservationOnly]);
  return { fixtureStore, registerStore, mediaStore, active, expired, disputed, preservationOnly };
}

function req(partial: Partial<ApiRequest> & Pick<ApiRequest, "method" | "pathSegments">): ApiRequest {
  return { queryParams: {}, body: undefined, ...partial };
}

test("GET /records/:id requires valid purpose and audience query params", async () => {
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const missing = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", active.record.recordId],
  }));
  assert.equal(missing.statusCode, 400);

  const invalid = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", active.record.recordId],
    queryParams: { purpose: "not-a-purpose", audience: "public" },
  }));
  assert.equal(invalid.statusCode, 400);
});

test("GET /records/:id returns the FULL detail bundle (content + evidence) when evaluatePermission allows it", async () => {
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
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
    const { fixtureStore, registerStore, mediaStore, expired, disputed } = await setup();
    for (const fixture of [expired, disputed]) {
      const response = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
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
  const { fixtureStore, registerStore, mediaStore, disputed } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
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
  const { fixtureStore, registerStore, mediaStore } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", "does-not-exist"],
    queryParams: { purpose: "publication", audience: "public" },
  }));
  assert.equal(response.statusCode, 404);
});

test("GET /lifecycle-requests requires a valid status query param", async () => {
  const { fixtureStore, registerStore, mediaStore } = await setup();
  const missing = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["lifecycle-requests"],
  }));
  assert.equal(missing.statusCode, 400);

  const invalid = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["lifecycle-requests"],
    queryParams: { status: "not-a-real-status" },
  }));
  assert.equal(invalid.statusCode, 400);
});

test("POST /records/:id/withdraw performs the action and attributes it to the authenticated caller, not the request body", async () => {
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
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
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const missing = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "restrict"],
    body: { reason: "[SYNTHETIC] test" },
  }));
  assert.equal(missing.statusCode, 400);

  const invalidPurpose = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "restrict"],
    body: { reason: "[SYNTHETIC] test", purposes: ["not-a-real-purpose"] },
  }));
  assert.equal(invalidPurpose.statusCode, 400);

  const ok = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "restrict"],
    body: { reason: "[SYNTHETIC] test", purposes: ["model-training"] },
  }));
  assert.equal(ok.statusCode, 200);
});

test("POST /records/:id/revoke-consent requires a consentId, then revokes it", async () => {
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const consentId = active.consentGrants[0].consentId;

  const missing = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "revoke-consent"],
    body: { reason: "[SYNTHETIC] test" },
  }));
  assert.equal(missing.statusCode, 400);

  const ok = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
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
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const startResponse = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "start-deletion"],
    body: { reason: "[SYNTHETIC] test" },
  }));
  const deletionRequestId = (startResponse.body as { requestId: string }).requestId;

  const missingLink = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
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

  const blocked = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
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

  const done = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
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
    const { fixtureStore, registerStore, mediaStore, active } = await setup();
    // active is "published"/"preserved" — never had start-deletion called.
    const response = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
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
    const { fixtureStore, registerStore, mediaStore, active, expired } = await setup();
    const startOnExpired = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
      method: "POST",
      pathSegments: ["records", expired.record.recordId, "start-deletion"],
      body: { reason: "[SYNTHETIC] test" },
    }));
    const expiredDeletionRequestId = (startOnExpired.body as { requestId: string }).requestId;

    const response = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
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
  const { fixtureStore, registerStore, mediaStore, disputed } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", disputed.record.recordId, "permission-check"],
    body: { purpose: "publication", audience: "public" },
  }));
  assert.equal(response.statusCode, 200);
  assert.equal((response.body as { allowed: boolean }).allowed, false);
});

test("POST /records/:id/permission-check rejects an invalid purpose/audience", async () => {
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "permission-check"],
    body: { purpose: "not-a-purpose", audience: "public" },
  }));
  assert.equal(response.statusCode, 400);
});

test("POST /export runs the real scoped export and excludes denied records", async () => {
  const { fixtureStore, registerStore, mediaStore, active, expired } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
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
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
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
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const conflicting = new AlwaysConflictingRegisterStore(registerStore);
  const response = await routeRequest(fixtureStore, conflicting, mediaStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "withdraw"],
    body: { reason: "[SYNTHETIC] test" },
  }));
  assert.equal(response.statusCode, 409);
});

test(
  "reusing a requestId for a DIFFERENT record returns 409 and leaves the second record untouched (Finding 2)",
  async () => {
    const { fixtureStore, registerStore, mediaStore, active, expired } = await setup();
    const reusedId = "req-reused-across-records";

    const first = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
      method: "POST",
      pathSegments: ["records", active.record.recordId, "withdraw"],
      body: { reason: "[SYNTHETIC] first operation", requestId: reusedId },
    }));
    assert.equal(first.statusCode, 200);
    assert.equal((first.body as { status: string }).status, "completed");

    const second = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
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
    const { fixtureStore, registerStore, mediaStore, active } = await setup();
    const reusedId = "req-reused-same-record-different-payload";

    const first = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
      method: "POST",
      pathSegments: ["records", active.record.recordId, "restrict"],
      body: { reason: "[SYNTHETIC] first", purposes: ["research"], requestId: reusedId },
    }));
    assert.equal(first.statusCode, 200);

    const second = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
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
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const input = { reason: "[SYNTHETIC] replay test", purposes: ["research"], requestId: "req-safe-replay" };

  const first = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "restrict"],
    body: input,
  }));
  const second = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "restrict"],
    body: input,
  }));
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.deepEqual(first.body, second.body, "an exact replay must return the same result, not conflict");
});

test("an unknown route returns 404, not a crash", async () => {
  const { fixtureStore, registerStore, mediaStore } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["not", "a", "real", "route"],
  }));
  assert.equal(response.statusCode, 404);
});

test("an unknown action under /records/:id returns 404", async () => {
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "not-a-real-action"],
  }));
  assert.equal(response.statusCode, 404);
});

test("GET /records/:id/media/:mediaId requires purpose and audience query params", async () => {
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", active.record.recordId, "media", active.record.mediaRefs[0].mediaId],
  }));
  assert.equal(response.statusCode, 400);
});

test("GET /records/:id/media/:mediaId returns the exact bytes as a base64 binary body when allowed", async () => {
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const textMedia = active.record.mediaRefs[0];
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
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
  const { fixtureStore, registerStore, mediaStore, disputed } = await setup();
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

  const response = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", disputed.record.recordId, "media", "disputed-media"],
    queryParams: { purpose: "publication", audience: "public" },
  }));
  assert.equal(response.statusCode, 403);
  assert.equal(response.binary, undefined, "a denial must never carry a binary payload");
  assert.match((response.body as { error: string }).error, /disputed/i);
});

test("GET /records/:id/media/:mediaId returns 409 for a legacy reference with no bound version", async () => {
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
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

  const response = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", active.record.recordId, "media", "legacy-media"],
    queryParams: { purpose: "publication", audience: "public" },
  }));
  assert.equal(response.statusCode, 409);
  assert.equal(response.binary, undefined);
});

// ------------------------------------------------- versioned correction --

test("POST /records/:id/correct replaces the field, attributes it to the authenticated caller, and preserves history", async () => {
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
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
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const response = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "correct"],
    body: { reason: "[SYNTHETIC] fix", field: "not-a-real-field", correctedValue: "x" },
  }));
  assert.equal(response.statusCode, 400);
});

test("POST /records/:id/dispute-correction marks it disputed without reverting it", async () => {
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "correct"],
    body: { reason: "[SYNTHETIC] fix", field: "title", correctedValue: "[SYNTHETIC] disputed title" },
  }));
  const [correction] = await fixtureStore.listCorrections(active.record.recordId);

  const response = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
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
  const { fixtureStore, registerStore, mediaStore, active, disputed } = await setup();
  await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "correct"],
    body: { reason: "[SYNTHETIC] fix", field: "summary", correctedValue: "[SYNTHETIC] corrected" },
  }));

  const allowed = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", active.record.recordId],
    queryParams: { purpose: "publication", audience: "public" },
  }));
  const allowedBody = allowed.body as { corrections: unknown[] };
  assert.equal(allowedBody.corrections.length, 1);

  const denied = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
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
  const { fixtureStore, registerStore, mediaStore, active } = await setup();
  const original = (await fixtureStore.getRecord(active.record.recordId))?.summary;

  const redactResponse = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "redact-text"],
    body: { reason: "[SYNTHETIC] sensitive detail", field: "summary" },
  }));
  assert.equal(redactResponse.statusCode, 200);

  const getResponse = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
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
    const { fixtureStore, registerStore, mediaStore, active } = await setup();

    const correctResponse = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
      method: "POST",
      pathSegments: ["records", active.record.recordId, "correct"],
      body: { reason: "[SYNTHETIC] fixing a typo", field: "title", correctedValue: "[SYNTHETIC] corrected title" },
    }));
    assert.equal(correctResponse.statusCode, 200);

    const redactResponse = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
      method: "POST",
      pathSegments: ["records", active.record.recordId, "redact-text"],
      body: { reason: "[SYNTHETIC] sensitive title", field: "title" },
    }));
    assert.equal(redactResponse.statusCode, 200);

    const getResponse = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
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
  const [active] = buildSeedFixtures();
  await bindSeedMedia(mediaStore, active);
  await seedStore(fixtureStore, registerStore, [active]);
  const textMedia = active.record.mediaRefs[0];

  const before = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", active.record.recordId, "media", textMedia.mediaId],
    queryParams: { purpose: "publication", audience: "public" },
  }));
  assert.equal(before.statusCode, 200);

  const redactResponse = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "POST",
    pathSegments: ["records", active.record.recordId, "redact-media"],
    body: { reason: "[SYNTHETIC] sensitive media", mediaId: textMedia.mediaId },
  }));
  assert.equal(redactResponse.statusCode, 200);

  const after = await routeRequest(fixtureStore, registerStore, mediaStore, STAFF_IDENTITY, req({
    method: "GET",
    pathSegments: ["records", active.record.recordId, "media", textMedia.mediaId],
    queryParams: { purpose: "publication", audience: "public" },
  }));
  assert.equal(after.statusCode, 403);
  assert.match((after.body as { error: string }).error, /redacted/i);
});
