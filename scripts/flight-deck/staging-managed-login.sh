#!/usr/bin/env bash
# TIRO-branded Cognito managed login for the Flight Deck STAGING app client.
# Run it in AWS CloudShell (tiro-stage, us-east-1) from a checkout of this
# repository. Docs: docs/flight-deck/managed-login.md.
#
#   bash scripts/flight-deck/staging-managed-login.sh plan
#       Read-only: checks the account, pool, tier, domain, client, and
#       current style; validates the request; changes nothing.
#   bash scripts/flight-deck/staging-managed-login.sh apply-branding --confirm apply-branding
#       Creates (or updates) the TIRO style for the app client. The domain
#       stays on its current version, so users see no change yet.
#   bash scripts/flight-deck/staging-managed-login.sh switch-to-managed-login --confirm switch-to-managed-login
#       Sets the domain to managed login (version 2). Requires the TIRO style.
#   bash scripts/flight-deck/staging-managed-login.sh rollback-to-classic --confirm rollback-to-classic
#       Sets the domain back to the classic hosted UI (version 1). The style
#       is kept (unused on version 1), so switching again is immediate.
#
# The only Cognito writes it can make: CreateManagedLoginBranding,
# UpdateManagedLoginBranding, and UpdateUserPoolDomain's ManagedLoginVersion
# (to 2, or back to 1). It never updates the user pool, the app client (whose
# update API replaces every field), MFA, recovery, or users. Each change is
# checked against a before-and-after snapshot of the client, pool, MFA, and
# recovery configuration, taken with an explicit field list that leaves out
# the client secret, so the secret is never read. It never deploys anything.
set -euo pipefail

readonly ACCOUNT="821507736007"
readonly REGION="us-east-1"
readonly POOL="us-east-1_H1ukCFTYB"
readonly CLIENT="3ukekra5fk6p6ce8fgafer4p4a"
readonly DOMAIN="tiro-flight-deck-stage"
readonly BUILD="deploy/flight-deck/managed-login/build.mjs"

cmd="${1:-}"
shift || true
confirm=""
while [ $# -gt 0 ]; do
  case "$1" in
    --confirm) confirm="${2:-}"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
case "$cmd" in
  plan) ;;
  apply-branding | switch-to-managed-login | rollback-to-classic)
    [ "$confirm" = "$cmd" ] || { echo "Refused: '$cmd' changes Cognito. Re-run with --confirm $cmd" >&2; exit 2; }
    ;;
  *) echo "usage: $0 plan | apply-branding | switch-to-managed-login | rollback-to-classic  (changes need --confirm <same word>)" >&2; exit 2 ;;
esac

command -v node >/dev/null 2>&1 || { echo "STOP: node is required (preinstalled in AWS CloudShell)." >&2; exit 2; }
[ -f "$BUILD" ] || { echo "Run from the repository root ($BUILD not found)." >&2; exit 2; }
node "$BUILD" check >/dev/null || { echo "STOP: the logo asset is out of date with the official mark." >&2; exit 1; }

idp() { aws cognito-idp "$@" --region "$REGION" --no-cli-pager; }

# --- Where are we? Each target is confirmed against AWS before anything else.
account=$(aws sts get-caller-identity --region "$REGION" --no-cli-pager --query Account --output text) || { echo "STOP: could not confirm the AWS account (are you signed in?)." >&2; exit 1; }
[ "$account" = "$ACCOUNT" ] || { echo "STOP: signed in to AWS account $account, not tiro-stage ($ACCOUNT). Nothing was changed." >&2; exit 1; }
domain_pool=$(idp describe-user-pool-domain --domain "$DOMAIN" --query 'DomainDescription.UserPoolId' --output text)
[ "$domain_pool" = "$POOL" ] || { echo "STOP: domain $DOMAIN belongs to user pool '$domain_pool', not $POOL. Nothing was changed." >&2; exit 1; }
domain_version=$(idp describe-user-pool-domain --domain "$DOMAIN" --query 'DomainDescription.ManagedLoginVersion' --output text)
[ "$domain_version" = "None" ] && domain_version=1
tier=$(idp describe-user-pool --user-pool-id "$POOL" --query 'UserPool.UserPoolTier' --output text)
case "$tier" in
  ESSENTIALS | PLUS) ;;
  *) echo "STOP: user pool tier is $tier. Managed login and its branding need Essentials or Plus. Nothing was changed." >&2; exit 1 ;;
