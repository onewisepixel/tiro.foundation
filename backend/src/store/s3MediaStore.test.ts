// Unit-level proof of S3MediaStore's ListObjectVersions PAGINATION loop —
// the one piece of real-S3 wire behavior that can't be exercised by the
// in-memory fake (mediaStore.test.ts) and that a small live-drill fixture
// set (a handful of versions) never forces into a second page either. This
// test fakes the S3Client's send() to return two truncated pages, proving
// the loop actually follows NextKeyMarker/NextVersionIdMarker rather than
// stopping after the first page.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { S3MediaStore } from "./s3MediaStore";

function fakeClient(send: (command: unknown) => Promise<unknown>): S3Client {
  return { send } as unknown as S3Client;
}

test("listObjectVersions follows pagination across multiple truncated pages", async () => {
  let call = 0;
  const client = fakeClient(async (command) => {
    assert.ok(command instanceof ListObjectVersionsCommand);
    call += 1;
    if (call === 1) {
      assert.equal((command as ListObjectVersionsCommand).input.KeyMarker, undefined);
      return {
        Versions: [{ Key: "k", VersionId: "v1", IsLatest: false, LastModified: new Date("2026-01-01") }],
        DeleteMarkers: [],
        IsTruncated: true,
        NextKeyMarker: "k",
        NextVersionIdMarker: "v1",
      };
    }
    if (call === 2) {
      assert.equal((command as ListObjectVersionsCommand).input.KeyMarker, "k");
      assert.equal((command as ListObjectVersionsCommand).input.VersionIdMarker, "v1");
      return {
        Versions: [{ Key: "k", VersionId: "v2", IsLatest: false, LastModified: new Date("2026-01-02") }],
        DeleteMarkers: [{ Key: "k", VersionId: "v3-marker", IsLatest: true, LastModified: new Date("2026-01-03") }],
        IsTruncated: false,
      };
    }
    throw new Error("unexpected third page request");
  });

  const store = new S3MediaStore({ client, bucketName: "fake-bucket" });
  const entries = await store.listObjectVersions("k");

  assert.equal(call, 2, "must have followed the truncated first page to fetch the second");
  assert.equal(entries.length, 3);
  assert.deepEqual(
    entries.map((e) => [e.versionId, e.isDeleteMarker]),
    [
      ["v1", false],
      ["v2", false],
      ["v3-marker", true],
    ],
  );
});

test("listObjectVersions filters out entries for a different key that merely shares the prefix", async () => {
  const client = fakeClient(async () => ({
    Versions: [
      { Key: "k", VersionId: "v1", IsLatest: true, LastModified: new Date() },
      { Key: "k-other-sibling", VersionId: "v-sibling", IsLatest: true, LastModified: new Date() },
    ],
    DeleteMarkers: [],
    IsTruncated: false,
  }));
  const store = new S3MediaStore({ client, bucketName: "fake-bucket" });
  const entries = await store.listObjectVersions("k");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].versionId, "v1");
});

test("getObject returns null, not a throw, on a NoSuchKey-shaped error", async () => {
  const client = fakeClient(async (command) => {
    assert.ok(command instanceof GetObjectCommand);
    const error = new Error("not found");
    error.name = "NoSuchKey";
    throw error;
  });
  const store = new S3MediaStore({ client, bucketName: "fake-bucket" });
  assert.equal(await store.getObject("k", "v1"), null);
});

test("putObject throws a clear error if the bucket unexpectedly returns no VersionId (not versioned)", async () => {
  const client = fakeClient(async (command) => {
    assert.ok(command instanceof PutObjectCommand);
    return {};
  });
  const store = new S3MediaStore({ client, bucketName: "fake-bucket" });
  await assert.rejects(() => store.putObject("k", Buffer.from("x"), "text/plain"), /VersionId/);
});

test("deleteObjectVersion sends an exact Key+VersionId delete, not a bare key-level delete", async () => {
  let captured: DeleteObjectCommand | undefined;
  const client = fakeClient(async (command) => {
    captured = command as DeleteObjectCommand;
    return {};
  });
  const store = new S3MediaStore({ client, bucketName: "fake-bucket" });
  await store.deleteObjectVersion("k", "v1");
  assert.equal(captured?.input.Key, "k");
  assert.equal(captured?.input.VersionId, "v1");
});
