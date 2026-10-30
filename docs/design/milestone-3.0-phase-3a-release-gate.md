# Milestone 3.0, Phase 3a: public experience adoption — G3 release-gate report

Status: **Draft PR; not merged, not deployed.** Production adoption needs the founder's separate approval under G3 (plan §8; decision 41).
Date: 2026-10-30. Branch: `release/phase-3a-public-experience`, from `main` at `5715821` (Phase 2 merged).
Owner: TIRO founder / Steward.

## 1. Summary

The approved Living Archive becomes the public site:

| Route | Before | After |
| --- | --- | --- |
| `/` | Living Trace 0.2 homepage (`OriginHero`, constellation) | **Homepage V5** ("The Living Archive") |
| `/memory-project` | 89-line overview (v0.1) | **Memory Project v1** |
| `/memory-project/records/[id]` | — | **The two-view record interface** (synthetic records only) |
| `/preview/home-v5`, `/preview/memory-v1`, `/preview/memory-v1/records/:id` | the approved previews | **Temporary redirects** to the routes above |
| Global navigation | Manifesto · About · Memory Project · Nodes · Community Rights | **Purpose · Memory Project · Principles · Get involved** (decision 42), with every destination in the menu and footer |

Nothing else moves. `/living-trace`, `/memories` (apart from the wording correction in §4), the inner pages, Flight Deck, authentication, hosting and deployment settings are unchanged. No real or backend-connected record is enabled. The earlier explorations (V2–V4), the obsolete components and every branch remain (Phase 5).

**Recommendation:** the evidence below supports G3. Release requires your sign-off on the preview deployment of this PR, and decisions A–C in §8.

## 2. What changed

**Moved with `git mv`** (history follows the moves; the two pages replaced at `/` and `/memory-project` appear in Git as modifications of the old pages):

- `app/preview/home-v5/page.tsx` → `app/page.tsx`; `home-v5.css` → `app/home.css`
- `app/preview/memory-v1/page.tsx` → `app/memory-project/page.tsx`; `memory-v1.css` → `app/memory-project/memory-project.css`
- `app/preview/memory-v1/records/[id]/page.tsx` → `app/memory-project/records/[id]/page.tsx`
- `components/preview/home-v5/*` → `components/home/` (`HeroStrands`, `RecordLayers`, `Thread`, `TwoAccounts`)
- `components/preview/memory-v1/*` → `components/memory-project/` (`ConsentLifecycle`, `MethodLayers`, `routes.ts`)

**Edited for production, content unchanged:**

- **Metadata.** `/` takes the site's existing title and description (as the old homepage did) and is indexable. `/memory-project` keeps its existing title; its description no longer mentions "submission guidelines", which the approved page does not contain. Record pages keep `noindex`; their titles drop "(preview)". The restricted record keeps its generic title.
- **Links.** Breadcrumbs and "return" links point to `/` and `/memory-project`. Records open at `/memory-project/records/…`, including the homepage's specimen and two-accounts links, which used to open `/living-trace/records/…` (decision B). The "full synthetic map" links still go to `/living-trace` (decision 43).
- **Comments** no longer describe the pages as explorations.

**New:**

- `next.config.ts`: three temporary (307) redirects. Records redirect **by pattern**, never by a list of ids, so a redirect reveals nothing: `DEMO-LT-0003` (undiscoverable) redirects and then 404s exactly like an id that never existed.
- `src/lib/navigation.ts`: the four groups, used by `TopNav` and `Footer` (§3).
- `components/memory-project/recordRoute.ts`: maps a projected record link to the record view (server only, like the projection).
- `scripts/test/verify-disclosure.mjs`: new checks (§5.1).
- `scripts/test/public-site-checks.mjs`: the release checks (§5.3–5.5).
- Tests: `navigation.test.ts`, `redirects.test.ts`, and two in `publicMemoryApi.test.ts`.

## 3. Navigation (decision 42)

| Group | Header link | Menu and footer |
| --- | --- | --- |
| **Purpose** | `/manifesto` | Manifesto · About |
| **Memory Project** | `/memory-project` | The Memory Project · *(footer only)* Memory records (`/memories`) |
| **Principles** | `/community-rights` | Community Rights |
| **Get involved** | `/pilot` | The pilot · Nodes · Contact |

