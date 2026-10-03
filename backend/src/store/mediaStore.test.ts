import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { InMemoryMediaStore } from "./mediaStore";

function sha256(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

test("putObject computes a real SHA-256 from the exact bytes, not a placeholder", async () => {
  const store = new InMemoryMediaStore();
  const body = Buffer.from("[SYNTHETIC] test content");
  const result = await store.putObject("fixtures/test/a.txt", body, "text/plain");
  assert.equal(result.sha256, sha256(body));
  assert.equal(result.bytes, body.length);
  assert.ok(result.versionId);
});

test("getObject returns the exact version's bytes, verified by a fresh hash on retrieval", async () => {
  const store = new InMemoryMediaStore();
  const body = Buffer.from("[SYNTHETIC] content for retrieval check");
  const { versionId } = await store.putObject("fixtures/test/b.txt", body, "text/plain");
  const result = await store.getObject("fixtures/test/b.txt", versionId);
  assert.ok(result);
  assert.deepEqual(result?.body, body);
  assert.equal(result?.sha256, sha256(body));
});

test("getObject returns null (never throws) for an unknown key or version", async () => {
  const store = new InMemoryMediaStore();
  assert.equal(await store.getObject("fixtures/test/missing.txt", "v1"), null);
  await store.putObject("fixtures/test/c.txt", Buffer.from("x"), "text/plain");
  assert.equal(await store.getObject("fixtures/test/c.txt", "not-a-real-version"), null);
});

test("re-uploading the same key produces a SECOND version while the first remains independently retrievable", async () => {
  const store = new InMemoryMediaStore();
  const key = "fixtures/test/two-versions.bin";
  const v1Body = Buffer.from("[SYNTHETIC] version one");
  const v2Body = Buffer.from("[SYNTHETIC] version two, different bytes");
  const v1 = await store.putObject(key, v1Body, "application/octet-stream");
  const v2 = await store.putObject(key, v2Body, "application/octet-stream");
  assert.notEqual(v1.versionId, v2.versionId);

  const versions = await store.listObjectVersions(key);
  assert.equal(versions.length, 2);
  assert.equal(versions.find((v) => v.versionId === v1.versionId)?.isLatest, false);
  assert.equal(versions.find((v) => v.versionId === v2.versionId)?.isLatest, true);

  // The OLD version is still fetchable by its own versionId — pinning means
  // a reference bound to v1 keeps serving v1's exact bytes regardless of v2.
  const fetchedV1 = await store.getObject(key, v1.versionId);
  assert.deepEqual(fetchedV1?.body, v1Body);
});

test("deleteObjectVersion permanently removes exactly that version, leaving others untouched", async () => {
  const store = new InMemoryMediaStore();
  const key = "fixtures/test/delete-one.txt";
  const v1 = await store.putObject(key, Buffer.from("v1"), "text/plain");
  const v2 = await store.putObject(key, Buffer.from("v2"), "text/plain");

  await store.deleteObjectVersion(key, v1.versionId);

  assert.equal(await store.getObject(key, v1.versionId), null);
  assert.ok(await store.getObject(key, v2.versionId));
  assert.equal((await store.listObjectVersions(key)).length, 1);
});

test("deleting every version leaves the key with an empty version list — full erasure, not a soft delete", async () => {
  const store = new InMemoryMediaStore();
  const key = "fixtures/test/full-erase.txt";
  const v1 = await store.putObject(key, Buffer.from("v1"), "text/plain");
  const v2 = await store.putObject(key, Buffer.from("v2"), "text/plain");

  for (const v of await store.listObjectVersions(key)) {
    await store.deleteObjectVersion(key, v.versionId);
  }

  assert.deepEqual(await store.listObjectVersions(key), []);
  assert.equal(await store.getObject(key, v1.versionId), null);
  assert.equal(await store.getObject(key, v2.versionId), null);
});

test("deleteObjectVersion on an already-gone version is a harmless no-op, not an error — safe to retry", async () => {
  const store = new InMemoryMediaStore();
  const key = "fixtures/test/idempotent-delete.txt";
  const v1 = await store.putObject(key, Buffer.from("v1"), "text/plain");
  await store.deleteObjectVersion(key, v1.versionId);
  await assert.doesNotReject(() => store.deleteObjectVersion(key, v1.versionId));
});
