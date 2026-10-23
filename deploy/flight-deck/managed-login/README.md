# TIRO-branded Cognito managed login (Flight Deck staging)

The version-controlled branding for the Flight Deck staging app client's Cognito managed login pages. The procedure, the design mapping, the rollback and the test plan are in [`docs/flight-deck/managed-login.md`](../../../docs/flight-deck/managed-login.md).

- `branding-settings.json`: the style (`Settings` for `CreateManagedLoginBranding` / `UpdateManagedLoginBranding`).
- `assets/tiro-mark-gold.svg`: generated from `public/tiro-mark-primary.svg` by `node build.mjs logo`. Don't edit it by hand: the tests compare it with the official mark.
- `build.mjs`: builds the requests and verifies a stored style. It makes no AWS calls.
- `reference/aws-settings-example.json`: the example settings document from the AWS API reference for [CreateManagedLoginBranding](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_CreateManagedLoginBranding.html) (read 2026-10-23). It is used only to check that every key in `branding-settings.json` is one Cognito recognizes; Cognito ignores unknown keys silently. If AWS documents new keys, add them here from the AWS document.
- Applied by `scripts/flight-deck/staging-managed-login.sh`.
