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
import { evaluatePermissionSnapshot } from "./permissions";

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

// The real byte-serving logic — bounded HEAD-before-GET size check,
// fetch, checksum verification — extracted so it has exactly one
// implementation shared by both authorization gates below: the normal,
// evaluatePermission-gated fetchAuthorizedMedia, and the intake-review-
// scoped fetchIntakeMedia (needed once quarantine became an unconditional
// deny in evaluatePermission — see permissions.ts — which otherwise left
// a reviewer with no way to ever preview an upload before approving it).
async function fetchMediaBytes(
  mediaStore: MediaStore,
  media: FixtureRecord["mediaRefs"][number],
): Promise<MediaFetchResult> {
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

  // Bounded read: ask the REAL size via a bodyless HEAD before ever calling
  // getObject, which buffers the entire object into memory. Our own
  // recorded `media.bytes` is trusted metadata we wrote ourselves, but
  // trusting it alone would mean a drifted or tampered real object could
  // still get fully buffered before the (then-too-late) size check below —
  // a real memory-exhaustion vector a reviewer caught. HeadObject transfers
  // no body at all, so this check is bounded regardless of the real size.
  const actualSize = await mediaStore.headObjectSize(media.objectKey, media.versionId);
  if (actualSize === null) {
    return { ok: false, statusCode: 404, reason: "The bound media version no longer exists in storage." };
  }
  if (actualSize > MAX_MEDIA_BYTES) {
    return {
      ok: false,
      statusCode: 413,
      reason: `Stored object is ${actualSize} bytes, exceeding the ${MAX_MEDIA_BYTES}-byte retrieval cap — refusing to buffer it.`,
    };
  }

  const object = await mediaStore.getObject(media.objectKey, media.versionId);
  if (!object) {
    return { ok: false, statusCode: 404, reason: "The bound media version no longer exists in storage." };
  }
  // Belt-and-suspenders: confirm what was actually buffered still matches
  // the bounded HEAD check above (should always hold barring a concurrent
  // overwrite of the exact same immutable version, which S3 versioning
  // makes essentially impossible — this is a consistency assertion, not
  // the primary enforcement point).
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

export async function fetchAuthorizedMedia(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  mediaStore: MediaStore,
  query: MediaFetchQuery,
  // Server-side policy only (publicView.ts's fetchPublicMedia sets it) —
  // never derived from request input.
  options: { requireSynthetic?: boolean } = {},
): Promise<MediaFetchResult> {
  const now = query.now ?? new Date();

  // The scoped permission check runs FIRST, exactly as it does for a record
  // detail read — a denial here means no bytes, no reason to even look at
  // the media store. Passing mediaId here also enforces redactMedia()'s
  // hard override (services/lifecycle.ts) — a redacted object denies even
  // when the record's own purpose/audience would otherwise fully allow it.
  // Read-once: the MediaRef (pinned versionId and checksum) is selected
  // from the SAME record snapshot this decision judged — no second
  // getRecord, so a record changed after the decision can't supply a
  // different reference than the one that was authorized.
  const { decision, record } = await evaluatePermissionSnapshot(fixtureStore, registerStore, {
    recordId: query.recordId,
    purpose: query.purpose,
    audience: query.audience,
    now,
    mediaId: query.mediaId,
  });
  if (!decision.allowed) {
    return { ok: false, statusCode: 403, reason: decision.reason };
  }
  // Unreachable while an allowed decision always carries its record, but
  // fails closed rather than trusting that.
  if (!record) {
    return { ok: false, statusCode: 404, reason: "Record not found." };
  }
  if (options.requireSynthetic && !record.isSynthetic) {
    return { ok: false, statusCode: 404, reason: "Not found." };
  }
  const media = findMediaRef(record, query.mediaId);
  if (!media) {
    return { ok: false, statusCode: 404, reason: `No media "${query.mediaId}" on this record.` };
  }

  return fetchMediaBytes(mediaStore, media);
}

export type IntakeMediaFetchQuery = { recordId: string; mediaId: string };

// Authorized by nothing more than "authenticated staff" (API Gateway's
// Cognito authorizer, checked before this ever runs) — explicitly NOT by
// evaluatePermission, and explicitly NOT because a consent grant exists:
// there can't be a VERIFIED one yet, verifying is the point of review. The
// three things actually enforced here are the same three
// `GET /intake/:recordId` enforces (router.ts): the record must be
// isSynthetic, must still be exactly "quarantined" (404 for anything else
// — once approved, the normal evaluatePermission-gated route is the right
// one), and must not be "withdrawn" (rejection is terminal). Redaction
// still applies even here — redactedMediaIds is a hard override
// independent of every other consideration (permissions.ts's own
// docstring), and this bypass-adjacent route is not an exception to that.
export async function fetchIntakeMedia(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  mediaStore: MediaStore,
  query: IntakeMediaFetchQuery,
): Promise<MediaFetchResult> {
  const control = await registerStore.getCurrent(query.recordId);
  if (!control || control.currentCustodyStatus !== "quarantined" || control.currentPublicationStatus === "withdrawn") {
    return { ok: false, statusCode: 404, reason: `No quarantined submission with id "${query.recordId}".` };
  }
  const record = await fixtureStore.getRecord(query.recordId);
  if (!record || !record.isSynthetic) {
    return { ok: false, statusCode: 404, reason: `No quarantined submission with id "${query.recordId}".` };
  }
  if (control.redactedMediaIds?.includes(query.mediaId)) {
    return { ok: false, statusCode: 403, reason: `Media ${query.mediaId} has been redacted.` };
  }
  const media = findMediaRef(record, query.mediaId);
  if (!media) {
    return { ok: false, statusCode: 404, reason: `No media "${query.mediaId}" on this record.` };
  }

  return fetchMediaBytes(mediaStore, media);
}
