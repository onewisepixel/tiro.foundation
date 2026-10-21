// Checks the security properties of the (undeployed) Flight Deck
// CloudFormation template. Structural only: no AWS credentials are used,
// so this cannot prove the template deploys; `aws cloudformation
// validate-template` and a staging deploy remain activation steps.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

type Resource = { Type: string; Properties: Record<string, unknown>; DeletionPolicy?: string; Condition?: string };
const t = JSON.parse(fs.readFileSync("deploy/flight-deck/flight-deck.template.json", "utf8")) as { Resources: Record<string, Resource>; Parameters: Record<string, { Default?: string }> };
const byType = (type: string) => Object.values(t.Resources).filter((r) => r.Type === type);

test("deploy template: a dedicated operator pool with MFA required, admin-created users only, retained", () => {
  const [pool] = byType("AWS::Cognito::UserPool");
  assert.equal(pool.Properties.MfaConfiguration, "ON");
  assert.deepEqual(pool.Properties.EnabledMfas, ["SOFTWARE_TOKEN_MFA"]);
  assert.deepEqual(pool.Properties.AdminCreateUserConfig, { AllowAdminCreateUserOnly: true });
  assert.equal(pool.Properties.DeletionProtection, "ACTIVE");
  assert.equal(pool.DeletionPolicy, "Retain");
  assert.ok(((pool.Properties.Policies as { PasswordPolicy: { MinimumLength: number } }).PasswordPolicy.MinimumLength) >= 14);
  assert.doesNotMatch(JSON.stringify(t), /staff|preservation-backend|FixturePool/i, "no reference to the synthetic backend's identity");
});

test("deploy template: a confidential code-flow client with exact callback URLs and no password flows", () => {
  const [client] = byType("AWS::Cognito::UserPoolClient");
  const p = client.Properties;
  assert.equal(p.GenerateSecret, true);
  assert.deepEqual(p.AllowedOAuthFlows, ["code"]);
  assert.deepEqual(p.ExplicitAuthFlows, ["ALLOW_REFRESH_TOKEN_AUTH"]);
  assert.equal(p.PreventUserExistenceErrors, "ENABLED");
  assert.equal(p.EnableTokenRevocation, true);
  assert.match(JSON.stringify(p.CallbackURLs), /\/flight-deck\/auth\/callback/);
  assert.doesNotMatch(JSON.stringify(p.AllowedOAuthFlows), /implicit/);
});

test("deploy template: secrets are generated, never literal; the pepper is retained", () => {
  const secrets = byType("AWS::SecretsManager::Secret");
  assert.equal(secrets.length, 4);
  for (const s of secrets) {
    assert.ok(s.Properties.GenerateSecretString, "generated");
    assert.ok(!("SecretString" in s.Properties), "no literal secret");
  }
  assert.equal(t.Resources.EmailHashPepper.DeletionPolicy, "Retain");
});

test("deploy template: the worker schedule is disabled by default and authenticates with the worker token", () => {
  assert.equal(t.Parameters.WorkerScheduleState.Default, "DISABLED");
  const [rule] = byType("AWS::Events::Rule");
  assert.deepEqual(rule.Properties.State, { Ref: "WorkerScheduleState" });
  assert.equal(rule.Properties.ScheduleExpression, "rate(5 minutes)");
  const [conn] = byType("AWS::Events::Connection");
  assert.match(JSON.stringify(conn.Properties), /resolve:secretsmanager:\$\{WorkerToken\}/);
  assert.equal(byType("AWS::CloudWatch::Alarm").length, 2, "worker failures and the status monitor");
  assert.equal(byType("AWS::RDS::DBInstance").length + byType("AWS::RDS::DBCluster").length, 0, "no database is provisioned before the founder chooses one");
});

