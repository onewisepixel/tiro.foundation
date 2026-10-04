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
import { AlreadyAppliedError, VersionConflictError, type FixtureStore, type RestrictionRegisterStore } from "./store";

export type DynamoStoreConfig = {
  client: DynamoDBClient;
  primaryTableName: string;
  // GSI1PK = STATUS#<status>, GSI1SK = createdAt — the lifecycle queue pattern.
  statusIndexName: string;
};

function isConditionalFailure(error: unknown): boolean {
  return (
    error instanceof ConditionalCheckFailedException ||
    (error instanceof TransactionCanceledException &&
      (error.CancellationReasons ?? []).some((r) => r.Code === "ConditionalCheckFailed"))
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

  listAuthorityClaims(recordId: string): Promise<AuthorityClaim[]> {
    return this.queryByPrefix<AuthorityClaim>(recordId, "AUTHORITY#");
  }

  async putAuthorityClaim(claim: AuthorityClaim): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.config.primaryTableName,
        Item: { PK: pk(claim.recordId), SK: authoritySk(claim.claimId), ...claim },
      }),
    );
  }

  listLegalRights(recordId: string): Promise<LegalRight[]> {
    return this.queryByPrefix<LegalRight>(recordId, "LEGALRIGHT#");
  }

  async putLegalRight(right: LegalRight): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.config.primaryTableName,
        Item: { PK: pk(right.recordId), SK: legalRightSk(right.rightId), ...right },
      }),
    );
  }

  listConsentGrants(recordId: string): Promise<ConsentGrant[]> {
    return this.queryByPrefix<ConsentGrant>(recordId, "CONSENT#");
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

  listCustodyCopies(recordId: string): Promise<CustodyCopy[]> {
    return this.queryByPrefix<CustodyCopy>(recordId, "COPY#");
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
}
