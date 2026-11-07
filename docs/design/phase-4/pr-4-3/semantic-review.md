# PR 4.3: shared components, semantic review

**Status: accepted by the founder on 2026-11-07, with these decisions:**
1. **Blocked badges:** candidate B, the flagged outline: a heavy left edge, no fill.
2. **Completed vs authorized:** glyphs and tones are kept; the wording remains the distinction.
3. **Informational vs actionable:** glyphs and tones are kept.
4. **Page-title eyebrow:** muted text.
5. **Notices, sections, fields, empty states and buttons:** as proposed.

No protected change was authorized or made. The implementation and its verification are recorded in [README.md](README.md). The rest of this document is the review as it was presented.

**Branch:** `phase-4/shared-components-4-3`, from `main` at `35f119d`.

This review compares the current and proposed treatment of each status and shared component. Implementation starts only after it is accepted.

## How to read it

The comparison sheets are outside the repository, in `C:\tiro\dev\evidence\phase-4-3\semantic-review\`:
- `semantic-review.desktop.light.jpg`;
- `semantic-review.desktop.dark.jpg`.

**Correction after acceptance.** The sheets first presented showed candidate A, solid, in their main "Proposed" columns, with B in a separate table. Both sheets were regenerated with candidate B in every proposed column, page badges included, and the separate A/B table removed.

Each sheet was rendered in the test browser inside the local synthetic demo, signed in as the founder, with the synthetic banner checked.
- **Current:** the exact markup on `main` with the live stylesheets.
- **Proposed:** the same words, glyphs, roles and tones under the proposed console-scoped rules.

The sheet's "Meaning" column is a review aid. It is not app text.

## What the boundary allows, and what follows from it

Phase 4 may change only `className` and `style` values in the shared components (`ui.tsx`, `client.tsx`) and the pages. The checker protects the following, and this review keeps it that way:
- **The status vocabulary:** every label, and the tone and glyph of every status, in `STATUS`, `STAGE_TONE` and the badges written in pages.
- **What is rendered and when:** every condition, role, action binding and permission check.

One consequence matters most. The stylesheet sees four tones (`neutral`, `attention`, `blocked`, `done`), not the individual statuses. CSS alone can therefore make the four tones distinct, but it cannot set apart two statuses that share a tone.

## 1. Status badges

### Today

| Tone | Form today | Statuses |
| --- | --- | --- |
| attention | Accent outline, accent text | Needs review, Ready to send by hand, Open, Basis awaiting review, Queued for dispatch, Queued, Running |
| blocked | Contested outline, contested text | Failed, Failed after retries, Held: gate failed, Paused, Escalated, Withdrawn, Invalidated |
| done | Mineral outline, mineral text | Approved (exact version), Sent, Published, Provider confirmed, Attested by a person, Done, Active |
| neutral | Strong-border outline, soft text | Draft, Archived, Closed, Cancelled, Expired, Used, Dry run only (not sent) |

All four tones are the same shape: a 1px box. In the light themes, `--tiro-accent` and `--tiro-contested` are the same colour (`#8b3a2b`), so attention and blocked badges look identical apart from the glyph and the word. The baseline recorded this (plan §5.4, item 1).

### Proposed: tone told apart by form

Weight follows urgency. Every word and glyph is unchanged.

| Tone | Proposed form | Reads as |
| --- | --- | --- |
| blocked | **Candidate B (recommended): flagged outline.** A contested outline with a heavy 5px left edge, no fill | Stop: something is held, failed or withdrawn |
| | Candidate A: solid. A contested fill with background-coloured text | The same, but see below |
| attention | Accent outline, as today | Look at this |
| done | No box: a mineral rule beneath the word | Settled and on record |
| neutral | A faint hairline box, muted text | Recorded; nothing to do |

**Why B rather than A.** In the light theme, a solid red "Failed" badge takes the same form as the solid red primary button, "Approve this exact version". A fill reads as "press me" and as the page's affirmative action. B keeps fills for the one affirmative control. It also matches the proposed danger button's heavy left edge (§5), so "contested colour plus heavy left edge" consistently means "stop or destructive".

**Print and high contrast.**
- Browsers print without backgrounds, so candidate A would print as invisible text. A's print rule falls back to a 2px outline; B needs no fallback.
- In Windows high-contrast mode, every tone keeps a border or rule, so each form survives.

### The four distinctions

