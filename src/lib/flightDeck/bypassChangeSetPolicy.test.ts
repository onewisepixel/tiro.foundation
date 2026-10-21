// The change-set policy behind scripts/flight-deck/staging-bypass-change-set.sh
// (scripts/flight-deck/bypass-change-set-policy.mjs). The positive case is
// the live seven-resource change set vercel-bypass-20261021T184902Z
// (fixtures/bypass-change-set-observed.json); every negative case changes
// one thing about it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
// A plain ES module, shared with the operator script.
import { checkBypassChangeSet } from "../../../scripts/flight-deck/bypass-change-set-policy.mjs";

type Detail = { Target: { Attribute: string; Name?: string; RequiresRecreation?: string; Path?: string }; Evaluation?: string; ChangeSource?: string; CausingEntity?: string };
type Change = { Type: string; ResourceChange: { Action: string; LogicalResourceId: string; ResourceType: string; Replacement: string; Scope: string[]; Details: Detail[]; PolicyAction?: string; ModuleInfo?: unknown } };
type ChangeSet = { StackName: string; Status: string; ExecutionStatus: string; NextToken?: string; Capabilities: string[]; Parameters: { ParameterKey: string; ParameterValue?: string; UsePreviousValue?: boolean }[]; Changes: Change[] };
type Fixture = { changeSet: ChangeSet; stackParameters: { ParameterKey: string; ParameterValue: string }[]; secretArn: string; versionId: string };

const FIXTURE = JSON.parse(fs.readFileSync("src/lib/flightDeck/fixtures/bypass-change-set-observed.json", "utf8")) as Fixture;
const STACK = "tiro-flight-deck-staging";

const fresh = () => structuredClone(FIXTURE);
const check = (f: Fixture, opts: Partial<{ secretArn: string; versionId: string; stackName: string }> = {}) =>
  checkBypassChangeSet(f.changeSet, { stackName: opts.stackName ?? STACK, stackParameters: f.stackParameters, versionId: opts.versionId ?? f.versionId, secretArn: opts.secretArn ?? f.secretArn }) as { ok: boolean; problems: string[] };
const change = (f: Fixture, id: string) => f.changeSet.Changes.find((c) => c.ResourceChange.LogicalResourceId === id)!.ResourceChange;
const refused = (f: Fixture, pattern: RegExp, opts?: Parameters<typeof check>[1]) => {
  const r = check(f, opts);
  assert.equal(r.ok, false, "must be refused");
  assert.ok(r.problems.some((p) => pattern.test(p)), `expected a problem matching ${pattern}; got:\n${r.problems.join("\n")}`);
};

test("the live seven-resource change set (two direct changes, five Dynamic dependants) is accepted", () => {
  const r = check(fresh());
  assert.deepEqual(r.problems, []);
  assert.equal(r.ok, true);
  assert.equal(FIXTURE.changeSet.Changes.length, 7);
});

test("dependants: an unexpected property, cause, source, or a Static (real) change is refused", () => {
  let f = fresh();
  change(f, "WorkerDestination").Details[0].Target.Name = "HttpMethod";
  refused(f, /WorkerDestination detail 1: HttpMethod caused by WorkerConnection\.Arn is not an expected dependency/);

  f = fresh();
  change(f, "WorkerDestination").Details[0].CausingEntity = "StatusConnection.Arn"; // the wrong connection
  refused(f, /WorkerDestination detail 1: ConnectionArn caused by StatusConnection\.Arn is not an expected dependency/);

  f = fresh();
  change(f, "WorkerInvokeRole").Details.push({ Target: { Attribute: "Properties", Name: "Policies", RequiresRecreation: "Never" }, Evaluation: "Dynamic", ChangeSource: "ResourceAttribute", CausingEntity: "ProtectiveLogBucket.Arn" });
  refused(f, /WorkerInvokeRole detail 3: Policies caused by ProtectiveLogBucket\.Arn/);

  f = fresh();
  change(f, "WorkerSchedule").Details[0].Evaluation = "Static"; // an actual edit of the schedule's targets
  refused(f, /WorkerSchedule detail 1: evaluation Static, expected Dynamic/);

  f = fresh();
  change(f, "StatusMonitor").Details[1].ChangeSource = "DirectModification";
  refused(f, /StatusMonitor detail 2: change source DirectModification, expected ResourceAttribute/);

  f = fresh();
  change(f, "WorkerSchedule").Details[0].Target.Name = "State"; // enabling or disabling the schedule
  refused(f, /WorkerSchedule detail 1: State caused by WorkerInvokeRole\.Arn is not an expected dependency/);

  f = fresh();
  change(f, "WorkerInvokeRole").Details[0].Target.Path = "/Properties/AssumeRolePolicyDocument";
  refused(f, /path \/Properties\/AssumeRolePolicyDocument is outside \/Properties\/Policies/);

  f = fresh();
  change(f, "StatusDestination").Details = [];
  refused(f, /StatusDestination: no change details to verify/);
});

