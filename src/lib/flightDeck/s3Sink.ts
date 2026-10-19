// The production protective event log: an S3 bucket with versioning and
// Object Lock (deploy/flight-deck/flight-deck.template.json).
//
// Every event is created with `If-None-Match: *`, so an existing object is
// never overwritten: a second writer for the same sequence number gets 412
// and its transaction is rolled back (SinkConflict -> RecoveryRequired).
// The bucket's default Object Lock retention (governance mode) protects
// each version from deletion for the retention period; the app's role has
// no delete or bypass permission. Checksums are sent with every upload,
// which S3 requires for Object Lock buckets.
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";
import { eventKey, SinkConflict, SinkUnavailable, type ProtectiveEvent, type ProtectiveSink } from "./protective";

const FENCE = "checkpoints/fence.json";

export type S3SinkConfig = {
  bucket: string;
  region: string;
  prefix?: string;
  // Only for S3-compatible test endpoints (and the local rehearsal).
  endpoint?: string;
};

const status = (e: unknown) => (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
const name = (e: unknown) => (e as { name?: string })?.name;

// Bounds each call, retries included, well inside the database's 15-second
// idle-in-transaction limit (postgres/pool.ts): a hung S3 request ends as
// SinkUnavailable and a rolled-back action, not a transaction killed by the
// server. A timed-out append may still have landed; that leaves the log
// ahead of the database, which the recovery gate detects and replays.
export const S3_CALL_TIMEOUT_MS = 5_000;
const bounded = () => ({ abortSignal: AbortSignal.timeout(S3_CALL_TIMEOUT_MS) });

export class S3ProtectiveSink implements ProtectiveSink {
  readonly label: string;
  private readonly client: S3Client;
  private readonly prefix: string;

  constructor(
    private readonly config: S3SinkConfig,
    clientConfig: Partial<S3ClientConfig> = {},
  ) {
    this.prefix = (config.prefix ?? "flight-deck/").replace(/^\/+/, "");
    this.label = `s3://${config.bucket}/${this.prefix}`;
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
      maxAttempts: 3,
      ...clientConfig,
    });
  }

  private key(k: string) {
    return `${this.prefix}${k}`;
  }

  async append(e: ProtectiveEvent): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: this.key(eventKey(e.seq)),
          Body: JSON.stringify(e),
          ContentType: "application/json",
          IfNoneMatch: "*",
          ChecksumAlgorithm: "SHA256",
        }),
        bounded(),
      );
    } catch (err) {
      // 412: an object already exists at this key. 409: a concurrent
      // conditional write to the same key is in progress.
      if (status(err) === 412 || status(err) === 409 || name(err) === "PreconditionFailed") {
        throw new SinkConflict(e.seq);
      }
      throw new SinkUnavailable();
    }
  }

  async read(seq: number): Promise<ProtectiveEvent | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: this.key(eventKey(seq)) }), bounded());
      const text = await res.Body?.transformToString("utf8");
      return text ? (JSON.parse(text) as ProtectiveEvent) : null;
    } catch (err) {
      if (status(err) === 404 || name(err) === "NoSuchKey") {
        return null;
      }
      throw new SinkUnavailable();
    }
  }

  async listAfter(after: number, limit: number): Promise<ProtectiveEvent[]> {
    let keys: string[];
    try {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.config.bucket, Prefix: this.key("events/"), StartAfter: this.key(eventKey(after)), MaxKeys: Math.min(limit, 1000) }),
        bounded(),
      );
      keys = (res.Contents ?? []).map((c) => c.Key!).filter((k) => /events\/\d{12}\.json$/.test(k));
    } catch {
      throw new SinkUnavailable();
    }
    const out: ProtectiveEvent[] = [];
    for (const k of keys.sort()) {
      const seq = Number(k.slice(-17, -5));
      const e = await this.read(seq);
      if (e) {
        out.push(e);
      }
    }
    return out;
  }

  // The restore fence: one overwritable object beside the checkpoints, so
  // the template's lifecycle rule expires its superseded versions.
  async readFence(): Promise<number | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: this.key(FENCE) }), bounded());
      const n = (JSON.parse((await res.Body?.transformToString("utf8")) ?? "{}") as { fence?: unknown }).fence;
      return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : null;
    } catch (err) {
      if (status(err) === 404 || name(err) === "NoSuchKey") {
        return null;
      }
      throw new SinkUnavailable();
    }
  }

  async writeFence(n: number): Promise<void> {
    await this.writeCheckpoint("fence.json", JSON.stringify({ fence: n }));
  }

  async writeCheckpoint(nameOf: string, body: string): Promise<void> {
    try {
      await this.client.send(new PutObjectCommand({ Bucket: this.config.bucket, Key: this.key(`checkpoints/${nameOf}`), Body: body, ContentType: "application/json", ChecksumAlgorithm: "SHA256" }), bounded());
    } catch {
      throw new SinkUnavailable();
    }
  }
}