test("deploy template: the protective log bucket is versioned, Object Locked, private, TLS-only, and append-only for the app", () => {
  const b = t.Resources.ProtectiveLogBucket;
  assert.equal(b.DeletionPolicy, "Retain");
  assert.equal(b.Properties.ObjectLockEnabled, true);
  const lock = b.Properties.ObjectLockConfiguration as { ObjectLockEnabled: string; Rule: { DefaultRetention: { Mode: string } } };
  assert.equal(lock.ObjectLockEnabled, "Enabled");
  assert.equal(lock.Rule.DefaultRetention.Mode, "GOVERNANCE");
  assert.deepEqual(b.Properties.VersioningConfiguration, { Status: "Enabled" });
  assert.ok(Object.values(b.Properties.PublicAccessBlockConfiguration as Record<string, boolean>).every(Boolean));
  const rules = (b.Properties.LifecycleConfiguration as { Rules: { Prefix: string; ExpirationInDays?: unknown }[] }).Rules;
  assert.ok(rules.every((r) => !r.Prefix.includes("events/") && r.ExpirationInDays === undefined), "events are never expired automatically");
  const policy = JSON.stringify(t.Resources.ProtectiveLogBucketPolicy.Properties);
  assert.match(policy, /aws:SecureTransport/);
  assert.match(policy, /BypassGovernanceRetention/);
  const app = JSON.stringify(t.Resources.FlightDeckAppPolicy.Properties);
  assert.doesNotMatch(app, /DeleteObject|PutObjectRetention|BypassGovernance|PutBucket|s3:\*/, "no delete, retention, or bucket-level writes");
  assert.match(app, /s3:PutObject/);
  // Restore drills and audits read the log but can never add to it.
  const ro = JSON.stringify(t.Resources.ProtectiveLogReadOnlyPolicy.Properties);
  assert.match(ro, /s3:GetObject/);
  assert.doesNotMatch(ro, /PutObject|DeleteObject|Retention|BypassGovernance|PutBucket|s3:\*/);
});

test("deploy template: the Vercel role trusts only the exact team, project and environment, and can only append to and read the log", () => {
  const role = t.Resources.VercelAppRole;
  assert.equal(role.Condition, "UseVercel");
  const trust = JSON.stringify(role.Properties.AssumeRolePolicyDocument);
  assert.match(trust, /sts:AssumeRoleWithWebIdentity/);
  assert.doesNotMatch(trust, /StringLike|\*/, "exact match only: no wildcard project or environment");
  assert.ok(trust.includes("owner:${VercelTeamSlug}:project:${VercelProjectName}:environment:${VercelEnvironment}"));
  assert.ok(trust.includes("oidc.vercel.com:aud"));
  const perms = JSON.stringify(role.Properties.Policies);
  assert.doesNotMatch(perms, /DeleteObject|Retention|BypassGovernance|PutBucket|secretsmanager|s3:\*|"\*"/);
  assert.match(perms, /s3:PutObject/);
  assert.equal(role.Properties.MaxSessionDuration, 3600, "short-lived credentials");
  assert.deepEqual((t.Parameters as Record<string, { AllowedValues?: string[] }>).VercelEnvironment.AllowedValues, ["production", "preview"], "never development");
});

test("deploy template: a status monitor alarms on any non-200 without retries; alarms reach two addresses; an AWS budget alerts", () => {
  const monitor = t.Resources.StatusMonitor.Properties as { State: unknown; Targets: { RetryPolicy: { MaximumRetryAttempts: number } }[] };
  assert.deepEqual(monitor.State, { Ref: "WorkerScheduleState" }, "off until the schedule is enabled");
  assert.equal(monitor.Targets[0].RetryPolicy.MaximumRetryAttempts, 0);
  assert.match(JSON.stringify(t.Resources.StatusConnection.Properties), /resolve:secretsmanager:\$\{MonitorToken\}/);
  assert.equal(t.Resources.EscalationSubscription.Condition, "HasEscalationEmail");
  const budget = t.Resources.CostBudget.Properties as { Budget: { TimeUnit: string }; NotificationsWithSubscribers: { Notification: { NotificationType: string } }[] };
  assert.equal(budget.Budget.TimeUnit, "MONTHLY");
  assert.deepEqual(budget.NotificationsWithSubscribers.map((n) => n.Notification.NotificationType).sort(), ["ACTUAL", "ACTUAL", "FORECASTED"]);
});

