// Appending protective events from inside an open PostgreSQL transaction.
//
// Locks the head row (FOR UPDATE), chains the events onto it, writes them
// to the external log, and moves the head, all before the caller commits.
// A concurrent writer waits on the lock and then, under SERIALIZABLE,
// fails with a serialization error and retries from the new head, so
// sequence numbers stay contiguous. If the external write fails, the
// caller's transaction is rolled back (ProtectiveWriteFailed or
// RecoveryRequired) and nothing commits.
import type { PoolClient } from "pg";
import { journalBodies } from "../store";
import type { JournalHead, ProtectiveBody, ProtectiveSink } from "../protective";

export async function readHead(client: { query: PoolClient["query"] }, forUpdate = false): Promise<JournalHead> {
  const { rows } = await client.query(`select seq, hash from fd_protective_head where id = 1${forUpdate ? " for update" : ""}`);
  return { seq: Number(rows[0].seq), hash: String(rows[0].hash) };
}

export async function setHead(client: { query: PoolClient["query"] }, head: JournalHead) {
  await client.query("update fd_protective_head set seq = $1, hash = $2 where id = 1", [head.seq, head.hash]);
}

export async function appendWithinTransaction(client: PoolClient, sink: ProtectiveSink | null, requireJournal: boolean, bodies: ProtectiveBody[]): Promise<JournalHead | null> {
  if (!bodies.length) {
    return null;
  }
  const head = await readHead(client, true);
  const next = await journalBodies(sink, requireJournal, head, bodies);
  if (next.seq !== head.seq) {
    await setHead(client, next);
  }
  return next;
}
