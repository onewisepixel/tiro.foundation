// Production sign-in through a dedicated Amazon Cognito user pool, using
// OpenID Connect authorization code flow with PKCE and a confidential
// client. Separate from the synthetic preservation backend's Cognito
// environment; nothing here reads or trusts that pool.
//
// What is verified on every sign-in:
//   - state (CSRF on the redirect) and the PKCE verifier, from a short-lived
//     signed HttpOnly cookie;
//   - the ID token's RS256 signature against the pool's published JWKS;
//   - iss (this pool), aud (this client), token_use = "id", exp/iat with a
//     small clock skew, nonce, and email_verified;
//   - membership of the required Cognito group;
//   - that the person is a NAMED, ACTIVE operator in Flight Deck's own
//     table (identity.ts). The role comes from that table, not the token.
//
// MFA is enforced by the user pool's configuration (MfaConfiguration ON;
// OperatorPool in deploy/flight-deck/flight-deck.template.json), which Cognito applies before
// it issues any token. Cognito ID tokens do not reliably carry an "amr"
// claim, so MFA cannot be re-checked per token; the deployment test checks
// the pool configuration instead.
import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify, type JsonWebKey } from "node:crypto";

export type CognitoConfig = {
  region: string;
  userPoolId: string;
  clientId: string;
  clientSecret: string;
  // Hosted UI / managed login domain, e.g. https://tiro-ops.auth.eu-west-2.amazoncognito.com
  domain: string;
  // Public https origin of this site, e.g. https://tiro.foundation
  publicOrigin: string;
  requiredGroup: string;
};

export const issuerFor = (c: Pick<CognitoConfig, "region" | "userPoolId">) => `https://cognito-idp.${c.region}.amazonaws.com/${c.userPoolId}`;
export const redirectUri = (c: CognitoConfig) => `${c.publicOrigin}/flight-deck/auth/callback`;
export const logoutUri = (c: CognitoConfig) => `${c.publicOrigin}/flight-deck/signed-out`;

const b64url = (buf: Buffer) => buf.toString("base64url");

// ---------- Login transaction (state, nonce, PKCE) ----------

export type LoginTransaction = { state: string; nonce: string; verifier: string; exp: number };
export const LOGIN_TTL_MS = 10 * 60 * 1000;

export function newLoginTransaction(now: number): LoginTransaction {
  return { state: b64url(randomBytes(24)), nonce: b64url(randomBytes(24)), verifier: b64url(randomBytes(48)), exp: now + LOGIN_TTL_MS };
}

export function pkceChallenge(verifier: string): string {
  return b64url(createHash("sha256").update(verifier).digest());
}

export function sealTransaction(t: LoginTransaction, secret: string): string {
  const payload = b64url(Buffer.from(JSON.stringify(t)));
  return `${payload}.${b64url(createHmac("sha256", secret).update(payload).digest())}`;
}

export function openTransaction(value: string | undefined, secret: string, now: number): LoginTransaction | null {
  if (!value || value.length > 1024) {
    return null;
  }
  const [payload, sig] = value.split(".");
  if (!payload || !sig) {
    return null;
  }
  const expected = Buffer.from(b64url(createHmac("sha256", secret).update(payload).digest()));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  try {
    const t = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as LoginTransaction;
    return typeof t.exp === "number" && t.exp > now && t.state && t.nonce && t.verifier ? t : null;
  } catch {
    return null;
  }
}

// reauth: force a fresh sign-in (launch-gate approvals), not a silent
// reuse of the identity provider's session.
export function authorizeUrl(c: CognitoConfig, t: LoginTransaction, opts: { reauth?: boolean } = {}): string {
  const u = new URL("/oauth2/authorize", c.domain);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", c.clientId);
  u.searchParams.set("redirect_uri", redirectUri(c));
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", t.state);
  u.searchParams.set("nonce", t.nonce);
  u.searchParams.set("code_challenge", pkceChallenge(t.verifier));
  u.searchParams.set("code_challenge_method", "S256");
  if (opts.reauth) {
    u.searchParams.set("prompt", "login");
    u.searchParams.set("max_age", "0");
  }
  return u.toString();
}

