# TIRO fixture backend — staff workflow UI

A minimal, staging-only staff tool. Not part of the public Next.js site, not deployed anywhere —
run it locally, against synthetic fixtures only. Vanilla HTML/JS, no build step, no framework, no
dependencies.

## What it does

- Signs in via Cognito's Hosted UI (OAuth2 Authorization Code + PKCE — this app client has no
  secret, per `infra/lib/fixture-backend-stack.ts`).
- Lists lifecycle requests by status.
- Looks up a record's full detail (record, restriction-register entry, authority claims, legal
  rights, consent grants, custody copies, audit receipts).
- Runs every lifecycle action (restrict, withdraw, retain, start-deletion, complete-deletion,
  revoke-consent) and a permission-check preview, against `backend/src/api/router.ts` via the
  deployed API.
- Runs a preservation export.
- Downloads a record's media, when the signed-in caller's purpose/audience selection is actually
  authorized for it — a legacy (pre-version-binding) reference shows as not retrievable, with no
  download button, rather than erroring.

Every mutating action is attributed to the signed-in staff member's Cognito identity — the API
reads that from the ID token, never from anything this page sends in a request body (see
`backend/src/api/handler.ts`'s `extractCallerIdentity`).

## Setup

1. Deploy the stack (see `docs/backend/runbook.md`) and note four `cdk deploy` outputs:
   `StaffApiUrl`, `StaffUserPoolId` (not needed here), `StaffUserPoolClientId`, `StaffUserPoolDomain`.
2. `cp config.example.js config.js` and fill in `apiBaseUrl`, `cognitoDomain`, `clientId` from those
   outputs. Leave `callbackUrl`/`logoutUrl` as-is unless you changed the port below.
3. Create at least one staff user in the deployed Cognito pool (self-signup is disabled on
   purpose — invited test staff only, per `docs/ethos.txt` §3):
   ```bash
   aws cognito-idp admin-create-user --user-pool-id <StaffUserPoolId> --username <email> \
     --user-attributes Name=email,Value=<email> Name=email_verified,Value=true \
     --message-action SUPPRESS --profile <your-profile>
   aws cognito-idp admin-set-user-password --user-pool-id <StaffUserPoolId> --username <email> \
     --password '<temporary-password>' --permanent --profile <your-profile>
   ```
4. Serve this directory as static files on port 4300 (must match the callback URL registered on
   the Cognito app client — `staffUiCallbackUrls` in the CDK stack):
   ```bash
   npx serve -l 4300 staff-ui
   ```
   `serve.json` (committed, do not remove) sets `"cleanUrls": false`. Without it, `serve`'s default
   behavior 301-redirects `callback.html?code=...&state=...` to `/callback` and **drops the query
   string in the redirect's `Location` header** — so the browser lands on a `code`-less URL and
   `completeSignIn()` (auth.js) has nothing to read, failing sign-in silently. This isn't a corner
   case: it is the normal Hosted-UI redirect, every time. Verify it's actually working after any
   change to this directory or its serving command:
   ```bash
   curl -i "http://localhost:4300/callback.html?code=test&state=test"
   # must return 200 directly (not a 301 to /callback) — if you see a 301,
   # serve.json isn't being picked up (wrong working directory, or it was removed).
   ```
5. Open `http://localhost:4300/`, sign in, go.

## What this is not

Not a production admin console, not hosted anywhere, not styled beyond "usable." It exists to
exercise the authenticated API end-to-end against real fixtures — see
`docs/backend/evidence-matrix.md` for what's demonstrated and what isn't.
