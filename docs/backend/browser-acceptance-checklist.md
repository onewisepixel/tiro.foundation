# Browser acceptance checklist — staff workflow, end to end

A human-run checklist for a literal browser click-through of the full admin
workflow against the real deployed stack and the real staff UI — the one
thing `docs/backend/evidence-matrix.md`'s "Browser-flow verification"
section has always named as not covered here (no browser-automation tool
is available in this environment). Everything server-side and every line
of client code this exercises is already verified for real by that
section and by the live drills; this checklist is the literal human
click-through on top of that.

Run this against synthetic fixtures only, on a deployed drill stack — see
`docs/backend/runbook.md`. Expect roughly 20–30 minutes.

## Setup

1. Deploy the stack and note the four `cdk deploy` outputs (`StaffApiUrl`,
   `StaffUserPoolId`, `StaffUserPoolClientId`, `StaffUserPoolDomain`) — see
   `docs/backend/runbook.md`.
2. Follow `staff-ui/README.md` steps 2–4: create `staff-ui/config.js`,
   create a staff Cognito user, serve `staff-ui/` on port 4300. Confirm the
   `curl -i "http://localhost:4300/callback.html?code=test&state=test"`
   sanity check in that README returns `200`, not a `301` — a `301` means
   sign-in will silently fail later and nothing below will work.
3. Seed the fixtures this checklist uses and print their record ids:
   ```bash
   AWS_PROFILE=<your-profile> AWS_REGION=us-east-1 \
     TIRO_PRIMARY_TABLE=<table> TIRO_REGISTER_TABLE=<table> TIRO_MEDIA_BUCKET=<bucket> \
     npx tsx backend/src/scripts/realSeedBrowserAcceptanceFixtures.ts
   ```
   Keep the three printed record ids (`ALLOWED`, `DENIED (expired consent)`,
   `DENIED (disputed authority)`) handy — every step below refers to them
   by these names.
4. Open `http://localhost:4300/` in a real browser and sign in via the
   Cognito Hosted UI with the staff user from step 2. **Note the exact
   email you sign in with** — step 16 checks that every action below was
   attributed to this same identity.

Record PASS/FAIL and a note for each numbered step as you go — this
checklist is the evidence, not just a rehearsal.

## A. Denied access (do this first, before touching the allowed record)

5. **Denied — disputed authority.** In "Look up a record", enter the
   `DENIED (disputed authority)` record id, purpose `publication`,
   audience `public`, click Load.
   - [ ] Expect: a yellow "Access: denied" banner naming the disputed
     authority claim as the reason.
   - [ ] Expect: NO title/summary content shown, NO consent/authority
     evidence listed — only the limited view (register state, lifecycle
     history, counts, audit receipts).
   - [ ] Expect: no action forms requiring content are usable in a way
     that would leak it (correction/redaction forms may render, but
     confirm no actual content is visible anywhere on the page).
6. **Denied — expired consent.** Repeat step 5 with the
   `DENIED (expired consent)` record id.
   - [ ] Expect: the same shape of denial, with a reason naming the
     expired/no-active-grant condition instead of a disputed claim —
     confirm the REASON TEXT actually differs between steps 5 and 6 (two
     distinct denial causes, not a generic catch-all message).
7. **Permission-check preview matches the page's own denial.** On either
   denied record, use the "permission-check" control with the same
   purpose/audience.
   - [ ] Expect: `allowed: false` with the same reason already shown on
     the page — the preview and the actual gate never disagree.

## B. The allowed record — correction and dispute

8. **Load the allowed record.** Enter the `ALLOWED` record id, purpose
   `publication`, audience `public`, click Load.
   - [ ] Expect: full content (title, summary, provenanceRef), full
     evidence (authority claims, legal rights, consent grants), custody
     copies, audit receipts, and an empty corrections list.
9. **Correct a field.** Use the `correct` form: field `summary`, enter a
   new corrected value, submit.
   - [ ] Expect: the page reloads showing the NEW value as the record's
     live `summary`.
   - [ ] Expect: the Corrections list now shows one entry whose
     `previousValue` is the ORIGINAL summary (copy it down — later steps
     need it) and whose `correctedValue` matches what you just entered.
