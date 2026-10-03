// Storage abstraction for actual media bytes, parallel to FixtureStore/
// RestrictionRegisterStore (store.ts) — a hand-built in-memory fake plus a
// real S3 adapter implementing the same interface, so service-layer logic
// (services/media.ts, lifecycle.ts's media-aware deletion) is exercised
// identically against both. See memoryStore.ts's header for what a
// logic-level fake does and does not prove.
//
// Every object this system writes is addressed by an EXACT key + S3
// VersionId pair — never "latest". A MediaRef (domain/types.ts) pins one
// specific version at approval time; a later re-upload to the same key never
// changes what an already-bound reference serves.
import { createHash } from "node:crypto";

export type MediaObjectVersionEntry = {
  key: string;
  versionId: string;
  isLatest: boolean;
  // S3 delete markers are themselves addressable, versioned entries — they
  // do not remove any prior version's bytes, and removing a delete marker
  // alone does not either (it just "undeletes" back to whatever version was
  // previously current). Full erasure requires deleting every entry this
  // method returns, markers included, by its exact versionId.
  isDeleteMarker: boolean;
  lastModified: string;
};

export type PutObjectResult = { versionId: string; sha256: string; bytes: number };
export type GetObjectResult = { body: Buffer; contentType: string; bytes: number; sha256: string };

export interface MediaStore {
  putObject(key: string, body: Buffer, contentType: string): Promise<PutObjectResult>;
  // The object's real size WITHOUT downloading any of its body — the real
  // adapter uses HeadObject, never GetObject, specifically so a caller can
  // enforce a size cap before ever buffering anything. Returns null if the
  // key/version pair doesn't exist. See services/media.ts and
  // services/export.ts, both of which check this BEFORE calling getObject.
  headObjectSize(key: string, versionId: string): Promise<number | null>;
  // Returns null if the key/version pair doesn't exist (never found) — never
  // throws for a plain not-found, so callers can fail closed deliberately.
  // Buffers the FULL object — callers that need a size cap must check
  // headObjectSize first, not rely on this to reject after the fact.
  getObject(key: string, versionId: string): Promise<GetObjectResult | null>;
  // All versions AND delete markers for this exact key, oldest-version-safe
  // (the real adapter paginates internally — S3 caps ListObjectVersions
  // pages — so callers always get the complete list in one call).
  listObjectVersions(key: string): Promise<MediaObjectVersionEntry[]>;
  // Permanently removes ONE exact version or delete marker. Never a bare
  // key-level delete (which would only ADD a new delete marker in S3,
  // leaving every byte of every prior version fully intact) — always scoped
  // to a specific versionId.
  deleteObjectVersion(key: string, versionId: string): Promise<void>;
}

function sha256Of(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

type StoredVersion = {
  versionId: string;
  body: Buffer;
  contentType: string;
  lastModified: string;
  isDeleteMarker: false;
};

// Logic-level fake — proves the media-retrieval/deletion SERVICE logic
// (services/media.ts, lifecycle.ts's purge step) is correct against this
// interface. Does NOT prove real S3 ConditionExpression/ListObjectVersions
// pagination/DeleteMarker wire behavior — that needs the real adapter below,
// exercised against a live bucket.
export class InMemoryMediaStore implements MediaStore {
  private versions = new Map<string, StoredVersion[]>();
  private counter = 0;

  async putObject(key: string, body: Buffer, contentType: string): Promise<PutObjectResult> {
    const sha256 = sha256Of(body);
    this.counter += 1;
    const versionId = `fake-v${this.counter}`;
    const list = this.versions.get(key) ?? [];
    list.push({ versionId, body: Buffer.from(body), contentType, lastModified: new Date().toISOString(), isDeleteMarker: false });
    this.versions.set(key, list);
    return { versionId, sha256, bytes: body.length };
  }

  async headObjectSize(key: string, versionId: string): Promise<number | null> {
    const entry = (this.versions.get(key) ?? []).find((v) => v.versionId === versionId);
    return entry ? entry.body.length : null;
  }

  async getObject(key: string, versionId: string): Promise<GetObjectResult | null> {
    const entry = (this.versions.get(key) ?? []).find((v) => v.versionId === versionId);
    if (!entry) return null;
    return { body: Buffer.from(entry.body), contentType: entry.contentType, bytes: entry.body.length, sha256: sha256Of(entry.body) };
  }

  async listObjectVersions(key: string): Promise<MediaObjectVersionEntry[]> {
    const list = this.versions.get(key) ?? [];
    return list.map((v, i) => ({
      key,
      versionId: v.versionId,
      isLatest: i === list.length - 1,
      isDeleteMarker: v.isDeleteMarker,
      lastModified: v.lastModified,
    }));
  }

  async deleteObjectVersion(key: string, versionId: string): Promise<void> {
    const list = this.versions.get(key);
    if (!list) return;
    this.versions.set(key, list.filter((v) => v.versionId !== versionId));
  }
}
