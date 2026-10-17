# Flight Deck 0.1: acceptance evidence

Status: **Local implementation evidence, 2026-10-16.** Nothing is deployed, live, or authorized for production. No real person's data has been collected.

## 1. Live / not live

| Capability | State |
| --- | --- |
| `/pilot` page in a production build | Builds and serves; **form closed** ("not yet open", no fields). Not deployed. |
| `/pilot` form accepting submissions | **Local demo only**, into a synthetic local file store |
| `/flight-deck` private app | **Local demo only** (loopback, dev build, explicit mode). 404 in every production build |
| Production identity, database, email, social, job runner | **Not built / not configured.** Adapters and disabled states only |
| Outbound email or social posts | **None possible.** No network provider exists in the code |
| Privacy notice | **Draft**, not legally reviewed |
| Archive intake | **Not built**; no switch exists |

## 2. Commands and measured results

Run on Windows 11, Node 22.17.1, Next.js 16.3.8.

| Command | Result |
| --- | --- |
| `npm test` | **409 / 409 pass** (368 pre-existing + 41 new in `src/lib/flightDeck/flightDeck.test.ts`) |
| `npx tsc --noEmit` | Clean |
| `npm run lint` | 0 errors; 2 warnings, both pre-existing in `backend/` (baseline unchanged) |
| `npm run build` | Succeeds. `/pilot` and all `/flight-deck` routes dynamic (`ƒ`); existing static routes unchanged |
| `npm run verify:disclosure` | "disclosure boundary holds in the production build" (20 client files, 278 prerendered files, 20 routes) |
| `npm run e2e:flight-deck` (against `npm run dev:flight-deck`) | **34 / 34 pass**; with `CLOSED_BASE_URL` pointing at a `next start` server, **35 / 35** (adds the production closed-form check). Results in `screens/e2e-results.json` |
| Production probe: `next start` with `FLIGHT_DECK_MODE=local-demo`, form and email flags deliberately set to `true` | `/flight-deck`, `/flight-deck/sign-in`, `/flight-deck/health`, `/flight-deck/export/…`, `?demo=1`, and a POST action attempt: **all 404**. Headers: `no-store`, `noindex, nofollow`, `X-Frame-Options: DENY`. `/pilot`: 200, "Form not yet open", 0 form fields |
| Client-bundle scan of the production build for store, suppression, session, and seed symbols | **0 matches** |

## 3. Directive §10 checklist

| # | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| 1 | No public route accepts files, narratives, media, archive metadata, or testimony | Unit: File values, unknown fields (`story`, `recordId`), 5,000-character note, 501-character note, links → refused, nothing stored. 64 KB action body limit. E2E: no file input or drag target on `/pilot` | Pass |
| 2 | Interest ≠ consent to newsletter, collection, naming, or preservation | Unit: only `direct-response` permission without the opt-in; schema has no "verified" authority value; E2E: no updates permission shown, opt-in unchecked by default | Pass |
| 3 | Repeats create no multi-email sequence; no account-existence disclosure | Unit: three submissions → one prospect, three submissions, **one** acknowledgement job, one open task, identical responses; past the per-address limit and for a suppressed address, the same response. E2E: repeat gets identical confirmation | Pass |
| 4 | No acceptance gate → blocked; exact notice version stored | Unit and E2E: missing acknowledgement or reply consent refused server-side; stale notice version refused; `pilot-privacy-draft-0.1` stored on submission and permission with exact wording | Pass |
| 5 | Unauthorized requests cannot reach records, exports, activity, or mutations | Proxy 404 outside demo; pages redirect without session; export route 403 without session/capability; capabilities enforced in the domain (unit: reviewer cannot draft, operator cannot approve or erase, reviewer cannot export, null actor denied). E2E: reviewer has no edit form, operator no approval controls | Pass |
| 6 | Demo cannot be activated on a real deployment by query or stray env | Unit: refused for production builds, five platform markers, non-loopback hosts. Production probe above | Pass |
| 7 | Approval bound to content, recipient, channel, schedule; edits revoke | Unit: body edit, recipient change, schedule change, content-metadata change each void approval; stale-hash decision refused; expiry. E2E: edit after approval removes send controls and shows "Invalidated" | Pass |
| 8 | Suppression at dispatch overrides approvals and retries | Unit: unsubscribe between a failed attempt and its retry → job cancelled, draft held, no receipt, one provider call; manual send refused; newsletter-only unsubscribe still allows a reply | Pass |
| 9 | `sent`/`published` only with confirmation | Unit: no provider → held, "manual-ready", no receipt; dry run → "simulated"; confirming fake provider → "sent". Manual route records "attested" with the person's id. E2E shows "Ready to send by hand", then "Attested by a person" | Pass |
| 10 | Failed jobs idempotent, retryable, no duplicates | Unit: double queue → one job; failure then success → two provider calls with one idempotency key, one receipt; crash with existing receipt → settled, not resent | Pass |
| 11 | Audit contains no messages, evidence, archive content, tokens, or secrets | Unit: across the whole seed, audit/counters/jobs contain no `@`, names, notes, or message bodies; every event has exactly the nine schema keys | Pass |
| 12 | No import from `backend/` archival stores; no mixed data | Unit: import scan of every Flight Deck file; separate store file | Pass |
| 13 | Public site fast and keyboard/screen-reader usable | E2E: first Tab reaches the skip link; every visible form control labeled; errors announced (`role=alert`), invalid fields marked (`aria-invalid`), focus moved to the outcome; entries survive a validation error; no horizontal overflow at 390 px on `/pilot`, Now, Approvals, Relationship. Disclosure verifier green. **Manual assistive-technology testing was NOT performed** (see §5) | Partial: automated checks only |
| 14 | Public copy factual | `/pilot` and templates claim no partners, participants, counts, incorporation, tax status, quotes, or turnaround; templates cite their sources; the founder progress note is marked for founder confirmation | Pass (founder to confirm copy) |
| 15 | Disabled flags give an honest, accessible alternative | Production `/pilot`: "Form not yet open" with the email address and a no-material reminder; server action returns `closed` and stores nothing | Pass |
| 16 | 15-minute synthetic review session | E2E: find the new inquiry on Now → read its note and permissions → draft reply → placeholders refused → fill and save → submit → approve the exact version (fingerprint checked) → queue → run jobs (held: no provider) → send by hand and attest → follow-up reminder registered, stage Contacted → generate digest → mark review complete. 7–10 s automated; a human pace was not timed | Pass (automated) |

