// Manually-invoked script — NOT part of `npm test`, NOT run in CI. Bounded,
// READ-ONLY capacity profile of the public Memory listing's real read path
// against live DynamoDB, one candidate at a time.
//
// Why this exists: the live public-memory drill's throttling was first
// explained from CloudWatch one-minute Sums, which aggregate every
// operation in the minute and cannot attribute consumption to a single
// request or a single read (and burst capacity can absorb short spikes a
// per-minute average hides). This measures each DynamoDB operation
// directly, from the SDK's own response: ConsumedCapacity (with
// ReturnConsumedCapacity: "INDEXES"), wall-clock latency, SDK attempts and
// retry delay, and per-attempt errors including DynamoDB's
// ThrottlingReasons.
//
// It runs the UNMODIFIED production code path — services/publicView.ts's
// readPublicRecord, which itself calls evaluatePermission — against the
// real DynamoFixtureStore/DynamoRestrictionRegisterStore, so both
// full-record reads (readPublicRecord's own getRecord AND
// evaluatePermission's second one) are measured, not a re-derivation.
// Candidates are chosen exactly the way readPublicListing chooses them:
// the register's listPage scan order, pre-filtered to
// preserved+published.
//
// Read-only by construction: a middleware rejects any DynamoDB command
// other than GetItem/Query/Scan BEFORE it is sent, so no code path reached
// from here can write, even by accident. Bounded: at most
// PROFILE_MAX_CANDIDATES (default 4, hard cap 12) candidates, sequential,
// separated by PROFILE_GAP_MS (default 15000) so each candidate's
// operations are measured in isolation rather than against the previous
// candidate's burst.
//
// Run with:
// AWS_PROFILE=tiro-fixture-deploy AWS_REGION=us-east-1 \
//   TIRO_FIXTURE_NAMESPACE=drill-20261002 \
//   [PROFILE_MAX_CANDIDATES=4] [PROFILE_GAP_MS=15000] \
//   [PROFILE_RECORD_IDS=id1,id2] [PROFILE_OUT=path/to/result.json] \
//   npx tsx backend/src/scripts/profilePublicReadPath.ts
import { AsyncLocalStorage } from "node:async_hooks";
import { writeFileSync } from "node:fs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { FixtureStore, RestrictionRegisterStore } from "../store/store";
import { DynamoFixtureStore } from "../store/dynamoStore";
import { DynamoRestrictionRegisterStore } from "../store/dynamoStore";
import { PUBLIC_LISTING_RAW_PAGE_SIZE, readPublicRecord } from "../services/publicView";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const NAMESPACE = process.env.TIRO_FIXTURE_NAMESPACE;
if (!NAMESPACE) throw new Error("Missing required env var TIRO_FIXTURE_NAMESPACE (never default it — see runbook).");
const PRIMARY_TABLE = `tiro-fixture-primary-${NAMESPACE}`;
const REGISTER_TABLE = `tiro-restriction-register-${NAMESPACE}`;
const MAX_CANDIDATES = Math.min(Number(process.env.PROFILE_MAX_CANDIDATES ?? 4), 12);
const GAP_MS = Number(process.env.PROFILE_GAP_MS ?? 15000);
const EXPLICIT_IDS = process.env.PROFILE_RECORD_IDS?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;
const READ_ONLY_COMMANDS = new Set(["GetItemCommand", "QueryCommand", "ScanCommand"]);

type AttemptRecord = { latencyMs: number; error?: { name: string; message: string; throttlingReasons?: unknown } };
type OperationRecord = {
  seq: number;
  candidate: string | null;
  storeMethod: string;
  command: string;
  consistentRead: boolean;
  latencyMs: number;
  sdkAttempts: number | null;
  sdkTotalRetryDelayMs: number | null;
  consumedCapacity: unknown;
  capacityUnits: number | null;
  itemCount: number | null;
  scannedCount: number | null;
  approxBytes: number | null;
  attempts: AttemptRecord[];
  finalError?: { name: string; message: string; throttlingReasons?: unknown };
};

const context = new AsyncLocalStorage<{ candidate: string | null; storeMethod: string; attempts: AttemptRecord[] }>();
const operations: OperationRecord[] = [];
let seq = 0;

