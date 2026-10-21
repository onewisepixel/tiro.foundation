#!/usr/bin/env bash
# Creates, and checks, a CloudFormation CHANGE SET that points the Flight
# Deck staging stack's two EventBridge connections at the Vercel bypass
# secret. It never executes the change set: it prints the command for you to
# run after reading the change set yourself.
#
#   First time:  bash scripts/flight-deck/staging-bypass-change-set.sh \
#                  --secret-arn <ARN> --version-id <VersionId>
#   Rotation:    bash scripts/flight-deck/staging-bypass-change-set.sh \
#                  --version-id <new VersionId>
#
# ARN and version ID are identifiers printed by staging-bypass-secret.sh,
# not the secret. Every other parameter keeps the stack's current value
# (UsePreviousValue), WorkerScheduleState included, so no schedule changes
# state. The parameter list is derived, not typed: the template's parameters
# from CloudFormation (get-template-summary) and the stack's from
# describe-stacks. A template parameter the stack does not have stops the
# script, because it would otherwise take its default.
#
# The finished change set is checked in full (bypass-change-set-policy.mjs,
# on the DescribeChangeSet JSON). The direct changes must be exactly
# WorkerConnection and StatusConnection, each changing only AuthParameters,
# in place. CloudFormation also lists five dependants, as Dynamic changes,
# because they read those connections' attributes (ARNs). Each is allowed
# only for its exact property and causing attribute. Anything else stops
# the script: any other resource, property, static change, replacement,
# parameter value, or stack. Read-only AWS calls apart from
# create-change-set. Docs: docs/flight-deck/staging-setup.md §10.4, §10.7.
set -euo pipefail

STACK="tiro-flight-deck-staging"
REGION="us-east-1"
# The staging account (tiro-stage). Checked before any CloudFormation call.
EXPECTED_ACCOUNT="821507736007"
TEMPLATE="deploy/flight-deck/flight-deck.template.json"
POLICY="scripts/flight-deck/bypass-change-set-policy.mjs"
secret_arn=""
version_id=""

while [ $# -gt 0 ]; do
  case "$1" in
    --secret-arn) secret_arn="${2:-}"; shift 2 ;;
    --version-id) version_id="${2:-}"; shift 2 ;;
    --stack) STACK="${2:-}"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[[ "$version_id" =~ ^[0-9A-Za-z-]{32,64}$ ]] || { echo "--version-id is required (the VersionId printed when the value was stored)" >&2; exit 2; }
if [ -n "$secret_arn" ] && ! [[ "$secret_arn" =~ ^arn:aws:secretsmanager:[a-z0-9-]+:[0-9]{12}:secret:[A-Za-z0-9/_+=.@-]+$ ]]; then
  echo "--secret-arn is not a Secrets Manager secret ARN" >&2
  exit 2
fi
[ -f "$TEMPLATE" ] || { echo "run from the repository root ($TEMPLATE not found)" >&2; exit 2; }
if [ -n "$secret_arn" ] && [[ "$secret_arn" != arn:aws:secretsmanager:"$REGION":"$EXPECTED_ACCOUNT":secret:* ]]; then
  echo "STOP: --secret-arn is not a secret in tiro-stage ($EXPECTED_ACCOUNT, $REGION)" >&2
  exit 2
fi

# The change set is checked with Node.js (preinstalled in AWS CloudShell).
command -v node >/dev/null 2>&1 || { echo "STOP: node is required to check the change set; nothing was created." >&2; exit 2; }
[ -f "$POLICY" ] || { echo "run from the repository root ($POLICY not found)" >&2; exit 2; }

# Refuse to touch any stack outside tiro-stage.
account=$(aws sts get-caller-identity --region "$REGION" --no-cli-pager --query Account --output text) || {
  echo "STOP: could not confirm the AWS account (are you signed in?). Nothing was created." >&2
  exit 1
}
if [ "$account" != "$EXPECTED_ACCOUNT" ]; then
  echo "STOP: signed in to AWS account $account, not tiro-stage ($EXPECTED_ACCOUNT). Nothing was created." >&2
  exit 1
fi
echo "AWS account $account (tiro-stage), region $REGION."

# Captured first, so a failing call stops the script (set -e) instead of
# silently producing an empty list.
template_list=$(aws cloudformation get-template-summary --region "$REGION" --no-cli-pager \
  --template-body "file://$TEMPLATE" --query 'Parameters[].ParameterKey' --output text)
