// Real AWS adapter for FixtureStore/RestrictionRegisterStore. Single-table
// design per docs/backend/decision-and-cost.md.
//
// Run against real DynamoDB repeatedly via the live acceptance drills in
// backend/src/scripts/ — see docs/backend/evidence-matrix.md for exactly
// what's been exercised and what hasn't (this stale comment used to say
// otherwise, from before AWS credentials were available in this
// environment; left corrected here rather than silently dropped).
import {
  DynamoDBClient,
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import type {
  AuditReceipt,
  AuthorityClaim,
  ConsentGrant,
  Correction,
  CustodyCopy,
  FixtureRecord,
  LegalRight,
  LifecycleRequest,
  LifecycleRequestStatus,
  Redaction,
  RestrictionRegisterEntry,
} from "../domain/types";
import {
  AlreadyAppliedError,
  DeletionInProgressError,
  VersionConflictError,
  type CustodyCopyCommitter,
  type EvidenceFlip,
  type FixtureStore,
  type IntakeRegisterCommitter,
  type RestrictionRegisterStore,
} from "./store";

export type DynamoStoreConfig = {
  client: DynamoDBClient;
  primaryTableName: string;
  // GSI1PK = STATUS#<status>, GSI1SK = createdAt — the lifecycle queue pattern.
  statusIndexName: string;
};

// Reviewer-caught finding (surfaced by a NEW deterministic forced-conflict
// drill check that hits the exact same item from two TransactWriteItems
// calls at the exact same instant — see realFullFixtureChecks.ts's
// "revocation racing restriction" combinatorial case): DynamoDB can cancel
// a TransactWriteItems call with cancellation reason "TransactionConflict"
// — raised when another transaction is concurrently touching one of the
// same items — WITHOUT ever evaluating the ConditionExpression at all.
// This is functionally the same situation as a condition mismatch (someone
// else's concurrent write intervened; the caller should retry) but was
// previously left unmapped, propagating as a raw, uncaught
// TransactionCanceledException instead of the VersionConflictError every
// caller in services/lifecycle.ts actually checks for — so a genuine race
// loss could be misreported as "Unexpected error applying lifecycle
// action" instead of the correct, retryable version-conflict framing.
function isConditionalFailure(error: unknown): boolean {
  return (
    error instanceof ConditionalCheckFailedException ||
    (error instanceof TransactionCanceledException &&
      (error.CancellationReasons ?? []).some((r) => r.Code === "ConditionalCheckFailed" || r.Code === "TransactionConflict"))
  );
}

// PK/SK scheme: PK = ENTITY#<recordId>, SK discriminates sub-items.
const pk = (recordId: string) => `ENTITY#${recordId}`;
const recordSk = () => "RECORD";
const authoritySk = (claimId: string) => `AUTHORITY#${claimId}`;
const legalRightSk = (rightId: string) => `LEGALRIGHT#${rightId}`;
const consentSk = (consentId: string) => `CONSENT#${consentId}`;
const copySk = (copyId: string) => `COPY#${copyId}`;
const auditSk = (receiptId: string) => `AUDIT#${receiptId}`;
const correctionSk = (correctionId: string) => `CORRECTION#${correctionId}`;
const redactionSk = (redactionId: string) => `REDACTION#${redactionId}`;
const lifecyclePk = (requestId: string) => `LIFECYCLE#${requestId}`;
const intakeReceiptSk = (requestId: string) => `INTAKE-RECEIPT#${requestId}`;

export class DynamoFixtureStore implements FixtureStore {
  private readonly doc: DynamoDBDocumentClient;
  constructor(private readonly config: DynamoStoreConfig) {
    this.doc = DynamoDBDocumentClient.from(config.client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async getRecord(recordId: string): Promise<FixtureRecord | null> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.config.primaryTableName,
        Key: { PK: pk(recordId), SK: recordSk() },
        // Strongly consistent: record reads feed permission decisions.
        ConsistentRead: true,
      }),
    );
    return (result.Item as FixtureRecord | undefined) ?? null;
  }

  async putRecord(record: FixtureRecord, expectedVersion: number | undefined): Promise<void> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.config.primaryTableName,
          // version is store-owned — see store.ts's putRecord comment.
          // Placed AFTER the spread so it always wins over whatever stale
          // value the caller's `record` object carries.
          Item: { PK: pk(record.recordId), SK: recordSk(), ...record, version: (expectedVersion ?? 0) + 1 },
          ConditionExpression:
            expectedVersion === undefined ? "attribute_not_exists(PK)" : "version = :expectedVersion",
          ExpressionAttributeValues:
            expectedVersion === undefined ? undefined : { ":expectedVersion": expectedVersion },
        }),
      );
    } catch (error) {
      if (isConditionalFailure(error)) {
        throw new VersionConflictError("FixtureRecord", record.recordId);
      }
      throw error;
    }
  }

  async deleteRecord(recordId: string, expectedVersion: number): Promise<void> {
    try {
      await this.doc.send(
        new DeleteCommand({
          TableName: this.config.primaryTableName,
          Key: { PK: pk(recordId), SK: recordSk() },
          ConditionExpression: "version = :expectedVersion",
          ExpressionAttributeValues: { ":expectedVersion": expectedVersion },
        }),
      );
    } catch (error) {
      if (isConditionalFailure(error)) {
        throw new VersionConflictError("FixtureRecord", recordId);
      }
      throw error;
    }
  }

  private async queryByPrefix<T>(recordId: string, skPrefix: string): Promise<T[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.config.primaryTableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
        ExpressionAttributeValues: { ":pk": pk(recordId), ":skPrefix": skPrefix },
      }),
    );
    return (result.Items ?? []) as T[];
  }

  // Strongly consistent AND fully paginated — unlike queryByPrefix above
  // (eventually consistent, first page only), which is fine for read-only
  // display lists (corrections/redactions/audit receipts) but not for
  // authority claims / legal rights / consent grants: evaluatePermission's
  // blocking checks and services/intake.ts's approvePreservation
  // evidence-completeness check both read these lists to decide whether
  // something is safe to allow or approve. Reviewer-caught finding: an
  // eventually consistent read can miss a claim/right/grant that another
  // request just committed — DynamoDB's default reads are eventually
  // consistent (AWS's own documented behavior, not an edge case) — letting
  // approval proceed as though an unresolved claim didn't exist. A single
  // Query page is also only guaranteed up to 1MB; this follows
  // LastEvaluatedKey until the whole partition's matching items are read,
  // not just the first page.
  private async queryByPrefixConsistent<T>(recordId: string, skPrefix: string): Promise<T[]> {
    const items: T[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const result = await this.doc.send(
        new QueryCommand({
          TableName: this.config.primaryTableName,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
          ExpressionAttributeValues: { ":pk": pk(recordId), ":skPrefix": skPrefix },
          ConsistentRead: true,
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      items.push(...((result.Items ?? []) as T[]));
      exclusiveStartKey = result.LastEvaluatedKey;
    } while (exclusiveStartKey);
    return items;
  }

  listAuthorityClaims(recordId: string): Promise<AuthorityClaim[]> {
    return this.queryByPrefixConsistent<AuthorityClaim>(recordId, "AUTHORITY#");
  }

  async putAuthorityClaim(claim: AuthorityClaim): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.config.primaryTableName,
        Item: { PK: pk(claim.recordId), SK: authoritySk(claim.claimId), ...claim },
      }),
    );
  }

  async getAuthorityClaim(recordId: string, claimId: string): Promise<AuthorityClaim | null> {
    // Strongly consistent, by-exact-key — same contract as getCorrection/
    // getRedaction. Used only as services/intake.ts's retry-safety guard.
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.config.primaryTableName,
        Key: { PK: pk(recordId), SK: authoritySk(claimId) },
        ConsistentRead: true,
      }),
    );
    return (result.Item as AuthorityClaim | undefined) ?? null;
  }

  listLegalRights(recordId: string): Promise<LegalRight[]> {
    return this.queryByPrefixConsistent<LegalRight>(recordId, "LEGALRIGHT#");
  }

  async putLegalRight(right: LegalRight): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.config.primaryTableName,
        Item: { PK: pk(right.recordId), SK: legalRightSk(right.rightId), ...right },
      }),
    );
  }

  async getLegalRight(recordId: string, rightId: string): Promise<LegalRight | null> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.config.primaryTableName,
        Key: { PK: pk(recordId), SK: legalRightSk(rightId) },
        ConsistentRead: true,
      }),
    );
    return (result.Item as LegalRight | undefined) ?? null;
  }

  listConsentGrants(recordId: string): Promise<ConsentGrant[]> {
    return this.queryByPrefixConsistent<ConsentGrant>(recordId, "CONSENT#");
  }

  async getConsentGrant(recordId: string, consentId: string): Promise<ConsentGrant | null> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.config.primaryTableName,
        Key: { PK: pk(recordId), SK: consentSk(consentId) },
        ConsistentRead: true,
      }),
    );
    return (result.Item as ConsentGrant | undefined) ?? null;
  }

  async putConsentGrant(grant: ConsentGrant, expectedVersion: number | undefined): Promise<void> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.config.primaryTableName,
          // version is store-owned — same reasoning as putRecord.
          Item: { PK: pk(grant.recordId), SK: consentSk(grant.consentId), ...grant, version: (expectedVersion ?? 0) + 1 },
          ConditionExpression:
            expectedVersion === undefined ? "attribute_not_exists(PK)" : "version = :expectedVersion",
          ExpressionAttributeValues:
            expectedVersion === undefined ? undefined : { ":expectedVersion": expectedVersion },
        }),
      );
    } catch (error) {
      if (isConditionalFailure(error)) {
        throw new VersionConflictError("ConsentGrant", grant.consentId);
      }
      throw error;
    }
  }

  // NOT routed through queryByPrefix (which defaults to eventually
  // consistent): completeDeletion's outstanding-copies check and
  // purgeMediaCustody (services/lifecycle.ts) both use this result to
  // decide whether it is safe to remove a record — an eventually
  // consistent read could miss a custody copy that was JUST committed
  // (e.g. by a legacy-media migration racing this exact deletion),
  // letting deletion proceed past media it doesn't yet know needs
  // purging. Reviewer-caught finding, alongside the CustodyCopyCommitter
  // fix below that closes the write-side half of the same race.
  async listCustodyCopies(recordId: string): Promise<CustodyCopy[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.config.primaryTableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
        ExpressionAttributeValues: { ":pk": pk(recordId), ":skPrefix": "COPY#" },
        ConsistentRead: true,
      }),
    );
    return (result.Items ?? []) as CustodyCopy[];
  }

  async putCustodyCopy(copy: CustodyCopy): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.config.primaryTableName,
        Item: { PK: pk(copy.recordId), SK: copySk(copy.copyId), ...copy },
      }),
    );
  }

  async createLifecycleRequest(request: LifecycleRequest): Promise<void> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.config.primaryTableName,
          Item: {
            PK: lifecyclePk(request.requestId),
            SK: "REQUEST",
            GSI1PK: `STATUS#${request.status}`,
            GSI1SK: request.createdAt,
            ...request,
          },
          ConditionExpression: "attribute_not_exists(PK)",
        }),
      );
    } catch (error) {
      if (isConditionalFailure(error)) {
        throw new VersionConflictError("LifecycleRequest", request.requestId);
      }
      throw error;
    }
  }

  async getLifecycleRequest(requestId: string): Promise<LifecycleRequest | null> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.config.primaryTableName,
        Key: { PK: lifecyclePk(requestId), SK: "REQUEST" },
        ConsistentRead: true,
      }),
    );
    return (result.Item as LifecycleRequest | undefined) ?? null;
  }

  async updateLifecycleRequest(request: LifecycleRequest): Promise<void> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.config.primaryTableName,
          Item: {
            PK: lifecyclePk(request.requestId),
            SK: "REQUEST",
            GSI1PK: `STATUS#${request.status}`,
            GSI1SK: request.createdAt,
            ...request,
          },
          ConditionExpression: "attribute_exists(PK)",
        }),
      );
    } catch (error) {
      if (isConditionalFailure(error)) {
        throw new VersionConflictError("LifecycleRequest", request.requestId);
      }
      throw error;
    }
  }

  async listLifecycleRequestsByStatus(status: LifecycleRequestStatus): Promise<LifecycleRequest[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.config.primaryTableName,
        IndexName: this.config.statusIndexName,
        KeyConditionExpression: "GSI1PK = :statusKey",
        ExpressionAttributeValues: { ":statusKey": `STATUS#${status}` },
      }),
    );
    // GSI reads are eventually consistent — correct for a work queue, not
    // used for access-control decisions. See docs/backend/decision-and-cost.md.
    return (result.Items ?? []) as LifecycleRequest[];
  }

  async putAuditReceipt(receipt: AuditReceipt): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.config.primaryTableName,
        Item: { PK: pk(receipt.recordId), SK: auditSk(receipt.receiptId), ...receipt },
      }),
    );
  }

  listAuditReceipts(recordId: string): Promise<AuditReceipt[]> {
    return this.queryByPrefix<AuditReceipt>(recordId, "AUDIT#");
  }

  async putCorrection(correction: Correction): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.config.primaryTableName,
        Item: { PK: pk(correction.recordId), SK: correctionSk(correction.correctionId), ...correction },
      }),
    );
  }

  listCorrections(recordId: string): Promise<Correction[]> {
    return this.queryByPrefix<Correction>(recordId, "CORRECTION#");
  }

  async getCorrection(recordId: string, correctionId: string): Promise<Correction | null> {
    // Strongly consistent GetItem by the EXACT key — never a Query (which,
    // even scoped to one item via begins_with, is still not what this
    // needs to guarantee) and never the table's default eventually
    // consistent read. Reviewer-caught finding: a retry's "already
    // applied" guard using a plain (eventually consistent) query could
    // miss a correction its own earlier attempt already committed —
    // DynamoDB's default reads can lag recent writes by a short,
    // unbounded window — and then proceed to corrupt that row's history.
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.config.primaryTableName,
        Key: { PK: pk(recordId), SK: correctionSk(correctionId) },
        ConsistentRead: true,
      }),
    );
    return (result.Item as Correction | undefined) ?? null;
  }

  async putRedaction(redaction: Redaction): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.config.primaryTableName,
        Item: { PK: pk(redaction.recordId), SK: redactionSk(redaction.redactionId), ...redaction },
      }),
    );
  }

  listRedactions(recordId: string): Promise<Redaction[]> {
    return this.queryByPrefix<Redaction>(recordId, "REDACTION#");
  }

  async getRedaction(recordId: string, redactionId: string): Promise<Redaction | null> {
    // Same strongly-consistent, by-exact-key contract as getCorrection.
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.config.primaryTableName,
        Key: { PK: pk(recordId), SK: redactionSk(redactionId) },
        ConsistentRead: true,
      }),
    );
    return (result.Item as Redaction | undefined) ?? null;
  }

  // Real DynamoDB TransactWriteItems: the record and its history entry are
  // DIFFERENT items (different SK) under the same PK, written in ONE
  // all-or-nothing transaction — genuinely atomic, not just "both calls
  // happened to succeed". A reviewer caught that two SEPARATE PutCommands
  // (the previous version of this code) could leave the field changed
  // with no history entry if the second call failed.
  async putRecordWithCorrection(
    record: FixtureRecord,
    expectedVersion: number | undefined,
    correction: Correction,
  ): Promise<void> {
    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.config.primaryTableName,
                // version is store-owned — see putRecord's comment. Placed
                // AFTER the spread so it always wins over whatever stale
                // value the caller's `record` object carries.
                Item: { PK: pk(record.recordId), SK: recordSk(), ...record, version: (expectedVersion ?? 0) + 1 },
                ConditionExpression:
                  expectedVersion === undefined ? "attribute_not_exists(PK)" : "version = :expectedVersion",
                ExpressionAttributeValues:
                  expectedVersion === undefined ? undefined : { ":expectedVersion": expectedVersion },
              },
            },
            {
              Put: {
                TableName: this.config.primaryTableName,
                Item: { PK: pk(correction.recordId), SK: correctionSk(correction.correctionId), ...correction },
                // Reviewer-caught finding: without this, a retry whose
                // pre-check (getCorrection) was somehow stale could still
                // land here and silently overwrite an ALREADY-committed
                // correction row with a corrupted "previous" value. This
                // condition is the actual guard; the pre-check is just the
                // fast path that avoids reaching this far at all.
                ConditionExpression: "attribute_not_exists(PK)",
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (error instanceof TransactionCanceledException) {
        const reasons = error.CancellationReasons ?? [];
        if (reasons[1]?.Code === "ConditionalCheckFailed") {
          throw new AlreadyAppliedError("Correction", correction.correctionId);
        }
        if (reasons[0]?.Code === "ConditionalCheckFailed") {
          throw new VersionConflictError("FixtureRecord", record.recordId);
        }
      }
      if (isConditionalFailure(error)) {
        throw new VersionConflictError("FixtureRecord", record.recordId);
      }
      throw error;
    }
  }

  async putRecordWithRedaction(
    record: FixtureRecord,
    expectedVersion: number | undefined,
    redaction: Redaction,
  ): Promise<void> {
    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.config.primaryTableName,
                Item: { PK: pk(record.recordId), SK: recordSk(), ...record, version: (expectedVersion ?? 0) + 1 },
                ConditionExpression:
                  expectedVersion === undefined ? "attribute_not_exists(PK)" : "version = :expectedVersion",
                ExpressionAttributeValues:
                  expectedVersion === undefined ? undefined : { ":expectedVersion": expectedVersion },
              },
            },
            {
              Put: {
                TableName: this.config.primaryTableName,
                Item: { PK: pk(redaction.recordId), SK: redactionSk(redaction.redactionId), ...redaction },
                // Same guard as putRecordWithCorrection's history Put.
                ConditionExpression: "attribute_not_exists(PK)",
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (error instanceof TransactionCanceledException) {
        const reasons = error.CancellationReasons ?? [];
        if (reasons[1]?.Code === "ConditionalCheckFailed") {
          throw new AlreadyAppliedError("Redaction", redaction.redactionId);
        }
        if (reasons[0]?.Code === "ConditionalCheckFailed") {
          throw new VersionConflictError("FixtureRecord", record.recordId);
        }
      }
      if (isConditionalFailure(error)) {
        throw new VersionConflictError("FixtureRecord", record.recordId);
      }
      throw error;
    }
  }

  // Real DynamoDB TransactWriteItems: the record and its new custody copy
  // are DIFFERENT items (different SK) under the same PK, written in ONE
  // all-or-nothing transaction. See store.ts's interface comment for why
  // this needs to be atomic (completeDeletion's purge can only ever learn
  // about media it has a CustodyCopy for).
  async putRecordWithCustodyCopy(
    record: FixtureRecord,
    expectedVersion: number | undefined,
    copy: CustodyCopy,
  ): Promise<void> {
    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.config.primaryTableName,
                Item: { PK: pk(record.recordId), SK: recordSk(), ...record, version: (expectedVersion ?? 0) + 1 },
                ConditionExpression:
                  expectedVersion === undefined ? "attribute_not_exists(PK)" : "version = :expectedVersion",
                ExpressionAttributeValues:
                  expectedVersion === undefined ? undefined : { ":expectedVersion": expectedVersion },
              },
            },
            {
              Put: {
                TableName: this.config.primaryTableName,
                Item: { PK: pk(copy.recordId), SK: copySk(copy.copyId), ...copy },
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (isConditionalFailure(error)) {
        throw new VersionConflictError("FixtureRecord", record.recordId);
      }
      throw error;
    }
  }
}

