# Flight Deck — synthetic cloud-staging checkpoint (2026-10-23)

**Disposition: LIMITED PASS — private synthetic-console validation only; founder review pending on this record.** This is **not** completion of the full staging acceptance plan, permission to use real data, or authorization to open any public or outbound function.

This dated record supplements the [staging acceptance plan](staging-acceptance.md), the historical [acceptance evidence](acceptance.md), and the [activation checklist](staging-activation-checklist.md). Those documents contain earlier preparation snapshots; this record describes the observed cloud staging state through October 23, 2026.

## 1. Scope and boundaries

| Item | Recorded value |
| --- | --- |
| Source repository | `onewisepixel/tiro.foundation`, `main` |
| Application | Private Flight Deck operational console; synthetic data only |
| Vercel project | `tiro-flight-deck-staging`, project `prj_PezobCrOgKXYGXYJZeQL6eL4kKSb`, team `tiro-9e61715e` |
| Staging origin | `https://tiro-flight-deck-staging.vercel.app` (Deployment Protection enabled) |
| Latest staging deployment (read-only Vercel check, Oct 23) | `dpl_3KEJLLLhjeEViMwbLtmqmxAWNhAd`, READY, commit `b632c242e638a09198719c57e4222ff268046acd` |
| Neon | Project `soft-tooth-43419485`; branch `br-floral-queen-b8jj8vhb`; database `flight_deck_staging`; PostgreSQL 17 |
| AWS | Dedicated `tiro-stage` account `821507736007`, us-east-1; CloudFormation stack `tiro-flight-deck-staging` |
| Operator | Registered founder through Cognito and TOTP MFA |
| Approved activation | **Console gate only**, recorded 2026-10-21 23:08 UTC and written to the protective log |
| Explicitly **not** approved | Public-form gate, real contacts, email dispatch, social publication, scheduled worker activation, public production deployment |

The public privacy notice remains a draft. The EventBridge worker and status schedules were reported and independently checked disabled during activation; they were **not** rechecked in AWS for this document. The Neon worker-run count below independently shows none has run.

## 2. Test results and provenance

**Provenance labels:** `founder-observed` = visually checked in the authenticated console and reported by the founder; `independent` = checked from a provider/database API; `automated` = passed on a disposable test system, not the staging endpoint.