stack_list=$(aws cloudformation describe-stacks --region "$REGION" --no-cli-pager \
  --stack-name "$STACK" --query 'Stacks[0].Parameters[].ParameterKey' --output text)
schedules=$(aws cloudformation describe-stacks --region "$REGION" --no-cli-pager --stack-name "$STACK" \
  --query "Stacks[0].Parameters[?ParameterKey=='WorkerScheduleState'].ParameterValue | [0]" --output text)
read -r -a template_keys <<<"$template_list"
stack_parameters=$(aws cloudformation describe-stacks --region "$REGION" --no-cli-pager \
  --stack-name "$STACK" --query 'Stacks[0].Parameters' --output json)
read -r -a stack_keys <<<"$stack_list"
[ "${#template_keys[@]}" -gt 0 ] && [ "${#stack_keys[@]}" -gt 0 ] || { echo "STOP: could not read the template's or the stack's parameters" >&2; exit 1; }

in_stack() {
  local k
  for k in "${stack_keys[@]}"; do [ "$k" = "$1" ] && return 0; done
  return 1
}

params=()
for k in "${template_keys[@]}"; do
  case "$k" in
    VercelBypassSecretVersionId)
      params+=("ParameterKey=$k,ParameterValue=$version_id")
      ;;
    VercelBypassSecretArn)
      if [ -n "$secret_arn" ]; then
        params+=("ParameterKey=$k,ParameterValue=$secret_arn")
      elif in_stack "$k"; then
        params+=("ParameterKey=$k,UsePreviousValue=true")
      else
        echo "STOP: the stack has no VercelBypassSecretArn yet; pass --secret-arn for the first change" >&2
        exit 1
      fi
      ;;
    *)
      if in_stack "$k"; then
        params+=("ParameterKey=$k,UsePreviousValue=true")
      else
        echo "STOP: template parameter $k is not in the deployed stack. Decide its value deliberately; nothing was created." >&2
        exit 1
      fi
      ;;
  esac
done

echo "Stack $STACK: WorkerScheduleState is $schedules and will stay $schedules (UsePreviousValue)."
name="vercel-bypass-$(date -u +%Y%m%dT%H%M%SZ)"
aws cloudformation create-change-set --region "$REGION" --no-cli-pager \
  --stack-name "$STACK" --change-set-name "$name" \
  --template-body "file://$TEMPLATE" --capabilities CAPABILITY_IAM \
  --parameters "${params[@]}" --query Id --output text >/dev/null
if ! aws cloudformation wait change-set-create-complete --region "$REGION" --stack-name "$STACK" --change-set-name "$name"; then
  aws cloudformation describe-change-set --region "$REGION" --no-cli-pager --stack-name "$STACK" --change-set-name "$name" \
    --query '{Status:Status,Reason:StatusReason}' --output table >&2 || true
  echo "STOP: the change set was not created (for example: no change, because this version ID is already applied)." >&2
  exit 1
fi

echo "Change set $name, every change detail (resource, action, replacement, property, evaluation, source, cause):"
policy_args=(--stack "$STACK" --stack-parameters "$stack_parameters" --version-id "$version_id")
[ -z "$secret_arn" ] || policy_args+=(--secret-arn "$secret_arn")
if ! aws cloudformation describe-change-set --region "$REGION" --no-cli-pager --stack-name "$STACK" --change-set-name "$name" --output json \
  | node "$POLICY" "${policy_args[@]}"; then
  echo "Do not execute it. Delete it with:" >&2
  echo "  aws cloudformation delete-change-set --region $REGION --stack-name $STACK --change-set-name $name" >&2
  exit 1
fi
echo "Direct changes: WorkerConnection and StatusConnection (AuthParameters, in place)."
echo "Also listed: the dependants CloudFormation re-evaluates from their ARNs (Dynamic), each checked for its exact property and cause."
echo "Review the COMPLETE change set yourself before executing it:"
echo "  aws cloudformation describe-change-set --region $REGION --no-cli-pager --stack-name $STACK --change-set-name $name --output json"
echo "Then, and only then, execute with:"
echo "  aws cloudformation execute-change-set --region $REGION --stack-name $STACK --change-set-name $name"
echo "  aws cloudformation wait stack-update-complete --region $REGION --stack-name $STACK"
