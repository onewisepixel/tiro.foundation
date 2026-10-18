// Flight Deck administration, run deliberately from a trusted machine with
// database credentials. Never reachable from the web.
//
//   npm run flight-deck:admin -- <command> [options]
//
//   check-config                      list missing/invalid production settings (names only)
//   migrate                           apply pending migrations (advisory-locked)
//   init --real | --synthetic         mark a freshly migrated database (once, irreversible)
//   add-operator --email E --name N --role founder|operator|reviewer
//   list-operators
//   list-gates                        show recorded gates and whether each verifies
//                                     (gates are approved in the console, not here)
//   export-snapshot <file>            logical backup of operations data (restore drills)
//   import-snapshot <file>            into an EMPTY database (restore drills); locks contact
//   mark-restored                     after a provider restore (point in time or snapshot):
//                                     locks contact until recovery is verified, ends all sessions
//   replay-ledger <file> --operator <usr_id>   reconciliation checkpoint; lifts are never
//                                     re-applied (they become founder confirmation tasks)
//
// Reads FLIGHT_DECK_DATABASE_URL (and FLIGHT_DECK_EMAIL_HASH_PEPPER where the
// operations store is opened). On a real-data database, every change goes
// through the protective event log, exactly as in the app: set
// FLIGHT_DECK_PROTECTIVE_BUCKET and FLIGHT_DECK_PROTECTIVE_REGION (and AWS
// credentials allowed to write it), or commands that change data refuse. Prints counts and codes, never secrets or
// personal data.
import fs from "node:fs";
import type pg from "pg";
import { createPool } from "../../src/lib/flightDeck/postgres/pool";
import { productionConfigProblems } from "../../src/lib/flightDeck/config";
import { PostgresIdentityStore } from "../../src/lib/flightDeck/identity";
import { verifyGate } from "../../src/lib/flightDeck/gates";
import { LocalFileProtectiveSink, type ProtectiveSink } from "../../src/lib/flightDeck/protective";
import { markRestored } from "../../src/lib/flightDeck/recovery";
import { S3ProtectiveSink } from "../../src/lib/flightDeck/s3Sink";
import { replayLedger, type Ledger } from "../../src/lib/flightDeck/ledger";
import { initializeDatabase, migrate } from "../../src/lib/flightDeck/postgres/migrations";
import { PostgresOperationsStore } from "../../src/lib/flightDeck/postgres/store";
import type { Role } from "../../src/lib/flightDeck/types";