10. **Dispute that correction.** Copy the correction's id from the
    Corrections list into the `dispute-correction` form, submit.
    - [ ] Expect: the correction's `status` becomes `"disputed"`.
    - [ ] Expect: the live `summary` field is UNCHANGED — still the
      corrected value from step 9, not reverted by the dispute.

## C. Redaction — text and media

11. **Redact the SAME field you corrected.** Use the `redact-text` form:
    field `summary` (the one you corrected in step 9), submit.
    - [ ] Expect: the live `summary` field now shows `[REDACTED]`.
    - [ ] Expect: the Redactions list shows only safe metadata (scope,
      field, reason, timestamp) — no `previousValue` anywhere on the page.
    - [ ] **Expect (the exact case a reviewer caught):** the Corrections
      list entry from step 9, for this SAME field, now ALSO shows
      `previousValue`/`correctedValue` as `[REDACTED]` — the correction
      history for a redacted field must be masked too, not just the live
      value. If step 9's original/corrected text is still visible in the
      Corrections list here, this is a FAIL.
12. **Redact a media object.** Note the text media's id from the Media
    section, then use the `redact-media` form with that id, submit.
    - [ ] Expect: that specific media object now shows as not retrievable
      (no working download), while a DIFFERENT, non-redacted media object
      on the SAME record remains downloadable — redaction is scoped to
      the exact object, not the whole record.

## D. Export

13. **Public-redacted export.** In the Export form: record id = `ALLOWED`,
    scope `public-redacted`, any fixture set id, destination audience
    `public`. Submit.
    - [ ] Expect: the exported record's redactions field is the sentinel
      `"redacted-for-public-export"` (or the record is absent, if
      something upstream denies it) — the pre-redaction original text
      must not appear anywhere in this export's output.
14. **Complete-preservation export.** Repeat with scope
    `complete-preservation`.
    - [ ] Expect: the full correction history (including the real,
      pre-redaction original text from step 9/11) IS present — this
      scope is the one archival custody is authorized to hold it in.
      Confirm this is a deliberate difference from step 13, not a bug:
      public-redacted withholds it, complete-preservation doesn't.

## E. Deletion

15. **Start, then complete, deletion of the ALLOWED record.** Use
    `start-deletion` (no fields). Copy the returned `requestId` into
    `complete-deletion`'s `deletionRequestId` field, submit.
    - [ ] Expect: `start-deletion` returns a request id immediately.
    - [ ] Expect: `complete-deletion` reports `"completed"` (it may need
      a moment to purge the real S3 media versions first).
    - [ ] Reload the record afterward (Look up a record, same id): expect
      either a 404-equivalent (record not found) or a denied view citing
      deleted custody status — never the original content again.

## F. Audit attribution

16. **Every action above is attributed to YOU, not spoofable.** Do this
    from a point before step 15's deletion, since the record's own
    history won't be reachable afterward.
    - [ ] Expect: each action form (restrict, withdraw, retain,
      start-deletion, complete-deletion) shows its raw JSON response
      directly on the page right after you submit it — look at the
      `requesterCapacity` field there; it must match the Cognito identity
      you actually signed in with in step 4 (`staff:<your-email>`). No
      network inspector needed; the UI prints the full response itself.
    - [ ] Expect: the Corrections list entry from step 9's `correct`
      action shows an `attribution` field with that SAME identity.
    - [ ] **Do NOT expect this from audit receipts.** `AuditReceipt`
      (`domain/types.ts`) has no actor field at all — only
      `recordId`/`receiptId`/`action`/`outcome`/`safeNote`/`at`. If the
      audit receipts list is the only place you checked, this step is
      incomplete, not passed.
    - [ ] Expect: in every case, the identity reflects what you actually
      signed in with, never anything you could have typed into a form —
      the UI never sends an identity in the request body at all; the API
      reads it from your ID token (`handler.ts`'s `extractCallerIdentity`).

## Result

Record: `___ / 16` steps passed, date run, and the staff email used to sign
in. File any FAIL as its own finding — do not mark this checklist
"passed" with an unresolved FAIL, and do not re-run a failed step
silently hoping it passes the second time without understanding why it
failed the first.
