import { test } from "node:test";
import assert from "node:assert/strict";
import type { FixtureRecord } from "../domain/types";
import { InMemoryFixtureStore, InMemoryIntakeRegisterCommitter, InMemoryRestrictionRegisterStore } from "../store/memoryStore";
import type { FixtureStore } from "../store/store";
import { createSubmission } from "./intake";
import { correctRecord, redactText } from "./lifecycle";
import { readIntakeQueue, readIntakeSubmission } from "./intakeViews";

const STAFF = "staff:reviewer@example.invalid";

function setup() {
  const fixtureStore = new InMemoryFixtureStore();
  const registerStore = new InMemoryRestrictionRegisterStore();
  const intakeCommitter = new InMemoryIntakeRegisterCommitter(fixtureStore, registerStore);
  return { fixtureStore, registerStore, intakeCommitter };
}

let createCounter = 0;
async function createBasicSubmission(deps: ReturnType<typeof setup>) {
  createCounter++;
  const request = await createSubmission(deps.fixtureStore, deps.intakeCommitter, {
    requestId: `create-${createCounter}`,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] new submission",
    fixtureSetId: "fixture-set-intake-views-test",
    title: "[SYNTHETIC] original title",
    summary: "[SYNTHETIC] summary",
    provenanceRef: "fixture://invented-intake-views",
  });
  return request.recordId;
}

// A redact-then-correct cycle, run for real against the same stores, used
// as an injected side effect to simulate the exact race a reviewer
// reproduced: redaction sets the register's redactedTextFields AND masks
// the live field, but a LATER correction overwrites that live field with
// new raw content regardless of the redaction flag — only a FRESH
// register read (not one captured before this cycle runs) re-masks it.
async function redactThenCorrect(
  fixtureStore: FixtureStore,
  registerStore: InMemoryRestrictionRegisterStore,
  recordId: string,
  leakedText: string,
) {
  await redactText(fixtureStore, registerStore, {
    requestId: `redact-${recordId}`,
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] redact",
    field: "title",
  });
  await correctRecord(fixtureStore, {
    requestId: `correct-${recordId}`,
    recordId,
    requesterCapacity: STAFF,
    reason: "[SYNTHETIC] correct after redaction",
    field: "title",
    correctedValue: leakedText,
  });
}

// Delegates every FixtureStore method to the real, already-populated
// store — EXCEPT getRecord, which runs the race above as a side effect
// the FIRST time it's called for the target recordId, then returns the
// PRE-race record (exactly as the real store would have at that instant).
// This proves readIntakeSubmission/readIntakeQueue are safe even though
// the record value they already captured predates the race: their LATER
// register read (taken last, by design) still reflects it.
class RaceOnFirstGetRecord implements FixtureStore {
  private fired = false;
  constructor(
    private readonly inner: InMemoryFixtureStore,
    private readonly registerStore: InMemoryRestrictionRegisterStore,
    private readonly targetRecordId: string,
    private readonly leakedText: string,
  ) {}

  async getRecord(recordId: string): Promise<FixtureRecord | null> {
    const result = await this.inner.getRecord(recordId);
    if (!this.fired && recordId === this.targetRecordId) {
      this.fired = true;
      await redactThenCorrect(this.inner, this.registerStore, this.targetRecordId, this.leakedText);
    }
    return result;
  }

