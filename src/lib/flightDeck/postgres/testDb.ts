// Test-only: a throwaway PostgreSQL server for integration tests, started
// from the embedded-postgres dev dependency in a temporary directory, on a
// random local port, with a random password. Each test gets its own fresh
// database. Nothing here is used outside tests, and no data outlives the
// test run.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomInt } from "node:crypto";
import pg from "pg";
import { initializeDatabase, migrate } from "./migrations";

export type TestServer = {
  port: number;
  password: string;
  newDatabase(opts?: { synthetic?: boolean; migrateIt?: boolean }): Promise<{ name: string; url: string; pool: pg.Pool }>;
  // A full copy of a database at this moment (CREATE DATABASE ... TEMPLATE):
  // the closest local stand-in for a provider snapshot or point-in-time
  // restore. Ends other sessions on the source first, as Postgres requires.
  cloneDatabase(from: string): Promise<{ name: string; url: string; pool: pg.Pool }>;
  stop(): Promise<void>;
};

export async function startTestServer(): Promise<TestServer> {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-pg-"));
  const port = 56000 + randomInt(0, 4000);
  const password = randomBytes(12).toString("hex");
  const server = new EmbeddedPostgres({ databaseDir: dir, user: "fd_test", password, port, persistent: false, onLog: () => {}, onError: () => {} });
  await server.initialise();
  await server.start();
  const pools: pg.Pool[] = [];
  let n = 0;
  return {
    port,
    password,
    async newDatabase(opts = {}) {
      const name = `fd_t${process.pid}_${++n}`;
      await server.createDatabase(name);
      const url = `postgresql://fd_test:${password}@127.0.0.1:${port}/${name}`;
      const pool = new pg.Pool({ connectionString: url, max: 10 });
      pool.on("error", () => undefined);
      pools.push(pool);
      if (opts.migrateIt !== false) {
        const client = await pool.connect();
        try {
          await migrate(client);
          await initializeDatabase(client, { synthetic: opts.synthetic ?? true });
        } finally {
          client.release();
        }
      }
      return { name, url, pool };
    },
    async cloneDatabase(from) {
      const name = `fd_t${process.pid}_${++n}_clone`;
      const admin = new pg.Client({ connectionString: `postgresql://fd_test:${password}@127.0.0.1:${port}/postgres` });
      await admin.connect();
      try {
        await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()", [from]);
        await admin.query(`create database "${name}" template "${from}"`);
      } finally {
        await admin.end();
      }
      const url = `postgresql://fd_test:${password}@127.0.0.1:${port}/${name}`;
      const pool = new pg.Pool({ connectionString: url, max: 10 });
      pool.on("error", () => undefined);
      pools.push(pool);
      return { name, url, pool };
    },
    async stop() {
      await Promise.all(pools.map((p) => p.end().catch(() => undefined)));
      await server.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
