# Flight Deck staging: TIRO-branded Cognito managed login

For: the founder, applying and testing the change on staging.
Status: **Prepared, not applied.** The branding configuration, the tooling and the tests are in this repository. Nothing has been sent to AWS: no style has been created, and the domain `tiro-flight-deck-stage` is still on the classic hosted UI.
Revision date: 2026-10-23. Scope: the Flight Deck staging app client only. TIRO's public website is not involved.

## 1. What this changes, and what it does not

Cognito serves Flight Deck's sign-in pages from the domain `tiro-flight-deck-stage`. Today that domain uses the classic hosted UI (`ManagedLoginVersion` 1), which renders generic AWS-styled pages. This change gives the app client a TIRO style and moves the domain to **managed login** (`ManagedLoginVersion` 2), Cognito's current hosted pages with a supported branding system.

**Unchanged:**

- the user pool and its users;
- the app client and its OAuth flows (authorization code; PKCE is sent by Flight Deck), scopes, callback and sign-out URLs, and token settings;
- MFA (required, authenticator app) and account recovery (verified email);
- the password policy and admin-only account creation;
- Flight Deck's token validation, operator checks and sessions.

The tooling cannot change any of these. It never calls the user-pool, app-client or MFA update APIs, and it proves the configuration is unchanged before and after every step (§4).

**One behaviour change, and a welcome one.** Flight Deck already sends `prompt=login` and `max_age=0` when a founder must re-authenticate to approve a launch gate (`src/lib/flightDeck/oidc.ts`). AWS documents `prompt` as "available in the managed login branding version only, not in the classic hosted UI" ([authorize endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html)). So on the classic domain today, the re-authentication request may simply be ignored: a founder could be sent back with an old `auth_time`, and Flight Deck would refuse the approval.

With managed login, `prompt=login` "requires users to re-authenticate even if they have an existing session". That makes the existing gate re-authentication work as designed (`recovery-guarantees.md` W8). The test plan checks it (§5, test R).

## 2. Facts this relies on (AWS documentation, read 2026-10-23)

