// Launch-gate approvals, attributable to a verified founder.
//
// 0.2 recorded gates from the admin script with a free-text "--by" name:
// an assertion, not an authentication. In 0.2.1 a gate can only be
// approved in the console by a signed-in operator who:
//   - is an active founder in Flight Deck's operator table;
//   - signed in through Cognito (MFA enforced by the pool), with the
//     provider subject bound to that operator;
//   - authenticated within the last APPROVAL_FRESHNESS_MS (a re-sign-in is
//     forced otherwise), so a stale session cannot approve.
// The approval is serialized, then signed by the server with a key derived
// from the session secret (held in the secret manager, never in the
// database), and journaled as a protective event. On every read the
// signature, the founder's current status, and the subject are checked
// again: a row inserted directly into the database, or an approval by
// someone since deactivated or demoted, opens nothing.
//
// The public form additionally requires a reference to the founder's
// separate written authorization and an explicit attestation, the console
// gate, and a privacy notice that is no longer a draft.
import { createHmac, timingSafeEqual } from "node:crypto";
import { GateError } from "./approvals";
import { privacyNoticeIsDraft, PRIVACY_NOTICE_VERSION } from "./config";
import { canonicalJson } from "./ids";
import type { Gate, GateRecord, IdentityStore, SessionActor } from "./identity";

export const APPROVAL_FRESHNESS_MS = 10 * 60 * 1000;

export function isFreshAuth(authTime: string | null, nowMs: number = Date.now()): boolean {
  return !!authTime && nowMs - Date.parse(authTime) <= APPROVAL_FRESHNESS_MS;
}

export const GATE_STATEMENTS: Record<Gate, string> = {
  console: "I approve opening the Flight Deck console to the operators named in it. This does not open the public form or permit any outbound message.",
  "public-form":
    "I approve opening the public interest form to collect real contact details under the privacy notice in force, as authorized in the written approval referenced here.",
};

export type GateApproval = {
  v: 1;
  gate: Gate;
  operatorId: string;
  providerSubject: string;
  authTime: string;
  approvedAt: string;
  statement: string;
  noticeVersion: string | null;
  writtenApprovalRef: string | null;
};

export type SignedGate = { approval: GateApproval; sig: string };

const key = (sessionSecret: string) => createHmac("sha256", sessionSecret).update("flight-deck:gate-signing").digest();

export function signGate(sessionSecret: string, approval: GateApproval): string {
  const sig = createHmac("sha256", key(sessionSecret)).update(canonicalJson(approval)).digest("hex");
  return JSON.stringify({ approval, sig } satisfies SignedGate);
}

export type GateCheck = { ok: true; approval: GateApproval } | { ok: false; reason: "unsigned" | "bad-signature" | "wrong-gate" | "approver-not-founder" | "approver-inactive" | "subject-mismatch" | "notice-changed" };

// Verifies a stored gate record against the server key and the operator's
// CURRENT standing.
export async function verifyGate(record: GateRecord, sessionSecret: string, identity: IdentityStore): Promise<GateCheck> {
  const raw = record.detail?.record;
  if (typeof raw !== "string") {
    return { ok: false, reason: "unsigned" };
  }
  let parsed: SignedGate;
  try {
    parsed = JSON.parse(raw) as SignedGate;
  } catch {
    return { ok: false, reason: "unsigned" };
  }
  if (!parsed?.approval || typeof parsed.sig !== "string" || !/^[a-f0-9]{64}$/.test(parsed.sig)) {
    return { ok: false, reason: "unsigned" };
  }
  const expected = createHmac("sha256", key(sessionSecret)).update(canonicalJson(parsed.approval)).digest();
  if (!timingSafeEqual(expected, Buffer.from(parsed.sig, "hex"))) {
    return { ok: false, reason: "bad-signature" };
  }
  const a = parsed.approval;
  if (a.gate !== record.gate) {
    return { ok: false, reason: "wrong-gate" };
  }
  const op = await identity.findOperator(a.operatorId);
  if (!op || !op.active) {
    return { ok: false, reason: "approver-inactive" };
  }
  if (op.role !== "founder") {
    return { ok: false, reason: "approver-not-founder" };
  }
  if (!op.cognitoSub || op.cognitoSub !== a.providerSubject) {
    return { ok: false, reason: "subject-mismatch" };
  }
  if (a.gate === "public-form" && a.noticeVersion !== PRIVACY_NOTICE_VERSION) {
    return { ok: false, reason: "notice-changed" };
  }
  return { ok: true, approval: a };
}

export type ApproveInput = { gate: Gate; attest: boolean; writtenApprovalRef?: string | null; noticeVersion?: string | null };

// Records an approval. Throws GateError with a code the UI explains.
export async function approveGate(deps: { identity: IdentityStore; sessionSecret: string; now: Date }, actor: SessionActor, input: ApproveInput): Promise<GateApproval> {
  if (actor.role !== "founder") {
    throw new GateError("founder-required");
  }
  const op = await deps.identity.findOperator(actor.id);
  if (!op || !op.active || op.role !== "founder") {
    throw new GateError("founder-required");
  }
  if (!actor.providerSubject || op.cognitoSub !== actor.providerSubject) {
    throw new GateError("reauth-required");
  }
  if (!actor.authTime || deps.now.getTime() - Date.parse(actor.authTime) > APPROVAL_FRESHNESS_MS) {
    throw new GateError("reauth-required");
  }
  if (!input.attest) {
    throw new GateError("confirm-required");
  }
  if (input.gate === "public-form") {
    const consoleGate = (await deps.identity.gates()).find((g) => g.gate === "console");
    if (!consoleGate || !(await verifyGate(consoleGate, deps.sessionSecret, deps.identity)).ok) {
      throw new GateError("console-gate-first");
    }
    if (privacyNoticeIsDraft()) {
      throw new GateError("notice-is-draft");
    }
    if (input.noticeVersion !== PRIVACY_NOTICE_VERSION) {
      throw new GateError("notice-changed");
    }
    const ref = (input.writtenApprovalRef ?? "").trim();
    if (ref.length < 8 || ref.length > 300) {
      throw new GateError("written-approval-required");
    }
  }
  const approval: GateApproval = {
    v: 1,
    gate: input.gate,
    operatorId: op.id,
    providerSubject: op.cognitoSub!,
    authTime: actor.authTime,
    approvedAt: deps.now.toISOString(),
    statement: GATE_STATEMENTS[input.gate],
    noticeVersion: input.gate === "public-form" ? PRIVACY_NOTICE_VERSION : null,
    writtenApprovalRef: input.gate === "public-form" ? (input.writtenApprovalRef ?? "").trim() : null,
  };
  await deps.identity.recordGate(input.gate, op.id, signGate(deps.sessionSecret, approval), deps.now);
  return approval;
}