// ---------- The two connections: parameter references and the dynamic direct modification ----------

const AUTH = (Evaluation: string, ChangeSource: string, CausingEntity?: string): Detail => ({
  Target: { Attribute: "Properties", Name: "AuthParameters", RequiresRecreation: "Never", Path: "/Properties/AuthParameters" },
  Evaluation,
  ChangeSource,
  ...(CausingEntity ? { CausingEntity } : {}),
});
const ARN_REF = () => AUTH("Static", "ParameterReference", "VercelBypassSecretArn");
const VID_REF = () => AUTH("Static", "ParameterReference", "VercelBypassSecretVersionId");
const DYN_DIRECT = () => AUTH("Dynamic", "DirectModification");
const setConnections = (f: Fixture, details: () => Detail[]) => {
  for (const id of ["WorkerConnection", "StatusConnection"]) change(f, id).Details = details();
};
// A rotation: only the version ID changes; the stack already holds the ARN.
const rotation = (details: () => Detail[]) => {
  const f = fresh();
  setConnections(f, details);
  const newVersion = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
  f.stackParameters.find((p) => p.ParameterKey === "VercelBypassSecretArn")!.ParameterValue = f.secretArn;
  f.stackParameters.find((p) => p.ParameterKey === "VercelBypassSecretVersionId")!.ParameterValue = f.versionId;
  f.changeSet.Parameters.find((p) => p.ParameterKey === "VercelBypassSecretVersionId")!.ParameterValue = newVersion;
  return { f, opts: { versionId: newVersion, secretArn: "" } };
};
const checkRotation = (r: ReturnType<typeof rotation>) =>
  checkBypassChangeSet(r.f.changeSet, { stackName: STACK, stackParameters: r.f.stackParameters, ...r.opts }) as { ok: boolean; problems: string[] };

test("the live connection details are what the fixture holds: two Static parameter references and one Dynamic direct modification, each", () => {
  for (const id of ["WorkerConnection", "StatusConnection"]) {
    assert.deepEqual(
      change(FIXTURE, id).Details.map((d) => [d.Evaluation, d.ChangeSource, d.CausingEntity ?? null, d.Target.Name, d.Target.RequiresRecreation]),
      [
        ["Static", "ParameterReference", "VercelBypassSecretArn", "AuthParameters", "Never"],
        ["Static", "ParameterReference", "VercelBypassSecretVersionId", "AuthParameters", "Never"],
        ["Dynamic", "DirectModification", null, "AuthParameters", "Never"],
      ],
    );
  }
  assert.equal(FIXTURE.changeSet.Parameters.find((p) => p.ParameterKey === "WorkerScheduleState")!.ParameterValue, "DISABLED");
});

test("connections: the entries are accepted in any order", () => {
  const f = fresh();
  setConnections(f, () => [DYN_DIRECT(), VID_REF(), ARN_REF()]);
  assert.deepEqual(check(f).problems, []);
});

test("rotation: the version ID reference, with or without the dynamic direct modification, is accepted", () => {
  for (const details of [() => [VID_REF(), DYN_DIRECT()], () => [VID_REF()]]) {
    assert.deepEqual(checkRotation(rotation(details)).problems, []);
  }
  // A change set may report unchanged parameters as UsePreviousValue.
  const r = rotation(() => [VID_REF(), DYN_DIRECT()]);
  const arnParam = r.f.changeSet.Parameters.find((p) => p.ParameterKey === "VercelBypassSecretArn")!;
  delete arnParam.ParameterValue;
  arnParam.UsePreviousValue = true;
  assert.deepEqual(checkRotation(r).problems, []);
});

test("connections: a direct modification must be Dynamic, uncaused, single, and present on a first-time update", () => {
  let f = fresh();
  change(f, "WorkerConnection").Details[2].Evaluation = "Static"; // an ordinary template edit
  refused(f, /WorkerConnection detail 3: a direct modification must be Dynamic \(the secret reference\), got Static/);

  f = fresh();
  change(f, "StatusConnection").Details[2].CausingEntity = "PublicOrigin";
  refused(f, /StatusConnection detail 3: a direct modification has causing entity PublicOrigin/);

  f = fresh();
  change(f, "WorkerConnection").Details.push(DYN_DIRECT()); // duplicated
  refused(f, /WorkerConnection: 2 direct modifications, expected at most one/);

  f = fresh();
  change(f, "StatusConnection").Details = [ARN_REF(), VID_REF()]; // missing on a first-time update
  refused(f, /StatusConnection: no dynamic direct modification of AuthParameters/);

  const r = rotation(() => [VID_REF(), DYN_DIRECT(), DYN_DIRECT()]);
  const res = checkRotation(r);
  assert.equal(res.ok, false);
  assert.ok(res.problems.some((p) => /2 direct modifications, expected at most one/.test(p)), res.problems.join("\n"));
});

