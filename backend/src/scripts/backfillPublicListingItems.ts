// Manually-invoked script — NOT part of `npm test`, NOT run in CI. Backfills
// public listing items (services/publicListingItem.ts) for records written
// before the store maintained them. The engine and its safety model are in
// services/listingBackfill.ts; this file supplies the DynamoDB reads/writes
// and the command line.
//
// DRY RUN BY DEFAULT: without --apply it only reads (strongly consistent
// record, listing and register-scan reads, paced) and logs what it would do.
//
// --apply additionally requires --confirm-listing-maintenance-deployed: the
// backfill is only safe once the deployed Lambda writes listing items
// atomically with every record change (see listingBackfill.ts).
//
// Resumable: progress goes to --state (default
// ./listing-backfill-<namespace>.state.json) after every record, and a JSONL
// decision log to --log. --resume continues after the last completed record.
//
// Run with:
// AWS_PROFILE=tiro-fixture-deploy AWS_REGION=us-east-1 TIRO_FIXTURE_NAMESPACE=drill-20261002 \
//   npx tsx backend/src/scripts/backfillPublicListingItems.ts [--limit N] [--resume] \
//   [--rcu-per-second 2] [--wcu-per-second 2] [--state path] [--log path] \
//   [--apply --confirm-listing-maintenance-deployed]
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { DynamoDBClient, TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, ScanCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import type { FixtureRecord, RestrictionRegisterEntry } from "../domain/types";
import { listingItemKey } from "../store/dynamoStore";
import { runListingBackfill, type BackfillDeps, type BackfillLogEntry } from "../services/listingBackfill";

const NAMESPACE = process.env.TIRO_FIXTURE_NAMESPACE;
if (!NAMESPACE) throw new Error("Missing required env var TIRO_FIXTURE_NAMESPACE (never default it — see runbook).");
const REGION = process.env.AWS_REGION ?? "us-east-1";
const PRIMARY_TABLE = `tiro-fixture-primary-${NAMESPACE}`;
const REGISTER_TABLE = `tiro-restriction-register-${NAMESPACE}`;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const APPLY = flag("--apply");
if (APPLY && !flag("--confirm-listing-maintenance-deployed")) {
  throw new Error("--apply requires --confirm-listing-maintenance-deployed (deploy listing maintenance first; see listingBackfill.ts).");
}
const STATE_PATH = option("--state") ?? `./listing-backfill-${NAMESPACE}.state.json`;
const LOG_PATH = option("--log") ?? `./listing-backfill-${NAMESPACE}.log.jsonl`;
const LIMIT = option("--limit") ? Number(option("--limit")) : null;
const RCU_PER_SECOND = Number(option("--rcu-per-second") ?? 2);
const WCU_PER_SECOND = Number(option("--wcu-per-second") ?? 2);
if (!(RCU_PER_SECOND > 0 && RCU_PER_SECOND < 5) || !(WCU_PER_SECOND > 0 && WCU_PER_SECOND < 5)) {
  throw new Error("Pacing must stay strictly below the tables' 5 RCU/WCU per second, leaving headroom for the staff API.");
}
let resumeAfter: string | null = null;
if (flag("--resume")) {
  if (!existsSync(STATE_PATH)) throw new Error(`--resume given but no state file at ${STATE_PATH}`);
  const state = JSON.parse(readFileSync(STATE_PATH, "utf8")) as { namespace: string; apply: boolean; lastCompletedRecordId: string | null };
  // A dry run's progress must never make an --apply run skip records.
  if (state.namespace !== NAMESPACE || state.apply !== APPLY) {
    throw new Error(`State file ${STATE_PATH} is for namespace "${state.namespace}" in ${state.apply ? "apply" : "dry-run"} mode; refusing to resume a different run.`);
  }
  resumeAfter = state.lastCompletedRecordId;
}

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), { marshallOptions: { removeUndefinedValues: true } });
const capacity = (c: { CapacityUnits?: number } | { CapacityUnits?: number }[] | undefined) =>
  (Array.isArray(c) ? c : c ? [c] : []).reduce((sum, x) => sum + (x.CapacityUnits ?? 0), 0);

