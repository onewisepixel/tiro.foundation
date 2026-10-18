// Production only: complete Cognito sign-in. Verifies state, exchanges the
// code server to server, verifies the ID token (oidc.ts), then requires a
// named, active operator (identity.ts) before issuing a session.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/flightDeck/access";
import { SESSION_ABSOLUTE_MS, signInOperator, SignInRefused } from "@/lib/flightDeck/identity";
import { exchangeCode, issuerFor, JwksCache, OidcError, openTransaction, verifyIdToken } from "@/lib/flightDeck/oidc";
import { getBootstrapRuntime, getConsoleRuntime, PROD_LOGIN_COOKIE, PROD_SESSION_COOKIE } from "@/lib/flightDeck/runtime";

const g = globalThis as unknown as { __fdJwks?: Map<string, JwksCache> };
const jwksFor = (issuer: string) => {
  g.__fdJwks ??= new Map();
  let c = g.__fdJwks.get(issuer);
  if (!c) {
    c = new JwksCache(`${issuer}/.well-known/jwks.json`);
    g.__fdJwks.set(issuer, c);
  }
  return c;
};

export async function GET(request: NextRequest) {
  const rt = await getBootstrapRuntime();
  if (!rt || rt.mode !== "production" || !rt.cognito || !rt.config || !rt.identity) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const back = (code: string) => {
    const res = NextResponse.redirect(new URL(`/flight-deck/sign-in?error=${code}`, rt.cognito!.publicOrigin), 303);
    res.cookies.delete({ name: PROD_LOGIN_COOKIE, path: "/" });
    return res;
  };
  const jar = await cookies();
  const now = Date.now();
  const t = openTransaction(jar.get(PROD_LOGIN_COOKIE)?.value, rt.config.sessionSecret, now);
  const params = request.nextUrl.searchParams;
  if (!t || params.get("state") !== t.state || params.get("error") || !params.get("code")) {
    return back("sign-in-failed");
  }
  try {
    const idToken = await exchangeCode(rt.cognito, params.get("code")!, t.verifier);
    const claims = await verifyIdToken(idToken, rt.cognito, jwksFor(issuerFor(rt.cognito)), { now, nonce: t.nonce });
    const { token, operator } = await signInOperator(rt.identity, claims, new Date(now));
    await rt.store.transaction((tx) => audit(tx, { id: operator.id, role: operator.role, displayName: operator.displayName }, "signed-in", "operator", operator.id, null));
    // Before the console gate, a founder lands on the approval page.
    const open = !!(await getConsoleRuntime());
    const res = NextResponse.redirect(new URL(open ? "/flight-deck" : "/flight-deck/gates", rt.cognito.publicOrigin), 303);
    res.cookies.delete({ name: PROD_LOGIN_COOKIE, path: "/" });
    // __Host- prefix: Secure, Path=/, no Domain; cannot be set by a
    // subdomain. Lax so the redirect chain from the IdP carries it; every
    // mutation is a same-origin POST checked by Next.js.
    res.cookies.set(PROD_SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_ABSOLUTE_MS / 1000 });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (e) {
    if (e instanceof SignInRefused) {
      // Audited without the address: the refusal code only.
      await rt.store.transaction((tx) => audit(tx, { id: "system", role: "system", displayName: "Flight Deck automation" }, "sign-in-refused", "operator", null, e.code)).catch(() => undefined);
      return back(e.code);
    }
    return back(e instanceof OidcError ? "sign-in-failed" : "storage-unavailable");
  }
}