  // Everything else is a plain pass-through.
  putRecord(...a: Parameters<FixtureStore["putRecord"]>) { return this.inner.putRecord(...a); }
  deleteRecord(...a: Parameters<FixtureStore["deleteRecord"]>) { return this.inner.deleteRecord(...a); }
  listAuthorityClaims(...a: Parameters<FixtureStore["listAuthorityClaims"]>) { return this.inner.listAuthorityClaims(...a); }
  putAuthorityClaim(...a: Parameters<FixtureStore["putAuthorityClaim"]>) { return this.inner.putAuthorityClaim(...a); }
  getAuthorityClaim(...a: Parameters<FixtureStore["getAuthorityClaim"]>) { return this.inner.getAuthorityClaim(...a); }
  listLegalRights(...a: Parameters<FixtureStore["listLegalRights"]>) { return this.inner.listLegalRights(...a); }
  putLegalRight(...a: Parameters<FixtureStore["putLegalRight"]>) { return this.inner.putLegalRight(...a); }
  getLegalRight(...a: Parameters<FixtureStore["getLegalRight"]>) { return this.inner.getLegalRight(...a); }
  listConsentGrants(...a: Parameters<FixtureStore["listConsentGrants"]>) { return this.inner.listConsentGrants(...a); }
  getConsentGrant(...a: Parameters<FixtureStore["getConsentGrant"]>) { return this.inner.getConsentGrant(...a); }
  putConsentGrant(...a: Parameters<FixtureStore["putConsentGrant"]>) { return this.inner.putConsentGrant(...a); }
  listCustodyCopies(...a: Parameters<FixtureStore["listCustodyCopies"]>) { return this.inner.listCustodyCopies(...a); }
  putCustodyCopy(...a: Parameters<FixtureStore["putCustodyCopy"]>) { return this.inner.putCustodyCopy(...a); }
  createLifecycleRequest(...a: Parameters<FixtureStore["createLifecycleRequest"]>) { return this.inner.createLifecycleRequest(...a); }
  getLifecycleRequest(...a: Parameters<FixtureStore["getLifecycleRequest"]>) { return this.inner.getLifecycleRequest(...a); }
  updateLifecycleRequest(...a: Parameters<FixtureStore["updateLifecycleRequest"]>) { return this.inner.updateLifecycleRequest(...a); }
  listLifecycleRequestsByStatus(...a: Parameters<FixtureStore["listLifecycleRequestsByStatus"]>) { return this.inner.listLifecycleRequestsByStatus(...a); }
  putAuditReceipt(...a: Parameters<FixtureStore["putAuditReceipt"]>) { return this.inner.putAuditReceipt(...a); }
  listAuditReceipts(...a: Parameters<FixtureStore["listAuditReceipts"]>) { return this.inner.listAuditReceipts(...a); }
  listCorrections(...a: Parameters<FixtureStore["listCorrections"]>) { return this.inner.listCorrections(...a); }
  putCorrection(...a: Parameters<FixtureStore["putCorrection"]>) { return this.inner.putCorrection(...a); }
  getCorrection(...a: Parameters<FixtureStore["getCorrection"]>) { return this.inner.getCorrection(...a); }
  listRedactions(...a: Parameters<FixtureStore["listRedactions"]>) { return this.inner.listRedactions(...a); }
  putRedaction(...a: Parameters<FixtureStore["putRedaction"]>) { return this.inner.putRedaction(...a); }
  getRedaction(...a: Parameters<FixtureStore["getRedaction"]>) { return this.inner.getRedaction(...a); }
  putRecordWithCorrection(...a: Parameters<FixtureStore["putRecordWithCorrection"]>) { return this.inner.putRecordWithCorrection(...a); }
  putRecordWithRedaction(...a: Parameters<FixtureStore["putRecordWithRedaction"]>) { return this.inner.putRecordWithRedaction(...a); }
  putRecordWithCustodyCopy(...a: Parameters<FixtureStore["putRecordWithCustodyCopy"]>) { return this.inner.putRecordWithCustodyCopy(...a); }
}

test("readIntakeSubmission never leaks raw content from a redact-then-correct race landing between its reads", async () => {
  const deps = setup();
  const recordId = await createBasicSubmission(deps);
  const leaked = "[SYNTHETIC] LEAKED RAW TITLE — must never appear in the result";
  const racingStore = new RaceOnFirstGetRecord(deps.fixtureStore, deps.registerStore, recordId, leaked);

  const view = await readIntakeSubmission(racingStore, deps.registerStore, recordId);
  assert.ok(view);
  assert.notEqual(view!.record.title, leaked);
  assert.equal(view!.record.title, "[REDACTED]");
});

test("readIntakeQueue never leaks raw content from the same race, for the pendingPreservation entry", async () => {
  const deps = setup();
  const recordId = await createBasicSubmission(deps);
  const leaked = "[SYNTHETIC] LEAKED RAW TITLE — must never appear in the queue";
  const racingStore = new RaceOnFirstGetRecord(deps.fixtureStore, deps.registerStore, recordId, leaked);

  const view = await readIntakeQueue(racingStore, deps.registerStore);
  const entry = view.pendingPreservation.find((e) => e.recordId === recordId);
  assert.ok(entry, "expected the raced submission in pendingPreservation");
  assert.notEqual(entry!.title, leaked);
  assert.equal(entry!.title, "[REDACTED]");
});

