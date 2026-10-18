# Flight Deck: acceptance evidence (0.2 production foundation)

Status: **Local evidence, 2026-10-17.** Nothing is deployed, no AWS resource or account exists, no real contact data exists, no message has been sent, and no post has been published. The 0.1 evidence is in git history (commit `2ab612e`).

## 1. Live / prepared / not built

| Capability | State |
| --- | --- |
| `/pilot` page, production build | Serves with the form **closed**; the form now has no free-text field |
| Public form accepting real submissions | **Not possible**: needs its flag, a recorded gate, and a non-draft notice; the admin script refuses the gate while the notice is a draft |
| Private console in production | **Prepared**: exists only with complete configuration and the founder's recorded console gate; Cognito sign-in required |
| PostgreSQL operations store | **Prepared and tested** against real PostgreSQL 17 locally; no database provisioned |
| Cognito pool, secrets, worker schedule, alarm | **Template only** (`deploy/flight-deck/`), not deployed, schedule disabled by default |
| Restore ledger sink | **Not provisioned** (warning shown) |
| Email, social, AI drafting, archive intake | **Off** by decision; no live implementation exists |

## 2. Commands and measured results

Windows 11, Node 22.17.1, Next.js 16.3.8, PostgreSQL 17.10 (embedded, temporary).

| Command | Result |
| --- | --- |
| `npm test` | **430 / 430** (368 pre-existing + 62 Flight Deck: 42 domain, 16 production-foundation, 4 deploy-template) |
| `npm run test:flight-deck-pg` | **15 / 15** against real PostgreSQL; repeated 4 times, all green |
| `npx tsc --noEmit` | Clean |
| `npm run lint` | 0 errors; the 2 pre-existing `backend/` warnings only |
| `npm run build` | Succeeds; all Flight Deck routes dynamic |
| `npm run verify:disclosure` | "disclosure boundary holds in the production build" |
| Client-bundle scan for server-only Flight Deck symbols (store, sessions, identity, seed, secrets) | **0 matches** |
| `npm run e2e:flight-deck`: browser run on the **local file store** | **50 / 50** (51 / 51 with `CLOSED_BASE_URL` pointing at a production server: the closed public form) |
| Same browser run with the UI on **local PostgreSQL** (`dev:flight-deck -- --pg`) | **50 / 50**; data confirmed in Postgres afterwards |
| axe-core scans (WCAG 2.0/2.1/2.2 A+AA rules), 11 page states incl. light theme | **0 violations** (after fixing one serious contrast defect it found) |
| `npm run rehearse:flight-deck`: production build against a TLS-only PostgreSQL with certificate verification | **27 / 27** (`screens/production-rehearsal.json`) |
| `npm run flight-deck:admin -- check-config` with no production settings | Lists the 11 missing settings by name only; exit 1 |

## 3. 0.2 validation requirements

| Requirement | Evidence | Result |
| --- | --- | --- |
| Concurrent writes | PG: 12 people submitting at once all recorded; the same person 8 times at once → 1 record, 8 submissions, 1 acknowledgement, 1 task; 3 concurrent edits from the same version → exactly 1 succeeds, 2 get "changed since you opened it" | Pass |
| Duplicate requests | PG: 3 concurrent queue requests → 1 job; 2 concurrent runners → 1 provider call, 1 receipt. Unit: double queue, repeated runs, crash recovery without resend | Pass |
| Revocation and suppression races | PG, staged at the worst moment (between the domain's reads and its writes): an opt-out committed during dispatch preparation wins and nothing is sent; an edit committed during a manual-send record revokes it and the send is refused | Pass |
| Worker retries | PG: a failed send retries with the same idempotency key; one receipt; two concurrent ticks → one runs, one `skipped-locked`. Unit: idempotent housekeeping, paused and failed outcomes recorded | Pass |
| Data restoration | PG: logical backup restored into a fresh database; ledger replay re-erases a person erased after the backup and restores an opt-out; import refuses a non-empty database. Unit: replay cancels a message queued in the restored copy; replay is idempotent | Pass (provider PITR drill not performed) |
| Storage failure | PG: unreachable database → `StoreUnavailable`; connection killed between reads and writes → `StoreUnavailable`, nothing committed, pool recovers. Unit: the public form tells the person nothing was stored | Pass |
| Operator access | Unit: only named, active operators get sessions; a different provider account for the same email is refused; idle and absolute expiry. PG: only token hashes stored. Rehearsal: forged and demo cookies refused in production; console 404 before the gate | Pass |
| Permission changes | Unit and PG: role change and deactivation take effect on the next request; deactivation revokes every session | Pass |
| OIDC verification | Unit, with real RSA keys: genuine token accepted; wrong key, `alg:none`, HS256, tampered claims, wrong issuer (incl. a "staff" pool), audience, token use, expiry, future issue, nonce, unverified email, missing group, unknown key all refused; JWKS rotation without refresh storms; PKCE S256 | Pass |
| Production disabled until gates | Rehearsal: 404 before the console gate and on any other host; console gate refused without a founder; public-form gate refused while the notice is a draft; form closed with its flag on | Pass |
| Database-level guards | PG: direct SQL `UPDATE`, `DELETE`, `TRUNCATE` on the audit table rejected; foreign keys enforced; synthetic/real mismatch refused; wipe refused on real data | Pass |
| Form content | Unit: a `note` field, free-text topics, duplicate or excess topics refused; E2E: no textarea anywhere in the form | Pass |
| Exceptions | Unit: opt-out case suppresses at once; deletion case holds outreach and completes on erasure; redaction leaves no trace of content; founder-only resolution; incident pause. E2E: a deletion request worked end to end in the browser | Pass |
| Regression of 0.1 guarantees | All 0.1 tests (exact-version approvals, dispatch-time checks, pause, audit safety, separation from the archive) still pass | Pass |

## 4. Defects found and fixed during 0.2

1. **Process crash on a dropped database connection** (no `error` listener on pool clients). Found by the killed-connection test; fixed.
2. **A CA certificate silently ignored** when `sslmode` appears in the connection URL (a node-postgres precedence rule). Found while building the rehearsal; fixed and covered by the TLS-only rehearsal.
3. **Primary button contrast 2.04:1** on `/pilot` (light text on gold, from 0.1, caused by CSS layer order). Found by axe; fixed.

## 5. Not performed

Manual screen-reader and device testing; human-paced timing of the founder review; any test with a real Cognito pool, real database provider, or provider point-in-time restore; `validate-template` or a staging deploy of the CloudFormation template; the new CI step on GitHub's runners (added, not yet run there). Protocols: `manual-tests.md`.

## 6. Screenshots

`docs/flight-deck/screens/`: the public form with topic choices, a validation error with entries preserved, the confirmation, mobile and reduced-motion views; Now, a relationship, Approvals, an outreach item ready to send by hand, Health with the worker, the weekly review, a deletion-request case; light theme. All synthetic.
