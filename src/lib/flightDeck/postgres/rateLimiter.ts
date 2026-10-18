// Durable, shared rate limiting for the public form: correct across any
// number of server instances, unlike the in-memory limiter (../abuse.ts).
//
// Fixed windows: each hit increments the counter for (key, window start)
// with one atomic upsert and reads the new count back. Keys are already
// keyed hashes (abuse.ts clientKey, sha256 of an address), so no address
// or IP is stored. Old windows are purged by the worker.
import type { Pool } from "pg";
import type { RateLimiter } from "../abuse";

export class PostgresRateLimiter implements RateLimiter {
  constructor(private readonly pool: Pool) {}

  async hit(key: string, limit: number, windowMs: number, now: number): Promise<boolean> {
    const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
    const { rows } = await this.pool.query(
      `insert into fd_rate_limits (key, window_start, count) values ($1, $2, 1)
       on conflict (key, window_start) do update set count = fd_rate_limits.count + 1
       returning count`,
      [key, windowStart],
    );
    return (rows[0].count as number) <= limit;
  }

  async purgeOlderThan(cutoff: Date): Promise<number> {
    const res = await this.pool.query("delete from fd_rate_limits where window_start < $1", [cutoff]);
    return res.rowCount ?? 0;
  }
}