esac
client_pool=$(idp describe-user-pool-client --user-pool-id "$POOL" --client-id "$CLIENT" --query 'UserPoolClient.UserPoolId' --output text)
[ "$client_pool" = "$POOL" ] || { echo "STOP: app client $CLIENT is not in $POOL. Nothing was changed." >&2; exit 1; }

# A snapshot of what must not change. Explicit fields only: the client
# secret is never requested, so it never leaves AWS.
snapshot() {
  idp describe-user-pool-client --user-pool-id "$POOL" --client-id "$CLIENT" --output json --query 'UserPoolClient.{ClientId:ClientId,UserPoolId:UserPoolId,ClientName:ClientName,AllowedOAuthFlows:AllowedOAuthFlows,AllowedOAuthFlowsUserPoolClient:AllowedOAuthFlowsUserPoolClient,AllowedOAuthScopes:AllowedOAuthScopes,CallbackURLs:CallbackURLs,LogoutURLs:LogoutURLs,DefaultRedirectURI:DefaultRedirectURI,ExplicitAuthFlows:ExplicitAuthFlows,SupportedIdentityProviders:SupportedIdentityProviders,PreventUserExistenceErrors:PreventUserExistenceErrors,EnableTokenRevocation:EnableTokenRevocation,AuthSessionValidity:AuthSessionValidity,IdTokenValidity:IdTokenValidity,AccessTokenValidity:AccessTokenValidity,RefreshTokenValidity:RefreshTokenValidity,TokenValidityUnits:TokenValidityUnits,RefreshTokenRotation:RefreshTokenRotation,ReadAttributes:ReadAttributes,WriteAttributes:WriteAttributes}'
  idp describe-user-pool --user-pool-id "$POOL" --output json --query 'UserPool.{Id:Id,UserPoolTier:UserPoolTier,MfaConfiguration:MfaConfiguration,Policies:Policies,AccountRecoverySetting:AccountRecoverySetting,AdminCreateUserConfig:AdminCreateUserConfig,AutoVerifiedAttributes:AutoVerifiedAttributes,UsernameAttributes:UsernameAttributes,UserAttributeUpdateSettings:UserAttributeUpdateSettings,DeletionProtection:DeletionProtection}'
  idp get-user-pool-mfa-config --user-pool-id "$POOL" --output json --query '{MfaConfiguration:MfaConfiguration,SoftwareTokenMfaConfiguration:SoftwareTokenMfaConfiguration,SmsMfaConfiguration:SmsMfaConfiguration,EmailMfaConfiguration:EmailMfaConfiguration,WebAuthnConfiguration:WebAuthnConfiguration}'
}
unchanged_since() {
  local after
  after=$(snapshot)
  if [ "$after" != "$1" ]; then
    echo "STOP: the client, pool, MFA, or recovery configuration differs from before. Investigate before anything else:" >&2
    diff <(printf '%s\n' "$1") <(printf '%s\n' "$after") >&2 || true
    exit 1
  fi
  echo "Unchanged: app client (OAuth flows, scopes, callback and sign-out URLs, token settings), user pool policy, MFA, recovery."
}