- Every destination of the previous navigation keeps a place. `/pilot` gains one, in the header (a test enforces this).
- **Header:** the four groups and the theme toggle. Inside a section, its group is marked current (`aria-current="true"`; `"page"` on the group's own page).
- **Narrow-screen menu:** each group with its pages, scrolling within the viewport on small screens (it fits a 320 × 568 screen).
- **Footer:** the four groups in columns, with every destination. Links are at least 24 px tall (WCAG 2.2 target size; the first check run caught them at 16 px).
- `/living-trace` stays out of the navigation (decision 43). `/memories` is footer-only (§4).

This mapping is **decision A** (§8). The header's height is unchanged (63 px).

## 4. `/memories`: navigation and the disabled state (decisions 42 and 44)

**The issue.** On `main`, the `/memories` index is linked from one page only: the old `/memory-project` ("Browse Memory Records"). Adopting Memory Project v1 would have removed that link, leaving the index unlinked (its records stay linked from the node pages). And the index says "Live records are temporarily unavailable", describing as an outage what is in fact a deliberate state: the public site has no API base URL, so backend records are not enabled (decision 44).

**The correction** (narrow; no backend record enabled, no redesign):

1. **Wording.** `publicMemoryApi.ts` now distinguishes **not enabled** (no `NEXT_PUBLIC_TIRO_PUBLIC_API_BASE_URL`; no request is made) from **unavailable** (configured, but the service failed).
   - When not enabled, `/memories` says: *"Live records are not enabled on this site. Records from the live Memory service are not shown publicly until their public display is approved."*
   - A backend record address (`/memories/<id>` beyond the three static demonstrations) answers 404, instead of a page claiming "the live Memory service did not respond".
   - A configured service that fails still shows the "temporarily unavailable" wording, so a real outage is still reported as one.
   - Tested in `publicMemoryApi.test.ts` and by the release checks.
2. **Navigation.** `/memories` is listed in the **footer only**, as "Memory records" under the Memory Project group. It keeps a place (decision 42) without appearing in the header or menu beside the demonstration, and the Memory Project group is not marked current on `/memories` (decision 44: kept separate). Its three static demonstration records, and their links from the node pages, are unchanged.

What `/memories` shows is otherwise unchanged; its restyle is Phase 3b. This is **decision C** (§8).

## 5. Verification

### 5.1 Disclosure (production build)

`npm run verify:disclosure` passes on the final build: 33 client files, 399 prerendered files, 29 routes.

New checks, each failing closed:

| Check | Fails when |
| --- | --- |
| 4b | the authority scenario is not at exactly `/memory-project/records/DEMO-MP-0001` |
| 4d | any expected record route (`DEMO-LT-0001`, `-0002`, `-0004`, `-0005`, `DEMO-MP-0001`) is missing, or any other record route exists, or `/memory-project` or a record is not prerendered |
| 4e | the restricted record (`DEMO-LT-0002`) does not render under the generic title "Restricted record" |
| 4f | `/`, `/memory-project` or any synthetic record page lacks the "Synthetic demonstration" label |
| 6 | any production page links to `/preview/` |

The existing checks still run (canaries, restricted and undiscoverable identifiers, the undiscoverable record's absence, `noindex` on every synthetic record page).

**Each new check was shown to fail** on a deliberately broken build: the scenario page removed, the homepage's synthetic label stripped, a `/preview/` link injected into `/about`, the restricted title changed, a record's `noindex` stripped. Each failed with its own message; the restored build passed.

### 5.2 Visual comparison with the approved previews

`scripts/test/living-archive-parity.mjs`, comparing the previews on `main` with the adopted pages on this branch. The pages: V5, Memory Project v1, the public, restricted and authority-scenario records, plus `/manifesto`, `/living-trace` and `/pilot`. Each in light and dark, at 1440, 820 and 390 px, with reduced and full motion: 96 captures each side. Only `<main>` below the header is compared, because the header and footer change by design.

| Result | |
| --- | --- |
| Element boxes and computed styles | **Identical** on every page. The only fingerprint differences are the intended `href`s: preview addresses → production addresses |
| Pixels | 22 captures identical; the rest differ by 1 to 375 pixels of anti-aliasing on curved strokes and dotted circles. Full-motion captures of V5 at tablet width differ by up to 1,098 pixels. No layout or colour change. The same kind of difference appears on `/living-trace`, which this branch does not touch, so it comes from rasterising pages whose total height changed (the new footer), not from the pages |
| Keyboard inside the pages | **Identical**: both tablists (Arrow keys, Home, End, and the panel each selects), the concordance's disclosure buttons, the record map, V5's deep link |
| Keyboard, header | Changed by design: four group links instead of five items, so every later Tab stop shifts by one |
| Console, hydration, overflow | None, in all 96 captures |

Screenshots (`docs/design/phase-3a/`):

- `*.first-screen.jpg`: each page's first screen, preview (before) and production (after), three widths, both themes.
- `layer-stack.jpg`: the exploded record.
- `navigation.jpg`: header, narrow-screen menu and footer, before and after, both themes.

### 5.3 Routes, redirects and links

160 release checks pass (`public-site-checks.mjs check`), including:

- **Redirects:**
  - the three adopted previews answer 307 to their production routes, query string preserved, and land on 200;
  - an undiscoverable and a nonexistent record id behave identically: redirect, then 404;
  - V2–V4 are still served.
- **Status codes:** `DEMO-LT-0003` and unknown ids are 404 at `/memory-project/records/`; Flight Deck answers 404.
- **Indexing:** `/`, `/memory-project` and the inner pages are indexable. Every synthetic record and `/living-trace` is `noindex`.
- **Links:** a crawl of every internal link from the public pages reaches 22 pages, all 200, with no production page linking to `/preview/`. Every navigation destination is linked from every page.
- **`/memories`:** the checks in §4.

### 5.4 Accessibility

- **axe-core (WCAG 2.0, 2.1 and 2.2, A and AA):** **no violations of any impact**. The pages scanned: `/`, `/memory-project`, three records, `/manifesto`, `/pilot` and `/nodes`. Each in light and dark, at 1440 and 390 px.
- **Keyboard:**
  - the skip link comes first;
  - the header's tab order is: skip link, mark, the four groups, theme;
  - the menu opens with Enter, lists all seven destinations in four groups, marks the current section, and closes on Escape.
- **Overflow:** no horizontal overflow at 320, 390 or 820 px on any adopted page or inner page, except `/pilot` at 320 px, which is identical on `main` (§7).
- **Reduced motion:** reduced-motion captures are covered by §5.2.

### 5.5 Performance

`public-site-checks.mjs perf`: each page loaded cold five times (median shown), at 390 px, CPU slowed 4×, network 150 ms round trip at 1.6 Mbps. Local production servers, so absolute times are lower than over the internet; compare the columns.

**The adopted pages against their approved previews** (the same design, at its new address):

| Page | LCP | CLS | Blocking time | Transferred (script) |
| --- | --- | --- | --- | --- |
| V5: preview on `main` | 1,144 ms | 0 | 67 ms | 309 KB (148) |
| V5: **`/`** | **1,136 ms** | **0** | **64 ms** | **317 KB (153)** |
| Memory Project v1: preview on `main` | 1,132 ms | 0 | 67 ms | 340 KB (160) |
| Memory Project v1: **`/memory-project`** | **1,140 ms** | **0** | **61 ms** | **326 KB (159)** |
| Record: preview on `main` | 1,148 ms | 0 | 63 ms | 334 KB (160) |
| Record: **`/memory-project/records/DEMO-LT-0001`** | **1,056 ms** | **0** | **63 ms** | **320 KB (159)** |

**The pages they replace** (measured on the build before the `/memories` correction, which touches neither page):

| Page | LCP | CLS | Blocking time | Transferred (script) |
| --- | --- | --- | --- | --- |
| `/` on `main` (Living Trace 0.2 homepage) | 1,100 ms | 0 | 74 ms | 324 KB (148) |
| `/memory-project` on `main` (89-line v0.1) | 868 ms | 0 | 64 ms | 286 KB (139) |

**Findings**

- The adopted pages perform like their approved previews: within 10 ms of LCP and 15 KB of transfer, apart from the record page, which is 92 ms faster. The production versions do not add weight.
- **`/`:** about as fast as the homepage it replaces (+36 ms LCP), with less blocking time (−10 ms) and less transferred (−7 KB).
- **`/memory-project`** first paints about 270 ms later than the old page and transfers 40 KB more. The old page was a short text overview; the new one carries the finding aid, the exploded record, the consent lifecycle and the catalogue. CLS stays at 0 and blocking time is unchanged.
- Every page renders its largest element at first paint (LCP = FCP): the headline is server-rendered text in a preloaded font.
- **Layout shift is zero everywhere.**

### 5.6 Build, tests, CI

| Check | Result |
| --- | --- |
| `npm run build` | Pass |
| `npm run verify:disclosure` | Pass (§5.1) |
| Typecheck, lint | Pass; 0 lint errors (the 2 warnings already on `main`) |
| `npm test` (Windows) | 550 of 554 pass. The 4 failures are the `managedLoginScript` tests that need Unix file permissions, unchanged from `main` |
| New tests | `navigation.test.ts` (6), `redirects.test.ts` (3), and 2 in `publicMemoryApi.test.ts` (not enabled vs unavailable) |
| Linux CI (`build-lint-test`, with the disclosure check) | **Pass:** run `41067042502` on `85cfa09` (PR #16). The full suite, including the Bash-script tests, PostgreSQL integration and CDK synth |
| Team preview deployment (`tiro-9e61715e/tiro-foundation`) | **Ready** on `85cfa09`: https://vercel.com/tiro-9e61715e/tiro-foundation/6SW9rATqtoefLxPZjVj7mQMZrnKK. Its address is visible only in Vercel, so the release checks above ran against a local production build of the same commit. Rerun them against the preview during review: `node scripts/test/public-site-checks.mjs check <preview URL> out.json` |

## 6. Requirements

| Requirement | Where shown |
| --- | --- |
| Preserve the approved designs and substantive content | §5.2: identical boxes and styles; copy unchanged apart from preview-only metadata (§2) |
| Demonstration records distinct from an operational collection | Synthetic labels enforced by check 4f; "In development. Not yet an operating collection." unchanged in the finding aid; records `noindex` |
| No real or backend-connected public records | No record data, projection or backend configuration changed; `/memories` now states that live records are not enabled (§4) |
| Record-level restrictions, generic restricted notice, `noindex` | Checks 2, 3, 4c and 4e; the restricted record page is unchanged |
| Disclosure verification for the new routes, failing closed | §5.1, with each new check shown to fail |
| Redirects, links, keyboard, mobile, accessibility, performance | §5.3 to §5.5 |
| `/living-trace` and `/memories` operationally separate | Neither moved; `/living-trace` unchanged and outside the navigation; `/memories` footer-only, wording corrected |
| Flight Deck, authentication, hosting, deployment untouched | No file under `src/app/flight-deck/`, `src/components/flight-deck/`, `src/lib/flightDeck/`, `src/proxy.ts`, `deploy/`, `infra/` or `.github/` changed. Flight Deck pages share the site's global `TopNav` and `Footer`, as before; they show the new navigation |
| Inner-page redesigns deferred | Inner pages unchanged (Phase 3b) |
| No deletions (Phase 5) | V2–V4, the obsolete components and every branch remain |

## 7. Known issues and limitations

- **`/pilot` overflows at 320 px** (a long link in its body; 349 px wide). Identical on `main`; part of Phase 3b's `/pilot` work.
- **One browser engine** (Chrome, headless, Windows). No Firefox or Safari run; no assistive-technology session.
- **Performance is local and synthetic**, not field data. Measure again on the preview deployment.
- **Flight Deck** was not run in local-demo mode. None of its files changed, but it renders the site's `TopNav` and `Footer`, so its header now shows the four groups. Its screenshots are Phase 4's.
- **`npm test` on Windows:** the 4 `managedLoginScript` tests that need Unix file permissions fail locally, as before; Linux CI runs them.
- The adopted pages keep their `hv5-` / `mv1-` class prefixes; renaming them is not needed for release.

## 8. Decisions for the founder

- **A. Navigation mapping** (§3; decision 42 requires review before release).
  - Purpose: Manifesto and About.
  - Memory Project.
  - Principles: Community Rights.
  - Get involved: Pilot, Nodes and Contact.

  Open question: should Nodes sit under Memory Project instead? Recommendation: approve as built.
- **B. Homepage record links** open in the Memory Project's record view, not on `/living-trace` (§2). Recommendation: approve. `/living-trace` stays linked as the full synthetic map.
- **C. `/memories`** (§4): footer-only placement, and the "not enabled" wording. Recommendation: approve. Revisit the placement when `/memories` is restyled in Phase 3b, or when public display of its records is decided.
- **D. Release (G3).** Merging this PR deploys it to production automatically: the team project, through its Git integration. The new `/` and `/memory-project` and the new navigation go live, and the previews' old addresses start redirecting. Approve only after reviewing the PR's preview deployment. Rollback: revert the merge commit, or use Vercel's instant rollback to the previous production deployment.
- **Carried from Phase 2** (decisions 1 and 2 there): drawing the homepage's restricted sheet with the shared `LayerStack`, and unifying two homepage spacing values. Not done here, so the approved design stays as approved. Recommendation: decide with screenshots after release.
