# Fixture-Preservation Backend — Current Status

Dated 2026-10-02. This note exists to keep three things from blurring together, per
`docs/ethos.txt` §6.0's own concern about conflating prototype, demonstration, and evidence.

## Three distinct things, kept distinct

1. **The historical static prototype** (`docs/memory.txt`). The public Next.js site, its three
   labeled demonstration memory records, the node graph. Unchanged by this milestone. Still has no
   database, no auth, no upload flow — nothing in this backend work touches it.

2. **This fixture-preservation milestone** (this folder). A separate `backend/` + `infra/` codebase
   modeling the permission/lifecycle/export/restore machinery `docs/ethos.txt` §3.3/§3.10/§4/§6.1/§12
   describe, exercised against synthetic, invented, non-sensitive fixtures — never the public site's
   real demonstration records, never real collected material. Deployed to a real, dedicated AWS
   account (`440744257823`, `us-east-1`) as of 2026-10-02; the central restore-after-withdrawal
   guarantee has been proven against real DynamoDB, not just the local fake (see
   `docs/backend/evidence-matrix.md`). Still genuinely incomplete for the parts that need
   organizational decisions this document can't make (named operators, adopted retention
   procedures) or further engineering (no Lambda/API/staff-UI surface yet).

3. **Future real-collection readiness.** Not started, and not implied by anything in this
   milestone. §6.1's full gate — real intake, real consent capture, a real named operator roster,
   adopted (not proposed) response-window numbers — remains unmet. Nothing in this backend writes
   real collection, and the code enforces fixture-only mode structurally (every fixture carries
   `isSynthetic: true`; `validateExport` in `restore.ts` refuses to import anything that doesn't).

## What changed, concretely

- New `backend/` package: domain types, a storage abstraction with both an in-memory fake (tested)
  and a real DynamoDB adapter (type-checks, not yet run against AWS), permission evaluation,
  lifecycle operations (restrict/withdraw/retain/delete/the deletion-pending→deleted gate),
  preservation export, and restoration with reconciliation against a durable, separately-stored
  restriction register.
- New `infra/` package: a CDK stack (two DynamoDB tables, an S3 media bucket, a Cognito staff pool,
  bounded-retention logging, a billing alarm with a real SNS email subscription) — deployed as
  `TiroFixtureBackend-drill-20261002`.
- 45 passing local tests, including the T0→T1→T2→T3 restore-after-withdrawal acceptance test the
  brief names as central, plus a negative control and a concurrent-restriction case.
- That same T0→T1→T2→T3 sequence also run for real (`backend/src/scripts/realBackupRestoreDrill.ts`)
  against the deployed stack: real `CreateBackupCommand`, real withdrawal against live data, real
  `RestoreTableFromBackupCommand`, real reconciliation against the untouched live restriction
  register. Two real bugs found and fixed in the process (a tag-propagation race on table delete,
  and a too-short restore-wait timeout) — see the evidence matrix for exactly what broke and why.
- CI now typechecks and tests both new packages and synths the CDK stack, on every PR, without any
  AWS credentials. The real-AWS drill is deliberately NOT in CI — it costs real (if tiny) money and
  takes up to ~10 minutes; it's a manually-invoked script, documented in the runbook.
- The public Next.js site is untouched — same build, same lint, same 45-test baseline it had before
  (18 of those 45 are the pre-existing `recordKind` frontend checks; 27 are new backend tests).

## What remains open, by kind

**Engineering, scoped and ready to pick up:**
Lambda/API Gateway/Cognito-authorizer wiring, the staff UI, authorized-media S3 routes, a real-AWS
fixture seed script, then the actual provider backup/restore drill once those exist to test against.

**Organizational, not engineering — this document cannot close these:**
A named operator. Adopted (not proposed) consent/retention response-window numbers. Both are
prerequisites §6.1 states explicitly; fabricating placeholder values for either would be exactly
the kind of unearned claim the last several rounds of this project's review process have been
catching and correcting. They stay blank here on purpose.
