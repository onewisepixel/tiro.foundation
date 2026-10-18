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
  assert.equal(byType("AWS::CloudWatch::Alarm").length, 1);
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
