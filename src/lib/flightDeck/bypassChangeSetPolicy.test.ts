// The change-set policy behind scripts/flight-deck/staging-bypass-change-set.sh
// (scripts/flight-deck/bypass-change-set-policy.mjs). The positive case is
// the seven-resource change set observed live on 2026-10-21
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

test("the observed seven-resource change set (two direct changes, five Dynamic dependants) is accepted", () => {
  const r = check(fresh());
  assert.deepEqual(r.problems, []);
  assert.equal(r.ok, true);
  assert.equal(FIXTURE.changeSet.Changes.length, 7);
});

test("a rotation change set (only the version ID parameter changes) is accepted", () => {
  const f = fresh();
  for (const id of ["WorkerConnection", "StatusConnection"]) {
    change(f, id).Details = [{ Target: { Attribute: "Properties", Name: "AuthParameters", RequiresRecreation: "Never" }, Evaluation: "Static", ChangeSource: "ParameterReference", CausingEntity: "VercelBypassSecretVersionId" }];
  }
  const newVersion = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
  f.stackParameters.find((p) => p.ParameterKey === "VercelBypassSecretArn")!.ParameterValue = f.secretArn;
  f.changeSet.Parameters.find((p) => p.ParameterKey === "VercelBypassSecretVersionId")!.ParameterValue = newVersion;
  // UsePreviousValue entries, as a change set may report them, are fine.
  const arnParam = f.changeSet.Parameters.find((p) => p.ParameterKey === "VercelBypassSecretArn")!;
  delete arnParam.ParameterValue;
  arnParam.UsePreviousValue = true;
  const r = checkBypassChangeSet(f.changeSet, { stackName: STACK, stackParameters: f.stackParameters, versionId: newVersion, secretArn: "" }) as { ok: boolean; problems: string[] };
  assert.deepEqual(r.problems, []);
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

test("direct changes: anything but AuthParameters, in place, from the template or the bypass parameters, is refused", () => {
  let f = fresh();
  change(f, "WorkerConnection").Details[0].Target.Name = "AuthorizationType";
  refused(f, /WorkerConnection detail 1: changes property AuthorizationType, expected AuthParameters/);

  f = fresh();
  change(f, "StatusConnection").Details[1].CausingEntity = "PublicOrigin";
  refused(f, /StatusConnection detail 2: caused by ParameterReference PublicOrigin/);

  f = fresh();
  change(f, "WorkerConnection").Details[0].Evaluation = "Dynamic";
  refused(f, /WorkerConnection detail 1: evaluation Dynamic, expected Static/);

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
