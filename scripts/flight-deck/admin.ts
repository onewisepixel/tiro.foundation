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
//   record-gate console --by "Name"
//   record-gate public-form --by "Name" --notice-version V
//   export-snapshot <file>            logical backup of operations data (restore drills)
//   import-snapshot <file>            into an EMPTY database (restore drills)
//   replay-ledger <file> --operator <usr_id>   after any restore, before reopening
//
// Reads FLIGHT_DECK_DATABASE_URL (and FLIGHT_DECK_EMAIL_HASH_PEPPER where the
// operations store is opened). Prints counts and codes, never secrets or
// personal data.
import fs from "node:fs";
import type pg from "pg";
import { createPool } from "../../src/lib/flightDeck/postgres/pool";
import { productionConfigProblems, privacyNoticeIsDraft, PRIVACY_NOTICE_VERSION } from "../../src/lib/flightDeck/config";
import { GATES, PostgresIdentityStore, type Gate } from "../../src/lib/flightDeck/identity";
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
  return PostgresOperationsStore.open({ pool: p, pepper, synthetic });
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
      const gate = rest[0] as Gate;
      const by = flag("by");
      if (!GATES.includes(gate) || !by) {
        fail(`usage: record-gate ${GATES.join("|")} --by "Name"`);
      }
      const p = pool();
      try {
        const identity = new PostgresIdentityStore(p);
        const detail: Record<string, unknown> = { recordedWith: "flight-deck-admin" };
        if (gate === "console") {
          const founders = (await identity.listOperators()).filter((o) => o.role === "founder" && o.active);
          if (!founders.length) {
            fail("the console gate needs at least one active founder operator first");
          }
        }
        if (gate === "public-form") {
          if (privacyNoticeIsDraft()) {
            fail(`refusing: the privacy notice (${PRIVACY_NOTICE_VERSION}) is still a draft; replace it with the reviewed text and a non-draft version first`);
          }
          if (flag("notice-version") !== PRIVACY_NOTICE_VERSION) {
            fail(`--notice-version must equal the notice in this build (${PRIVACY_NOTICE_VERSION})`);
          }
          detail.noticeVersion = PRIVACY_NOTICE_VERSION;
        }
        await identity.recordGate(gate, by, detail, new Date());
        console.log(`gate "${gate}" recorded by ${by}`);
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
        console.log("imported; now run replay-ledger before reopening the console or the worker");
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
        console.log(`replayed: ${r.erased} erasures, ${r.suppressionsRestored} suppressions restored, ${r.suppressionsLifted} lifted`);
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