// ---------- Vercel Deployment Protection bypass (staging) ----------

type Auth = {
  ApiKeyAuthParameters: { ApiKeyName: string; ApiKeyValue: unknown };
  InvocationHttpParameters?: { "Fn::If": [string, { HeaderParameters: { Key: string; Value: unknown; IsValueSecret: boolean }[] }, unknown] };
};
const authOf = (name: string) => (t.Resources[name].Properties as { AuthParameters: Auth }).AuthParameters;

test("deploy template: both EventBridge connections keep their own bearer tokens and add the bypass header only when its secret is configured", () => {
  for (const [name, token] of [
    ["WorkerConnection", "WorkerToken"],
    ["StatusConnection", "MonitorToken"],
  ] as const) {
    const auth = authOf(name);
    assert.equal(t.Resources[name].Properties.AuthorizationType, "API_KEY", `${name} keeps API-key authentication`);
    assert.equal(auth.ApiKeyAuthParameters.ApiKeyName, "Authorization", `${name} keeps the Authorization header`);
    assert.deepEqual(auth.ApiKeyAuthParameters.ApiKeyValue, { "Fn::Sub": `Bearer {{resolve:secretsmanager:\${${token}}}}` }, `${name} keeps its own bearer token`);
    const [condition, whenSet, otherwise] = auth.InvocationHttpParameters!["Fn::If"];
    assert.equal(condition, "HasBypassSecret");
    assert.deepEqual(otherwise, { Ref: "AWS::NoValue" }, `${name}: no header, and no placeholder, without the secret`);
    assert.deepEqual(whenSet.HeaderParameters, [
      {
        Key: "x-vercel-protection-bypass",
        // Pinned to a version ID when one is given (a rotation changes it,
        // which is what makes CloudFormation re-read the secret);
        // otherwise the current version. Either way, only a reference.
        Value: {
          "Fn::If": [
            "HasBypassSecretVersion",
            { "Fn::Sub": "{{resolve:secretsmanager:${VercelBypassSecretArn}:SecretString:::${VercelBypassSecretVersionId}}}" },
            { "Fn::Sub": "{{resolve:secretsmanager:${VercelBypassSecretArn}}}" },
          ],
        },
        IsValueSecret: true,
      },
    ]);
    // At most two AuthParameters properties are allowed (the schema's
    // maxProperties): the API key and these header parameters.
    assert.deepEqual(Object.keys(auth).sort(), ["ApiKeyAuthParameters", "InvocationHttpParameters"]);
  }
  assert.deepEqual((t as unknown as { Conditions: Record<string, unknown> }).Conditions.HasBypassSecret, { "Fn::Not": [{ "Fn::Equals": [{ Ref: "VercelBypassSecretArn" }, ""] }] });
});