export function signOutUrl(c: CognitoConfig): string {
  const u = new URL("/logout", c.domain);
  u.searchParams.set("client_id", c.clientId);
  u.searchParams.set("logout_uri", logoutUri(c));
  return u.toString();
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export class OidcError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

// Exchanges the authorization code at the token endpoint (server to
// server; the client secret never reaches a browser).
export async function exchangeCode(c: CognitoConfig, code: string, verifier: string, fetchImpl: Fetch = fetch): Promise<string> {
  if (!/^[A-Za-z0-9._~-]{1,512}$/.test(code)) {
    throw new OidcError("bad-code");
  }
  const body = new URLSearchParams({ grant_type: "authorization_code", client_id: c.clientId, code, redirect_uri: redirectUri(c), code_verifier: verifier });
  const res = await fetchImpl(new URL("/oauth2/token", c.domain).toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}`,
    },
    body,
  });
  if (!res.ok) {
    throw new OidcError("token-exchange-failed");
  }
  const json = (await res.json()) as { id_token?: unknown };
  if (typeof json.id_token !== "string") {
    throw new OidcError("no-id-token");
  }
  return json.id_token;
}

// ---------- JWKS and ID token verification ----------

type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

export class JwksCache {
  private keys = new Map<string, Jwk>();
  private fetchedAt = 0;

  constructor(
    private readonly url: string,
    private readonly fetchImpl: Fetch = fetch,
    private readonly ttlMs = 60 * 60 * 1000,
  ) {}

  async key(kid: string, now: number): Promise<Jwk | null> {
    const fresh = now - this.fetchedAt < this.ttlMs;
    // An unknown kid triggers at most one refresh per minute (key rotation).
    if (!this.keys.has(kid) && (!fresh || now - this.fetchedAt > 60_000)) {
      await this.refresh(now);
    }
    return this.keys.get(kid) ?? null;
  }

  private async refresh(now: number) {
    const res = await this.fetchImpl(this.url);
    if (!res.ok) {
      throw new OidcError("jwks-unavailable");
    }
    const { keys } = (await res.json()) as { keys?: Jwk[] };
    this.keys = new Map((keys ?? []).filter((k) => k.kid && k.kty === "RSA").map((k) => [k.kid!, k]));
    this.fetchedAt = now;
  }
}

export type IdClaims = { sub: string; email: string; groups: string[]; authTime: number | null };

const SKEW_S = 60;

export async function verifyIdToken(token: string, c: CognitoConfig, jwks: JwksCache, opts: { now: number; nonce: string }): Promise<IdClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new OidcError("malformed-token");
  }
  let header: { alg?: string; kid?: string };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new OidcError("malformed-token");
  }
  // Only RS256. Never "none", never an HMAC algorithm keyed with a public key.
  if (header.alg !== "RS256" || !header.kid) {
    throw new OidcError("bad-algorithm");
  }
  const jwk = await jwks.key(header.kid, opts.now);
  if (!jwk) {
    throw new OidcError("unknown-key");
  }
  const ok = verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(parts[2], "base64url"));
  if (!ok) {
    throw new OidcError("bad-signature");
  }
  const nowS = Math.floor(opts.now / 1000);
  if (claims.iss !== issuerFor(c)) {
    throw new OidcError("wrong-issuer");
  }
  if (claims.aud !== c.clientId) {
    throw new OidcError("wrong-audience");
  }
  if (claims.token_use !== "id") {
    throw new OidcError("wrong-token-use");
  }
  if (typeof claims.exp !== "number" || claims.exp + SKEW_S < nowS) {
    throw new OidcError("expired");
  }
  if (typeof claims.iat !== "number" || claims.iat - SKEW_S > nowS) {
    throw new OidcError("issued-in-future");
  }
  if (typeof claims.nonce !== "string" || claims.nonce.length !== opts.nonce.length || !timingSafeEqual(Buffer.from(claims.nonce), Buffer.from(opts.nonce))) {
    throw new OidcError("wrong-nonce");
  }
  if (typeof claims.sub !== "string" || !claims.sub) {
    throw new OidcError("no-subject");
  }
  if (typeof claims.email !== "string" || claims.email_verified !== true) {
    throw new OidcError("email-not-verified");
  }
  const groups = Array.isArray(claims["cognito:groups"]) ? (claims["cognito:groups"] as unknown[]).filter((g): g is string => typeof g === "string") : [];
  if (!groups.includes(c.requiredGroup)) {
    throw new OidcError("not-in-required-group");
  }
  return { sub: claims.sub, email: claims.email.toLowerCase(), groups, authTime: typeof claims.auth_time === "number" ? claims.auth_time : null };
}