test("connections: a dynamic direct modification of any other property is refused", () => {
  for (const name of ["AuthorizationType", "Description", "InvocationConnectivityParameters", "KmsKeyIdentifier"]) {
    const f = fresh();
    change(f, "WorkerConnection").Details[2].Target = { Attribute: "Properties", Name: name, RequiresRecreation: "Never" };
    refused(f, new RegExp(`WorkerConnection detail 3: changes property ${name}, expected AuthParameters`));
  }
  const f = fresh();
  change(f, "StatusConnection").Details[2].Target = { Attribute: "Tags", RequiresRecreation: "Never" };
  refused(f, /StatusConnection detail 3: changes Tags, not a property/);
});

test("a dynamic direct modification on any other resource is refused", () => {
  // On a dependant: only Dynamic ResourceAttribute re-evaluations are allowed there.
  for (const [id, prop] of [
    ["WorkerDestination", "ConnectionArn"],
    ["WorkerInvokeRole", "Policies"],
    ["WorkerSchedule", "State"],
    ["StatusMonitor", "Targets"],
  ] as const) {
    const f = fresh();
    change(f, id).Details.push({ Target: { Attribute: "Properties", Name: prop, RequiresRecreation: "Never" }, Evaluation: "Dynamic", ChangeSource: "DirectModification" });
    refused(f, new RegExp(`${id} detail \\d: change source DirectModification, expected ResourceAttribute`));
  }
  // On a resource outside the change.
  const f = fresh();
  f.changeSet.Changes.push({
    Type: "Resource",
    ResourceChange: { Action: "Modify", LogicalResourceId: "OperatorPool", ResourceType: "AWS::Cognito::UserPool", Replacement: "False", Scope: ["Properties"], Details: [{ Target: { Attribute: "Properties", Name: "MfaConfiguration", RequiresRecreation: "Never" }, Evaluation: "Dynamic", ChangeSource: "DirectModification" }] },
  });
  refused(f, /OperatorPool \(AWS::Cognito::UserPool\) would modify: not part of this change/);
});

test("connections: parameter references must be Static, to the bypass parameters, exactly those changing, once each", () => {
  let f = fresh();
  change(f, "WorkerConnection").Details[0].Evaluation = "Dynamic";
  refused(f, /WorkerConnection detail 1: a parameter reference must be Static, got Dynamic/);

  f = fresh();
  change(f, "StatusConnection").Details[1].CausingEntity = "PublicOrigin";
  refused(f, /StatusConnection detail 2: caused by parameter PublicOrigin, expected a bypass parameter/);

  f = fresh();
  change(f, "StatusConnection").Details.push(VID_REF()); // duplicated
  refused(f, /StatusConnection: parameter reference VercelBypassSecretVersionId is listed more than once/);

  f = fresh();
  change(f, "WorkerConnection").Details = [VID_REF(), DYN_DIRECT()]; // first time, but the ARN reference is missing
  refused(f, /WorkerConnection: no reference to VercelBypassSecretArn, which this update changes/);

  let r = rotation(() => [ARN_REF(), VID_REF(), DYN_DIRECT()]); // rotation must not touch the ARN
  let res = checkRotation(r);
  assert.ok(res.problems.some((p) => /references VercelBypassSecretArn, which this update does not change/.test(p)), res.problems.join("\n"));

  r = rotation(() => [DYN_DIRECT()]); // rotation without the version reference
  res = checkRotation(r);
  assert.ok(res.problems.some((p) => /no reference to VercelBypassSecretVersionId/.test(p)), res.problems.join("\n"));

  for (const source of ["ResourceReference", "ResourceAttribute", "Automatic", "NoModification"]) {
    f = fresh();
    change(f, "WorkerConnection").Details[2].ChangeSource = source;
    refused(f, new RegExp(`WorkerConnection detail 3: caused by ${source}.*expected a bypass parameter or the dynamic secret reference`));
  }

  f = fresh();
  f.changeSet.Changes = f.changeSet.Changes.filter((c) => c.ResourceChange.LogicalResourceId !== "StatusConnection");
  refused(f, /StatusConnection is not modified/);
});

