# Flight Deck 0.1: architecture and threat model

Status: **Implementation for founder review.** Runs locally on synthetic fixtures only. Nothing is deployed, no external account exists, and no real contact data has been collected.
Revision date: 2026-10-16.
Authority: the Flight Deck 0.1 directive. Defers to `/community-rights`, `docs/manifestov0-2.txt`, and `docs/ethos.txt` (proposed operational requirements). Implements nothing from Contract 0.2 (`docs/proposals/memory-record-relationship-contract.md`), which is still under formal review.

## 1. What Flight Deck is

Two surfaces inside the existing Next.js 16 site:

- **`/pilot`** (public). An honest invitation to *conversations* about a future pilot, with a small expression-of-interest form. It collects no memories, recordings, files, or cultural material.
- **`/flight-deck`** (private). A founder operations instrument: relationships, outreach, campaigns, content, approvals, activity, health, and a weekly review. Every external consequence requires approval of an exact version.

Neither surface is an archive, and nothing in either is an archival record, a source-authority finding, or consent to collect, preserve, or publish.

## 2. Repository audit (2026-10-16)

| Observed | Briefing said | Divergence |
| --- | --- | --- |
| `main` at `9bbf13b`, clean tree, no staged changes | Audit first | None. Branches `backend/fixture-preservation-milestone` and `docs/stewardship-alignment-20261002` exist; untouched. |
| Next.js **16.3.8**, React 19, Tailwind v4, no ORM, no auth, no CRM | Same | None. |
| `src/proxy.ts` (Next 16's renamed middleware) already set `no-store` on `/memories` | Not mentioned | Extended rather than replaced (§4). |
| `/contact` is a `mailto:`; `/memory-project` has no funnel | Same | None. |
| Baseline: 368/368 tests, lint 0 errors (2 pre-existing backend warnings), typecheck clean | Run checks | None. |
| A `next dev` server was already running on :3000 from this directory (PID 22356) | Not mentioned | Left untouched. The demo runs on :3100 with its own build directory (`.next-flight-deck`), which required one opt-in line in `next.config.ts` (§6). |

Nothing under `backend/`, `infra/`, `docs/manifestov0-2.txt`, `/community-rights`, `docs/ethos.txt`, the proposals, or the fixture permissions was modified.

## 3. Boundaries

```
 public                                   private (local demo only)
 ───────                                  ─────────────────────────
 /pilot ──server action──► intake.ts ─┐   /flight-deck/* ──server actions──► domain services
                                      │                                         │
                                      ▼                                         ▼
                           OperationsStore (src/lib/flightDeck/store.ts) ◄──────┘
                           LocalFileOperationsStore: .flight-deck/local-store.json
                                      │
                                      ▼
                           dispatch.ts ──► EmailProvider / SocialPublisher ports
                                           (Disabled, or dry-run LocalOutbox only)

 NO import path to backend/, infra/, src/data/, the Living Trace, or any archival store.
```

- **Separate domain.** `src/lib/flightDeck/` holds its own types, store, and services. Entity names (`Prospect`, `CommunicationPermission`, `OpsTask`, …) cannot be mistaken for the archive's `AuthorityClaim`, `ConsentGrant`, or `FixtureRecord`. A test (`flightDeck.test.ts`, item 12) fails if any Flight Deck file imports from `backend`, `infra`, `@/data`, `publicMemoryApi`, or `livingTrace`.
- **Separate storage.** The local store is one JSON file in a git-ignored directory. It is not the AWS fixture backend and never talks to it.
- **No archive intake.** There is no upload route, no file field, and no flag that could enable one.

## 4. Gates, outermost first

1. **Mode decision** (`config.ts`). Two modes: `disabled` (default) and `local-demo`. Local demo requires `FLIGHT_DECK_MODE=local-demo` **and** `NODE_ENV !== "production"` **and** no hosting-platform marker (Vercel, Lambda, Amplify, Netlify, Cloud Run, ECS, Azure, Render, Fly, Railway, Heroku, Codespaces) **and** a loopback `Host`. Query strings and cookies are never consulted. There is no production mode in 0.1.
2. **Proxy** (`src/proxy.ts`). Outside local demo, every `/flight-deck` path, including server actions and the export route, answers 404 before page code runs. Private responses carry `no-store`, `noindex`, `no-referrer`, `DENY` framing, and `nosniff`.
3. **Server re-check** (`runtime.ts`, `app/flight-deck/guard.ts`). Every page, action, and route handler gets the runtime again; null means 404. No session means sign-in (pages) or nothing (actions).
4. **Capabilities** (`access.ts`). Enforced inside the domain functions, not in the UI: `founder` (all), `operator` (prepare, never approve, resume, or delete), `reviewer` (read and decide, never edit).
5. **Approval binding** (`approvals.ts`). An approval stores a SHA-256 over the canonical payload: content version and text, recipient address, channel, purpose, and schedule (content also binds origin, source, asset, asset permission, and route). The reviewer's form posts the hash it displayed; a mismatch is refused. Any edit appends a new immutable version and invalidates approvals. Approvals expire (14 days by default).
6. **Dispatch-time checks** (`dispatch.ts`). Re-run when a job runs, not when it is queued: global pause, approval for exactly this payload, suppression, communication permission, campaign active and within weekly limits, provider availability. Any failure holds or cancels the job.
7. **Truthful receipts.** `sent`/`published` only with a provider confirmation or a named person's manual attestation. A dry run is `simulated`. With no provider (0.1), the job is held as `provider-disabled` and the item becomes "ready to send by hand".

## 5. Data model

Entities and their schemas live in `src/lib/flightDeck/types.ts`; every type is inferred from its schema, so requests and writes share one definition. The store (`store.ts`) enforces on every write: strict schema validation (unknown fields are errors), optimistic version checks, declared foreign keys, unique keys (`emailKey`, `idempotencyKey`, `dedupeKey`), insert-only audit, and all-or-nothing transactions.

| Entity | Purpose | Notes |
| --- | --- | --- |
| Prospect | A person or organization TIRO may talk to | `authorityStatus` can only be `unverified` or `not-applicable`; the schema has no "verified" value. |
| InterestSubmission | One form submission | Stores form version and the exact notice version shown. |
| CommunicationPermission | Permission to write, per purpose | `direct-response`, `pilot-follow-up`, `newsletter`. Exact wording and version for form captures; a documented basis awaiting review for researched contacts. Never manufactured. |
| Organization, Affiliation | Introductions | Schema and store only in 0.1; the UI records organization names on the prospect. |
| Interaction | High-level summary of a contact | No testimony or pasted correspondence. Inbound replies record sender integrity. |
| OpsTask | Work item | Deterministic automation creates at most one per `dedupeKey`. |
| Campaign | Purpose, audience, weekly limits, review status | Approval of scope never makes a recipient eligible. |
| ContentDraft, OutreachDraft | Versioned drafts | Versions are append-only. |
| Approval | Decision bound to a payload hash | `active`, `invalidated`, `consumed`, `expired`, `closed`. |
| DispatchJob | One idempotent attempt to send or publish | One idempotency key for the job's life; lease-based claiming; exponential backoff. |
| DeliveryReceipt | Proof of delivery | `provider` + `confirmed`, `dry-run` + `simulated`, or `manual-attestation` + `attested` with the person's id. |
| Suppression | Opt-out, by keyed hash | Survives erasure of the prospect. Overrides any approval. |
| AuditEvent | Who, capacity, action code, object id, reason code | The schema admits no free text. |
| FunnelCount | Aggregate form and abuse counters | No identifiers. |

## 6. Files

- `src/lib/flightDeck/` — domain: `schema`, `types`, `store`, `config`, `access`, `ids`, `abuse`, `intake`, `permissions`, `approvals`, `drafts`, `dispatch`, `prospects`, `briefing`, `templates`, `pilotCopy`, `messages`, `identities`, `seed`, `providers`, `session`, `runtime` (server-only); tests in `flightDeck.test.ts`.
- `src/app/pilot/` — public page and its server action. `src/components/pilot/PilotInterestForm.tsx`.
- `src/app/flight-deck/` — private routes, `actions.ts`, `guard.ts`, `export/[id]/route.ts`. `src/components/flight-deck/` — UI parts.
- `scripts/flight-deck/dev.mjs` (demo launcher), `scripts/flight-deck/e2e.mjs` (browser checks).
- Modified: `src/proxy.ts` (gate), `next.config.ts` (`serverActions.bodySizeLimit: "64kb"`; `distDir` honours `FLIGHT_DECK_DIST_DIR`, set only by the demo launcher), `src/app/globals.css` (additive styles from existing tokens), `package.json` (scripts; no new dependencies), `.gitignore`, `eslint.config.mjs`, `tsconfig.json` (Next.js adds the demo build directory's type paths automatically), `src/app/memory-project/page.tsx` and `src/app/contact/page.tsx` (one link each to `/pilot`).

No dependency was added; `package-lock.json` is unchanged.

## 7. Threat model

| Threat | Control in 0.1 | Remaining risk / production requirement |
| --- | --- | --- |
| Private console reachable on a deployment | Mode decision refuses production builds, platform markers, and non-loopback hosts; proxy 404; per-request server re-check | A production identity provider must replace test identities before any deployment of `/flight-deck`. |
| Demo enabled by a stray variable or query string | Four independent conditions; no query or cookie input | Verified by unit tests and a production-build probe (`acceptance.md`). |
| CSRF on mutations | Server Actions are POST-only and Next.js rejects Origin/Host mismatch; session cookie `SameSite=Strict`, `HttpOnly`, path-scoped | Production: `Secure` cookies behind HTTPS, `serverActions.allowedOrigins` if a proxy/CDN rewrites Host. |
| Session forgery | HMAC-signed cookie, per-process random key, 8-hour expiry, timing-safe compare | Demo only. Production needs IdP sessions with MFA and server-side revocation. |
| Uploads or testimony through the form | Text-only allow-list; any `File` value or unknown field refused; 4,000-character total cap; 500-character note; links refused in the note; 64 KB action body limit | None identified for 0.1. |
| Contact enumeration | Identical "received" response for new, repeat, suppressed, rate-limited-by-address, and honeypot submissions | Per-client rate limit can reveal "too many from this connection", which says nothing about an address. |
| Bots and abuse | Honeypot (hidden from AT), signed form token with minimum fill time and expiry, per-client and per-address limits; no CAPTCHA | **In-memory limiter protects one process only.** Production needs a durable shared limiter or edge rate limiting. |
| Duplicate sends | One idempotency key per job; queueing twice returns the same job; receipt check before resend after a crash; dry-run outbox dedupes by key | A real provider must honour idempotency keys. A suppression landing in the instant between the pre-send check and the provider call cannot be caught; the window is one request. |
| Sending after opt-out | Suppression checked at dispatch and at manual attestation; applying it cancels jobs and holds drafts immediately | Inbound unsubscribe processing (email links) is not built: no provider. |
| PII in logs | Audit schema admits codes and opaque ids only; action errors log the error class only; digest omits addresses and notes | Hosting logs (request URLs) contain opaque ids only. |
| Email hashing reversible | Keyed HMAC with a per-store pepper | **Locally the pepper sits in the same file as the data.** Production must hold it in a secret manager, separately from the database. |
| Server code in client bundles | `server-only` on runtime; providers and stores imported only by server modules | Verified: zero client-bundle matches for store, suppression, session, or seed symbols in the production build. |
| Unapproved outbound | No network provider exists in the codebase | Adding one is a founder decision (`integrations.md`). |
| Archive contamination | Separate domain, separate store, import test | None identified. |