## 4. Screenshots (`docs/flight-deck/screens/`)

`pilot-desktop`, `pilot-mobile`, `pilot-mobile-reduced-motion`, `pilot-validation-error`, `pilot-confirmation`, `pilot-production-closed`, `now-desktop`, `now-mobile`, `now-desktop-light-reduced-motion`, `relationship-desktop`, `relationship-mobile`, `approvals-desktop`, `approvals-mobile`, `outreach-manual-ready-desktop`, `health-desktop`, `digest-desktop`. All show synthetic data. Regenerate with `npm run e2e:flight-deck` (it resets the local store first).

## 5. Not performed

- **Manual screen-reader and physical-device testing** (VoiceOver, NVDA, TalkBack, switch/keyboard-only walkthrough). Use `docs/design/accessibility-manual-test.md`'s protocol for `/pilot` and `/flight-deck`.
- Lighthouse performance measurement of `/pilot` (it is server-rendered per request because the form token and mode are per-request).
- Any test against a real provider, database, or identity service (none exist).
- Human-paced timing of the 15-minute review.
- Legal review of any wording.

## 6. Known limitations

- In-memory rate limiting (one process). Local pepper stored with the data. Test identities instead of an IdP. No background job runner. No inbound-email processing (unsubscribe links, bounces). Organization and affiliation records exist in the model and store but have no editing screen. "Second reviewer" is recorded, not required. A suppression arriving in the instant between the final pre-send check and a provider call cannot be stopped (one-request window).
- `tsconfig.json`: Next.js adds `.next-flight-deck` type paths whenever the demo server runs; harmless (the directory is git-ignored).

## 7. Founder decisions required for launch

1. **Identity provider** for `/flight-deck` (separate Cognito pool vs managed OIDC), and who the named operators and any second reviewer are.
2. **Operations database** (recommended: managed PostgreSQL in a TIRO-controlled account) and its region.
3. **Privacy notice and controller**: commission legal review of `privacy-launch-gates.md` §2–3; name the controlling entity while TIRO is unincorporated.
4. **Acknowledgement emails**: send by hand for now, or choose a transactional provider (requires SPF/DKIM/DMARC DNS changes).
5. **Social publishing**: stay manual (recommended) or connect platform APIs later.
6. **Public copy**: approve `/pilot` wording and whether to name the proposed pilot's community or region publicly (it is deliberately generic now).
7. **Launch approval**: record which gates in `privacy-launch-gates.md` §5 are met, and authorize deployment of `/pilot` (closed state is safe to deploy; opening the form is not, yet).