function describeError(error: unknown): { name: string; message: string; throttlingReasons?: unknown } {
  const e = error as { name?: string; message?: string; ThrottlingReasons?: unknown };
  return { name: e?.name ?? "Error", message: e?.message ?? String(error), throttlingReasons: e?.ThrottlingReasons };
}

// Same default construction as api/handler.ts (default retry strategy and
// all), so sdkAttempts reflects what the deployed Lambda would actually do.
const client = new DynamoDBClient({ region: REGION });

client.middlewareStack.add(
  (next, ctx) => async (args) => {
    const command = ctx.commandName ?? "unknown";
    if (!READ_ONLY_COMMANDS.has(command)) {
      throw new Error(`profilePublicReadPath is read-only; refusing to send ${command}.`);
    }
    const input = args.input as Record<string, unknown>;
    input.ReturnConsumedCapacity = "INDEXES";
    const store = context.getStore();
    const attempts: AttemptRecord[] = [];
    const op: OperationRecord = {
      seq: ++seq,
      candidate: store?.candidate ?? null,
      storeMethod: store?.storeMethod ?? "unknown",
      command,
      consistentRead: input.ConsistentRead === true,
      latencyMs: 0,
      sdkAttempts: null,
      sdkTotalRetryDelayMs: null,
      consumedCapacity: null,
      capacityUnits: null,
      itemCount: null,
      scannedCount: null,
      approxBytes: null,
      attempts,
    };
    operations.push(op);
    const started = performance.now();
    try {
      return await context.run({ candidate: op.candidate, storeMethod: op.storeMethod, attempts }, async () => {
        const result = await next(args);
        const output = result.output as Record<string, unknown> & {
          $metadata?: { attempts?: number; totalRetryDelay?: number };
          ConsumedCapacity?: { CapacityUnits?: number };
          Items?: unknown[];
          Item?: unknown;
          Count?: number;
          ScannedCount?: number;
        };
        op.sdkAttempts = output.$metadata?.attempts ?? null;
        op.sdkTotalRetryDelayMs = output.$metadata?.totalRetryDelay ?? null;
        op.consumedCapacity = output.ConsumedCapacity ?? null;
        op.capacityUnits = output.ConsumedCapacity?.CapacityUnits ?? null;
        op.itemCount = output.Items ? output.Items.length : output.Item ? 1 : 0;
        op.scannedCount = output.ScannedCount ?? null;
        // Approximate only — JSON of the wire-format items, not DynamoDB's
        // own item-size accounting.
        op.approxBytes = JSON.stringify(output.Items ?? output.Item ?? null).length;
        return result;
      });
    } catch (error) {
      op.finalError = describeError(error);
      const meta = (error as { $metadata?: { attempts?: number; totalRetryDelay?: number } }).$metadata;
      op.sdkAttempts = meta?.attempts ?? null;
      op.sdkTotalRetryDelayMs = meta?.totalRetryDelay ?? null;
      throw error;
    } finally {
      op.latencyMs = Math.round(performance.now() - started);
    }
  },
  { step: "initialize", name: "tiroProfileOperation", priority: "high" },
);

// Deserialize step runs once PER ATTEMPT (inside the retry middleware), so
// this sees throttled attempts the retry strategy later recovered from.
client.middlewareStack.add(
  (next) => async (args) => {
    const attempts = context.getStore()?.attempts;
    const started = performance.now();
    try {
      const result = await next(args);
      attempts?.push({ latencyMs: Math.round(performance.now() - started) });
      return result;
    } catch (error) {
      attempts?.push({ latencyMs: Math.round(performance.now() - started), error: describeError(error) });
      throw error;
    }
  },
  { step: "deserialize", name: "tiroProfileAttempt", priority: "low" },
);

// Labels every DynamoDB operation with the store method that issued it.
// readPublicRecord/evaluatePermission await their reads sequentially, so
// the label is unambiguous.
function labelled<T extends object>(target: T, candidate: () => string | null): T {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) =>
        context.run({ candidate: candidate(), storeMethod: String(prop), attempts: [] }, () =>
          (value as (...a: unknown[]) => unknown).apply(obj, args),
        );
    },
  });
}