export type RestrictionRegisterConfig = {
  client: DynamoDBClient;
  tableName: string;
};

// A SEPARATE table, per docs/ethos.txt §12 and the brief's explicit
// instruction to keep this "outside the data being rolled back" with
// "access and deletion permissions separated from ordinary data-restoration
// tooling." That separation has to exist at the AWS resource level (a
// distinct table, distinct IAM policy, excluded from the primary table's
// restore/backup tooling) — this class only enforces the application-level
// half of it.
export class DynamoRestrictionRegisterStore implements RestrictionRegisterStore {
  private readonly doc: DynamoDBDocumentClient;
  constructor(private readonly config: RestrictionRegisterConfig) {
    this.doc = DynamoDBDocumentClient.from(config.client);
  }

  async getCurrent(recordId: string): Promise<RestrictionRegisterEntry | null> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.config.tableName,
        Key: { recordId },
        // Always strongly consistent — this is the one read that decides
        // whether content may be served. Never relaxed for this table.
        ConsistentRead: true,
      }),
    );
    return (result.Item as RestrictionRegisterEntry | undefined) ?? null;
  }

  async setCurrent(
    entry: RestrictionRegisterEntry,
    expectedVersion: number | undefined,
  ): Promise<void> {
    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.config.tableName,
                Item: entry,
                // Exact-match compare-and-swap, not monotonic — two
                // concurrent read-modify-write lifecycle actions derived from
                // the same prior snapshot must not both be able to succeed.
                ConditionExpression:
                  expectedVersion === undefined
                    ? "attribute_not_exists(recordId)"
                    : "controlVersion = :expectedVersion",
                ExpressionAttributeValues:
                  expectedVersion === undefined
                    ? undefined
                    : { ":expectedVersion": expectedVersion },
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (isConditionalFailure(error)) {
        throw new VersionConflictError("RestrictionRegisterEntry", entry.recordId);
      }
      throw error;
    }
  }

  async listAll(): Promise<RestrictionRegisterEntry[]> {
    // Fixture-scale only — a full table scan. Fine for a handful of
    // synthetic records; would need a proper index before any real-scale use.
    const result = await this.doc.send(new ScanCommand({ TableName: this.config.tableName }));
    return (result.Items ?? []) as RestrictionRegisterEntry[];
  }

  async listPage(query: { limit: number; cursor: string | null }): Promise<{ entries: RestrictionRegisterEntry[]; nextCursor: string | null }> {
    const result = await this.doc.send(
      new ScanCommand({
        TableName: this.config.tableName,
        Limit: query.limit,
        ExclusiveStartKey: query.cursor ? { recordId: query.cursor } : undefined,
      }),
    );
    const entries = (result.Items ?? []) as RestrictionRegisterEntry[];
    // LastEvaluatedKey's shape always matches this table's own key schema
    // (recordId alone, no sort key — see getCurrent/setCurrent above), so
    // its recordId is exactly the plain resume key this method's own
    // ExclusiveStartKey expects on the next call.
    const nextCursor = result.LastEvaluatedKey ? (result.LastEvaluatedKey.recordId as string) : null;
    return { entries, nextCursor };
  }
}

