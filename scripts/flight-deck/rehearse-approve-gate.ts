// REHEARSAL ONLY (scripts/flight-deck/rehearse-production.mjs).
//
// Approves the console gate through the same code the console uses
// (approveGate → signed record → protective log → fd_activation_gates),
// standing in for the one step a local rehearsal cannot perform: a real
// Cognito sign-in with MFA. It binds a fictitious provider subject to the
// founder and presents a session that authenticated "just now". On a real
// deployment the subject and auth_time come only from a verified Cognito
// ID token (oidc.ts); there is no other way to approve a gate.
//
//   tsx rehearse-approve-gate.ts <founder email> <fictitious subject>
import { approveGate } from "../../src/lib/flightDeck/gates";
import { PostgresIdentityStore, type SessionActor } from "../../src/lib/flightDeck/identity";
import { createPool } from "../../src/lib/flightDeck/postgres/pool";
import { S3ProtectiveSink } from "../../src/lib/flightDeck/s3Sink";

const [email, subject] = process.argv.slice(2);
const env = process.env;

async function main() {
  if (!email || !subject || !env.FLIGHT_DECK_DATABASE_URL || !env.FLIGHT_DECK_SESSION_SECRET || !env.FLIGHT_DECK_PROTECTIVE_ENDPOINT) {
    console.error("rehearsal only: needs <email> <subject> and the rehearsal environment");
    process.exit(2);
  }
  const pool = createPool(env.FLIGHT_DECK_DATABASE_URL, { ca: env.FLIGHT_DECK_DATABASE_CA_PEM ?? null, max: 2, applicationName: "flight-deck-rehearsal" });
  try {
    const sink = new S3ProtectiveSink({ bucket: env.FLIGHT_DECK_PROTECTIVE_BUCKET!, region: env.FLIGHT_DECK_PROTECTIVE_REGION!, endpoint: env.FLIGHT_DECK_PROTECTIVE_ENDPOINT });
    const identity = new PostgresIdentityStore(pool, { sink, requireJournal: true, synthetic: false });
    const op = await identity.findOperatorByEmail(email);
    if (!op) {
      throw new Error("no such operator");
    }
    // Stands in for the first Cognito sign-in, which binds the subject.
    await identity.bindSub(op.id, subject);
    const now = new Date();
    const actor: SessionActor = { id: op.id, role: op.role, displayName: op.displayName, providerSubject: subject, authTime: now.toISOString() };
    const approval = await approveGate({ identity, sessionSecret: env.FLIGHT_DECK_SESSION_SECRET, now }, actor, { gate: "console", attest: true });
    console.log(JSON.stringify({ ok: true, gate: approval.gate }));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: (e as { code?: string }).code ?? (e instanceof Error ? e.message : String(e)) }));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