# The app client's current style, if any.
style_json=""
style_id=""
if out=$(idp describe-managed-login-branding-by-client --user-pool-id "$POOL" --client-id "$CLIENT" --output json 2>&1); then
  style_json="$out"
  style_id=$(printf '%s' "$style_json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{process.stdout.write(JSON.parse(s).ManagedLoginBranding?.ManagedLoginBrandingId??"")})')
elif ! printf '%s' "$out" | grep -q "ResourceNotFoundException"; then
  echo "STOP: could not read the app client's managed login style:" >&2
  printf '%s\n' "$out" >&2
  exit 1
fi
matches() { [ -n "$style_json" ] && printf '%s' "$style_json" | node "$BUILD" verify --user-pool-id "$POOL" >/dev/null 2>&1; }

echo "AWS account $account (tiro-stage), region $REGION."
echo "User pool $POOL, tier $tier. App client $CLIENT."
echo "Domain $DOMAIN: version $domain_version ($([ "$domain_version" = 2 ] && echo "managed login" || echo "classic hosted UI"))."
if [ -z "$style_id" ]; then echo "Managed login style for the app client: none."
elif matches; then echo "Managed login style for the app client: $style_id, matches the repository."
else echo "Managed login style for the app client: $style_id, differs from the repository."
fi
node "$BUILD" create-request --user-pool-id "$POOL" --client-id "$CLIENT" >/dev/null
echo "Request built and validated from deploy/flight-deck/managed-login/ (no secret in it)."

case "$cmd" in
  plan)
    echo "Plan only: nothing was changed."
    ;;
  apply-branding)
    before=$(snapshot)
    if [ -z "$style_id" ]; then
      node "$BUILD" create-request --user-pool-id "$POOL" --client-id "$CLIENT" \
        | idp create-managed-login-branding --cli-binary-format base64 --cli-input-json file:///dev/stdin --query 'ManagedLoginBranding.ManagedLoginBrandingId' --output text
    else
      node "$BUILD" update-request --user-pool-id "$POOL" --branding-id "$style_id" \
        | idp update-managed-login-branding --cli-binary-format base64 --cli-input-json file:///dev/stdin --query 'ManagedLoginBranding.ManagedLoginBrandingId' --output text
    fi
    idp describe-managed-login-branding-by-client --user-pool-id "$POOL" --client-id "$CLIENT" --output json | node "$BUILD" verify --user-pool-id "$POOL"
    unchanged_since "$before"
    echo "The domain is still on version $domain_version: users see no change until switch-to-managed-login."
    ;;
  switch-to-managed-login)
    [ "$domain_version" != 2 ] || { echo "The domain already uses managed login. Nothing was changed."; exit 0; }
    matches || { echo "STOP: the app client has no TIRO style, or it differs from the repository. Run apply-branding first: without a style, managed login is unavailable for this client." >&2; exit 1; }
    before=$(snapshot)
    idp update-user-pool-domain --domain "$DOMAIN" --user-pool-id "$POOL" --managed-login-version 2 --output json >/dev/null
    now=$(idp describe-user-pool-domain --domain "$DOMAIN" --query 'DomainDescription.ManagedLoginVersion' --output text)
    [ "$now" = 2 ] || { echo "STOP: the domain reports version $now after the update." >&2; exit 1; }
    unchanged_since "$before"
    echo "The domain now uses managed login. Cognito applies it within about a minute. Run the test plan (docs/flight-deck/managed-login.md §5)."
    echo "To undo: bash $0 rollback-to-classic --confirm rollback-to-classic"
    ;;
  rollback-to-classic)
    [ "$domain_version" != 1 ] || { echo "The domain already uses the classic hosted UI. Nothing was changed."; exit 0; }
    before=$(snapshot)
    idp update-user-pool-domain --domain "$DOMAIN" --user-pool-id "$POOL" --managed-login-version 1 --output json >/dev/null
    now=$(idp describe-user-pool-domain --domain "$DOMAIN" --query 'DomainDescription.ManagedLoginVersion' --output text)
    [ "$now" = 1 ] || [ "$now" = "None" ] || { echo "STOP: the domain reports version $now after the update." >&2; exit 1; }
    unchanged_since "$before"
    echo "The domain is back on the classic hosted UI (within about a minute). The TIRO style is kept, unused, for a later switch."
    ;;
esac
