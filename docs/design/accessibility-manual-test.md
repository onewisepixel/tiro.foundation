# Living Trace — manual accessibility test protocol

Status: Protocol for a human tester. **Not yet run.** Automated checks (axe, scripted keyboard, accessibility-tree review) are recorded in `living-trace.md` §6; they do not replace this pass.
Target: WCAG 2.2 AA (`docs/ethos.txt` §0.4, §7).
Run against: a production build (`npm run build && npm start`), or the deployed preview.

## Devices and assistive technology

| # | Device | Browser | Assistive technology |
| --- | --- | --- | --- |
| A | iPhone (any current iOS) | Safari | VoiceOver |
| B | Android phone (mid-tier, if possible) | Chrome | TalkBack |
| C | Mac | Safari | VoiceOver |
| D | Windows PC | Chrome or Edge | NVDA (free), or Narrator |
| E | Any desktop | Any | Keyboard only, no mouse; then 200% and 400% zoom |
| F | Any | Any | OS "reduce motion" on; OS high-contrast / forced colors on (Windows) |

Record results in the table at the end. Note the device, OS version, AT version, and date.

## Pages

`/` (homepage), `/living-trace`, `/living-trace/records/DEMO-LT-0001`, `/living-trace/records/DEMO-LT-0002`, `/memories/demo-audio-record`, `/nodes/lagos`, `/community-rights`.

## Tasks

### 1. Orientation (A–D)
1. Load `/`. Expected: the page title is announced, and the first heading is the founding premise.
2. Use heading navigation (VoiceOver rotor / TalkBack headings / NVDA `H`). Expected: one h1, then an h2 per movement (Witness … Participate), in order. No heading is empty or duplicated.
3. Use landmark navigation. Expected: banner (site header), navigation, main, contentinfo (footer), plus a region per movement.
4. On the hero, confirm the description of the mark is read ("The TIRO mark: origin, transmission, resonance …") and the drawn labels are not read twice.

### 2. Skip link and keyboard (E)
1. Press Tab once on `/`. Expected: "Skip to content" appears visibly; Enter moves focus past the header.
2. Tab through the whole page. Expected: focus is always visible; order follows the visual order; nothing traps focus; nothing receives focus while invisible.
3. In Discover: reach the evidence filter buttons, the "Relationships" list, and the inspector's buttons by Tab alone. Enter or Space selects a relationship; the inspector updates.
4. Tab quickly from the top of the page into Discover. Expected: its controls already exist (the interactive version loads at browser idle).

### 3. Discover with a screen reader (A–D)
1. Select "Record A → Place" in the list. Expected: one short announcement, "Selected relationship: Refers to, attested, 2 accounts. Details in the inspector.", not a re-reading of the whole inspector.
2. Move into the inspector. Expected: "Account 2 · Restricted source" is understandable without seeing the boundary styling.
3. Toggle an evidence filter. Expected: its pressed state is announced, and the list heading states "N of 13 shown".
4. Confirm the drawing itself is not read (it is hidden from AT; the list and inspector are its equivalent).

### 4. Records and boundary (A–D)
1. `/living-trace/records/DEMO-LT-0001`. Expected: the synthetic notice is read before the title. Field labels and values are read as pairs, and each evidence state is read as a word ("Unknown", "Recorded"), not only conveyed by a line.
2. `/living-trace/records/DEMO-LT-0002`. Expected: only the notice, the reference, and the "never shown" list. There is no hidden title to discover with AT.
3. `/memories/demo-audio-record`. Expected: the demonstration notice comes first, and "No audio recording attached" is announced. There is no empty media player.

### 5. Touch and reflow (A, B, E)
1. On phones: open and close the menu; Escape (hardware keyboard) or the Close button dismisses it.
2. In Discover on a phone: tap a line or a point in the drawing. Expected: it selects reliably (the hit areas are wide), and the inspector appears above the list.
3. At 320px width and at 400% desktop zoom: no horizontal scrolling of the page; no text clipped or overlapping.

### 6. Motion, contrast, forced colors (F)
1. With reduce motion on: nothing animates; the hero, spine, and constellation appear complete immediately.
2. With Windows forced colors: lines, boundaries, and focus outlines remain visible, and evidence states remain distinguishable by pattern and word.
3. Light and dark themes (header toggle): repeat a spot check of tasks 1 and 4.

## Results

| Task | Device | Pass / fail | Notes (what was announced, what went wrong) |
| --- | --- | --- | --- |
| | | | |
