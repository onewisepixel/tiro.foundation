// Connection pools for the operations database, shared by the web runtime
// and the admin script.
//
// node-postgres lets sslmode/sslrootcert in the URL override the `ssl`
// option, which would silently drop a configured CA. When TLS is required,
// those URL parameters are removed and verification is set explicitly:
// certificate chain AND hostname, against the provider's CA if one is
// configured (FLIGHT_DECK_DATABASE_CA_PEM), else the system trust store.
import pg from "pg";

export function withoutTlsParams(url: string): string {
  const u = new URL(url);
  for (const k of ["sslmode", "sslrootcert", "sslcert", "sslkey", "ssl"]) {
    u.searchParams.delete(k);
  }
  return u.toString();
}

export function requiresTls(url: string): boolean {
  return /[?&]sslmode=(verify-full|verify-ca|require)\b/.test(url);
}

export function createPool(url: string, opts: { ca?: string | null; max?: number; applicationName?: string } = {}): pg.Pool {
  const tls = requiresTls(url);
  const pool = new pg.Pool({
    connectionString: tls ? withoutTlsParams(url) : url,
    ssl: tls ? { rejectUnauthorized: true, ...(opts.ca ? { ca: opts.ca } : {}) } : undefined,
    max: opts.max ?? 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    idle_in_transaction_session_timeout: 15_000,
    application_name: opts.applicationName ?? "flight-deck",
  });
  pool.on("error", (e) => console.error("flight-deck postgres pool:", e instanceof Error ? e.name : "error"));
  return pool;
}