export type CustodyCopyCommitterConfig = {
  client: DynamoDBClient;
  primaryTableName: string;
  registerTableName: string;
};

// Real AWS implementation of CustodyCopyCommitter (store.ts). The ONE place
// in this codebase that writes across BOTH the primary table AND the
// restriction register table in a single DynamoDB transaction — deliberate
// and narrow, not a precedent for blurring their separation elsewhere (see
// store.ts's interface comment). A single TransactWriteItems call CAN span
// multiple tables in the same account/region; this uses that to make "is
// the record not currently being deleted" and "commit the new media
// tracking" one indivisible operation, closing a TOCTOU race a separate
// read-then-write sequence cannot: deletion can start AND finish entirely
// in the gap between a fresh check and a later write, since uploading real
// bytes to S3 takes real wall-clock time.
export class DynamoCustodyCopyCommitter implements CustodyCopyCommitter {
  private readonly doc: DynamoDBDocumentClient;
  constructor(private readonly config: CustodyCopyCommitterConfig) {
    this.doc = DynamoDBDocumentClient.from(config.client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async commitIfNotDeleting(
    record: FixtureRecord,
    expectedVersion: number | undefined,
    copy: CustodyCopy,
  ): Promise<void> {
    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              // A pure assertion, no write — part of the SAME atomic unit
              // as the two Puts below. A register entry that doesn't exist
              // at all fails this condition too (the attribute comparison
              // is against a nonexistent item), which is the correct,
              // fail-closed behavior: every record this is ever called for
              // was discovered via the register's own listAll() in the
              // first place, so a missing entry here is itself an anomaly,
              // not something to silently proceed past.
              ConditionCheck: {
                TableName: this.config.registerTableName,
                Key: { recordId: record.recordId },
                ConditionExpression: "currentCustodyStatus <> :pending AND currentCustodyStatus <> :deleted",
                ExpressionAttributeValues: { ":pending": "deletion-pending", ":deleted": "deleted" },
              },
            },
            {
              Put: {
                TableName: this.config.primaryTableName,
                Item: { PK: pk(record.recordId), SK: recordSk(), ...record, version: (expectedVersion ?? 0) + 1 },
                ConditionExpression:
                  expectedVersion === undefined ? "attribute_not_exists(PK)" : "version = :expectedVersion",
                ExpressionAttributeValues:
                  expectedVersion === undefined ? undefined : { ":expectedVersion": expectedVersion },
              },
            },
            {
              Put: {
                TableName: this.config.primaryTableName,
                Item: { PK: pk(copy.recordId), SK: copySk(copy.copyId), ...copy },
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (error instanceof TransactionCanceledException) {
        const reasons = error.CancellationReasons ?? [];
        if (reasons[0]?.Code === "ConditionalCheckFailed") {
          throw new DeletionInProgressError(record.recordId);
        }
        if (reasons[1]?.Code === "ConditionalCheckFailed") {
          throw new VersionConflictError("FixtureRecord", record.recordId);
        }
      }
      if (isConditionalFailure(error)) {
        throw new VersionConflictError("FixtureRecord", record.recordId);
      }
      throw error;
    }
  }
}

export type IntakeRegisterCommitterConfig = {
  client: DynamoDBClient;
  primaryTableName: string;
  registerTableName: string;
};

// Real AWS implementation of IntakeRegisterCommitter (store.ts). Each
// method below is one TransactWriteItems call spanning both tables, same
// established technique as DynamoCustodyCopyCommitter above — see that
// class's comment for why a single transaction can and should span both.
export class DynamoIntakeRegisterCommitter implements IntakeRegisterCommitter {
  private readonly doc: DynamoDBDocumentClient;
  constructor(private readonly config: IntakeRegisterCommitterConfig) {
    this.doc = DynamoDBDocumentClient.from(config.client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async commitCreateSubmission(record: FixtureRecord): Promise<void> {
    const now = new Date().toISOString();
    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.config.registerTableName,
                Item: {
                  recordId: record.recordId,
                  controlVersion: 1,
                  currentPublicationStatus: "not-published",
                  currentCustodyStatus: "quarantined",
                  restrictedPurposes: [],
                  revokedConsentIds: [],
                  mediaPurgeClaim: null,
                  redactedMediaIds: [],
                  redactedTextFields: [],
                  updatedAt: now,
                },
                ConditionExpression: "attribute_not_exists(recordId)",
              },
            },
            {
              Put: {
                TableName: this.config.primaryTableName,
                Item: { PK: pk(record.recordId), SK: recordSk(), ...record, version: 1 },
                ConditionExpression: "attribute_not_exists(PK)",
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (isConditionalFailure(error)) {
        throw new VersionConflictError("RestrictionRegisterEntry", record.recordId);
      }
      throw error;
    }
  }

  // The shared register-side condition/update every write below needs,
  // besides commitApproval (see its own comment for why that one asserts
  // only controlVersion, not custody/publication state separately).
  private registerOpenIntakeTransactItem(recordId: string, expectedControlVersion: number) {
    return {
      Update: {
        TableName: this.config.registerTableName,
        Key: { recordId },
        UpdateExpression: "SET controlVersion = :next, updatedAt = :now",
        ConditionExpression:
          "controlVersion = :expected AND currentCustodyStatus = :quarantined AND currentPublicationStatus <> :withdrawn",
        ExpressionAttributeValues: {
          ":next": expectedControlVersion + 1,
          ":now": new Date().toISOString(),
          ":expected": expectedControlVersion,
          ":quarantined": "quarantined",
          ":withdrawn": "withdrawn",
        },
      },
    };
  }

  async commitEvidenceCreate(
    recordId: string,
    expectedControlVersion: number,
    newItem: AuthorityClaim | LegalRight | ConsentGrant,
  ): Promise<void> {
    const isAuthority = "claimId" in newItem;
    const isLegalRight = !isAuthority && "rightId" in newItem;
    const itemSk = isAuthority
      ? authoritySk((newItem as AuthorityClaim).claimId)
      : isLegalRight
        ? legalRightSk((newItem as LegalRight).rightId)
        : consentSk((newItem as ConsentGrant).consentId);
    const item = isAuthority || isLegalRight ? newItem : { ...(newItem as ConsentGrant), version: 1 };
    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            this.registerOpenIntakeTransactItem(recordId, expectedControlVersion),
            {
              Put: {
                TableName: this.config.primaryTableName,
                Item: { PK: pk(recordId), SK: itemSk, ...item },
                ConditionExpression: "attribute_not_exists(PK)",
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (error instanceof TransactionCanceledException) {
        const reasons = error.CancellationReasons ?? [];
        if (reasons[1]?.Code === "ConditionalCheckFailed") {
          throw new AlreadyAppliedError("IntakeEvidence", itemSk);
        }
      }
      if (isConditionalFailure(error)) {
        throw new VersionConflictError("RestrictionRegisterEntry", recordId);
      }
      throw error;
    }
  }

  async commitMediaAdd(
    recordId: string,
    expectedControlVersion: number,
    updatedRecord: FixtureRecord,
    expectedRecordVersion: number,
    copy: CustodyCopy,
  ): Promise<void> {
    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            this.registerOpenIntakeTransactItem(recordId, expectedControlVersion),
            {
              Put: {
                TableName: this.config.primaryTableName,
                Item: { PK: pk(recordId), SK: recordSk(), ...updatedRecord, version: expectedRecordVersion + 1 },
                ConditionExpression: "version = :expectedVersion",
                ExpressionAttributeValues: { ":expectedVersion": expectedRecordVersion },
              },
            },
            {
              Put: {
                TableName: this.config.primaryTableName,
                Item: { PK: pk(copy.recordId), SK: copySk(copy.copyId), ...copy },
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (isConditionalFailure(error)) {
        throw new VersionConflictError("RestrictionRegisterEntry", recordId);
      }
      throw error;
    }
  }

  async commitEvidenceSupersede(
    recordId: string,
    expectedControlVersion: number,
    oldItem: { kind: "authority" | "legalRight"; id: string },
    newItem: AuthorityClaim | LegalRight,
  ): Promise<void> {
    const oldSk = oldItem.kind === "authority" ? authoritySk(oldItem.id) : legalRightSk(oldItem.id);
    const newSk =
      oldItem.kind === "authority" ? authoritySk((newItem as AuthorityClaim).claimId) : legalRightSk((newItem as LegalRight).rightId);
    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            this.registerOpenIntakeTransactItem(recordId, expectedControlVersion),
            {
              Update: {
                TableName: this.config.primaryTableName,
                Key: { PK: pk(recordId), SK: oldSk },
                UpdateExpression: "SET #status = :superseded",
                ConditionExpression: "#status = :unknown",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: { ":superseded": "superseded", ":unknown": "unknown" },
              },
            },
            {
              Put: {
                TableName: this.config.primaryTableName,
                Item: { PK: pk(recordId), SK: newSk, ...newItem },
                ConditionExpression: "attribute_not_exists(PK)",
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (error instanceof TransactionCanceledException) {
        const reasons = error.CancellationReasons ?? [];
        if (reasons[2]?.Code === "ConditionalCheckFailed") {
          throw new AlreadyAppliedError("IntakeEvidence", newSk);
        }
      }
      if (isConditionalFailure(error)) {
        throw new VersionConflictError("RestrictionRegisterEntry", recordId);
      }
      throw error;
    }
  }

  async commitApproval(
    recordId: string,
    requestId: string,
    expectedControlVersion: number,
    expectedRecordVersion: number,
    registerPatch: Partial<Pick<RestrictionRegisterEntry, "currentCustodyStatus" | "currentPublicationStatus">>,
    evidenceFlips: EvidenceFlip[],
  ): Promise<void> {
    const now = new Date().toISOString();
    const setClauses = ["controlVersion = :nextControlVersion", "updatedAt = :now"];
    const values: Record<string, unknown> = {
      ":nextControlVersion": expectedControlVersion + 1,
      ":now": now,
      ":expectedControlVersion": expectedControlVersion,
    };
    if (registerPatch.currentCustodyStatus) {
      setClauses.push("currentCustodyStatus = :nextCustody");
      values[":nextCustody"] = registerPatch.currentCustodyStatus;
    }
    if (registerPatch.currentPublicationStatus) {
      setClauses.push("currentPublicationStatus = :nextPublication");
      values[":nextPublication"] = registerPatch.currentPublicationStatus;
    }
    // controlVersion-only pinning is NOT transitively sufficient on its
    // own — reproduced directly: a reviewer who does a FRESH read of an
    // ALREADY-rejected record and submits approval anyway supplies a
    // perfectly current, non-stale expectedControlVersion, so a bare
    // version match alone would happily approve a withdrawn submission.
    // "Not withdrawn" is asserted explicitly here, every time, atomically
    // with the version check — not inferred from version-staleness, which
    // only ever catches a CHANGE since the caller's last read, never a bad
    // state the caller's own read already reflected. The specific starting
    // custody value (quarantined vs. preserved) is still each caller's own
    // job (approvePreservation/approvePublication, services/intake.ts)
    // since it legitimately differs between them.
    values[":withdrawn"] = "withdrawn";
    const transactItems: NonNullable<ConstructorParameters<typeof TransactWriteCommand>[0]>["TransactItems"] = [
      {
        Update: {
          TableName: this.config.registerTableName,
          Key: { recordId },
          UpdateExpression: `SET ${setClauses.join(", ")}`,
          ConditionExpression: "controlVersion = :expectedControlVersion AND currentPublicationStatus <> :withdrawn",
          ExpressionAttributeValues: values,
        },
      },
      {
        ConditionCheck: {
          TableName: this.config.primaryTableName,
          Key: { PK: pk(recordId), SK: recordSk() },
          ConditionExpression: "version = :expectedRecordVersion",
          ExpressionAttributeValues: { ":expectedRecordVersion": expectedRecordVersion },
        },
      },
    ];
    for (const flip of evidenceFlips) {
      if (flip.kind === "authority") {
        transactItems.push({
          Update: {
            TableName: this.config.primaryTableName,
            Key: { PK: pk(recordId), SK: authoritySk(flip.claimId) },
            UpdateExpression: "SET #status = :identified, reviewerDecision = :reviewerDecision",
            ConditionExpression: "#status = :unknown",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: {
              ":identified": "identified",
              ":unknown": "unknown",
              ":reviewerDecision": flip.reviewerDecision,
            },
          },
        });
      } else if (flip.kind === "legalRight") {
        transactItems.push({
          Update: {
            TableName: this.config.primaryTableName,
            Key: { PK: pk(recordId), SK: legalRightSk(flip.rightId) },
            UpdateExpression: "SET #status = :identified, reviewerDecision = :reviewerDecision",
            ConditionExpression: "#status = :unknown",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: {
              ":identified": "identified",
              ":unknown": "unknown",
              ":reviewerDecision": flip.reviewerDecision,
            },
          },
        });
      } else {
        // Reviewer-caught finding: requiring signerCapacityVerified to
        // currently be false rejected a grant that was ALREADY verified —
        // a real, valid case, not an anomaly: the same ConsentGrant can
        // legitimately carry both "preservation" and "publication" in its
        // purposes array, get verified once by approvePreservation, and
        // then be named again by approvePublication, which only needs
        // re-verifying it to be a safe no-op, never a hard conflict.
        // attribute_exists is the real guard instead — the grant must
        // exist (an Update on a missing item would otherwise silently
        // CREATE a near-empty one), regardless of its current verified
        // state.
        transactItems.push({
          Update: {
            TableName: this.config.primaryTableName,
            Key: { PK: pk(recordId), SK: consentSk(flip.consentId) },
            UpdateExpression: "SET signerCapacityVerified = :verified",
            ConditionExpression: "attribute_exists(PK)",
            ExpressionAttributeValues: { ":verified": true },
          },
        });
      }
    }
    transactItems.push({
      Put: {
        TableName: this.config.primaryTableName,
        Item: { PK: pk(recordId), SK: intakeReceiptSk(requestId), recordId, requestId, createdAt: now },
        ConditionExpression: "attribute_not_exists(PK)",
      },
    });
    try {
      await this.doc.send(new TransactWriteCommand({ TransactItems: transactItems }));
    } catch (error) {
      // Every failure here means the same thing to every caller
      // (approvePreservation/approvePublication, services/intake.ts):
      // re-check hasReceipt — either a concurrent attempt already
      // succeeded (receipt now exists), or this is a genuine conflict
      // (register, record, or evidence state moved) requiring real
      // re-review. No need to distinguish which item failed.
      if (isConditionalFailure(error)) {
        throw new VersionConflictError("RestrictionRegisterEntry", recordId);
      }
      throw error;
    }
  }

  async hasReceipt(recordId: string, requestId: string): Promise<boolean> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.config.primaryTableName,
        Key: { PK: pk(recordId), SK: intakeReceiptSk(requestId) },
        ConsistentRead: true,
      }),
    );
    return result.Item !== undefined;
  }
}
