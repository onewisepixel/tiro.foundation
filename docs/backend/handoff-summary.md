# Fixture-Preservation Backend — Reviewer Handoff Summary

> **For a fresh session picking this up: read the next section first.** It is the current,
> structured state as of 2026-10-10 — exact repo/deploy state, what's verified vs. not, and the
> next three actions. Everything below it (starting at "Dated 2026-10-03") is the original,
> preserved historical narrative log, append-only since this document was created — it documents
> earlier milestones in full and should not be edited to "clean up" the story; it is evidence, not
> prose to be made more optimistic.

## Session handoff — read this first (2026-10-10)

### Objective and scope

**Project purpose** (unchanged, per `docs/ethos.txt` §§3.3, 3.10, 4, 6.1, 12): a small, persistent
AWS backend demonstrating permission evaluation, record lifecycle operations, preservation
export/restore, and now public read access — using exclusively non-sensitive, clearly-labeled
synthetic fixtures (`isSynthetic: true` is mandatory on every record). Real collection stays
disabled; a named operator and adopted (not merely proposed) consent/retention procedures are
explicit, stated prerequisites this document cannot resolve.

**This session's milestone: "connect approved synthetic records to the public Memory site."**
The staff intake-and-review workflow (prior milestone, closed — see the historical log below)
works end to end, but the public `/memories` pages still read only 3 hardcoded static records.
This milestone adds public, unauthenticated, read-only listing/detail/media endpoints
(`GET /public/records`, `GET /public/records/:recordId`, `GET /public/records/:recordId/media/:mediaId`)
with `purpose: "publication"` / `audience: "public"` enforced entirely server-side (never from a
caller-supplied parameter), wired into the Memory index and detail pages, with every protective
action (restrict, redact-text, redact-media, revoke-consent, withdraw, delete) required to
propagate across pages, metadata, API, and media with no stale cached content. DynamoDB capacity
must stay unchanged (5/5 RCU/WCU on both tables and the primary table's one GSI — two tables, not three) throughout.

**Acceptance criteria** (the user's own stated completion test, unchanged across all rounds):
create a fixture through staff intake; confirm preservation approval alone leaves it anonymously
invisible; approve a *separate* public-audience publication grant; then browse and retrieve media
without signing in. Test each protective action independently against a fresh, previously-allowed
fixture, confirming the affected content disappears or becomes masked across pages, metadata, API,
and media. Plus: a literal human browser walkthrough before sign-off (see below — not yet done).

**Completed work:** full implementation (backend routes/services, infra routes, frontend wiring —
commit `648daeb`), a first independent-review round of 5 findings fixed (commit `1e6d329`, which
also folded in a documentation wording correction from an earlier milestone and updated
`status.md`/`evidence-matrix.md`), and a second independent-review round of 3 more findings fixed
(commit `5c3d306`, current `HEAD`). Two of the five findings from the first round
("secret-key" and "exact response-size") were independently re-verified by the user as fixed, per
their own words in this session. The three findings from the second round are implemented and
locally/deterministically verified, but **not yet independently re-reviewed by the user**, and the
live drill has not reconfirmed a clean end-to-end pass since they shipped (see Verification
evidence below).

**What remains explicitly outside this milestone's scope:** real (non-synthetic) intake; actual
image/audio/video content redaction (only text-masking and a hard media-access deny exist); any
DynamoDB capacity change; deleting or cleaning up legacy fixture data left on the shared
`drill-20261002` namespace by *other*, unrelated milestones.

**Current state — awaiting ALL of the following before sign-off** (the user's own words: "Keep
sign-off pending until these fixes and that human walkthrough pass"):
1. A decision on how to handle the live drill's current, persistent throttling (see "Open work and
   resumption" below) — a **user decision is needed**, not something to resolve unilaterally.
2. A literal human browser walkthrough of the Next.js back/forward fix — **requires a real browser,
   not available to the assistant in this environment.**
3. The user's own independent re-review of this round's three fixes (commit `5c3d306`) — the first
   round's two confirmed-fixed findings give some confidence, but this round is unreviewed.

### Exact repository state

- **Location:** `c:\tiro\dev\tiro.foundation` (Windows). **Branch:** `main`.
- **HEAD:** `5c3d306b8b19380a3ffc51502a96e5d5997d95f5`.
- **Remote:** `origin` = `https://github.com/onewisepixel/tiro.foundation.git`. `main` is up to
  date with `origin/main` — confirmed via `git fetch` + `git rev-list --left-right --count
  origin/main...HEAD` → `0  0` (neither ahead nor behind), checked 2026-10-10.
- **Working tree:** clean immediately before this handoff was written (`git status` → "nothing to
  commit, working tree clean"). This handoff document and its two companion edits
  (`docs/backend/status.md`, `docs/backend/evidence-matrix.md`) are now **new, uncommitted
  changes** — **recheck `git status` after reading this** to see their current state; they have
  deliberately NOT been committed or pushed (no explicit authorization to do so was given for this
  task — see "Decisions and authorization" below).
- **Relevant commits, most recent first:**
  - `5c3d306` — this session: three review-round-2 fixes (bfcache/Next.js history nav, false-empty
    directory on provider failure, pacing-past-deadline) plus a drill-script retry fix. 7 files,
    +347/−40 lines.
  - `1e6d329` — prior session: review-round-1's five fixes (cursor-secret randomization, exact
    response-size headers, unavailable-vs-404 on the frontend, misleading-empty-listing message,
    plus the per-candidate resilience catch that round 2's Finding 2 later found a gap in) and the
    first `status.md`/`evidence-matrix.md` update for this milestone. 13 files.
  - `648daeb` — first implementation commit for this milestone (public API, infra routes, frontend
    wiring). 26 files, +1875/−29.
  - `5e47dd2`, `f599117`, `f335ea3`, `b8c9d29`, `2fa7af6`, `efcc811`, `88f5dc7` and earlier —
    the prior, separate "staff intake and review" milestone (closed; see historical log below).
  - A second, unrelated branch exists: `backend/fixture-preservation-milestone` at `93427f7`, far
    behind `main` — stale, not part of current work, do not touch.
- **Deployment-to-commit correspondence: believed to match, NOT independently re-verified
  byte-for-byte.** The live Lambda for stack `TiroFixtureBackend-drill-20261002` was redeployed
  (`cdk deploy`) from the exact working tree that became commit `5c3d306`, with no further edits
  to `backend/`/`infra/` afterward — but this was not re-confirmed by diffing the deployed bundle
  hash against the commit after the fact. Treat as "should match `5c3d306`'s backend/infra code,"
  not as a verified fact.

### Changes and rationale (this session, commit `5c3d306`)

1. **Next.js client-side back/forward (Router Cache) was never covered — P1.**
   `src/components/BfcacheRevalidator.tsx`'s `pagehide`/`pageshow` handlers only see the native
   browser bfcache; a same-document `<Link>` navigation never fires either event, so Next's OWN
   client-side Router Cache reusing a page on back/forward — confirmed from
   `node_modules/next/dist/docs/01-app/04-glossary.md`'s "Client Cache" entry: "Pages... are
   reused during browser back/forward navigation," and `staleTimes.md`'s own note that
   `staleTimes` doesn't touch this — went unguarded. **Fixed:** added a `popstate` listener
   (fires for History-API back/forward, not for a forward click to a new entry) that hides content
   (`data-bfcache-pending` on `<html>`, `src/app/globals.css`) and calls `router.refresh()` inside
   `useTransition`, revealing only once `isPending` confirms fresh content actually committed.
   **Abandoned-approach note, kept because it explains why this fix looks the way it does:** an
   earlier round assumed `Cache-Control: no-store` (`src/proxy.ts`) would exclude a page from
   Chrome's bfcache — wrong; Chrome ≥109 no longer treats `no-store` as a bfcache-exclusion
   criterion. A later round assumed `staleTimes.dynamic: 0` (`next.config.ts`) would cover
   back/forward reuse generally — also wrong, per the glossary quote above. Neither header/config
   tweak was ever going to work for this specific case; only an explicit `popstate` handler can.
2. **A provider failure on every candidate could still look like a confident, empty success — P2.**
   The previous round's per-candidate resilience ("catch and skip one bad candidate, keep going")
   had a blind spot: if ALL candidates on a page throw, the result still looks like a fully-checked
   `{items: [], nextCursor: null}` — indistinguishable from "genuinely nothing is published."
   **Fixed:** `backend/src/services/publicView.ts`'s `readPublicListing` now returns
   `hadFailures: boolean`; `backend/src/api/router.ts`'s `GET /public/records` returns `503` (never
   a lying `200`) when `hadFailures && items.length === 0`. The failed recordId is logged
   server-side only (`console.error`), never returned to the anonymous caller. New tests:
   `publicView.test.ts` ("flags hadFailures when every candidate on the page throws"),
   `router.test.ts` ("returns 503, not a confident empty 200..."). **Confirmed live** — the drill
   actually hit this path for real (see Verification evidence) and produced the designed `503`.
3. **Pacing could still let real work start after the deadline — P2.** The time budget was checked
   BEFORE each pacing sleep, never after — a deterministic reproduction started a second
   evaluation at 9,400ms against an 8,000ms budget. **Fixed:** `readPublicListing` now re-checks
   the deadline immediately after every sleep, at both call sites (per-evaluation and
   per-raw-page), before starting new work; if exceeded, it breaks WITHOUT advancing `resumeKey`
   past the unattempted row, so the next call retries it fresh rather than skipping it. New tests
   in `publicView.test.ts` reproduce the exact scenario with a real timer firing mid-sleep.
4. **Drill script fix (not a backend/infra change):** `realPublicMemoryAcceptanceDrill.ts`'s own
   `withHttpThrottleRetry` only retried on HTTP `500`; after Finding 2 shipped, a sustained failure
   now legitimately surfaces as `503` instead, and the drill was failing to retry it. Fixed to
   retry on both.

**Prior session's changes (commit `1e6d329`, reconfirmed by the user as fixed for 2 of 5 — "the
secret-key and exact response-size fixes passed my earlier reproductions"):** cursor-secret
randomization (`backend/src/services/cursorCodec.ts`'s `setCursorSecretKey`, a fresh
`randomBytes(32)` minted per `cdk deploy` in `infra/lib/fixture-backend-stack.ts`, required at
Lambda startup via `handler.ts` — replacing an earlier, wrong approach that derived the key from a
constant committed to source, independently decryptable by the reviewer); exact response-size
headers (`PUBLIC_JSON_RESPONSE_HEADERS`, one object shared between `router.ts`'s size guard and
`handler.ts`'s real response, closing a 27-byte undercount the reviewer reproduced exactly);
unavailable-vs-404 distinction (`src/app/memories/[id]/page.tsx`'s tri-state `resolvePublicRecord`
— `found` / `not-found` / `unavailable` — so a backend 500/network error is never shown as "Memory
Not Found"); and the misleading-empty-listing-message fix (`src/app/memories/page.tsx` now
describes the current slice, e.g. "No live records on this page — more may be available further
on," rather than claiming global emptiness for a budget-bounded partial scan).

### Decisions and authorization

- **Standing constraint, repeated explicitly across every round: DynamoDB capacity stays at 5/5
  RCU/WCU on both tables and the GSI.** Never raise it to work around throttling. Reconfirmed via
  `infra/lib/fixture-backend-stack.ts` and `cdk synth` output each round (still 5/5 as of this
  writing).
- **Explicit, current instruction: "Keep sign-off pending until these fixes and that human
  walkthrough pass."** Sign-off has NOT been given. Do not represent this milestone as accepted
  or complete in any future communication until both the live-drill blocker and the browser
  walkthrough are resolved.
- **Standing rule (the assistant's own operating constraint, not the user's): never commit or push
  without being explicitly asked.** The user has been doing their own commits between rounds
  (`648daeb`, `1e6d329`, `5c3d306` are all authored by the user, `Sean Obienu
  <onewisepixel@gmail.com>`) — do not assume that pattern extends to this handoff task, which did
  not ask for a commit.
- **Prior explicit authorization — "After these fixes, proceed with the existing drill-20261002
  deployment, anonymous acceptance drill, and production-mode browser walkthrough" — was treated
  as standing for repeated redeploys/drill-runs against the SAME namespace across subsequent
  rounds**, since nothing suggested revoking it. This is an interpretation, not a fresh grant for
  each round; if a new session is unsure whether it still applies, ask rather than assume.
- **Withheld / not done without being asked:** raising DynamoDB capacity (explicitly instructed not
  to); deleting or cleaning up legacy "preserved+published" fixture data from OTHER, unrelated
  milestones on the shared `drill-20261002` namespace, even though it's now a known contributor to
  the live-drill blocker (not this feature's data to delete); committing or pushing this handoff's
  own edits.
- **Unresolved question posed to the user, not yet answered:** how to handle the live-drill
  capacity/density blocker — see "Open work and resumption," action 1.
- **Governance vs. adopted procedure, for clarity:** "a named operator" and "adopted consent/
  retention procedures" remain PROPOSALS/PREREQUISITES per `docs/ethos.txt` §6.1 — no real
  appointment or adopted procedure exists. Nothing in this session changed that; do not treat any
  fixture or synthetic-data decision as if it did.

### Verification evidence

| Check | Command / method | Date (UTC) | Revision | Result | What it proves |
| --- | --- | --- | --- | --- | --- |
| Local tests | `npm test` (repo root) | 2026-10-10 | `5c3d306` | **275/275 pass** | All service-layer logic, including deterministic reproductions of this round's 3 findings, passes against in-memory fakes. Does not prove live AWS behavior. |
| Backend typecheck | `npx tsc --noEmit -p backend/tsconfig.json` | 2026-10-10 | `5c3d306` | clean | No type errors. |
| Infra typecheck | `npx tsc --noEmit -p infra/tsconfig.json` | 2026-10-10 | `5c3d306` | clean | No type errors. |
| Lint | `npm run lint` | 2026-10-10 | `5c3d306` | 2 warnings, 0 errors | Both warnings pre-exist this milestone (`router.ts`'s `payloadFingerprint`, `intake.test.ts`'s `controlVersion`), unrelated. |
| Frontend build | `npm run build` | prior round | `1e6d329`-era | clean | `/memories` and `/memories/[id]` both render `ƒ` (dynamic); not re-run against `5c3d306` in this session specifically — recommend re-running before trusting it unchanged. |
| CDK synth | `npx cdk synth` (from `infra/`) | 2026-10-10 | `5c3d306` | clean | 3 tables confirmed `ReadCapacityUnits: 5`; 3 new `/public/records*` routes confirmed `AuthorizationType: NONE`. |
| CI | GitHub Actions on push | — | `5c3d306` | **user-reported "CI passed"** | Not independently inspected by the assistant this round — attributed to the user's own report, not re-verified. |
| Live deploy | `cdk deploy` to `TiroFixtureBackend-drill-20261002` | 2026-10-09 (this session, 3×) | `5c3d306`'s working tree | succeeded each time | Lambda code updated; each redeploy also mints a fresh `TIRO_PUBLIC_CURSOR_SECRET` (by design), invalidating any outstanding pagination cursors. |
| Live acceptance drill (clean baseline) | `realPublicMemoryAcceptanceDrill.ts` | 2026-10-09, before this round's 3 fixes | `1e6d329`-era code | **32/32 passed** | The ENTIRE completion-test language, once, before this session's changes. Documented in evidence-matrix.md; now historical, not current. |
| Live acceptance drill (after this round's fixes) | same script | 2026-10-09/10 (3 separate attempts) | `5c3d306` | **all 3 runs failed to complete** (sustained `500`→`503` on `GET /public/records`, exhausting the drill's own 30-attempt backoff every time) | Does NOT prove the 3 fixes are wrong — the failure is traced to live DynamoDB throttling (see below), not to the application logic. Does NOT re-confirm the 32/32 result still holds end-to-end on current code. |
| Direct DynamoDB query (register table) | `ScanCommand` with `Select: "COUNT"` + `FilterExpression` for `currentCustodyStatus = "preserved" AND currentPublicationStatus = "published"`, via `@aws-sdk/client-dynamodb`, profile `tiro-fixture-deploy` | 2026-10-10 | live data, not code | **197 of 271 rows** currently eligible | Explains WHY the drill keeps throttling: the cheap pre-filter in `readPublicListing` passes for nearly every row scanned, so almost every evaluation is a real, expensive one — not the "sparse scan" the pacing constants were sized against. |
| Direct DynamoDB query (primary table) | `DescribeTableCommand` | 2026-10-10 | live data | ~2,162 items, ~19.6 MB | Scale context for the above; this table has accumulated data across this engagement's ENTIRE multi-milestone history on this shared namespace, not just this feature. |
| Live endpoint spot-check | `curl .../public/records?limit=1` (twice, 20+ seconds apart) | 2026-10-10T05:35:33Z and 05:36:01Z | live, current | **`503` both times** | Confirms the throttling is a PERSISTENT condition right now, not a momentary blip that already cleared. |
| Live endpoint spot-check (negative control) | `curl .../public/records/<random-nonexistent-uuid>` | 2026-10-10 | live, current | **`404`, immediately** | A nonexistent-id request never reaches the expensive evaluation loop at all — confirms the throttling is specific to the listing's candidate-evaluation path, not universal. |
| Production-build frontend check | `next build && next start` pointed at the live stack, verified via `curl` (no browser tool available) | prior round | `1e6d329`-era | index listing, detail page, `<title>` metadata, media, and redaction propagation all confirmed correct | This was run BEFORE this session's 3 fixes; not re-run against `5c3d306` — Finding 1's `popstate`/`router.refresh()` logic specifically cannot be verified via `curl` at all; it needs a real browser. |
| Literal human browser walkthrough | — | — | — | **NOT PERFORMED** | No browser-automation tool is available in this environment. This is the central, explicitly-required gap before sign-off. |
| Independent review | the user, reading commits and reproducing locally | 2026-10-08 through 2026-10-10 (2 rounds so far) | `1e6d329` (round 1, 5 findings) and `5c3d306` (round 2, 3 findings) | Round 1: 2 of 5 findings explicitly reconfirmed fixed by the user. Round 2: not yet independently re-reviewed. | The user's own review is the acceptance mechanism this whole engagement runs on; round 2 is the CURRENT open item. |

**Never read a partially-evaluated listing or a provider failure as proof of absence:** a `503`
from `GET /public/records` means "could not determine," not "nothing is published," and a
budget-bounded page returning few/no items means "this slice, under this budget," not "the whole
directory." Both distinctions are now enforced in code (Findings 2 and 3 above) — a future session
should not need to re-litigate them, but should also not quote the stale 32/32 result as current
without re-running the drill first.

### Operational context

- **AWS account:** `440744257823`. **Region:** `us-east-1`. **CLI/SDK profile:**
  `tiro-fixture-deploy` (configured in this machine's `~/.aws/config`/`~/.aws/credentials`;
  credentials present, not reproduced here).
- **Stack:** `TiroFixtureBackend-drill-20261002` (name derived from
  `TIRO_FIXTURE_NAMESPACE=drill-20261002`). **This exact namespace has been reused across many
  unrelated milestones in this engagement** — see "197 of 271 rows" above for why that now matters.
- **DynamoDB tables (all at 5 RCU / 5 WCU — do not change):**
  `tiro-fixture-primary-drill-20261002` (~2,162 items, ~19.6 MB) and
  `tiro-restriction-register-drill-20261002` (271 items, 197 currently "preserved+published").
- **Deploy command** (from `infra/`):
  `AWS_PROFILE=tiro-fixture-deploy AWS_REGION=us-east-1 TIRO_FIXTURE_NAMESPACE=drill-20261002 npx cdk deploy --require-approval never`
  — never omit the namespace (omitting it once previously created a stray `dev` stack that had to
  be torn down).
- **Live drill command** (from repo root):
  `AWS_PROFILE=tiro-fixture-deploy AWS_REGION=us-east-1 TIRO_STAFF_API_URL=https://fzbddb466g.execute-api.us-east-1.amazonaws.com TIRO_STAFF_USER_POOL_ID=us-east-1_dYIugcLDB TIRO_STAFF_USER_POOL_CLIENT_ID=4000m9rsm9fm1htc9aqmnl8fn3 npx tsx backend/src/scripts/realPublicMemoryAcceptanceDrill.ts`
  — the three `TIRO_STAFF_*` values come from the CDK stack's own outputs and should be
  re-confirmed (e.g. via `cdk deploy`'s own printed `Outputs:`) if a redeploy happens, though they
  have been stable across every redeploy so far this session.
- **Frontend local verification against the live backend:**
  `NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL=https://fzbddb466g.execute-api.us-east-1.amazonaws.com npm run build`
  then `NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL=... PORT=3100 npm start`, verified via `curl` against
  `localhost:3100` (no browser tool available — this proves HTML/headers/content, never real
  browser navigation behavior like Finding 1's fix).
  **No local dev server is currently running** — confirmed via `tasklist` immediately before
  writing this handoff.
- **Fixtures/resources left by this session — CORRECTED 2026-10-10 (later the same day):** the
  statement previously here ("likely cleaned up on all 3 failed attempts") was unfounded. The
  drill's `finally` block DID run, but at `5c3d306` it ignored the withdraw response entirely and
  only `.catch()`-ed thrown errors — while its retry helper RETURNS its last 500/503 after 31
  attempts instead of throwing. Your re-review of `5c3d306` reproduced exactly that: cleanup finished
  "normally" after 31 failed HTTP attempts. Those POSTs also carried no `requestId`, so each retry
  was a NEW lifecycle request rather than an idempotent replay. **So any of the 3 throttled runs may
  have left fixtures still published; that is unverified either way.** Fixed locally (not yet
  deployed or run live): cleanup now verifies each fixture (staff GET 404, or a withdraw with HTTP
  200 + lifecycle status `completed` + a register read-back of `withdrawn`), lists unresolved
  recordIds, and exits non-zero; POSTs mint one `requestId` per logical operation, reused across
  retries (`backend/src/scripts/publicDrillSupport.ts`). The drill also never deleted every
  fixture, despite its header comment saying so: only the delete-path fixture is deleted, and the
  rest are withdrawn. The header is now corrected. The 197 "preserved+published" rows are confirmed
  live (register scan); at least the two near-400 KB ones profiled are another milestone's data
  (fixture set `fixture-set-2026-10-preservation-drill`, created 2026-10-04 by the
  correction/redaction drill's abandoned export-budget attempt). Whether any of the 197 came from
  this drill's throttled runs is NOT established.
- **Dated facts carried over from an earlier, unrelated milestone** (preserved here only because
  they're still live and dated): an S3 noncurrent-version lifecycle-rule expiration observation is
  genuinely pending until `2026-11-04T00:00:00Z` — see `evidence-matrix.md`'s "S3 noncurrent-version
  expiration observation" section; unrelated to this milestone, do not conflate.

### Open work and resumption — next three actions, in priority order

1. **[Needs a user decision — do not resolve unilaterally]** Decide how to handle the live drill's
   persistent throttling, now traced to 197/271 real "preserved+published" register rows on the
   shared `drill-20261002` namespace. Options, none yet executed: (a) retune
   `PUBLIC_LISTING_EVALUATION_PACING_MS` (currently 1500ms) /
   `PUBLIC_LISTING_MAX_EVALUATIONS` (currently 4) in `backend/src/services/publicView.ts` more
   conservatively against this now-confirmed density; (b) reduce
   `realPublicMemoryAcceptanceDrill.ts`'s own retry aggressiveness or add inter-fixture pacing,
   since its 30-attempt backoff loop repeatedly re-hits the same early-scanned candidates; (c) get
   explicit authorization to clean up legacy "preserved+published" fixtures from OTHER milestones
   on this namespace; (d) accept the current drill as correctly reporting degradation and schedule
   a retry for a lower-contention window instead of changing code. Once directed: implement (if
   applicable), redeploy, and re-run `realPublicMemoryAcceptanceDrill.ts` until it reconfirms a
   clean pass (expect 32 checks, possibly more if new ones were added) — **acceptance criterion:
   the drill exits 0 with every check reporting PASS, re-run at least once more after that to rule
   out a lucky low-contention window.**
2. **[Needs a human with a real browser — cannot be done by an assistant in this environment]** Run
   the literal walkthrough Finding 1's fix requires: `npm run build && npm start` (production mode)
   pointed at the live stack via `NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL`; open `/memories`, navigate
   into a live detail page via a normal `<Link>` click (not a direct URL load); in a separate tab
   or via the staff UI, apply a protective action (e.g. withdraw) to that same record; back in the
   first tab, press Back and confirm the stale (pre-withdrawal) detail page does NOT reappear even
   momentarily (content should hide, then show the corrected/404 state); press Forward and confirm
   the same; then test a genuine OS-level bfcache restore (navigate away to another site/tab,
   trigger the native back/forward cache, return) and confirm the same. **Added by the user,
   2026-10-10:** also navigate OUT of `/memories` entirely (e.g. via the site nav to another
   section), apply a protective action, then come back INTO `/memories` (both by a nav link click
   and by Back), and confirm neither the index nor a previously-visited detail page shows the
   pre-action state; also confirm the index's incomplete-results notice appears if a listing page
   reports `hadFailures`. **Acceptance criterion:**
   the stale page is never visible, not even for one frame, in any of the three cases. This is the
   human walkthrough the user explicitly required before sign-off.
3. **[Can be done by either party once 1 and 2 are resolved]** Update
   `docs/backend/status.md`/`docs/backend/evidence-matrix.md` with the FINAL outcome (the live
   drill's reconfirmed clean pass, and the completed browser walkthrough's result), following the
   exact same dated-entry pattern already used throughout both documents, and obtain the user's
   explicit sign-off. Do not mark this milestone complete in any summary before that sign-off is
   given.

---

Dated 2026-10-03. Branch `backend/fixture-preservation-milestone`, commits `b4c5172` (implementation)
and `93427f7` (real-AWS verification), on top of `3de6d66`. 29 files changed, ~3,000 lines added. Not
yet merged to `main`.

**Update, same day:** review of `93427f7` found five real correctness gaps (listed below, under
"Correctness fixes after review"). All five are now fixed with regression tests. A same-day
follow-up review of the first fix found a sixth: `reconcileRestoredRecords()` could disagree with
`evaluatePermission()` on the same restored record, because it never accounted for grant-level
revocation — fixed by having reconciliation delegate directly to `evaluatePermission()` instead of
re-deriving its own, looser approximation. 55 tests pass (up from 45). The PR was held for these
fixes before merge, per the reviewer's request. The real-AWS drill's result (below) is accurate for
the one scenario it tests; it was not, and is not, evidence for the gaps the reviewer additionally
found by testing cases the drill doesn't exercise.

**Update, later the same day:** `backend/src/scripts/realFullFixtureChecks.ts` closed that gap —
seeded the full four-fixture set into the live deployed stack and re-ran the grant-revocation,
concurrency, and export-authorization checks against real DynamoDB. All 9 checks passed on the
first run. See "What was proven, and how" below.

**Update, a third review round the same day:** CI was red (a Turbopack/Google-Fonts build failure
plus 6 high-severity `npm audit` findings — both root-caused and fixed/documented), the grant-
revocation restoration claim was still overstated (closed by a dedicated real-AWS drill,
`realGrantRevocationRestoreDrill.ts`, which passed), and one assertion could falsely pass on a
missing grant (`undefined !== null`). All three fixed; see `docs/backend/status.md`.

**Update, authenticated API + staff UI:** built `backend/src/api/` (router + Lambda handler), wired
an HTTP API with a Cognito JWT authorizer and a Hosted-UI OAuth app client into
`infra/lib/fixture-backend-stack.ts`, and built `staff-ui/` (a standalone static page). Deployed and
smoke-tested against the real stack — unauthenticated calls get 401, a real Cognito token succeeds,
and a lifecycle action correctly attributes itself to the authenticated caller even when the request
body tries to spoof a different one. 76 tests pass (up from 55). See the evidence matrix's "Real
staff API smoke test."

**Update, API milestone review — three defects held sign-off, all fixed and re-verified against
real AWS:** (1) record reads bypassed scoped permission checks — `GET /records/:id` now requires
`purpose`/`audience` and returns a limited metadata view (no content, no evidence contents, counts
only) when `evaluatePermission` denies; (2) reused request IDs silently suppressed different
operations — `getOrCreateRequest` now fingerprints the full operation and a mismatched reuse is a
409, confirmed against live DynamoDB (second record provably untouched); (3) deletion completion
bypassed the deletion workflow — `completeDeletion()` now requires a `deletionRequestId` linking to
a completed `startDeletion()` request and the register actually showing `"deletion-pending"`, or it
denies rather than silently deleting, confirmed against a live record that was never deleted. 84
tests pass (up from 76). Also verified: Hosted UI → callback → API, using the real `auth.js` file
executed in a real JS engine against the live Cognito domain and API — honestly short of a literal
browser click-through, since no browser-automation tool is available here; see the evidence
matrix's "Browser-flow verification" for exactly what that does and doesn't prove.

**Update, a fourth review round — two more `completeDeletion` defects, fixed with regression tests
but at first only proven locally:** partial-failure recovery (the register write landing before the
record-removal write meant a transient failure there left the request permanently denied, never
resumable) and a stale-custody-precondition race (the prerequisite check used a separate, discarded
register read instead of the exact snapshot the write itself used, so a retention action landing in
between went undetected). 86 tests pass (up from 84).

**Update, the S3 media milestone — real, version-bound media; authenticated retrieval; media-aware,
resumable deletion; media-carrying export/restore; and ONE live-AWS acceptance drill that also
closed the fourth round's two real-AWS gaps:** every `MediaRef` now pins an exact S3 version (never
"latest") with a genuine SHA-256 computed from real uploaded bytes — not the old all-zero
placeholder. `GET /records/:recordId/media/:mediaId` runs the identical `evaluatePermission` check
as every other route, on every fetch, with no presigned URLs and no reusable download capability.
`completeDeletion()` now purges every real S3 version AND delete marker for media-tracked custody
copies before reconciling them, tolerant of partial progress. `exportFixtureSet` embeds real media
bytes for complete-preservation exports (never for public ones); `validateExport` now rejects a
tampered package by re-hashing its actual bytes, not just checking checksum format.
119 tests pass (up from 86). **`realS3MediaAcceptanceDrill.ts` passed 25/25 checks against the live
redeployed stack** — unauthenticated/direct-S3 denial, exact-byte retrieval, every denial case,
no-reusable-URL confirmation after a real withdrawal AND a real grant revocation, export/restore
integrity with real tamper rejection and a positive control, real S3 version/delete-marker inventory
and removal (including a marker deliberately created outside this system's own path), and the two
previously-local-only `completeDeletion` fixes now confirmed against real DynamoDB. One real bug —
in the drill script's own assumptions, not the system under test — was caught and fixed before the
corrected run passed outright. See the evidence matrix's "Real S3 media acceptance drill" for the
full, exact result.

**Update, a fifth review round — four gaps reproduced against the real service code, all fixed:**
(1) `completeDeletion()` purged every S3 version BEFORE validating custody status, so a real
retention action still got its media destroyed even though completion correctly returned
`"denied"` — fixed with a fresh pre-purge custody check; (2) export had no size budget and
retrieval buffered bytes before checking their real size — a reviewer reproduced a 7MB export from
one repeated record id — fixed with a new bodyless-HEAD size check (`MediaStore.headObjectSize`),
record-id deduplication, and a per-object plus aggregate export byte budget; (3) `importExport`
never wrote restored `auditReceipts` at all — fixed, with the in-memory store's one
non-upsert-by-id entity-put corrected for safe replay; (4) emptying a package's `mediaObjects`
still passed validation — fixed by requiring every version-bound reference to be accounted for in
either the included objects or an honest skip record, rejecting the rest as incomplete/tampered.
127 tests pass (up from 119); the live drill was redeployed, extended to use real bound media for
the retention check, and re-run — **29/29**. See the evidence matrix's fifth-review-round note.

**Update, a sixth review round (2026-10-04) — two residual gaps in the fifth round's fixes, both
genuinely CLOSED this time, not narrowed-and-documented:** (1) the fifth round's retention guard
was a bare read, not a claim — a reviewer deterministically proved retention could still win the
register while an already-in-flight purge destroyed the media anyway; fixed with real mutual
exclusion (a conditional-write `mediaPurgeClaim` that `retainForPreservationOnly` itself now
checks and refuses to override, not just a tighter window on the deletion side); (2) the export
budget measured raw bytes while Lambda's real limit is on the serialized (base64 + JSON) response —
20 distinct, individually-authorized, under-cap records still produced 7MB+ serialized; fixed by
budgeting the actual serialized contribution, computed from a HEAD-only size before fetching
anything. 131 tests pass (up from 127); the live drill now includes a real-DynamoDB interleaving
check (closing Finding 1 with a genuine `VersionConflictError`, not a local approximation) and a
real 20-object `/export` call through the live Lambda confirming a 4,946,321-byte response, down
from 7,035,395 — **34/34**. See the evidence matrix's sixth-review-round note.

**Update, the versioned correction and redaction milestone (2026-10-04):** implements §12's
"Correct" action (`correctRecord()`/`disputeCorrection()` — replaces the live field immediately,
preserves the previous value permanently, and a later dispute marks it `"disputed"` without
reverting it) and §3.5's redaction tooling, scoped honestly to text masking and a hard media-access
override (`redactText()`/`redactMedia()`) — never actual image/audio/video content processing, which
needs infrastructure this project doesn't have. The pre-redaction original is never served through
the normal record-read path; `complete-preservation` exports carry it (custody there is authorized
to hold the full archival record), `public-redacted` exports omit it, reusing the existing
redacted-for-public-export pattern. Four new API routes, no infra change needed. 150 tests pass (up
from 131); a new live drill, `realCorrectionRedactionDrill.ts`, passed **19/19 on its first real
run** against the deployed stack.

**Update, a seventh review round (2026-10-04) — five gaps reported as deterministic LOCAL
reproductions against the actual service code, not fresh AWS runs, all genuinely fixed:** (1)
correcting then redacting the same field left the correction's historical values unmasked — fixed
by a shared `services/redactionView.ts` module enforcing masking on history too, from the current
register, wired into the live route and public exports; (2) restoring a pre-redaction backup could
revive redacted text, because text redaction (unlike media) had no durable register state — fixed
by adding `redactedTextFields` to the register and masking from it at serve time, restore-proof the
same way media already was; (3) a failed history write could lose the true original — fixed with
genuine atomicity (`putRecordWithCorrection`/`putRecordWithRedaction`, a real DynamoDB
`TransactWriteItems`) plus stable, requestId-derived history ids; (4) the media-purge claim was
released too early (reopening the exact race it exists to prevent) and didn't recognize its own
`requestId` on retry — fixed by holding it continuously through the final commit and comparing
ownership; (5) the export response budget measured only media, so 20 large-text records still
produced 9 MB+ — fixed by budgeting each record's complete real serialized envelope and excluding
the whole record, never trimming, when it would cross the limit.

158 tests pass (up from 150). `realS3MediaAcceptanceDrill.ts` (Finding 4) now passes **36/36**;
`realCorrectionRedactionDrill.ts` (Findings 1-3, plus Finding 5's API-shape half) now passes
**32/32**. One limitation is named rather than hidden: Finding 5's actual whole-response TEXT
exclusion couldn't be forced live — every attempt against this fixture stack's deliberately tiny,
always-free-tier DynamoDB provisioning observably throttled (confirmed directly against CloudWatch
metrics and Lambda logs), but that's an observed result from these specific attempts, not proof
it's categorically impossible at 5 RCU/s (AWS documents burst capacity beyond the nominal
provisioned rate) — so that exact scale (the reviewer's 9,032,712-byte, 20-record reproduction)
stays proven byte-for-byte by the deterministic local test instead. See the evidence matrix's
seventh-review-round note for the full detail.

**Update, an eighth review round (2026-10-04) — four more gaps reported as deterministic LOCAL
reproductions, all genuinely fixed:** (1) `FixtureRecord.version` never actually advanced — every
caller spread a freshly-read copy without incrementing it, so two concurrent corrections both
reading the same version could both "succeed," the second silently clobbering the first — fixed by
making the STORE itself (not the caller) own the persisted version, closing the bug structurally
for every current and future caller; (2) a retry's "already applied" guard used a query that, on
the real adapter, is eventually consistent and could miss a just-committed write, letting a retry
corrupt history with an already-changed value as a fake "previous" one — fixed with a strongly
consistent by-id lookup AND a conditional history write that rejects a duplicate id outright, the
real unconditional guard even if the pre-check is wrong; (3) retention checked only the media-purge
claim, never custody status, so retention immediately after a completed deletion could flip an
already-`"deleted"` tombstone back to `"preserved"` — fixed by rejecting `"deleted"` custody
outright, including during deletion recovery; (4) the export budget still measured only this
object's own single encoding, not the Lambda handler's actual doubly-escaped response — content
rich in quotes/backslashes could measure safely under budget yet nearly double once really
wrapped — fixed by measuring that real re-escaped cost directly.

164 tests pass (up from 158). Both live drills were extended and re-run:
`realCorrectionRedactionDrill.ts` (Findings 1 and 2, against real DynamoDB's own
`ConditionExpression`/`TransactWriteItems`) now passes **38/38**; `realS3MediaAcceptanceDrill.ts`
(Finding 3, a real deletion run to completion then retention immediately after) now passes
**41/41**. Finding 4 wasn't re-attempted live beyond the prior round's API-shape check — per
explicit instruction, this shared table's capacity stays unchanged, and the observed-throttling
(not categorical-impossibility) caveat still applies. See the evidence matrix's eighth-review-round
note for the full detail.

**Update, a ninth review round (2026-10-04) — one residual export-budget gap with two reproducible
paths, neither about any one record's content, both genuinely fixed:** (1) `fixtureSetId` has no
length limit and the manifest embeds it verbatim — 20 ordinary records plus a 2 MiB `fixtureSetId`
produced a real 7,026,838-byte response — fixed with a length cap (API boundary + defensively
inside `exportFixtureSet`) and by budgeting the manifest's REAL encoded size instead of a fixed
guess; (2) skipped-record entries were counted but appended unconditionally — 8,000 requested
records (903 included, 7,097 skipped) produced a real 7,291,455-byte response because the skip
report itself could grow without bound — fixed with a batch-size cap AND a loop that stops,
reporting a new `recordsNotProcessed` field honestly, the moment even one more skip entry would
itself exceed budget; a final, outermost guard in `router.ts` now also answers a real `413` if the
complete wrapped response would still exceed Lambda's hard limit despite all of the above.

168 tests pass (up from 164). `realCorrectionRedactionDrill.ts` was extended and re-run: the real
deployed API rejects both an oversized `fixtureSetId` and an oversized batch with a real 400,
before any record is even looked at — now passes **40/40**. Unlike the prior round's residual gap,
these two fixes make the deployed API do LESS work on bad input, so confirming them live needed no
capacity change and consumed essentially no RCU. See the evidence matrix's ninth-review-round note
for the full detail.

**Update, operational readiness (2026-10-04) — making the already-reviewed lifecycle features
dependable to operate, not adding new ones:** (1) `realStaffApiSmokeTest.ts` scripts the prior
manual smoke test into a reusable drill (8/8); in doing so it caught that one of its own assertions
was stale — a disputed-authority fixture used to assert a full detail bundle, which was correct
only BEFORE Finding 1's permission-enforcement fix; fixed by seeding a real `active` fixture for
the allowed case and keeping a corrected, separate denial check for the disputed one. (2)
`realFullFixtureChecks.ts` grew four combinatorial-case checks with the expected outcome defined
for EITHER ordering: revocation racing restriction (a genuine two-writer race — symmetric
first-wins, and the loser's retry converges to both changes present) and export racing
withdrawal/deletion (a writer-vs-reader case — `evaluatePermission` reads the register once per
call, so a record is either excluded or included with a fully self-consistent snapshot, never
torn). 13/13. (3) `realLegacyMediaMigration.ts` inventories every live `versionId: null` media
reference and dry-run-reports which match a known, exact, reconstructable placeholder signature
(rebindable) versus which have no trustworthy known origin (stay unavailable) — narrow exact
matching only, never fuzzy, because a near-miss is exactly where guessing would be most tempting
and most wrong; `--apply` is gated behind an explicit flag and not run against live data without
separate sign-off. (4) A 16-step browser-acceptance checklist and its fixture-seeding script are
now prepared for a human to run end-to-end (correction → dispute → text/media redaction → export →
deletion, including denied access and audit attribution) — genuinely not yet executed, since no
browser-automation tool exists in this environment. (5) Real AWS Cost Explorer and billing-alarm
state were reconciled against `decision-and-cost.md`'s estimate (actual cost confirms the estimate;
one real, human-actionable gap found: the billing alarm's SNS email subscription is stuck
`PendingConfirmation`). (6) Confirmed DynamoDB TTL — distinct from S3's lifecycle rule — is not
configured on any table in this system; deletion is exclusively explicit. Seeded a dedicated,
isolated S3 noncurrent-version observation of the bucket's real 30-day expiration rule; genuinely
PENDING until 2026-11-03 (never fabricated early). DynamoDB capacity was left unchanged throughout,
per explicit instruction. See the evidence matrix's "Combinatorial cases," "Real staff API smoke
test," "Legacy media migration," and "S3 noncurrent-version expiration observation" notes.

**Update, review of the operational-readiness round (2026-10-05) — three real gaps found by
actually executing the new scripts against local fakes and reasoning about the new drill's forced
timing, all genuinely fixed:** (1) the legacy-media migration had no deletion-workflow eligibility
check at all and wrote its record-rewrite and custody-copy as two separate calls — reproduced as
two real failures (rebinding media for an already-deleted record; a failed custody-copy write
leaving an uploaded object permanently untracked, so a later deletion could report success while it
survived) — fixed by extracting the logic into a new, unit-tested module
(`services/legacyMediaMigration.ts`), checking custody status FRESH immediately before any upload
(never trusting the dry-run snapshot), and writing the record and its copy in one atomic DynamoDB
transaction (`FixtureStore.putRecordWithCustodyCopy`) with best-effort cleanup of an orphaned
upload if that transaction still fails; 6 new regression tests reproduce both original failures and
prove them closed. (2) The prior round's new "revocation racing restriction" combinatorial check
required a genuine CAS conflict that isn't actually guaranteed — two independent service calls can
legitimately serialize cleanly with nothing to retry — and its retry step used a brand-new
requestId instead of the original one, abandoning the loser's `LifecycleRequest` permanently
"in-progress"; fixed by accepting either valid outcome, adding a NEW deterministic forced-conflict
check (mirroring Finding 2a's technique), and retrying with the original requestId. That forced
check immediately caught a THIRD, genuinely new production bug: DynamoDB's `TransactWriteItems`
can cancel with reason `TransactionConflict` (simultaneous item contention) without ever evaluating
the `ConditionExpression`, and `dynamoStore.ts`'s `isConditionalFailure` only recognized
`ConditionalCheckFailed` — so a real race loss could propagate unmapped instead of becoming the
`VersionConflictError` every caller expects; now fixed. `realFullFixtureChecks.ts` passes **15/15**
against real DynamoDB after both fixes. (3) The S3 expiry observation's printed eligibility date
was a raw `+30 days` instant; S3's lifecycle engine actually sweeps once daily around UTC midnight
on whole elapsed days, so the real earliest eligibility is 2026-11-04T00:00:00Z, not
2026-11-03T22:44 — and `--check` could falsely report "expired" for an empty listing or for the
inverted case where the current version vanished instead of the noncurrent one; fixed by persisting
the exact seeded version ids as ground truth and requiring the current version to survive as a
positive control before ever reporting an observed expiration. 174 tests pass (up from 168). See
the evidence matrix's "Combinatorial cases," "Legacy media migration," and "S3 noncurrent-version
expiration observation" notes for the full detail.

**Update, same day (2026-10-05):** the billing alarm's SNS email subscription — the one real,
human-actionable gap the operational-readiness round found — is now confirmed. The user subscribed
and confirmed a different, organizational address (`cero@tiro.foundation`) rather than the original
`onewisepixel@gmail.com`; re-verified directly via `aws sns list-subscriptions-by-topic` (a real
`SubscriptionArn`, not just the confirmation screen), not merely taken on the confirmation
screenshot's word. The billing alarm now has a real, confirmed, actionable recipient.

**Update, a second review round of the operational-readiness work (2026-10-06) — five more real
gaps, all fixed:** (1) legacy-media migration could still race deletion EVEN with the fresh custody
check from the first round — `startDeletion()` + `completeDeletion()` can run to full completion
entirely in the real wall-clock gap between that check and the S3 upload finishing, leaving a newly
migrated object and its unreconciled `CustodyCopy` to survive an already-"completed" deletion. Fixed
with `CustodyCopyCommitter` (`store.ts`/`dynamoStore.ts`): the record+copy write and a
`ConditionCheck` on the restriction register's custody status now commit in ONE DynamoDB
transaction spanning both tables — the one place in this codebase that does — so there is no window
left for a concurrent deletion to land in. `listCustodyCopies` was also made strongly consistent,
closing the matching read-side gap. (2) The cleanup-on-failure path could destroy a binding that
actually committed — a timeout can report failure even after the server applied the write — fixed
by re-reading the record fresh before ever deleting the uploaded object, resolving the uncertainty
the same way `services/lifecycle.ts` already does for corrections and redactions, rather than
assuming any error means "didn't commit." (3) The S3 expiry checker's eligibility-date guard only
ran when v1 was still present, so v1 disappearing for any OTHER reason before real eligibility
would have been misreported as an early, lucky pass — fixed, and the whole eligibility/`--check`
decision tree was extracted into a new unit-tested module, `services/s3ExpiryObservation.ts`. (4)
The older `Finding 2b` concurrency check (`startDeletion` racing `restrict`) carried the exact same
two defects the first round's revocation/restriction combinatorial check did (requiring a
conflict that isn't guaranteed, never retrying a real loser) — fixed with the identical pattern.
(5) The staff UI's action forms showed their response only in a spot the next record reload wiped
almost immediately — losing `start-deletion`'s requestId and every action's actor attribution
before a human tester could read them — fixed with a persistent, page-level Action log.

11 new regression tests prove these closed (185 total, up from 174): 3 new tests in
`legacyMediaMigration.test.ts` (now 9) reproduce the TOCTOU race and the false-cleanup scenario
directly and prove both fixed; a new `s3ExpiryObservation.test.ts` (8 tests) covers the full
`--check` decision tree, including the exact third-finding repro. `realFullFixtureChecks.ts` also
grew two checks that exercise
`CustodyCopyCommitter` directly against real DynamoDB (a successful commit, and a real cross-table
refusal) and re-confirmed Finding 2b's fix live. See the evidence matrix's "Legacy media
migration," "Combinatorial cases," and "S3 noncurrent-version expiration observation" notes, and
"Browser-flow verification" for the staff-UI fix, for the full detail and real results.

**Update, a third review round (2026-10-06) — the second round's own fixes had two more gaps, both
fixed:** (1) the idempotent-recovery recheck added to resolve an uncertain commit was itself an
unguarded network call that could fail — a reviewer forced a DEFINITE custody refusal
(`DeletionInProgressError`, which GUARANTEES the whole transaction was atomically cancelled, no
ambiguity) immediately followed by a recheck failure; the uncaught exception skipped cleanup
entirely, and a later `completeDeletion()` reported `"completed"` while the untracked upload
survived — resurrecting the FIRST round's original bug via a brand-new path. Fixed: definite
non-commit signals (`DeletionInProgressError`/`VersionConflictError`) now go straight to cleanup
with no recheck at all, since there is no uncertainty to resolve for them; the recheck, kept only
for genuinely uncertain errors, is now wrapped in its own `try`/`catch` so a failure there preserves
BOTH failure messages in a new outcome instead of throwing uncaught. (2) A failed cleanup was still
reported as `"skipped-ineligible"` — implying nothing was left behind — so the CLI's failure count
and exit code never reflected a real orphan. Fixed with a dedicated `"needs-reconciliation"`
outcome carrying the exact `objectKey`/`versionId` as structured fields; the CLI now counts these,
prints them under their own banner, and exits non-zero whenever any exist. 3 new regression tests
(188 total, up from 185) reproduce both findings exactly. These are local, fault-injection-proven
fixes to service-layer control flow — not independently re-verified against real AWS this round,
since the underlying `DeletionInProgressError`/`VersionConflictError` classification itself was
already proven live in the second round. `--apply` stays deliberately unrun. See the evidence
matrix's "Legacy media migration" entry (third review round) for the full detail.

**Update, a fourth review round (2026-10-06) — one reporting gap in the third round's own fix:** an
ORDINARY write failure (reproduced by injecting a real `AccessDeniedException` directly into the
CLI) still landed in `"skipped-ineligible"` once cleanup succeeded — reported as a benign skip with
the CLI exiting 0, the record left genuinely un-migrated with nothing in the output distinguishing
it from a correct-by-design exclusion. Fixed by splitting that one outcome into two with a real
semantic difference: `"skipped-ineligible"` stays reserved for refusals that are correct BY DESIGN
(the early eligibility checks, plus `DeletionInProgressError`/`VersionConflictError`, per explicit
instruction to keep eligibility/concurrency refusals there); every OTHER confirmed non-commit — a
genuine operational error — is now its own `"failed"` outcome, counted and reported, never folded
into a label implying nothing went wrong. The existing regression test for this exact path was
corrected in place to assert `"failed"`, directly reproducing the reviewer's CLI finding at the
service layer; 188 tests still pass (a test was corrected, not added). `--apply` stays deliberately
unrun. See the evidence matrix's "Legacy media migration" entry (fourth review round).

**Update, `--apply` executed (2026-10-06):** with every reported finding across four review rounds
closed, the reviewer explicitly recommended the live-migration procedure (fresh dry-run, `--apply`,
verify, re-confirm) and gave final authorization. Executed exactly that: a fresh dry-run found 40
rebindable; `--apply` rebound all 40, with 0 skipped, 0 failed, and 0 needing reconciliation; an
independent verification script (not part of the committed suite) confirmed all 40 directly against
real AWS — exact S3 object, exact SHA-256, exact `MediaRef`, a matching `CustodyCopy` for each; a
confirmatory dry-run immediately after found 0 remaining rebindable, with only the 6 records
correctly excluded for being in the deletion workflow still carrying legacy references. DynamoDB
capacity was confirmed unchanged throughout. This closes the legacy-media migration end to end —
the one piece of this engagement's real, hard-to-reverse live-data mutation, now done and verified.
See the evidence matrix's "`--apply` executed" entry for the full detail.

**Update, the literal human browser click-through (2026-10-07):** `docs/backend/browser-acceptance-checklist.md`
was run for real, interactively, against the deployed stack — **16/16 steps passed**, staff
identity `cero@tiro.foundation`. One real setup-time bug was caught and fixed along the way:
`staff-ui/serve.json`'s `cleanUrls: false` (needed to stop `callback.html`'s query string from
being dropped on redirect) also silently disabled `index.html` auto-serving at the root path,
since both behaviors share one internal gate in `serve-handler` — `http://localhost:4300/` had
been serving a raw directory listing instead of the staff page the entire time that file has
existed. Fixed with a targeted `/` → `/index.html` rewrite that doesn't touch the callback fix.
See the evidence matrix's "The literal human click-through, done" entry.

**Update, staff intake and review (2026-10-08):** a staff member can now originate a brand-new
synthetic record through the browser — metadata, structured authority/legal-rights/consent-grant
evidence, a small media file — starting quarantined and unpublished, until a reviewer's decision
promotes it into the exact same permission/export/redaction/deletion machinery every other record
is already subject to, per `docs/ethos.txt` §§3.2-3.3. Five review rounds found real design gaps
BEFORE any production code was written — the quarantine-read window, cross-table commit
atomicity, revision binding, evidence completeness and real grant validation, and the actual
evidence-correction path — all closed in the design before implementation began; two more real
bugs (a controlVersion-only pin that didn't actually catch an already-rejected record, and a
tautological grant-audience check) were caught by the new tests themselves during implementation
and fixed immediately. 206 backend tests pass (up from 188).
`backend/src/scripts/realIntakeAcceptanceDrill.ts` — the reviewer's own stated completion test —
passed **22/22** against the real deployed stack: create, add real evidence and media, confirm
quarantine denies access even with evidence attached, a real metadata correction mid-review forces
a real DynamoDB version conflict on a stale approval, approve preservation for real, confirm
staff/preservation access now works and public/publication stays denied, confirm
`approve-publication` is itself denied with no publication grant ever submitted, export both
scopes, restore into an isolated target, withdraw, and delete. `infra/lib/fixture-backend-stack.ts`
grew four new routes and a narrowly scoped `s3:PutObject` grant (the first time this Lambda has
ever uploaded media itself) — DynamoDB capacity unchanged. Still open: a literal human
click-through of the new staff-ui sections, prepared but not yet run. See the evidence matrix's
"Staff intake and review" entry for the full detail.

**Catch-up update (2026-10-10) — this document had fallen behind `status.md`/`evidence-matrix.md`
between 2026-10-08 and now; both of those remain the live, round-by-round source of truth
throughout this gap, per this document's own next paragraph.** In order: the staff-intake
milestone's own remaining open item above WAS completed on 2026-10-07 (16/16 browser
click-through, one real setup bug found and fixed — see `evidence-matrix.md`'s "The literal human
click-through, done" entry); a fifth staff-intake review round on 2026-10-08 closed a residual
queue/evaluatePermission snapshot-sharing gap (`f599117`); then the **public Memory site
connection milestone** began and ran through two full implementation-and-review rounds, detailed
in full in the "Session handoff" section at the top of this document — summarized here only:
public, unauthenticated listing/detail/media endpoints now exist and are wired into the Memory
site; a first independent-review round (`1e6d329`) found and fixed 5 gaps, 2 of which the user has
explicitly reconfirmed; a second round (`5c3d306`, current `HEAD`) found and fixed 3 more; a prior
live-drill run reached 32/32 before this second round's fixes, but that result is now stale and
has not been reconfirmed since, blocked by a genuine, currently-persistent DynamoDB throttling
condition on the shared `drill-20261002` namespace (traced to 197 of 271 register rows being real,
expensive-to-evaluate candidates — almost certainly legacy data from other milestones, not this
feature). A literal browser walkthrough of this round's Next.js back/forward fix also remains
outstanding (no browser-automation tool available in this environment). **Sign-off is explicitly
withheld pending both**, per the user's own stated instruction. See the "Session handoff" section
at the top of this document for the complete, structured current state, evidence, and next steps.

This document is the entry point. For depth on any specific claim below, the four docs it points to
are the actual source of truth — this summary should not be quoted as authoritative where it
disagrees with them.

## What was asked

Implement a small, persistent AWS backend demonstrating permissions, record lifecycle operations,
preservation export, and safe restoration, using non-sensitive synthetic fixtures — per the
`tiro-aws-backend-handoff.md` brief and `docs/ethos.txt` §§3.3, 3.10, 4, 6.1, 12. Real collection
stays disabled; this is an engineering exercise, not a data-intake system.

## What was built

**Database decision: DynamoDB**, single-table design, with the lifecycle control state (what's
currently allowed to be served) kept in a **separate table** from the data itself. Full reasoning
and a pricing-grounded cost estimate in `docs/backend/decision-and-cost.md`.

**Code** (`backend/`, workspace-isolated from the Next.js app — different `tsconfig`, excluded from
the frontend's typecheck):
- `domain/` — the entity model (`FixtureRecord`, `ConsentGrant`, `AuthorityClaim`,
  `LifecycleRequest`, `RestrictionRegisterEntry`, etc.) and a from-scratch UUIDv7 generator.
- `store/` — a `FixtureStore`/`RestrictionRegisterStore` interface implemented twice: an in-memory
  fake for tests, and a real DynamoDB adapter. Identical service-layer code runs against either.
- `services/` — permission evaluation, lifecycle operations (restrict/withdraw/retain/delete),
  preservation export (JSONL), and restoration with reconciliation against the live control state.
- `fixtures/` — synthetic, clearly-labeled (`isSynthetic: true`) test data.
- `scripts/realBackupRestoreDrill.ts`, `realFullFixtureChecks.ts`, `realGrantRevocationRestoreDrill.ts`
  — the manually-invoked real-AWS drills (below).
- `api/` — added for the authenticated-API slice: a transport-agnostic `router.ts` (every route
  re-runs `evaluatePermission`/the lifecycle functions unchanged — Cognito authentication only gates
  who may call the API at all) and the real Lambda entrypoint, `handler.ts`.

**Infrastructure** (`infra/`, CDK/TypeScript): two DynamoDB tables, a private versioned-encrypted S3
bucket, a Cognito staff pool (self-signup disabled, Hosted-UI OAuth2+PKCE app client), an HTTP API
with a Cognito JWT authorizer fronting the Lambda above, bounded-retention logging, and a billing
alarm wired to a real SNS email subscription.

**`staff-ui/`** (new, standalone — not part of the Next.js app): a minimal static page using
Cognito Hosted UI to sign in, then calling every route on the API above. See `staff-ui/README.md`.

## What was proven, and how

**Locally (54 passing tests, no AWS credentials needed, runs in CI):** permission evaluation against
every case named in the brief (wrong purpose, wrong audience, expired consent, disputed authority,
disputed legal right, unverified signer capacity, missing control state, staff-role-is-not-a-grant),
lifecycle idempotency, a simulated-failure test proving a lifecycle action is never marked complete
before its control-state write is durable, a concurrency test proving two lifecycle actions racing
against the same snapshot can't silently clobber each other, export-time authorization, and the
T0→T1→T2→T3 restore-after-withdrawal sequence (plus a grant-level revocation variant) against the
in-memory fake.

**Against real AWS (the actual point of this milestone):** the stack is deployed
(`TiroFixtureBackend-drill-20261002`, account `440744257823`, `us-east-1`). The restore drill ran
four times: seed a record → real `CreateBackupCommand` → withdraw + start deletion against live data
→ real `RestoreTableFromBackupCommand` into a fresh table → reconcile the restored (stale,
still-"published") record against the live (correctly "withdrawn") control table → assert denial.
**All four passed.** The fourth run was fully automated including self-cleanup, exit code 0.

Separately, `realFullFixtureChecks.ts` seeded the FULL four-fixture set (not just the one `active`
case above) into the same live tables and ran 9 checks against real DynamoDB: 4 parity checks, the
grant-revocation check (Finding 1), two concurrency checks — a direct register compare-and-swap
race and a full `startDeletion`/`restrict` integration race (Finding 2) — and an export-authorization
check under both export scopes (Finding 3). **All 9 passed on the first run.** No disposable AWS
resources were created; the seeded fixtures were left in place as part of the real-AWS baseline.

Full requirement-by-requirement status — what's `demonstrated (local)`, `demonstrated (real AWS)`,
`pending`, or `not demonstrated`, with gaps stated plainly — is in
`docs/backend/evidence-matrix.md`. Nothing in this summary should be read as stronger than that
table says.

## Correctness fixes after review

Found by an independent review of `93427f7`, fixed the same day, each with a regression test:

1. **Restoration could revive revoked consent.** The restriction register protected record-wide
   withdrawal/deletion but not a single revoked `ConsentGrant` — restoring an old backup of that
   grant row made it look unrevoked again. Fixed by adding `revokedConsentIds` to the register
   itself (checked by `evaluatePermission` in addition to, never instead of, the grant's own
   `revokedAt`) and a new `revokeConsentGrant()` lifecycle action. `restore.test.ts`.
2. **Concurrent lifecycle actions could undo each other.** `transitionControl` read the register
   twice (non-atomically) per call, and callers did a third read before that — two actions
   interleaved could both "succeed" against the same stale snapshot, with the second clobbering the
   first (reviewer's repro: a deletion raced against a restriction ended up `published`/`preserved`).
   Fixed by deriving the full next state from exactly one snapshot and requiring the register write
   to match that snapshot's version exactly (compare-and-swap, not monotonic). `lifecycle.test.ts`.
3. **Export bypassed scoped permission checks.** `exportFixtureSet` only checked
   `currentPublicationStatus` directly for the public scope, and had no check at all for the
   preservation scope — an expired-consent or disputed-authority record could still be exported.
   Fixed by routing every export decision through `evaluatePermission` itself. `export.test.ts`.
4. **Legal-rights disputes were never checked.** `evaluatePermission` checked disputed/unknown
   *authority* claims but never looked at `LegalRight` records at all. Fixed by adding the same
   check (an empty legal-rights list is fine; a disputed or unknown one denies).
   `permissions.test.ts`.
5. **Deletion and checksum validation were incomplete.** `completeDeletion()` updated the register
   to `"deleted"` but never removed the actual `FixtureRecord` — the record stayed present and
   exportable. `validateExport`'s checksum check only required a non-empty string, accepting
   `"not-a-checksum"`. Fixed by adding `FixtureStore.deleteRecord()` (called from
   `completeDeletion()`) and SHA-256 hex-format validation. Byte-level verification against actual
   stored media content remains a separate, unclosed gap — no media bytes flow through export/import
   in this pass. `lifecycle.test.ts`, `restore.test.ts`.

## Real problems found and fixed during implementation

Listed because a clean final report with no bugs mentioned would be a worse signal than this list,
not a better one:

1. A from-scratch UUIDv7 implementation was silently one byte short (wrong string length) — caught
   by tracing the bit-packing by hand before it shipped, rewritten with a buffer-based approach.
2. A test fixture's own setup (`publicationStatus: "review"`) masked the condition the test claimed
   to verify (disputed authority) behind an earlier, unrelated gate (publication status) — the
   fixture was wrong, not the logic; fixed by isolating the variable under test.
3. The CDK stack's S3 bucket name string-interpolated an unresolved CDK token
   (`${this.account}` in environment-agnostic synth), failing S3 naming validation before a single
   AWS credential was involved — fixed by not hand-naming the bucket at all (the idiomatic CDK
   pattern, not a workaround).
4. ESLint was scanning `infra/cdk.out`'s generated/minified JS as if it were hand-written source
   (flat config doesn't read `.gitignore`) — fixed with an explicit ignore entry.
5. Tagging a freshly-restored DynamoDB table leaves it in a transient "in use" lock **not reflected
   in `TableStatus`** — an immediate `DeleteTable` failed twice with `ResourceInUseException` before
   this was understood; fixed with a retry-on-that-specific-exception wrapper, not a blind sleep.
6. The restore-wait timeout (300s) was too short — one real restore took ~10 minutes for a
   near-empty table. AWS documents restore time as variable, not proportional to table size. Bumped
   to 900s.

## Security note

During credential setup, a raw AWS secret access key was briefly visible in the local chat/IDE
context (pasted from a downloaded credentials CSV). Treated as compromised on sight: the key was
deactivated and deleted in IAM before ever being used for anything, a fresh key was generated, and
it was configured directly into the local AWS CLI profile rather than shared again. No access logs
show the exposed key was ever used.

## Cost

Estimated and, after one real month, should be confirmed near $0 — DynamoDB provisioned capacity is
set well inside the always-free 25/25 allowance, and the fixture workload is tiny (four synthetic
records seeded across all drill runs, no sustained traffic). Full estimate with cited AWS pricing in
`docs/backend/decision-and-cost.md`. A CloudWatch billing alarm (notification only, not an enforced
cap) is live, with a confirmed subscription at `cero@tiro.foundation` (confirmed 2026-10-05).

## Explicitly not done — not a vague "more to do" list

- Migrating the already-live legacy (`versionId: null`) media references seeded before version
  binding existed — they correctly fail closed (409), but nothing re-uploads/rebinds them
  automatically; would need a dedicated one-off migration script.
- Real TTL-deletion timing and real S3 noncurrent-version lifecycle-rule expiration timing — every
  deletion in every drill so far has been explicit, not timing-based.
- A combinatorial real-AWS case (e.g. a revocation racing a concurrent restriction, or a media purge
  racing an export) — each real-AWS correctness case so far has been checked in isolation.
- Forcing the export response budget's real whole-record TEXT exclusion live (as opposed to proving
  the field exists) — needs reading several real MB out of this stack's deliberately tiny,
  always-free-tier DynamoDB provisioning inside one Lambda invocation; every attempt tried
  observably throttled, but that's an observed result from those specific attempts, not proof it's
  categorically impossible at this provisioning (AWS documents burst capacity beyond the nominal
  provisioned rate) — and a real, billed capacity bump wasn't made unilaterally, per explicit
  instruction to leave this shared table's capacity unchanged. See the evidence matrix's
  seventh-review-round note.
- **Done as of the S3 media milestone, previously listed here:** authorized-media S3 routes
  (presigned URLs deliberately NOT used — see `services/media.ts`'s "no reusable download
  capability" design), real S3 version/delete-marker handling, byte-level checksums, and real S3
  object-version inventory/removal. See the evidence matrix's "Real S3 media acceptance drill".
- **Done as of the versioned correction and redaction milestone, previously listed here:**
  §3.5/§12's "Correct" action and text/media redaction tooling. See that milestone's note above and
  the evidence matrix's "Real correction/redaction drill".
- **Organizational, not engineering, and not something this document can resolve:** a named
  operator, and adopted (not merely proposed) consent/retention response-window numbers. Both are
  stated prerequisites in `docs/ethos.txt` §6.1. No placeholder values were fabricated for either.
- **Added by the public Memory site connection milestone (2026-10-08 through 2026-10-10), same
  "not a vague more-to-do list" standard:** real (non-synthetic) intake — unchanged, still an
  organizational prerequisite, not engineering; actual image/audio/video content redaction (only
  text-masking and a hard media-access deny exist, same limitation as the correction/redaction
  milestone above, now also true of the public-facing read path); resolving the live-drill
  throttling currently blocking a reconfirmed clean drill pass — genuinely open, see the "Session
  handoff" section at the top of this document; the literal browser walkthrough of the Next.js
  back/forward fix — not done, no browser-automation tool available; cleaning up legacy
  "preserved+published" fixture data from other milestones on the shared `drill-20261002`
  namespace — deliberately not done without explicit authorization, since it isn't this feature's
  data.

## Where to look for more

- **The "Session handoff" section at the very top of this document** — the current, structured
  state as of 2026-10-10: exact repo/deploy state, verification evidence, operational context, and
  the next three actions. Read this before anything below it for anything touching the public
  Memory site connection milestone.
- `docs/backend/decision-and-cost.md` — why DynamoDB, access-pattern analysis, cost estimate.
- `docs/backend/evidence-matrix.md` — the requirement-by-requirement table, local vs. real-AWS
  results, every AWS-only check still outstanding with the exact command to run it, and (newest)
  the public Memory site connection milestone's full round-by-round detail.
- `docs/backend/runbook.md` — exact commands for local dev, deploy, the real drill, and cleanup.
- `docs/backend/status.md` — keeps the historical static prototype, this fixture milestone, and
  future real-collection readiness from blurring into each other; also the most frequently
  updated, round-by-round running log.
- `docs/backend/browser-acceptance-checklist.md` — the staff-intake milestone's own completed
  (2026-10-07, 16/16) browser walkthrough checklist; a comparable checklist does not yet exist for
  the public Memory site connection milestone's outstanding walkthrough (see "Open work and
  resumption," action 2, at the top of this document) — would need to be written fresh if a future
  session wants a scripted checklist rather than the free-form steps listed there.