let currentCandidate: string | null = null;
const fixtureStore = labelled<FixtureStore>(
  new DynamoFixtureStore({ client, primaryTableName: PRIMARY_TABLE, statusIndexName: "GSI1-status-index" }),
  () => currentCandidate,
);
const registerStore = labelled<RestrictionRegisterStore>(
  new DynamoRestrictionRegisterStore({ client, tableName: REGISTER_TABLE }),
  () => currentCandidate,
);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function selectCandidates(): Promise<string[]> {
  if (EXPLICIT_IDS) return EXPLICIT_IDS.slice(0, MAX_CANDIDATES);
  const ids: string[] = [];
  let cursor: string | null = null;
  // Same scan order and pre-filter as readPublicListing; bounded to 200
  // rows (PUBLIC_LISTING_MAX_RAW_ROWS's own value) at most.
  for (let pages = 0; pages < 8 && ids.length < MAX_CANDIDATES; pages++) {
    const page = await registerStore.listPage({ limit: PUBLIC_LISTING_RAW_PAGE_SIZE, cursor });
    for (const entry of page.entries) {
      if (entry.currentCustodyStatus === "preserved" && entry.currentPublicationStatus === "published") {
        ids.push(entry.recordId);
        if (ids.length >= MAX_CANDIDATES) break;
      }
    }
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
    await sleep(400);
  }
  return ids;
}

async function main() {
  console.log(`Profiling ${PRIMARY_TABLE} / ${REGISTER_TABLE}: up to ${MAX_CANDIDATES} candidates, ${GAP_MS}ms apart. Read-only.`);
  const candidates = await selectCandidates();
  const perCandidate: { recordId: string; wallMs: number; outcome: string }[] = [];

  for (const [index, recordId] of candidates.entries()) {
    if (index > 0) await sleep(GAP_MS);
    currentCandidate = recordId;
    const started = performance.now();
    let outcome: string;
    try {
      const view = await readPublicRecord(fixtureStore, registerStore, recordId);
      outcome = view ? "allowed" : "denied-or-missing";
    } catch (error) {
      outcome = `threw: ${describeError(error).name}`;
    }
    perCandidate.push({ recordId, wallMs: Math.round(performance.now() - started), outcome });
    currentCandidate = null;
  }

  console.log("\n=== Per operation ===");
  console.table(
    operations.map((op) => ({
      seq: op.seq,
      candidate: op.candidate ? op.candidate.slice(0, 13) : "(scan)",
      method: op.storeMethod,
      cmd: op.command.replace("Command", ""),
      strong: op.consistentRead,
      RCU: op.capacityUnits,
      ms: op.latencyMs,
      attempts: op.sdkAttempts,
      retryDelayMs: op.sdkTotalRetryDelayMs,
      items: op.itemCount,
      approxBytes: op.approxBytes,
      throttled: op.attempts.filter((a) => a.error).length,
      error: op.finalError?.name ?? "",
    })),
  );

  console.log("\n=== Per candidate ===");
  console.table(
    perCandidate.map((c) => {
      const ops = operations.filter((op) => op.candidate === c.recordId);
      return {
        recordId: c.recordId,
        outcome: c.outcome,
        wallMs: c.wallMs,
        operations: ops.length,
        totalRCU: ops.reduce((sum, op) => sum + (op.capacityUnits ?? 0), 0),
        maxSingleOpRCU: Math.max(0, ...ops.map((op) => op.capacityUnits ?? 0)),
        throttledAttempts: ops.reduce((sum, op) => sum + op.attempts.filter((a) => a.error).length, 0),
      };
    }),
  );

  const throttleReasons = operations.flatMap((op) => op.attempts.filter((a) => a.error).map((a) => ({ seq: op.seq, method: op.storeMethod, ...a.error })));
  if (throttleReasons.length > 0) {
    console.log("\n=== Failed attempts (including ones the SDK retried past) ===");
    console.log(JSON.stringify(throttleReasons, null, 2));
  }

  if (process.env.PROFILE_OUT) {
    writeFileSync(
      process.env.PROFILE_OUT,
      JSON.stringify({ measuredAt: new Date().toISOString(), namespace: NAMESPACE, gapMs: GAP_MS, perCandidate, operations }, null, 2),
    );
    console.log(`\nFull result written to ${process.env.PROFILE_OUT}`);
  }
}

main().catch((error) => {
  console.error("Profile failed:", error);
  process.exitCode = 1;
});
