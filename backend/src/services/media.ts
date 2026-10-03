// Authenticated media retrieval per docs/ethos.txt §3.10/§12 and the
// reviewer's instruction that Cognito authentication never substitutes for
// evaluatePermission — exactly the same rule permissions.ts and router.ts
// enforce for record/evidence reads applies here too. A denied request gets
// no bytes and no reusable download capability (no presigned URL is ever
// issued) — every fetch re-runs the full scoped check against the LIVE
// register, so access revoked a second after this would deny the very next
// fetch, not just future ones that happen to re-check.
import type { ConsentGrant, FixtureRecord, Purpose } from "../domain/types";
import type { FixtureStore, RestrictionRegisterStore } from "../store/store";
import type { MediaStore } from "../store/mediaStore";
import { evaluatePermission } from "./permissions";

// Enforced BEFORE any attempt to fetch/buffer the object, from the
// MediaRef's own recorded size (bytes we measured ourselves at upload time —
// see fixtures/media.ts / services/export.ts's import path), not from a
// separate round-trip. Keeps a maliciously or mistakenly oversized reference
// from ever reaching a full S3 GetObject.
export const MAX_MEDIA_BYTES = 256 * 1024;

export type MediaFetchQuery = {
  recordId: string;
  mediaId: string;
  purpose: Purpose;
  audience: ConsentGrant["audience"];
  now?: Date;
};

export type MediaFetchResult =
  | { ok: true; body: Buffer; contentType: string; bytes: number }
  | { ok: false; statusCode: 403 | 404 | 409 | 413 | 500; reason: string };

export function findMediaRef(record: FixtureRecord, mediaId: string) {
  return record.mediaRefs.find((m) => m.mediaId === mediaId) ?? null;
}

export async function fetchAuthorizedMedia(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  mediaStore: MediaStore,
  query: MediaFetchQuery,
): Promise<MediaFetchResult> {
  const now = query.now ?? new Date();

  // The scoped permission check runs FIRST, exactly as it does for a record
  // detail read — a denial here means no bytes, no reason to even look at
  // the media store.
  const decision = await evaluatePermission(fixtureStore, registerStore, {
    recordId: query.recordId,
    purpose: query.purpose,
    audience: query.audience,
    now,
  });
  if (!decision.allowed) {
    return { ok: false, statusCode: 403, reason: decision.reason };
  }

  const record = await fixtureStore.getRecord(query.recordId);
  if (!record) {
    return { ok: false, statusCode: 404, reason: "Record not found." };
  }
  const media = findMediaRef(record, query.mediaId);
  if (!media) {
    return { ok: false, statusCode: 404, reason: `No media "${query.mediaId}" on this record.` };
  }

  // Fail closed for anything not bound to a real, pinned S3 version — never
  // guess "latest", never serve a legacy reference that predates version
  // binding. See domain/types.ts's MediaRef.versionId comment.
  if (!media.versionId) {
    return {
      ok: false,
      statusCode: 409,
      reason: "This media reference has no bound S3 version (legacy, pre-migration) and cannot be retrieved until it is re-uploaded and rebound.",
    };
  }

  if (media.bytes > MAX_MEDIA_BYTES) {
    return {
      ok: false,
      statusCode: 413,
      reason: `Media is ${media.bytes} bytes, exceeding the ${MAX_MEDIA_BYTES}-byte retrieval cap.`,
    };
  }

  const object = await mediaStore.getObject(media.objectKey, media.versionId);
  if (!object) {
    return { ok: false, statusCode: 404, reason: "The bound media version no longer exists in storage." };
  }
  // Defense in depth: our own recorded `bytes` is what gated above, before
  // any buffering happened; re-checking the ACTUALLY retrieved size catches
  // any drift between that recorded metadata and reality.
  if (object.bytes > MAX_MEDIA_BYTES) {
    return {
      ok: false,
      statusCode: 413,
      reason: `Retrieved object is ${object.bytes} bytes, exceeding the ${MAX_MEDIA_BYTES}-byte retrieval cap.`,
    };
  }
  if (object.sha256 !== media.checksumSha256) {
    return {
      ok: false,
      statusCode: 500,
      reason: "Checksum mismatch between the bound reference and the retrieved object; refusing to serve possibly-tampered content.",
    };
  }

  return { ok: true, body: object.body, contentType: object.contentType, bytes: object.bytes };
}