const [command, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const has = (name: string) => rest.includes(`--${name}`);

function fail(message: string): never {
  console.error(`flight-deck-admin: ${message}`);
  process.exit(1);
}

function pool(): pg.Pool {
  const url = process.env.FLIGHT_DECK_DATABASE_URL;
  if (!url) {
    fail("FLIGHT_DECK_DATABASE_URL is not set");
  }
  return createPool(url, { ca: process.env.FLIGHT_DECK_DATABASE_CA_PEM ?? null, max: 2, applicationName: "flight-deck-admin" });
}

async function opsStore(p: pg.Pool) {
  const { rows } = await p.query("select value from fd_meta where key = 'synthetic'");
  if (!rows.length) {
    fail("database not initialized; run init first");
  }
  const synthetic = rows[0].value === true;
  const pepper = process.env.FLIGHT_DECK_EMAIL_HASH_PEPPER ?? (synthetic ? "flight-deck-local-demo-pepper-synthetic-only-0001" : "");
  if (!synthetic && pepper.length < 32) {
    fail("FLIGHT_DECK_EMAIL_HASH_PEPPER is required for a real-data database");
  }
  return PostgresOperationsStore.open({ pool: p, pepper, synthetic, sink: protectiveSink(synthetic), requireJournal: true });
}

// The same log the app writes to. A real-data database requires the S3
// log; the synthetic local demo uses its local file log.
function protectiveSink(synthetic: boolean): ProtectiveSink {
  const env = process.env;
  if (env.FLIGHT_DECK_PROTECTIVE_BUCKET && env.FLIGHT_DECK_PROTECTIVE_REGION) {
    return new S3ProtectiveSink({ bucket: env.FLIGHT_DECK_PROTECTIVE_BUCKET, region: env.FLIGHT_DECK_PROTECTIVE_REGION, prefix: env.FLIGHT_DECK_PROTECTIVE_PREFIX || "flight-deck/", ...(env.FLIGHT_DECK_PROTECTIVE_ENDPOINT ? { endpoint: env.FLIGHT_DECK_PROTECTIVE_ENDPOINT } : {}) });
  }
  if (synthetic) {
    return new LocalFileProtectiveSink(".flight-deck/protective-pg");
  }
  fail("FLIGHT_DECK_PROTECTIVE_BUCKET and FLIGHT_DECK_PROTECTIVE_REGION are required for a real-data database");
}

async function main() {
  switch (command) {
    case "check-config": {
      const problems = productionConfigProblems({ ...process.env, NODE_ENV: "production" });
      console.log(problems.length ? `production configuration incomplete:\n- ${problems.join("\n- ")}` : "production configuration complete");
      process.exit(problems.length ? 1 : 0);
    }
    case "migrate": {
      const p = pool();
      const c = await p.connect();
      try {
        const r = await migrate(c);
        console.log(`applied: ${r.applied.join(", ") || "none"}; already applied: ${r.alreadyApplied.length}`);
      } finally {
        c.release();
        await p.end();
      }
      return;
    }
    case "init": {
      if (has("real") === has("synthetic")) {
        fail("choose exactly one of --real or --synthetic");
      }
      const p = pool();
      const c = await p.connect();
      try {
        await initializeDatabase(c, { synthetic: has("synthetic") });
        console.log(`database marked ${has("synthetic") ? "synthetic" : "real"}`);
      } finally {
        c.release();
        await p.end();
      }
      return;
    }
    case "add-operator": {
      const email = flag("email");
      const name = flag("name");
      const role = flag("role") as Role | undefined;
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name || !role || !["founder", "operator", "reviewer"].includes(role)) {
        fail("usage: add-operator --email E --name N --role founder|operator|reviewer");
      }
      const p = pool();
      try {
        const op = await new PostgresIdentityStore(p).addOperator({ email, displayName: name, role }, new Date());
        console.log(`added operator ${op.id} (${role}); they must also exist in the Cognito pool and the "flight-deck" group`);
      } finally {
        await p.end();
      }
      return;
    }
    case "list-operators": {
      const p = pool();
      try {
        for (const o of await new PostgresIdentityStore(p).listOperators()) {
          console.log(`${o.id}  ${o.role.padEnd(8)}  ${o.active ? "active" : "deactivated"}  ${o.cognitoSub ? "bound" : "not yet signed in"}`);
        }
      } finally {
        await p.end();
      }
      return;
    }
    case "record-gate": {
      // 0.2.1: gates are approved only in the console, by an active founder
      // who has just signed in through Cognito with MFA; the approval is
      // signed by the server and journaled (src/lib/flightDeck/gates.ts). A
      // name typed here would be an assertion, not an authentication.
      fail("gates can no longer be recorded from this script. Sign in to /flight-deck as a founder (with MFA) and use /flight-deck/gates.");
    }
    case "list-gates": {
      const p = pool();
      try {
        const identity = new PostgresIdentityStore(p);
        const secret = process.env.FLIGHT_DECK_SESSION_SECRET;
        for (const g of await identity.gates()) {
          const check = secret ? await verifyGate(g, secret, identity) : null;
          console.log(`${g.gate.padEnd(12)} approved by ${g.approvedBy} at ${g.approvedAt}  ${check ? (check.ok ? "signature and approver verified" : `NOT VALID (${check.reason})`) : "(set FLIGHT_DECK_SESSION_SECRET to verify)"}`);
        }
      } finally {
        await p.end();
      }
      return;
    }
    case "export-snapshot": {
      const file = rest[0] ?? fail("usage: export-snapshot <file>");
      const p = pool();
      try {
        const snap = await (await opsStore(p)).exportSnapshot();
        fs.writeFileSync(file, JSON.stringify(snap), { mode: 0o600 });
        console.log(`exported ${Object.values(snap.collections).reduce((n, c) => n + Object.keys(c).length, 0)} rows to ${file} (contains personal data if the database is real: store it encrypted)`);
      } finally {
        await p.end();
      }
      return;
    }
    case "import-snapshot": {
      const file = rest[0] ?? fail("usage: import-snapshot <file>");
      const p = pool();
      try {
        await (await opsStore(p)).importSnapshot(JSON.parse(fs.readFileSync(file, "utf8")));
        console.log("imported; contact is locked until recovery is verified: the worker does this on its next run, or a founder can from Health");
      } finally {
        await p.end();
      }
      return;
    }
    case "mark-restored": {
      const p = pool();
      try {
        await markRestored(await opsStore(p));
        // Sessions live in the database: a restore could revive one that
        // was signed out after the backup. Everyone signs in again.
        const ended = await p.query("update fd_sessions set revoked_at = now() where revoked_at is null");
        console.log(`marked as restored: contact is locked until recovery is verified (the worker does this on its next run, or a founder from Health); ${ended.rowCount ?? 0} session(s) ended`);
      } finally {
        await p.end();
      }
      return;
    }
    case "replay-ledger": {
      const file = rest[0];
      const operatorId = flag("operator");
      if (!file || !operatorId) {
        fail("usage: replay-ledger <file> --operator <usr_id>");
      }
      const p = pool();
      try {
        const op = (await new PostgresIdentityStore(p).listOperators()).find((o) => o.id === operatorId && o.active && o.role === "founder");
        if (!op) {
          fail("replay must be run as an active founder operator");
        }
        const ledger = JSON.parse(fs.readFileSync(file, "utf8")) as Ledger;
        const store = await opsStore(p);
        const r = await store.transaction((tx) => replayLedger(tx, { id: op.id, role: "founder", displayName: op.displayName }, ledger));
        console.log(`replayed: ${r.erased} erasures, ${r.suppressionsRestored} suppressions restored, ${r.liftsToConfirm} lift(s) left in force for a founder to confirm (Health)`);
      } finally {
        await p.end();
      }
      return;
    }
    default:
      fail(`unknown command "${command ?? ""}"; see the header of scripts/flight-deck/admin.ts`);
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : "failed"));
