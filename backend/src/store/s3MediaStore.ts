// Real AWS adapter for MediaStore (mediaStore.ts). Mirrors dynamoStore.ts's
// relationship to memoryStore.ts: same interface, exercised against the
// in-memory fake in most tests, but only this file proves real S3 wire
// behavior (ListObjectVersions pagination, delete markers, VersionId
// semantics) — see docs/backend/evidence-matrix.md for what's actually been
// run against a live bucket versus type-checked only.
import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { GetObjectResult, MediaObjectVersionEntry, MediaStore, PutObjectResult } from "./mediaStore";

export type S3MediaStoreConfig = {
  client: S3Client;
  bucketName: string;
};

function sha256Of(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

export class S3MediaStore implements MediaStore {
  constructor(private readonly config: S3MediaStoreConfig) {}

  async putObject(key: string, body: Buffer, contentType: string): Promise<PutObjectResult> {
    const result = await this.config.client.send(
      new PutObjectCommand({ Bucket: this.config.bucketName, Key: key, Body: body, ContentType: contentType }),
    );
    if (!result.VersionId) {
      // Would mean the bucket isn't actually versioned — every MediaRef
      // binding in this system assumes a real, pinnable VersionId exists.
      throw new Error(`PutObject for "${key}" returned no VersionId — is the bucket versioned?`);
    }
    return { versionId: result.VersionId, sha256: sha256Of(body), bytes: body.length };
  }

  async getObject(key: string, versionId: string): Promise<GetObjectResult | null> {
    try {
      const result = await this.config.client.send(
        new GetObjectCommand({ Bucket: this.config.bucketName, Key: key, VersionId: versionId }),
      );
      const body = Buffer.from(await result.Body!.transformToByteArray());
      return {
        body,
        contentType: result.ContentType ?? "application/octet-stream",
        bytes: body.length,
        sha256: sha256Of(body),
      };
    } catch (error) {
      const name = error instanceof NoSuchKey ? "NoSuchKey" : (error as { name?: string }).name;
      if (name === "NoSuchKey" || name === "NoSuchVersion") {
        return null;
      }
      throw error;
    }
  }

  async listObjectVersions(key: string): Promise<MediaObjectVersionEntry[]> {
    const entries: MediaObjectVersionEntry[] = [];
    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;
    // S3 caps each ListObjectVersions page (1000 keys worth of entries) —
    // loop until IsTruncated is false so callers always get the complete
    // list for this key, not just its first page.
    do {
      const result = await this.config.client.send(
        new ListObjectVersionsCommand({
          Bucket: this.config.bucketName,
          Prefix: key,
          KeyMarker: keyMarker,
          VersionIdMarker: versionIdMarker,
        }),
      );
      for (const v of result.Versions ?? []) {
        // Prefix is a PREFIX match, not exact — guard against a sibling key
        // that merely starts with this one (defensive; mediaId-derived keys
        // shouldn't collide this way, but the filter is free).
        if (v.Key === key && v.VersionId) {
          entries.push({
            key,
            versionId: v.VersionId,
            isLatest: v.IsLatest ?? false,
            isDeleteMarker: false,
            lastModified: v.LastModified?.toISOString() ?? "",
          });
        }
      }
      for (const m of result.DeleteMarkers ?? []) {
        if (m.Key === key && m.VersionId) {
          entries.push({
            key,
            versionId: m.VersionId,
            isLatest: m.IsLatest ?? false,
            isDeleteMarker: true,
            lastModified: m.LastModified?.toISOString() ?? "",
          });
        }
      }
      keyMarker = result.IsTruncated ? result.NextKeyMarker : undefined;
      versionIdMarker = result.IsTruncated ? result.NextVersionIdMarker : undefined;
    } while (keyMarker !== undefined || versionIdMarker !== undefined);
    return entries;
  }

  async deleteObjectVersion(key: string, versionId: string): Promise<void> {
    // DeleteObject with an explicit VersionId permanently removes that exact
    // version or delete marker — S3's idempotent-delete semantics mean
    // calling this again for an already-gone version is a harmless no-op,
    // not an error, so retries after a partial purge are always safe.
    await this.config.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucketName, Key: key, VersionId: versionId }),
    );
  }
}