const deps: BackfillDeps = {
  async listRegisterPage(cursor, limit) {
    const result = await doc.send(
      new ScanCommand({
        TableName: REGISTER_TABLE,
        Limit: limit,
        ExclusiveStartKey: cursor ? { recordId: cursor } : undefined,
        ProjectionExpression: "recordId, currentCustodyStatus",
        ReturnConsumedCapacity: "TOTAL",
      }),
    );
    return {
      entries: (result.Items ?? []) as { recordId: string; currentCustodyStatus: RestrictionRegisterEntry["currentCustodyStatus"] }[],
      nextCursor: (result.LastEvaluatedKey?.recordId as string | undefined) ?? null,
      consumedRcu: capacity(result.ConsumedCapacity),
    };
  },
  async readRecord(recordId) {
    const result = await doc.send(
      new GetCommand({ TableName: PRIMARY_TABLE, Key: { PK: `ENTITY#${recordId}`, SK: "RECORD" }, ConsistentRead: true, ReturnConsumedCapacity: "TOTAL" }),
    );
    return { record: (result.Item as FixtureRecord | undefined) ?? null, consumedRcu: capacity(result.ConsumedCapacity) };
  },
  async readListing(recordId) {
    const result = await doc.send(
      new GetCommand({ TableName: PRIMARY_TABLE, Key: listingItemKey(recordId), ConsistentRead: true, ReturnConsumedCapacity: "TOTAL" }),
    );
    return { raw: result.Item ?? null, consumedRcu: capacity(result.ConsumedCapacity) };
  },
  async writeListing({ item, expectedExistingVersion }) {
    try {
      const result = await doc.send(
        new TransactWriteCommand({
          ReturnConsumedCapacity: "TOTAL",
          TransactItems: [
            {
              ConditionCheck: {
                TableName: REGISTER_TABLE,
                Key: { recordId: item.recordId },
                ConditionExpression: "attribute_exists(recordId) AND currentCustodyStatus <> :pending AND currentCustodyStatus <> :deleted",
                ExpressionAttributeValues: { ":pending": "deletion-pending", ":deleted": "deleted" },
              },
            },
            {
              Put: {
                TableName: PRIMARY_TABLE,
                Item: { ...listingItemKey(item.recordId), ...item },
                ConditionExpression: expectedExistingVersion === null ? "attribute_not_exists(PK)" : "recordVersion = :expected",
                ExpressionAttributeValues: expectedExistingVersion === null ? undefined : { ":expected": expectedExistingVersion },
              },
            },
          ],
        }),
      );
      return { outcome: "written", consumedWcu: capacity(result.ConsumedCapacity) };
    } catch (error) {
      if (error instanceof TransactionCanceledException) {
        const reasons = (error.CancellationReasons ?? []).map((r) => r.Code ?? "None");
        // A cancelled transaction still consumes capacity, but the SDK
        // doesn't report it on the exception; charge a conservative estimate.
        return { outcome: "condition-failed", consumedWcu: 8, detail: `cancelled: register=${reasons[0]} listing=${reasons[1]}` };
      }
      throw error;
    }
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

async function main() {
  console.log(
    `${APPLY ? "APPLY" : "DRY RUN"} listing backfill on ${PRIMARY_TABLE} / ${REGISTER_TABLE}; pacing ${RCU_PER_SECOND} RCU/s, ${WCU_PER_SECOND} WCU/s; ` +
      `${resumeAfter ? `resuming after ${resumeAfter}` : "from the start"}${LIMIT !== null ? `; limit ${LIMIT}` : ""}.`,
  );
  const summary = await runListingBackfill(deps, {
    apply: APPLY,
    resumeAfter,
    maxRecords: LIMIT,
    readRcuPerSecond: RCU_PER_SECOND,
    writeWcuPerSecond: WCU_PER_SECOND,
    pageSize: 25,
    onRecord(entry: BackfillLogEntry) {
      appendFileSync(LOG_PATH, `${JSON.stringify({ at: new Date().toISOString(), apply: APPLY, ...entry })}\n`);
      writeFileSync(STATE_PATH, JSON.stringify({ namespace: NAMESPACE, apply: APPLY, lastCompletedRecordId: entry.recordId, updatedAt: new Date().toISOString() }, null, 2));
      console.log(`${entry.recordId}  ${entry.plan}${entry.write ? ` (${entry.write})` : ""}  v${entry.recordVersion ?? "-"}  ${entry.consumedRcu} RCU${entry.detail ? `  ${entry.detail}` : ""}`);
    },
  });
  console.log("\n=== Summary ===");
  console.log(JSON.stringify(summary, null, 2));
  if (summary.counts["needs-review"] || summary.conditionFailed > 0) {
    console.log("Some records need review or lost a race; see the log. Re-run (with --resume) after resolving.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exitCode = 1;
});
