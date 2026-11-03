# Flight Deck runtime control census: summary

Generated 2026-11-03T09:58:56.601Z from `bec57d2dc7ac` against the local synthetic demo. Action names: server-reference manifest.

## Screens by role

Status and route per role; forms and controls are counted. `same` means served at the requested path.

| Screen | anonymous | founder | operator | reviewer |
| --- | --- | --- | --- | --- |
| now | 200 → /flight-deck/sign-in; 3 form(s), 3 submit | 200; 1 form(s), 1 submit | 200; 1 form(s), 1 submit | 200; 1 form(s), 1 submit |
| approvals | 200 → /flight-deck/sign-in; 3 form(s), 3 submit | 200; 4 form(s), 10 submit | 200; 1 form(s), 1 submit | 200; 4 form(s), 10 submit |
| sign-in | 200; 3 form(s), 3 submit | — | — | — |
| signed-out | 200; 0 form(s), 0 submit | 200; 1 form(s), 1 submit | 200; 1 form(s), 1 submit | 200; 1 form(s), 1 submit |
| gates | 404; 0 form(s), 0 submit | 404; 0 form(s), 0 submit | 404; 0 form(s), 0 submit | 404; 0 form(s), 0 submit |
| recovery | 200; 0 form(s), 0 submit | 200; 1 form(s), 1 submit | 200; 1 form(s), 1 submit | 200; 1 form(s), 1 submit |
| relationships | — | 200; 1 form(s), 1 submit | 200; 1 form(s), 1 submit | 200; 1 form(s), 1 submit |
| relationships-new | — | 200; 2 form(s), 2 submit | 200; 2 form(s), 2 submit | 200; 2 form(s), 2 submit |
| relationship-b02 | — | 200; 8 form(s), 8 submit | 200; 7 form(s), 7 submit | 200; 1 form(s), 1 submit |
| relationship-a05 | — | 200; 9 form(s), 11 submit | 200; 8 form(s), 10 submit | 200; 1 form(s), 1 submit |
| relationship-a07-opted-out | — | 200; 7 form(s), 9 submit | 200; 6 form(s), 8 submit | 200; 1 form(s), 1 submit |
| relationship-b02-print | — | 200; 1 form(s), 1 submit | 200; 1 form(s), 1 submit | 200; 1 form(s), 1 submit |
| outreach | — | 200; 1 form(s), 1 submit | 200; 1 form(s), 1 submit | 200; 1 form(s), 1 submit |
| outreach-b02-needs-review | — | 200; 3 form(s), 3 submit | 200; 3 form(s), 3 submit | 200; 1 form(s), 1 submit |
| outreach-a04-queued | — | 200; 4 form(s), 4 submit | 200; 4 form(s), 4 submit | 200; 1 form(s), 1 submit |
| campaigns | — | 200; 4 form(s), 4 submit | 200; 3 form(s), 3 submit | 200; 1 form(s), 1 submit |
| content | — | 200; 2 form(s), 2 submit | 200; 2 form(s), 2 submit | 200; 1 form(s), 1 submit |
| content-first | — | 200; 3 form(s), 3 submit | 200; 3 form(s), 3 submit | 200; 1 form(s), 1 submit |
| content-last | — | 200; 4 form(s), 4 submit | 200; 4 form(s), 4 submit | 200; 1 form(s), 1 submit |
| cases | — | 200; 1 form(s), 1 submit | 200; 1 form(s), 1 submit | 200; 1 form(s), 1 submit |
| cases-new | — | 200; 2 form(s), 2 submit | 200; 2 form(s), 2 submit | 200; 2 form(s), 2 submit |
| digest | — | 200; 2 form(s), 2 submit | 200; 2 form(s), 2 submit | 200; 2 form(s), 2 submit |
| activity | — | 200; 1 form(s), 1 submit | 200; 1 form(s), 1 submit | 200; 1 form(s), 1 submit |
| health | — | 200; 6 form(s), 6 submit | 200; 3 form(s), 3 submit | 200; 2 form(s), 2 submit |

## Permission-dependent controls

Each distinct form (its action, context and submit labels) and where it appears. A control missing for a role is withheld from that role.

### now

| Control | anonymous | founder | operator | reviewer |
| --- | --- | --- | --- | --- |
| src/app/flight-deck/actions.ts#signIn · [Continue as founder] | yes | **no** | **no** | **no** |
| src/app/flight-deck/actions.ts#signIn · [Continue as operator] | yes | **no** | **no** | **no** |
| src/app/flight-deck/actions.ts#signIn · [Continue as reviewer] | yes | **no** | **no** | **no** |
| src/app/flight-deck/actions.ts#signOut · [Sign out] | **no** | yes | yes | yes |

### approvals

| Control | anonymous | founder | operator | reviewer |
| --- | --- | --- | --- | --- |
| src/app/flight-deck/actions.ts#signIn · [Continue as founder] | yes | **no** | **no** | **no** |
| src/app/flight-deck/actions.ts#signIn · [Continue as operator] | yes | **no** | **no** | **no** |
| src/app/flight-deck/actions.ts#signIn · [Continue as reviewer] | yes | **no** | **no** | **no** |
| src/app/flight-deck/actions.ts#signOut · [Sign out] | **no** | yes | yes | yes |
| src/app/flight-deck/actions.ts#decideAction · First contact to Synthetic Prospect B-02 · [Approve this exact version / Request revision / Reject] | **no** | yes | **no** | yes |
| src/app/flight-deck/actions.ts#decideAction · instagram post: Introduction: why TIRO exists · [Approve this exact version / Request revision / Reject] | **no** | yes | **no** | yes |
| src/app/flight-deck/actions.ts#decideAction · linkedin post: Custody, not ownership · [Approve this exact version / Request revision / Reject] | **no** | yes | **no** | yes |

