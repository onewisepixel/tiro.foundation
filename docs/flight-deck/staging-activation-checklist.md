# Flight Deck: staging activation checklist

For: the founder. Work through it in order. Each ☐ that creates a resource or a charge, or changes what staging can do, needs your explicit go-ahead at that step.
Revision date: 2026-10-21. Details: `staging-setup.md`. Tests: `staging-acceptance.md`.
**Region: us-east-1 (N. Virginia), in the existing `tiro-stage` AWS account (821507736007).** Neon `aws-us-east-1`; Vercel functions `iad1`.

✓ = **done**, as reported by the founder on 2026-10-21 (not verified from this repository). ☐ = **awaiting your authorization**.

## 1. Before provisioning

- ✓ Vercel plan checked; staging project `tiro-flight-deck-staging` in team `TIRO`.
- ✓ Neon terms confirmed; database `flight_deck_staging` (synthetic only).
- ✓ `tiro-stage` account checks (`staging-setup.md` §2), mailboxes, and estimate approved against the $75 planning ceiling. The bypass secret adds $0.40 a month (§8).

## 2. Services and resources

- ✓ Neon project (Scale, `aws-us-east-1`, fixed 0.25 CU, 14-day history, spending notification).
- ✓ Vercel staging project, with **Vercel Authentication** (Deployment Protection) on and the automation-bypass secret generated.
- ✓ Stack `tiro-flight-deck-staging` deployed in us-east-1, with **both schedules DISABLED**.
- ✓ Five migrations applied; database initialized as synthetic.
- ✓ GitHub environment `flight-deck-staging` (you as required reviewer): variables `VERCEL_ORG_ID`, `VERCEL_STAGING_PROJECT_ID`, `VERCEL_PUBLIC_SITE_PROJECT_ID`, `FLIGHT_DECK_STAGING_ORIGIN`; secrets `VERCEL_STAGING_TOKEN`, `VERCEL_AUTOMATION_BYPASS_SECRET`.
- ✓ `FLIGHT_DECK_MODE=disabled`; public form, outbound email, and social publishing off.

## 3. Automation bypass (this change)

- ☐ Review and merge the draft pull request `flight-deck/staging-automation-bypass`.
- ☐ Store the **same** bypass value in Secrets Manager as `tiro-flight-deck-staging/vercel-automation-bypass` (CloudShell, silent prompt; `staging-setup.md` §10.3). Keep the ARN and version ID it prints; never read the value back.
- ☐ Create the change set with `VercelBypassSecretArn` and `VercelBypassSecretVersionId`, every other parameter unchanged (§10.4).
- ☐ **Review it:** `Modify` on `WorkerConnection` and `StatusConnection` only, no replacement, no schedule enabled. Then execute.
- ☐ Verify both connections (§10.5): `AUTHORIZED`, `Authorization` API key unchanged, extra secret header `x-vercel-protection-bypass`.

## 4. First deploy

- ☐ Decide to set `FLIGHT_DECK_MODE=production` in the staging project's Production environment. The deploy workflow refuses any other mode. Production mode alone still opens nothing until the console gate is approved, and on staging the public form cannot open at all.
- ☐ `add-operator` for yourself, if not already done (`staging-setup.md` §4).
- ☐ Run **Deploy Flight Deck staging**, type the confirmation, approve the run, and check that the smoke checks pass. They now include "protection refuses no or wrong bypass" and "the status endpoint refuses a call with the bypass but no bearer token".
- ☐ Run the credential checks in §10.6 once (missing and wrong bypass refused; bypass without a bearer token refused).
- ☐ Sign in with MFA; approve the console gate at `/flight-deck/gates`.
- ☐ Decide to set `WorkerScheduleState=ENABLED` (a reviewed change set; nothing else changes).

## 5. Prove it

- ☐ `staging-acceptance.md` stages A to F, including C7 (Deployment Protection) and E1 (scheduled calls pass protection and Flight Deck's own tokens), recorded in `acceptance.md` §7.
- ☐ Weekly cost check across AWS (Flight Deck's stack in `tiro-stage`), Neon, and Vercel during the first month.

## Afterwards

- To rotate the bypass: `staging-setup.md` §10.7. The change set always keeps `WorkerScheduleState` unchanged.
- To stop: `staging-setup.md` §9. Remove Flight Deck's resources only; **do not close `tiro-stage`**. The log bucket cannot be deleted until its retention has passed.
- Not authorized by any of this: real contact data, the public form, outbound messages, or a production deployment.