test("deploy template: the bypass secret is referenced by ARN only, never present in the template, parameters or outputs", () => {
  const param = (t.Parameters as Record<string, { Default?: string; AllowedPattern?: string }>).VercelBypassSecretArn;
  assert.equal(param.Default, "", "optional: absent by default");
  assert.ok(new RegExp(param.AllowedPattern!).test("arn:aws:secretsmanager:us-east-1:821507736007:secret:tiro-flight-deck-staging/vercel-bypass-AbCdEf"));
  assert.ok(!new RegExp(param.AllowedPattern!).test("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"), "a raw secret value is not accepted as the parameter");
  const raw = fs.readFileSync("deploy/flight-deck/flight-deck.template.json", "utf8");
  // The header is sent by exactly the two connections, and its only value
  // is the dynamic reference (checked in the test above).
  assert.equal(raw.match(/"Key": "x-vercel-protection-bypass"/g)?.length, 2, "one header per connection, nowhere else");
  assert.equal(raw.match(/resolve:secretsmanager:\$\{VercelBypassSecretArn\}/g)?.length, 4, "two forms per connection");
  const version = (t.Parameters as Record<string, { Default?: string; AllowedPattern?: string }>).VercelBypassSecretVersionId;
  assert.equal(version.Default, "");
  assert.ok(new RegExp(version.AllowedPattern!).test("a1b2c3d4-e5f6-7890-abcd-ef1234567890"));
  assert.doesNotMatch(JSON.stringify((t as unknown as { Outputs: unknown }).Outputs), /VercelBypassSecretVersionId/);
  assert.doesNotMatch(JSON.stringify((t as unknown as { Outputs: unknown }).Outputs), /VercelBypassSecretArn|protection-bypass/);
  // The schedules stay off unless deliberately enabled.
  assert.equal(t.Parameters.WorkerScheduleState.Default, "DISABLED");
});

test("deploy workflow: manual and approved only; isolation checks intact; smoke checks pass protection with the bypass, never a bearer token, never exposing the secret", () => {
  const wf = fs.readFileSync(".github/workflows/deploy-flight-deck-staging.yml", "utf8");
  const triggers = wf.slice(wf.indexOf("\non:"), wf.indexOf("\npermissions:"));
  assert.match(triggers, /workflow_dispatch:/);
  assert.doesNotMatch(triggers, /\b(push|pull_request|pull_request_target|schedule|workflow_run|repository_dispatch):/, "no automatic trigger");
  assert.match(wf, /if: inputs\.confirm == 'deploy synthetic staging'/);
  assert.match(wf, /environment: flight-deck-staging/);
  assert.match(wf, /refusing: that is the public site's project/);
  assert.match(wf, /grep -qx 'FLIGHT_DECK_DEPLOYMENT="staging"'/);
  assert.match(wf, /grep -qx 'FLIGHT_DECK_MODE="production"'/);
  assert.match(wf, /FLIGHT_DECK_PUBLIC_FORM_ENABLED="true"' "\$f" \|\| \{ echo "the public form must stay off"/);
  assert.match(wf, /FLIGHT_DECK_OUTBOUND_EMAIL_ENABLED="true"' "\$f" \|\| \{ echo "outbound email must stay off"/);
  assert.match(wf, /run: npm test/);
  assert.match(wf, /run: npm run test:flight-deck-pg/);

  const smoke = wf.slice(wf.indexOf("name: Smoke check"));
  assert.match(smoke, /BYPASS: \$\{\{ secrets\.VERCEL_AUTOMATION_BYPASS_SECRET \}\}/);
  assert.match(smoke, /test -n "\$BYPASS" \|\| \{ echo "VERCEL_AUTOMATION_BYPASS_SECRET is missing or empty"; exit 1; \}/);
  // The secret goes to curl on stdin only: never a -H argument, a URL
  // query parameter, or an echo.
  assert.match(smoke, /printf 'header = "x-vercel-protection-bypass: %s"\\n' "\$BYPASS" \| curl --config -/);
  assert.doesNotMatch(smoke, /-H\s+["']?x-vercel-protection-bypass/i);
  assert.doesNotMatch(smoke, /x-vercel-protection-bypass=|x-vercel-set-bypass-cookie/);
  assert.doesNotMatch(smoke, /echo[^\n]*\$BYPASS/);
  // Flight Deck's own authentication is exercised, not bypassed.
  assert.doesNotMatch(smoke, /Authorization|Bearer|WORKER_TOKEN|MONITOR_TOKEN/);
  assert.match(smoke, /case "\$code" in 401\|404\)/);
  assert.match(smoke, /Form not yet open/);
});
