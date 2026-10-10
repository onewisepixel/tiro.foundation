import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryFixtureStore, InMemoryIntakeRegisterCommitter, InMemoryRestrictionRegisterStore } from "../store/memoryStore";
import { InMemoryMediaStore } from "../store/mediaStore";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import type { FixtureStore } from "../store/store";
import { routeRequest } from "../api/router";
import { setCursorSecretKey } from "../services/cursorCodec";
import {
  cleanupDrillFixtures,
  idempotentPost,
  retryOnServerError,
  walkPublicListing,
  type HttpResult,
} from "./publicDrillSupport";

setCursorSecretKey("test-only-fixed-cursor-key-never-used-in-production");

// Routes a drill-style path ("/public/records?limit=50&cursor=...") through
// the REAL router, so walkPublicListing is exercised against the actual
// response shape readPublicListing/router.ts produce — not a hand-written
// imitation of it.
function routerGet(fixtureStore: FixtureStore, registerStore: InMemoryRestrictionRegisterStore) {
  const mediaStore = new InMemoryMediaStore();
  const intakeCommitter = new InMemoryIntakeRegisterCommitter(fixtureStore as InMemoryFixtureStore, registerStore);
  return async (path: string): Promise<HttpResult> => {
    const url = new URL(path, "https://example.invalid");
    const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, "public:anonymous", {
      method: "GET",
      pathSegments: url.pathname.split("/").filter(Boolean),
      queryParams: Object.fromEntries(url.searchParams),
      body: undefined,
    });
    return { status: response.statusCode, json: response.body };
  };
}

// Reviewer's exact reproduction: one allowed record fails evaluation,
// another allowed record succeeds — the real API answers 200 with
// hadFailures: true and nextCursor: null. The failed record must NOT be
// reported absent.
test("walkPublicListing reports a failed-to-evaluate record as inconclusive, never absent, when another record on the page succeeds", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [failing] = buildSeedFixtures();
  const [succeeding] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [failing, succeeding]);
  const failingStore = new Proxy(fixtureStore, {
    get(target, prop, receiver) {
      if (prop === "getRecord") {
        return (recordId: string) =>
          recordId === failing.record.recordId
            ? Promise.reject(new Error("simulated ProvisionedThroughputExceededException"))
            : target.getRecord(recordId);
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const get = routerGet(failingStore, registerStore);

  const firstPage = await get("/public/records?limit=50");
  const body = firstPage.json as { items: { recordId: string }[]; nextCursor: string | null; hadFailures: boolean };
  assert.equal(firstPage.status, 200, "precondition: the API itself answers 200, not 503, for a PARTIAL failure");
  assert.equal(body.hadFailures, true);
  assert.equal(body.nextCursor, null);
  assert.deepEqual(body.items.map((i) => i.recordId), [succeeding.record.recordId]);

  const failedOutcome = await walkPublicListing(get, failing.record.recordId);
  assert.equal(failedOutcome.kind, "inconclusive");

  // Presence stays positive evidence even on a page with failures.
  const presentOutcome = await walkPublicListing(get, succeeding.record.recordId);
  assert.deepEqual(presentOutcome, { kind: "present" });
});

test("walkPublicListing reports absent only when every page explicitly reports hadFailures: false", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const [allowed] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [allowed]);
  const outcome = await walkPublicListing(routerGet(fixtureStore, registerStore), "never-existed");
  assert.deepEqual(outcome, { kind: "absent" });
});

test("walkPublicListing treats a missing hadFailures field, a non-200, and an exhausted page bound as inconclusive", async () => {
  const noField = await walkPublicListing(async () => ({ status: 200, json: { items: [], nextCursor: null } }), "x");
  assert.equal(noField.kind, "inconclusive");

  const unavailable = await walkPublicListing(async () => ({ status: 503, json: { error: "x" } }), "x");
  assert.equal(unavailable.kind, "inconclusive");

  const endless = await walkPublicListing(async () => ({ status: 200, json: { items: [], nextCursor: "more", hadFailures: false } }), "x", { maxPages: 3 });
  assert.equal(endless.kind, "inconclusive");
});

test("retryOnServerError retries 500/503 and returns (never throws) the last failure after maxAttempts", async () => {
  let calls = 0;
  const result = await retryOnServerError(
    async () => {
      calls++;
      return { status: calls % 2 === 0 ? 500 : 503, json: null };
    },
    { maxAttempts: 4, sleep: async () => {} },
  );
  assert.equal(calls, 4);
  assert.equal(result.status, 500);

  let otherCalls = 0;
  const notRetried = await retryOnServerError(
    async () => {
      otherCalls++;
      return { status: 409, json: null };
    },
    { sleep: async () => {} },
  );
  assert.equal(notRetried.status, 409);
  assert.equal(otherCalls, 1, "a 4xx is returned immediately, never retried");
});