// Counts getRecord calls by recordId — used to prove readIntakeQueue's
// cheap pre-filter actually skips the expensive per-entry reads for
// entries the scan's own data already rules out, rather than reading
// every single register entry regardless of eligibility.
class CountingFixtureStore implements FixtureStore {
  readonly getRecordCalls: string[] = [];
  constructor(private readonly inner: InMemoryFixtureStore) {}
  async getRecord(recordId: string) {
    this.getRecordCalls.push(recordId);
    return this.inner.getRecord(recordId);
  }
  putRecord(...a: Parameters<FixtureStore["putRecord"]>) { return this.inner.putRecord(...a); }
  deleteRecord(...a: Parameters<FixtureStore["deleteRecord"]>) { return this.inner.deleteRecord(...a); }
  listAuthorityClaims(...a: Parameters<FixtureStore["listAuthorityClaims"]>) { return this.inner.listAuthorityClaims(...a); }
  putAuthorityClaim(...a: Parameters<FixtureStore["putAuthorityClaim"]>) { return this.inner.putAuthorityClaim(...a); }
  getAuthorityClaim(...a: Parameters<FixtureStore["getAuthorityClaim"]>) { return this.inner.getAuthorityClaim(...a); }
  listLegalRights(...a: Parameters<FixtureStore["listLegalRights"]>) { return this.inner.listLegalRights(...a); }
  putLegalRight(...a: Parameters<FixtureStore["putLegalRight"]>) { return this.inner.putLegalRight(...a); }
  getLegalRight(...a: Parameters<FixtureStore["getLegalRight"]>) { return this.inner.getLegalRight(...a); }
  listConsentGrants(...a: Parameters<FixtureStore["listConsentGrants"]>) { return this.inner.listConsentGrants(...a); }
  getConsentGrant(...a: Parameters<FixtureStore["getConsentGrant"]>) { return this.inner.getConsentGrant(...a); }
  putConsentGrant(...a: Parameters<FixtureStore["putConsentGrant"]>) { return this.inner.putConsentGrant(...a); }
  listCustodyCopies(...a: Parameters<FixtureStore["listCustodyCopies"]>) { return this.inner.listCustodyCopies(...a); }
  putCustodyCopy(...a: Parameters<FixtureStore["putCustodyCopy"]>) { return this.inner.putCustodyCopy(...a); }
  createLifecycleRequest(...a: Parameters<FixtureStore["createLifecycleRequest"]>) { return this.inner.createLifecycleRequest(...a); }
  getLifecycleRequest(...a: Parameters<FixtureStore["getLifecycleRequest"]>) { return this.inner.getLifecycleRequest(...a); }
  updateLifecycleRequest(...a: Parameters<FixtureStore["updateLifecycleRequest"]>) { return this.inner.updateLifecycleRequest(...a); }
  listLifecycleRequestsByStatus(...a: Parameters<FixtureStore["listLifecycleRequestsByStatus"]>) { return this.inner.listLifecycleRequestsByStatus(...a); }
  putAuditReceipt(...a: Parameters<FixtureStore["putAuditReceipt"]>) { return this.inner.putAuditReceipt(...a); }
  listAuditReceipts(...a: Parameters<FixtureStore["listAuditReceipts"]>) { return this.inner.listAuditReceipts(...a); }
  listCorrections(...a: Parameters<FixtureStore["listCorrections"]>) { return this.inner.listCorrections(...a); }
  putCorrection(...a: Parameters<FixtureStore["putCorrection"]>) { return this.inner.putCorrection(...a); }
  getCorrection(...a: Parameters<FixtureStore["getCorrection"]>) { return this.inner.getCorrection(...a); }
  listRedactions(...a: Parameters<FixtureStore["listRedactions"]>) { return this.inner.listRedactions(...a); }
  putRedaction(...a: Parameters<FixtureStore["putRedaction"]>) { return this.inner.putRedaction(...a); }
  getRedaction(...a: Parameters<FixtureStore["getRedaction"]>) { return this.inner.getRedaction(...a); }
  putRecordWithCorrection(...a: Parameters<FixtureStore["putRecordWithCorrection"]>) { return this.inner.putRecordWithCorrection(...a); }
  putRecordWithRedaction(...a: Parameters<FixtureStore["putRecordWithRedaction"]>) { return this.inner.putRecordWithRedaction(...a); }
  putRecordWithCustodyCopy(...a: Parameters<FixtureStore["putRecordWithCustodyCopy"]>) { return this.inner.putRecordWithCustodyCopy(...a); }
}

test("readIntakeQueue's cheap pre-filter skips expensive per-entry reads for ineligible entries — the real throttling fix", async () => {
  const deps = setup();
  // Many ineligible submissions (approved to preserved+published, i.e. not
  // quarantined and not "preserved+not-published" either) plus exactly one
  // genuinely eligible one — simulates this engagement's own accumulated
  // register history, where most rows are long past the intake queue's
  // concern.
  const ineligibleIds: string[] = [];
  for (let i = 0; i < 10; i++) {
    const id = await createBasicSubmission(deps);
    // Push each straight to "preserved" + "published" — ineligible for
    // BOTH queue halves — via a direct register write, cheaper than a full
    // approval flow for a test that's only about read counts.
    const control = await deps.registerStore.getCurrent(id);
    await deps.registerStore.setCurrent(
      { ...control!, currentCustodyStatus: "preserved", currentPublicationStatus: "published", controlVersion: control!.controlVersion + 1 },
      control!.controlVersion,
    );
    ineligibleIds.push(id);
  }
  const eligibleId = await createBasicSubmission(deps);

  const countingStore = new CountingFixtureStore(deps.fixtureStore);
  const view = await readIntakeQueue(countingStore, deps.registerStore);

  assert.equal(view.pendingPreservation.length, 1);
  assert.equal(view.pendingPreservation[0].recordId, eligibleId);
  for (const id of ineligibleIds) {
    assert.equal(countingStore.getRecordCalls.includes(id), false, `getRecord must never have been called for ineligible ${id}`);
  }
});
