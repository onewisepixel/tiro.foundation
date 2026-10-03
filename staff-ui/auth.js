// Cognito Hosted UI sign-in via OAuth2 Authorization Code + PKCE. No auth
// library — this is deliberately small and auditable: generate a PKCE pair,
// redirect to Hosted UI, exchange the returned code for tokens, keep the ID
// token (not the access token — it carries the "email" claim the staff API
// attributes actions to, and it has the "aud" claim the API's Cognito
// authorizer checks; Cognito access tokens have neither) in sessionStorage
// only. Nothing here is a secret — this is a public OAuth client
// (generateSecret: false in the CDK stack), by design.
const SESSION_KEY = "tiro_staff_id_token";
const VERIFIER_KEY = "tiro_staff_pkce_verifier";

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomVerifier() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

function decodeJwtClaims(token) {
  const payload = token.split(".")[1];
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(normalized));
}

function config() {
  if (!window.TIRO_STAFF_CONFIG) {
    throw new Error("Missing config.js — copy config.example.js to config.js and fill in your deployed stack's values.");
  }
  return window.TIRO_STAFF_CONFIG;
}

// Called from index.html's "Sign in" button.
async function redirectToSignIn() {
  const verifier = randomVerifier();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const challenge = await challengeFor(verifier);
  const cfg = config();
  const url = new URL(cfg.cognitoDomain + "/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.callbackUrl);
  url.searchParams.set("scope", "openid email");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  window.location.href = url.toString();
}

// Called from callback.html after Cognito redirects back with ?code=....
async function completeSignIn() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const error = params.get("error");
  if (error) {
    throw new Error(`Cognito returned an error: ${error} — ${params.get("error_description") ?? ""}`);
  }
  if (!code) {
    throw new Error("No authorization code in the callback URL.");
  }
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) {
    throw new Error("No PKCE verifier found — sign-in must have started in this same browser tab/session.");
  }
  const cfg = config();
  const response = await fetch(cfg.cognitoDomain + "/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: cfg.clientId,
      code,
      redirect_uri: cfg.callbackUrl,
      code_verifier: verifier,
    }),
  });
  sessionStorage.removeItem(VERIFIER_KEY);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${detail}`);
  }
  const tokens = await response.json();
  sessionStorage.setItem(SESSION_KEY, tokens.id_token);
}

function currentIdToken() {
  const token = sessionStorage.getItem(SESSION_KEY);
  if (!token) return null;
  try {
    const claims = decodeJwtClaims(token);
    if (claims.exp && Date.now() / 1000 > claims.exp) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return { token, claims };
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function signOut() {
  sessionStorage.removeItem(SESSION_KEY);
  const cfg = config();
  const url = new URL(cfg.cognitoDomain + "/logout");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("logout_uri", cfg.logoutUrl);
  window.location.href = url.toString();
}

// Thin wrapper over fetch() that attaches the bearer token and resolves
// with parsed JSON + status — never throws on a non-2xx response, so
// callers can show the API's own error message instead of a generic one.
async function apiFetch(path, options = {}) {
  const session = currentIdToken();
  if (!session) {
    throw new Error("Not signed in.");
  }
  const cfg = config();
  const response = await fetch(cfg.apiBaseUrl + path, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      authorization: `Bearer ${session.token}`,
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}