| Fact | Source |
| --- | --- |
| Managed login and its branding are in the **Essentials** and Plus plans; Lite has only the classic hosted UI. The pool is Essentials | [Feature plans](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-sign-in-feature-plans.html) |
| The version is per domain: 1 = classic, 2 = managed login, switched in place with `UpdateUserPoolDomain`, within about a minute for a prefix domain | [UpdateUserPoolDomain](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_UpdateUserPoolDomain.html) |
| Each app client needs a branding style **before** its domain uses managed login; the API doesn't create one automatically (the console does) | Cognito developer guidance; enforced by the script |
| One style per app client. `UpdateManagedLoginBranding` patches: values not sent keep their setting | [CreateManagedLoginBranding](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_CreateManagedLoginBranding.html) |
| Settings are a JSON document (`categories`, `componentClasses`, `components`; `darkMode`/`lightMode`; colours as `RRGGBBAA`). **Values not in the schema are ignored silently** | [Branding editor and API](https://docs.aws.amazon.com/cognito/latest/developerguide/managed-login-brandingeditor.html) |
| Images by category (`FORM_LOGO`, `FAVICON_ICO`, …), up to 1,000,000 base64 characters each, request at most 2 MB. SVG limited to an allowlist of elements and attributes | [AssetType](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AssetType.html), branding guide |
| **Text cannot be changed or added**: managed login's wording is Cognito's own. Localization uses the `lang` URL parameter | Branding guide |
| `signUp`, `instructions`, `sessionTimerDisplay`, `languageSelector` components are reserved, not implemented | CreateManagedLoginBranding |

**What can be styled.** One style applies to every managed login page of the client:

- sign-in;
- the new-password prompt at an admin-created user's first sign-in;
- authenticator setup (QR code and first code) and the MFA code challenge;
- forgot password, and the code-and-new-password reset;
- error and status messages.

Pages can't be styled individually, and there is no custom CSS or HTML. Sign-up isn't offered, because the pool allows administrators only to create accounts. Because Cognito supplies all text, nothing in these pages can make claims TIRO hasn't approved; equally, nothing TIRO-specific can be written there.

## 3. The configuration (`deploy/flight-deck/managed-login/`)

| File | What it is |
| --- | --- |
| `branding-settings.json` | The style: Indigo dark register only, TIRO tokens only, square corners as in the console, no imagery |
| `assets/tiro-mark-gold.svg` | The official mark (`public/tiro-mark-primary.svg`), with its drawing unchanged |
| `build.mjs` | Builds the exact `CreateManagedLoginBranding` and `UpdateManagedLoginBranding` requests, regenerates and checks the logo, and verifies a stored style against the repository. No AWS calls |
| `reference/aws-settings-example.json` | AWS's documented example settings document; the tests require every TIRO key to exist in it |
| `scripts/flight-deck/staging-managed-login.sh` | The operator script (§4) |

**The logo.** The mark is drawn in `currentColor`, which the site renders as `--tiro-mark`, the antique gold on Indigo. An uploaded image can't inherit page CSS, so the logo is generated from the official file with exactly three changes:

- `currentColor` becomes `#c79a4b`;
- the embedded C2PA provenance block is removed, since its signature can't survive the colour change;
- the `role` and `xmlns:c2pa` attributes are removed, since they aren't in Cognito's SVG allowlist.

The tests compare every shape and coordinate with `public/tiro-mark-primary.svg` and `src/components/TiroMark.tsx`. The favicon is the site's own `src/app/favicon.ico`, unchanged.

**Design mapping** (dark register, from `src/app/globals.css`):

| Element | Token | Value |
| --- | --- | --- |
| Page background | `--tiro-bg` | `#0b0e16` |
| Sign-in form surface | `--tiro-raised` | `#121621` |
| Form border, dividers | `--tiro-border` | cream at 14% |
| Status message backgrounds | `--tiro-bg-deep` | `#060811` |
| Headings | `--tiro-text` | `#ede4d3` |
| Body text, field labels | `--tiro-text-soft` | cream at 86% |
| Descriptions, hints | `--tiro-text-muted` | cream at 64% |
| Input background | `--tiro-bg` | `#0b0e16` |
| Input border, placeholder | `--tiro-text-subtle` | cream at 56% (the console's input hover border) |
| Primary button, links, focus ring, selected option | `--tiro-accent` | `#c79a4b` (button text `#0b0e16`) |
| Secondary button border | `--tiro-border-strong` | cream at 24% |
| Errors | `--tiro-contested` | `#d08770` |
| Success | `--tiro-mineral` | `#8fa6a3` |
| Corners | (console) | square (radius 0) |

Off: page imagery, Cognito's illustrations, the header and the footer.

**Contrast** (WCAG 2.2, computed on the surface each item sits on):

| Text (4.5:1 needed) | Ratio | Components (3:1 needed) | Ratio |
| --- | --- | --- | --- |
| Heading | 14.31:1 | Focus ring on the form | 7.01:1 |
| Body text, field labels | 10.75:1 | Input border on the form | 5.23:1 |
| Descriptions, hints | 6.43:1 | Input border on the input | 5.33:1 |
| Placeholder | 5.33:1 | Primary button on the form | 7.01:1 |
| Links | 7.01:1 | | |
| Primary button text | 7.49:1 | | |
| Error / success indicators | 7.03:1 / 7.76:1 | | |

The form's own outline (1.39:1) is decorative, like the console's panels. The form is identified by its raised surface and its contents.

**Why a script, not CloudFormation.** The pool, domain and client are in the `tiro-flight-deck-staging` stack, but this change is kept out of that template, deliberately:

- The bypass procedure must keep sending the template with `--template-body`, which has a 51,200-byte limit; the branding with its assets would use most of the remaining room.
- The bypass change-set check refuses any unrelated change.
- `ManagedLoginVersion` is write-only in CloudFormation, so the stack can't detect drift, and it isn't in the template. Stack updates therefore leave the domain's version alone.

**Do not add `ManagedLoginVersion` to the template without setting it to the live value.** A template that says `1` would switch staging back to the classic UI on the next stack update. The tests flag the property if it appears.

## 4. Applying it (each step needs your approval)

Run in AWS CloudShell, `tiro-stage`, us-east-1. First check `aws sts get-caller-identity` shows `821507736007`. Then get the merged scripts:

```bash
git clone https://github.com/onewisepixel/tiro.foundation.git
cd tiro.foundation || echo "Clone failed: stop here."
git checkout main && git log -1 --oneline
```

The script confirms each target before acting, and stops on any mismatch:

- the account (`821507736007`) and region;
- that the domain `tiro-flight-deck-stage` belongs to pool `us-east-1_H1ukCFTYB`;
- that the pool's tier is Essentials or Plus;
- that app client `3ukekra5fk6p6ce8fgafer4p4a` is in that pool.

Around every change it snapshots the client, pool, MFA and recovery configuration, through an explicit field list that leaves out the client secret, and refuses to finish if anything differs.

1. **Plan (read-only).**

   ```bash
   bash scripts/flight-deck/staging-managed-login.sh plan
   ```

   It reports the tier, the domain version, and whether a style exists and matches. It builds and validates the request, and changes nothing.
2. **Create the style.** The domain stays classic, so users see no change yet.

   ```bash
   bash scripts/flight-deck/staging-managed-login.sh apply-branding --confirm apply-branding
   ```

   This creates the style, or updates the existing one in place if the client already has one, then checks that what Cognito stored matches the repository: every setting, and each asset byte for byte.
3. **Preview.** Cognito console → User pools → *tiro-flight-deck-operators* → Managed login → Styles → the client's style. Use the branding editor's **Preview** to see the pages before anyone is affected. Look only: an edit saved there would make the style differ from the repository, and the script would then refuse to switch until `apply-branding` is run again.
4. **Switch the domain to managed login.**

   ```bash
   bash scripts/flight-deck/staging-managed-login.sh switch-to-managed-login --confirm switch-to-managed-login
   ```

   It refuses unless the matching TIRO style exists. It takes effect within about a minute. Do this when nobody needs to sign in for a few minutes, then run §5.

Your principal needs `cognito-idp:DescribeUserPool`, `DescribeUserPoolDomain`, `DescribeUserPoolClient`, `GetUserPoolMfaConfig`, `DescribeManagedLoginBrandingByClient`, `CreateManagedLoginBranding`, `UpdateManagedLoginBranding` and `UpdateUserPoolDomain` on the pool. The secret-free snapshot still calls `DescribeUserPoolClient`, which AWS authorizes as a whole.

## 5. Test plan (staging, after the switch)

Use a test operator first, and your founder account for R. On a desktop browser, then a phone. Record date, browser, result, and any defect in `acceptance.md` §7.

| # | Test | Pass when |
| --- | --- | --- |
| L1 | Open `/flight-deck`, choose Sign in | Redirects to the managed login page on `tiro-flight-deck-stage.auth.us-east-1.amazoncognito.com`. Indigo background, raised form, gold TIRO mark at the top of the form, gold primary button, square corners, the TIRO favicon in the tab |
| L2 | Sign in with email and password | Asked for the authenticator code; then back in Flight Deck at `/flight-deck`, signed in as the right operator |
| L3 | Wrong password; unknown email | A neutral error ("incorrect username or password" style), the same for both: user-existence errors stay suppressed. Error styled in the contested colour |
| M1 | **MFA enrollment**: a newly created test operator signs in for the first time | Asked to set a new password (admin-created account), then shown the authenticator setup: QR code, manual key, first code. All in the TIRO style. Enrollment can't be skipped |
| M2 | **MFA challenge**: a wrong code, then the right one | The wrong code is refused with a styled error; the right one completes sign-in |
| P1 | **Forgot password**: "Forgot your password?" with a test operator's email | A code is emailed (Cognito's message). The code-and-new-password page is styled |
| P2 | Complete the reset with a password meeting the policy; then sign in | The reset succeeds; sign-in still asks for the authenticator code (MFA unchanged) |
| P3 | Reset with a weak password, or an expired code | Refused, with styled errors |
| R | **Founder re-authentication**: signed in more than 10 minutes, open `/flight-deck/gates` and choose "Sign in again" | Managed login asks for the password **and** the authenticator code again, even though a Cognito session exists (`prompt=login`). Back on the gates page, approval is offered (fresh `auth_time`). Under the classic UI this may not have worked: note the difference |
| S1 | Sign out | Lands on `/flight-deck/signed-out`; the old session cookie is refused |
| A1 | Keyboard only | Every field and button reachable in order; the gold focus ring is visible on each |
| A2 | 200% zoom, and a 320 px-wide window | No horizontal scrolling; nothing cut off |
| A3 | Screen reader (VoiceOver or NVDA): sign-in and the MFA code page | Fields and buttons announced with their labels; errors announced |
| X1 | `lang=fr` added to the sign-in URL (optional) | Cognito's French text, same style: confirms text comes from Cognito, not from the style |

## 6. Rollback to the classic hosted UI

```bash
bash scripts/flight-deck/staging-managed-login.sh rollback-to-classic --confirm rollback-to-classic
```

This sets the domain back to version 1. It takes effect within about a minute, with the same before-and-after checks. The classic pages look exactly as before: their classic customization was never touched.

The TIRO style is kept, unused, so switching again is immediate. To remove it as well, which is optional and only after rolling back, run `aws cognito-idp delete-managed-login-branding --region us-east-1 --user-pool-id us-east-1_H1ukCFTYB --managed-login-branding-id <id from plan>`. Never delete it while the domain uses managed login: without a style, managed login is unavailable for the client.

If sign-in fails after the switch for any reason, roll back first and investigate afterwards. Rolling back changes no authentication setting.

## 7. Status

| | |
| --- | --- |
| **Implemented** | The branding settings, logo and favicon assets, request builder and verifier, operator script with rollback, this procedure and test plan |
| **Tested locally** | Every settings key in Cognito's documented schema; colours only from TIRO tokens; WCAG contrast; the logo identical in drawing to the official mark and within Cognito's SVG allowlist; asset categories, types and size limits; request shapes against the AWS CLI's input skeletons; the script against a stub AWS CLI (gates, confirmations, create-or-update, refusing to switch without the style, rollback, snapshot mismatch, no forbidden calls, no client secret). Each safeguard mutation-checked |
| **Unverified until staging** | The live pool's tier and current settings (this machine has no AWS access, so run `plan` first); how Cognito actually renders the style; whether Cognito accepts creating a style while the domain is still classic (if it refuses, the procedure needs a short window with the switch first); the email codes' delivery; `prompt=login` behaviour in practice; screen-reader and phone behaviour |