test("idempotentPost sends the SAME requestId on every retry attempt, and respects a caller-supplied one", async () => {
  const sentIds: unknown[] = [];
  let attempts = 0;
  await idempotentPost(
    async (body) => {
      sentIds.push(body.requestId);
      attempts++;
      return { status: attempts < 3 ? 503 : 200, json: { status: "completed" } };
    },
    { reason: "[SYNTHETIC] test" },
    (fn) => retryOnServerError(fn, { sleep: async () => {} }),
  );
  assert.equal(sentIds.length, 3);
  assert.equal(typeof sentIds[0], "string");
  assert.ok(sentIds.every((id) => id === sentIds[0]), "every attempt must carry the same requestId");

  const supplied: unknown[] = [];
  await idempotentPost(async (body) => {
    supplied.push(body.requestId);
    return { status: 200, json: null };
  }, { reason: "x", requestId: "caller-chosen" });
  assert.deepEqual(supplied, ["caller-chosen"]);
});

test("idempotentPost's stable requestId makes a retry after a lost response an idempotent replay against the real router, not a second request", async () => {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const mediaStore = new InMemoryMediaStore();
  const intakeCommitter = new InMemoryIntakeRegisterCommitter(fixtureStore, registerStore);
  const [active] = buildSeedFixtures();
  await seedStore(fixtureStore, registerStore, [active]);
  const recordId = active.record.recordId;
  const controlBefore = (await registerStore.getCurrent(recordId))!.controlVersion;

  let attempts = 0;
  const result = await idempotentPost(
    async (body) => {
      attempts++;
      const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, "staff:test@example.invalid", {
        method: "POST",
        pathSegments: ["records", recordId, "withdraw"],
        queryParams: {},
        body,
      });
      // First attempt commits, but its response is "lost" as a 500.
      return attempts === 1 ? { status: 500, json: null } : { status: response.statusCode, json: response.body };
    },
    { reason: "[SYNTHETIC] withdraw" },
    (fn) => retryOnServerError(fn, { sleep: async () => {} }),
  );
  assert.equal(attempts, 2);
  assert.equal(result.status, 200);
  assert.equal((result.json as { status: string }).status, "completed");
  assert.equal(
    (await registerStore.getCurrent(recordId))!.controlVersion,
    controlBefore + 1,
    "the replay must not apply the withdrawal a second time",
  );
});

function fakeStaffApi(state: Record<string, { status: number; publication?: string }>, withdrawResult: (id: string) => HttpResult) {
  const posts: string[] = [];
  return {
    posts,
    deps: {
      post: async (path: string) => {
        const id = path.split("/")[2];
        posts.push(id);
        const result = withdrawResult(id);
        if (result.status === 200 && state[id]) state[id].publication = "withdrawn";
        return result;
      },
      get: async (path: string) => {
        const id = path.split("/")[2].split("?")[0];
        const s = state[id];
        return s.status === 404
          ? { status: 404, json: { error: "gone" } }
          : { status: 200, json: { control: { currentPublicationStatus: s.publication } } };
      },
    },
  };
}

test("cleanupDrillFixtures reports throttled withdrawals as unresolved instead of finishing silently", async () => {
  const state = {
    ok: { status: 200, publication: "published" },
    throttled: { status: 200, publication: "published" },
    gone: { status: 404 },
  };
  const api = fakeStaffApi(state, (id) =>
    id === "throttled" ? { status: 503, json: { error: "throttled" } } : { status: 200, json: { status: "completed" } },
  );
  const result = await cleanupDrillFixtures(["ok", "throttled", "gone"], api.deps);
  assert.deepEqual(result.resolved, [
    { recordId: "ok", how: "withdrawn" },
    { recordId: "gone", how: "already-deleted" },
  ]);
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.unresolved[0].recordId, "throttled");
  assert.match(result.unresolved[0].reason, /503/);
  assert.deepEqual(api.posts, ["ok", "throttled"], "an already-deleted record is not withdrawn");
});

test("cleanupDrillFixtures requires lifecycle completion AND a withdrawn read-back, not just HTTP 200", async () => {
  const state = { denied: { status: 200, publication: "published" }, stale: { status: 200, publication: "published" } };
  const api = {
    post: async (path: string) =>
      path.includes("denied")
        ? { status: 200, json: { status: "denied" } }
        : { status: 200, json: { status: "completed" } }, // claims success but state never changes
    get: async (path: string) => ({ status: 200, json: { control: { currentPublicationStatus: state[path.includes("denied") ? "denied" : "stale"].publication } } }),
  };
  const result = await cleanupDrillFixtures(["denied", "stale"], api);
  assert.equal(result.resolved.length, 0);
  assert.deepEqual(result.unresolved.map((u) => u.recordId), ["denied", "stale"]);
});

test("cleanupDrillFixtures reports a thrown error per fixture and keeps going", async () => {
  const result = await cleanupDrillFixtures(["a", "b"], {
    post: async () => ({ status: 200, json: { status: "completed" } }),
    get: async (path) => {
      if (path.includes("/a?")) throw new Error("network down");
      return { status: 404, json: null };
    },
  });
  assert.deepEqual(result.resolved, [{ recordId: "b", how: "already-deleted" }]);
  assert.deepEqual(result.unresolved.map((u) => u.recordId), ["a"]);
});