### signed-out

| Control | anonymous | founder | operator | reviewer |
| --- | --- | --- | --- | --- |
| src/app/flight-deck/actions.ts#signOut · [Sign out] | **no** | yes | yes | yes |

### recovery

| Control | anonymous | founder | operator | reviewer |
| --- | --- | --- | --- | --- |
| src/app/flight-deck/actions.ts#signOut · [Sign out] | **no** | yes | yes | yes |

### relationship-b02

| Control | anonymous | founder | operator | reviewer |
| --- | --- | --- | --- | --- |
| src/app/flight-deck/actions.ts#editProspectAction · Next action and details · [Save details] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#transitionAction · Change stage · [Change stage] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#recordInteractionAction · Interactions · [Record] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#createTaskAction · Tasks · [Add task] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#createOutreachFromTemplate · Outreach for this person · [Create draft] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#withdrawAction · Retention, export, withdrawal · [Record opt-out] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#eraseAction · Retention, export, withdrawal · [Erase permanently] | — | yes | **no** | **no** |

### relationship-a05

| Control | anonymous | founder | operator | reviewer |
| --- | --- | --- | --- | --- |
| src/app/flight-deck/actions.ts#editProspectAction · Next action and details · [Save details] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#transitionAction · Change stage · [Change stage] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#recordInteractionAction · Interactions · [Record] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#resolveTaskAction · Tasks · [Done / Escalate / Cancel] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#createTaskAction · Tasks · [Add task] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#createOutreachFromTemplate · Outreach for this person · [Create draft] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#withdrawAction · Retention, export, withdrawal · [Record opt-out] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#eraseAction · Retention, export, withdrawal · [Erase permanently] | — | yes | **no** | **no** |

### relationship-a07-opted-out

| Control | anonymous | founder | operator | reviewer |
| --- | --- | --- | --- | --- |
| src/app/flight-deck/actions.ts#editProspectAction · Next action and details · [Save details] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#recordInteractionAction · Interactions · [Record] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#resolveTaskAction · Tasks · [Done / Escalate / Cancel] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#createTaskAction · Tasks · [Add task] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#createOutreachFromTemplate · Outreach for this person · [Create draft] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#eraseAction · Retention, export, withdrawal · [Erase permanently] | — | yes | **no** | **no** |

### outreach-b02-needs-review

| Control | anonymous | founder | operator | reviewer |
| --- | --- | --- | --- | --- |
| src/app/flight-deck/actions.ts#editOutreachAction · Edit · [Save new version] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#archiveDraftAction · Next step · [Archive draft] | — | yes | yes | **no** |

### outreach-a04-queued

| Control | anonymous | founder | operator | reviewer |
| --- | --- | --- | --- | --- |
| src/app/flight-deck/actions.ts#editOutreachAction · Edit · [Save new version] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#manualSendAction · Next step · [Record as sent by hand] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#archiveDraftAction · Next step · [Archive draft] | — | yes | yes | **no** |

### campaigns

| Control | anonymous | founder | operator | reviewer |
| --- | --- | --- | --- | --- |
| src/app/flight-deck/actions.ts#submitForReviewAction · Pilot listening: introductions (synthetic plan) · [Send scope for approval] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#campaignStateAction · Pilot listening: introductions (synthetic plan) · [Close campaign] | — | yes | **no** | **no** |
| src/app/flight-deck/actions.ts#editCampaignAction · Pilot listening: introductions (synthetic plan) · [Save] | — | yes | yes | **no** |

### content

| Control | anonymous | founder | operator | reviewer |
| --- | --- | --- | --- | --- |
| src/app/flight-deck/actions.ts#createContentFromTemplate · New draft · [Create draft] | — | yes | yes | **no** |

### content-first

| Control | anonymous | founder | operator | reviewer |
| --- | --- | --- | --- | --- |
| src/app/flight-deck/actions.ts#editContentAction · Edit · [Save new version] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#archiveDraftAction · Next step · [Archive] | — | yes | yes | **no** |

### content-last

| Control | anonymous | founder | operator | reviewer |
| --- | --- | --- | --- | --- |
| src/app/flight-deck/actions.ts#editContentAction · Edit · [Save new version] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#submitForReviewAction · Next step · [Send for review] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#archiveDraftAction · Next step · [Archive] | — | yes | yes | **no** |

### health

| Control | anonymous | founder | operator | reviewer |
| --- | --- | --- | --- | --- |
| src/app/flight-deck/actions.ts#reconcileAction · Recovery and the protective log · [Verify and replay now] | — | yes | **no** | **no** |
| src/app/flight-deck/actions.ts#runWorkerAction · Scheduled worker · [Run worker tick now] | — | yes | yes | **no** |
| src/app/flight-deck/actions.ts#liftSuppressionAction · Suppressed recipients (1 active) · [Lift (only if they asked)] | — | yes | **no** | **no** |
| src/app/flight-deck/actions.ts#resetSeedAction · Local demo data · [Reset to synthetic seed] | — | yes | **no** | **no** |