| Distinction | Today | With the proposal (CSS only) | Fully separating it would need |
| --- | --- | --- | --- |
| **Attention vs blocked** | Glyph and word only in light themes (same colour) | **Resolved:** outline vs flagged outline, in every theme and in print | Nothing more |
| **Informational vs actionable:** Queued for dispatch, Queued, Running vs Needs review, Ready to send by hand, Open, Basis awaiting review | Same tone; glyph families differ (⏱ ↻ vs ◐ ✉ ○) and the words differ | **Unchanged:** same tone, so same form | Moving the three system-in-progress states to another tone. That is a status-tone change, protected, and needs its own authorization |
| **Completed vs authorized:** Sent, Published, Provider confirmed, Done vs Approved (exact version), and in pages Scope approved, Approval valid for vN…, Permitted to write…, Approved by… | Same tone and the same ✓ glyph; only the words differ | **Unchanged:** same tone, so same form | A different aria-hidden glyph for the authorization states, in `STATUS` (`approved`) and in five page badges: Scope approved (campaigns), Approval valid for vN… (outreach and content), Permitted to write… (outreach) and Approved by… (gates). Protected label maps and props, so it needs its own authorization |
| **Available actions vs actions awaiting approval** | Actions are rendered only when available. An item awaiting approval shows the sentence "Awaiting a decision in Approvals." and no control. No disabled control exists, except the brief "Working…" while a form submits | Button hierarchy in §5; the "Working…" state becomes a faint outline instead of a 50% fade | Nothing in 4.3. The sentence is page markup, styled with the working forms in PR 4.5 |

There is one route I'm not proposing. The checker erases `className` values entirely, so a class computed from the glyph (`className={glyph === "✓" ? …}`) would pass it. That would encode meaning where the checker cannot see it, so it would bypass the boundary rather than respect it.

### Recorded, not changed

- **"Running" appears twice:**
  - in `STATUS`, for a worker job: attention, ↻;
  - on Health, for outbound activity: done, ●.
  
  It's the same word with two tones. This is vocabulary, so it is left as it is.
- **Primary vs danger buttons share a colour in the light theme.** They are told apart by fill vs outline, and under the proposal also by the danger button's heavy left edge.

## 2. Notices

| | Today | Proposed |
| --- | --- | --- |
| Error (`role="alert"`, ✕, hidden "Error: ") | 2px contested left rule on a light surface | Enclosed: a contested 1px outline with a 3px left edge, on the surface. An error is something to read before continuing |
| Confirmation (`role="status"`, ✓) | 2px mineral left rule on a light surface | Recedes: a 1px mineral rule at the margin, no fill |

Today the two notices differ only in rule colour and glyph. Under the proposal they also differ by form: enclosed vs a margin rule. The roles, glyphs, hidden text and wording stay the same.

## 3. Page titles and sections

| | Today | Proposed |
| --- | --- | --- |
| PageTitle eyebrow | Label, in the accent | Label, in muted text. The accent is kept for state (attention) and the current destination in the navigation |
| PageTitle block | Title and lede | The same, closed by a hairline rule, as on the public pages' local headers |
| Section heading | Label over a 1px `--tiro-border` rule | The same label over a `--tiro-border-strong` rule, so sections separate clearly once panels give way to rules (PR 4.4) |

## 4. Fields and empty states

| | Today | Proposed |
| --- | --- | --- |
| Field | Shared `/pilot` label and hint classes, resized with `!important` utilities | Console-scoped label (0.875rem, text colour) and hint (0.75rem, muted). It looks the same; the overrides are removed |
| Empty | Muted sentence | Muted sentence at a hairline margin rule: a recorded absence, not a message |

## 5. Buttons and action hierarchy

| | Today | Proposed |
| --- | --- | --- |
| Primary: the page's single affirmative action | Filled accent | **Unchanged weight** (plan §2) |
| Default | Strong-border outline on a faint surface fill | Outline, no fill. Hover strengthens the border |
| Danger | Contested outline | Contested outline with a 3px left edge, so it is never read as primary where the two share a colour |
| Pending ("Working…") | Whole button at 50% opacity | Faint outline, subtle text, "not allowed" pointer |
| Link styled as a button ("Open a case", "Print", "Export") | Same as default | Same as default (they navigate; they never change state) |

Height rises from 2.5rem to 2.75rem, matching the 44px targets of the 4.2 navigation.

## What implementation would change

- `src/app/flight-deck/flight-deck.css`: new console-scoped rules under `.fd-shell`. `globals.css`, whose `fd-*` rules `/pilot` shares, is not edited.
- `src/components/flight-deck/ui.tsx`: `className` values only, in Notice, PageTitle, Section, Empty and Field. `Badge`, `StatusBadge`, `StageBadge` and `STATUS` are untouched; badges change through the stylesheet.
- `client.tsx` and the pages: no change. Buttons change through the stylesheet.

No protected file is involved. Two options in §1 would need a protected change: tone for the in-progress states, and the glyph for authorization states. Neither is part of this proposal unless the founder separately authorizes it.

## Decisions requested

1. **Blocked badge form:** candidate B, the flagged outline (recommended), or candidate A, solid.
2. **Completed vs authorized:**
   - keep the words as the only distinction (no protected change); or
   - authorize separately a different glyph for the authorization states. That means `STATUS.approved` and the five page badges listed in §1.
3. **Informational vs actionable:**
   - keep the glyphs and words as the distinction (recommended; no protected change); or
   - authorize separately a tone change for Queued for dispatch, Queued and Running.
4. **The page-title eyebrow** moves from accent to muted text.
5. **Notices, sections, fields, empty states and buttons** as shown.