| Checkpoint | Result | Evidence and qualification |
| --- | --- | --- |
| Deployment, protection, sign-in | **Pass (limited)** | Staging deploy READY (independent, Oct 23). Cognito founder sign-in and fresh authenticator-code challenge exercised; Vercel protection observed in the activation sequence. No claim that every identity negative case in plan A was tested. |
| Console activation | **Pass** | Founder-authorized signed gate recorded at 2026-10-21 23:08 UTC in protective log; one `console` gate row independently confirmed in Neon on Oct 23. |
| Cloud-staging disclosure | **Pass** | [PR #6](https://github.com/onewisepixel/tiro.foundation/pull/6) corrected banner to `STAGING · SYNTHETIC DATA ONLY · CLOUD-HOSTED · NO REAL CONTACTS`; deployed before user tests. |
| Operator attribution and relationship ownership | **Pass** | [PR #7](https://github.com/onewisepixel/tiro.foundation/pull/7) deployed at `b632c242`. Founder visually confirmed Activity attribution, relationship Owner = `TIRO Founder`, and owner selector without demo operators; no ownership edit saved. |
| Rejected contact basis | **Pass** | Fictional relationship `TIRO TEST — Fictional Archive Partner` created; founder rejected permission review. Permission became expired; attempt to advance an outreach draft refused with `Permission to contact has expired.` (founder-observed). |
| Unauthorized dispatch evidence | **Pass within application records** | Independent database checks found no dispatch jobs or publication receipts after refusal; no worker runs. This cannot prove the absence of unrelated, out-of-band human action. |
| Review/approval attribution | **Pass** | Synthetic content fixture `cnt_WcYnY7EC4xxv8zML` moved to review, and v2 was approved with an attributed approval and audit event at 2026-10-23 08:54:59 UTC. |
| Edit invalidates approval | **Pass** | Founder edited fixture body to v3. Independent Neon verification: content `draft`, currentVersion `3`, prior v2 approval `invalidated` with reason `content-edited`. Audit retained invalidation and edit events. |
| UI fail-closed state | **Pass at UI layer** | Founder verified that v3 had no valid approval and lacked publication/queue actions. No live forced server request was submitted. |
| Backend negative regression | **Pass in CI** | [PR #11](https://github.com/onewisepixel/tiro.foundation/pull/11) merged as `441fc1910541e87ed39b6d211bd8e8f378df7b33`. [CI run 39931656022](https://github.com/onewisepixel/tiro.foundation/actions/runs/39931656022) passed `build-lint-test`, including real PostgreSQL integration tests. The new test verifies rejection of stale approval by both `queueDispatch` and `recordManualPublication`, with zero new jobs/receipts/audit side effects. No live authenticated staging HTTP invocation was performed. |
| Health read-only inspection | **Pass, founder-observed** | Founder reported all requested Health checks green on Oct 23: recovery/log, off gates/providers, queue, workers, registered operator, and no actionable discrepancy reported. No Health action button was used. |
| Deployment isolation after CI merge | **Pass** | Vercel API still listed the staging deployment at `b632c242`, READY, as of Oct 23. PR #11 is present on `main` and verified in CI but is **not separately deployed** to staging. Public `tiro-foundation` project was not targeted. |

### Read-only database reconciliation (Oct 23)

Independently queried the **specified staging branch and database**, using only SELECT:

| Field | Value |
| --- | ---: |
| `fd_jobs` | 0 |
| `fd_receipts` | 0 |
| `fd_worker_runs` | 0 |
| `fd_interactions` | 0 |
| `fd_submissions` | 0 |
| `fd_audit` | 28 |
| `fd_activation_gates`: `console` | 1 |
| `fd_activation_gates`: `public-form` | 0 |
| Fixture | `draft`, synthetic, version 3 |
| Fixture's v2 approval | `invalidated`, `content-edited` |

The zero counts characterize Flight Deck's recorded staging operations at the time of the query, not every conceivable external side effect.

## 3. Still open — no implied approval to execute

The [full A–F acceptance plan](staging-acceptance.md) has **not** passed. In particular:

1. **Authenticated HTTP negative request:** The stale-approval path passed at the domain/PostgreSQL layer in CI. The deployed Next.js Server Action boundary has not been exercised by a direct, authenticated rejected request. Keep this as a distinct end-to-end evidence gap.
2. **Identity and protection adversarial checks:** The complete session replay, delayed reauthentication, outside-group/MFA denial, second-operator deactivation, and preview/OIDC-scope matrix have not all been recorded as passing.
3. **Database and protective-log resilience:** The destructive-attempt denials, restore/cut-over, tampered-history, and recovery-time drills in plans B–D are not complete in staging.
4. **Scheduled operation and alarms:** Worker and status schedules intentionally remain disabled. The 24-hour worker observation, alarms delivered to subscribers, bypass rotation/outage, and worker-token failures in plan E have **not** been run. These require separate approval before enabling schedules or contacting anyone.
5. **Incident and accessibility exercises:** Plan F rotations and incident tests, assistive-technology testing, and the human-paced review remain outstanding.
6. **UI no-op Save:** The backend treats unchanged content edits as no-ops; the form's Save remains clickable without edits. The founder explicitly deferred this presentation/UX improvement to a separate Flight Deck UI upgrade package. It does not block this limited checkpoint.

Do not infer from this document that the source version currently on `main` is the version deployed to staging; the Vercel deployment identity above controls that claim.

## 4. Disposition and change control

**Accepted for:** continuing human-supervised, private, synthetic-only Console validation with the existing gates and infrastructure unchanged.

**Not accepted for:** completion of the A–F plan, public intake, real operational records, real-contact outreach, automated or manual public publishing, enabling scheduled workers or status monitors, production launch, or replacing the founder's approvals with this document.

Next documentary action: founder reviews this evidence, accepts or corrects its scope, and explicitly decides which still-open staging tests may be scheduled. Any test that changes a gate, schedule, cloud resource, provider state, protective log, or recipient contact remains separately approval-gated. Do not merge this evidence document as a substitute for an operational authorization.

Prepared as an evidence compilation on 2026-10-23; **no founder signature for the full staging plan is asserted**.