test("replacements are refused, at the resource and at the property", () => {
  for (const id of ["WorkerConnection", "WorkerDestination", "WorkerInvokeRole", "StatusMonitor"]) {
    for (const replacement of ["True", "Conditional"]) {
      const f = fresh();
      change(f, id).Replacement = replacement;
      refused(f, new RegExp(`${id}: replacement ${replacement}, expected False`));
    }
    const f = fresh();
    change(f, id).Details[0].Target.RequiresRecreation = "Conditionally";
    refused(f, new RegExp(`${id} detail 1: RequiresRecreation is Conditionally, expected Never`));
  }
});

test("additional resources, actions, attributes, nested stacks, and policy actions are refused", () => {
  let f = fresh();
  f.changeSet.Changes.push({
    Type: "Resource",
    ResourceChange: { Action: "Modify", LogicalResourceId: "ProtectiveLogBucket", ResourceType: "AWS::S3::Bucket", Replacement: "False", Scope: ["Properties"], Details: [{ Target: { Attribute: "Properties", Name: "ObjectLockConfiguration", RequiresRecreation: "Never" }, Evaluation: "Static", ChangeSource: "DirectModification" }] },
  });
  refused(f, /ProtectiveLogBucket \(AWS::S3::Bucket\) would modify: not part of this change/);

  f = fresh();
  f.changeSet.Changes.push({ Type: "Resource", ResourceChange: { Action: "Add", LogicalResourceId: "Extra", ResourceType: "AWS::IAM::Role", Replacement: "False", Scope: [], Details: [] } });
  refused(f, /Extra \(AWS::IAM::Role\) would add/);

  f = fresh();
  change(f, "WorkerSchedule").Action = "Remove";
  refused(f, /WorkerSchedule: action Remove, expected Modify/);

  f = fresh();
  change(f, "StatusMonitor").Scope = ["Properties", "Tags"];
  refused(f, /StatusMonitor: scope \["Properties","Tags"\]/);

  f = fresh();
  change(f, "WorkerConnection").Details[0].Target.Attribute = "DeletionPolicy";
  refused(f, /WorkerConnection detail 1: changes DeletionPolicy, not a property/);

  f = fresh();
  change(f, "WorkerInvokeRole").ModuleInfo = { TypeHierarchy: "x" };
  refused(f, /WorkerInvokeRole: comes from a module or nested stack/);

  f = fresh();
  change(f, "WorkerDestination").PolicyAction = "ReplaceAndDelete";
  refused(f, /WorkerDestination: policy action ReplaceAndDelete/);

  f = fresh();
  change(f, "WorkerInvokeRole").ResourceType = "AWS::IAM::Policy";
  refused(f, /WorkerInvokeRole has type AWS::IAM::Policy/);

  f = fresh();
  f.changeSet.Changes.push(structuredClone(f.changeSet.Changes[2]));
  refused(f, /WorkerDestination is listed more than once/);
});

test("the change set itself: wrong stack, not ready, paginated, extra capability, or changed parameters are refused", () => {
  refused(fresh(), /belongs to stack tiro-flight-deck-staging, expected some-other-stack/, { stackName: "some-other-stack" });

  let f = fresh();
  f.changeSet.Status = "FAILED";
  refused(f, /status is FAILED/);

  f = fresh();
  f.changeSet.ExecutionStatus = "UNAVAILABLE";
  refused(f, /execution status is UNAVAILABLE/);

  f = fresh();
  f.changeSet.NextToken = "more";
  refused(f, /more than one page/);

  f = fresh();
  f.changeSet.Capabilities = ["CAPABILITY_IAM", "CAPABILITY_NAMED_IAM"];
  refused(f, /unexpected capability CAPABILITY_NAMED_IAM/);

  f = fresh();
  f.changeSet.Parameters.find((p) => p.ParameterKey === "WorkerScheduleState")!.ParameterValue = "ENABLED";
  refused(f, /parameter WorkerScheduleState would change from DISABLED to ENABLED/);

  f = fresh();
  f.changeSet.Parameters.find((p) => p.ParameterKey === "PublicOrigin")!.ParameterValue = "https://elsewhere.example";
  refused(f, /parameter PublicOrigin would change/);

  refused(fresh(), /parameter VercelBypassSecretVersionId is .*expected 00000000/, { versionId: "00000000-0000-0000-0000-000000000000" });
  refused(fresh(), /parameter VercelBypassSecretArn is .*expected arn:aws:secretsmanager:us-east-1:821507736007:secret:other/, { secretArn: "arn:aws:secretsmanager:us-east-1:821507736007:secret:other-AbCdEf" });
});
