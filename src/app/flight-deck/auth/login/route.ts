// Production only: begin Cognito sign-in (authorization code + PKCE).
import { NextResponse } from "next/server";
import { authorizeUrl, LOGIN_TTL_MS, newLoginTransaction, sealTransaction } from "@/lib/flightDeck/oidc";
import type { NextRequest } from "next/server";
import { getBootstrapRuntime, PROD_LOGIN_COOKIE } from "@/lib/flightDeck/runtime";

export async function GET(request: NextRequest) {
  const rt = await getBootstrapRuntime();
  if (!rt || rt.mode !== "production" || !rt.cognito || !rt.config) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const t = newLoginTransaction(Date.now());
  const res = NextResponse.redirect(authorizeUrl(rt.cognito, t, { reauth: request.nextUrl.searchParams.get("reauth") === "1" }), 303);
  // Lax, not Strict: the browser must send it back on the top-level
  // redirect from the Cognito domain to the callback.
  res.cookies.set(PROD_LOGIN_COOKIE, sealTransaction(t, rt.config.sessionSecret), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: LOGIN_TTL_MS / 1000 });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
