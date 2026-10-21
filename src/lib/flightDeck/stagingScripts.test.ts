// The staging operator scripts (scripts/flight-deck/staging-bypass-*.sh),
// run in a real bash against a stub `aws` that records its arguments and
// standard input. No AWS call is made; the value is a fake.
//
// What must never regress:
//   - the bypass value reaches the AWS CLI only on stdin: never an argument,
//     never output, never a trace (even under bash -x), never a file;
//   - empty or malformed input is refused before any AWS call;
//   - the change set keeps every other stack parameter (UsePreviousValue),
//     WorkerScheduleState included; stops on an undecided new parameter;
//     refuses anything but an in-place change to the two connections; and is
//     never executed by the script.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const FAKE = "FAKEbypassVALUE0123456789abcdef";
const work = fs.mkdtempSync(path.join(os.tmpdir(), "fd-staging-scripts-"));
const toBash = (p: string) => p.replace(/\\/g, "/");
const CAP = toBash(work);

// The stub is a bash function exported into the script's process. ("@{"
// stands for a bash "${", which a template literal would interpolate.)
const STUB = String.raw`
aws() {
  printf '%s\n' "$@" >> "$CAP/argv"
  local svc="$1" op="$2"
  case "$svc $op" in
    "secretsmanager create-secret"|"secretsmanager put-secret-value")
      cat > "$CAP/stdin"
      if [ "@{AWS_STUB_FAIL:-}" = 1 ]; then echo "aws: [ERROR]: simulated failure" >&2; return 254; fi
      printf '| Arn | arn:aws:secretsmanager:us-east-1:000000000000:secret:x-AbCdEf |\n| VersionId | 11111111-2222-3333-4444-555555555555 |\n' ;;
    "sts get-caller-identity")
      if [ "@{STUB_STS_FAIL:-}" = 1 ]; then echo "Unable to locate credentials" >&2; return 253; fi
      printf '%s\n' "@{STUB_ACCOUNT:-821507736007}" ;;
    "cloudformation get-template-summary") printf '%s\n' "$TEMPLATE_KEYS" ;;
    "cloudformation describe-stacks")
      case "$*" in
        *WorkerScheduleState*) printf '%s\n' "$SCHED" ;;
        *"--output json"*) printf '%s\n' "$STACK_PARAMS_JSON" ;;
        *) printf '%s\n' "$STACK_KEYS" ;;
      esac ;;
    "cloudformation create-change-set") printf '%s\n' "$@" > "$CAP/change-set-args"; echo "arn:aws:cloudformation:change-set" ;;
    "cloudformation wait") return "@{WAIT_RC:-0}" ;;
    "cloudformation describe-change-set")
      case "$*" in *"--output json"*) printf '%s\n' "$CHANGESET_JSON" ;; *) echo "| Status | FAILED |" ;; esac ;;
    "cloudformation execute-change-set") echo executed > "$CAP/EXECUTED" ;;
    *) echo "unexpected aws $*" >&2; return 99 ;;
  esac
}
export -f aws
`.replaceAll("@{", "${");

function reset() {
  for (const f of ["argv", "stdin", "change-set-args", "EXECUTED"]) {
    fs.rmSync(path.join(work, f), { force: true });
  }
}
const read = (f: string) => (fs.existsSync(path.join(work, f)) ? fs.readFileSync(path.join(work, f), "utf8") : null);

function run(script: string, args: string[], opts: { input?: string; env?: Record<string, string>; trace?: boolean } = {}) {
  reset();
  const cmd = `${STUB}\nbash ${opts.trace ? "-x " : ""}${script} ${args.map((a) => `'${a}'`).join(" ")}`;
  const r = spawnSync("bash", ["-c", cmd], { input: opts.input ?? "", encoding: "utf8", env: { ...process.env, CAP, ...opts.env } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const SECRET = "scripts/flight-deck/staging-bypass-secret.sh";
const CHANGE = "scripts/flight-deck/staging-bypass-change-set.sh";

for (const mode of ["create", "rotate"] as const) {
  test(`bypass secret (${mode}): the value goes to the AWS CLI on stdin only, never in arguments, output or a trace`, () => {
    for (const trace of [false, true]) {
      const r = run(SECRET, [mode], { input: `${FAKE}\n`, trace });
      assert.equal(r.code, 0, r.out);
      assert.equal(read("stdin"), FAKE, "exactly the value, no trailing newline");
      const argv = read("argv")!;
      assert.ok(!argv.includes(FAKE), "never an argument");
      assert.ok(argv.includes("file:///dev/stdin"));
      assert.ok(argv.includes(mode === "create" ? "create-secret" : "put-secret-value"));
      assert.ok(argv.includes("{Arn:ARN,VersionId:VersionId}"), "prints only ARN and version ID");
      assert.ok(!r.out.includes(FAKE), `never output or traced (bash -x: ${trace})`);
    }
    assert.deepEqual(fs.readdirSync(work).sort(), ["argv", "stdin"], "no other file was written (the stub's own captures only)");
  });

  test(`bypass secret (${mode}): a failing AWS call exits non-zero without exposing the value`, () => {
    const r = run(SECRET, [mode], { input: `${FAKE}\n`, env: { AWS_STUB_FAIL: "1" }, trace: true });
    assert.notEqual(r.code, 0);
    assert.ok(!r.out.includes(FAKE));
  });

  test(`bypass secret (${mode}): empty, spaced, quoted or missing input is refused before any AWS call`, () => {
    for (const input of ["\n", "FAKE bypass VALUE 0123456789\n", 'FAKE"bypassVALUE0123456789\n', "short\n", ""]) {
      const r = run(SECRET, [mode], { input });
      assert.notEqual(r.code, 0, JSON.stringify(input));
      assert.ok(!(read("argv") ?? "").includes("secretsmanager"), `Secrets Manager not called for ${JSON.stringify(input)}`);
    }
  });
}

test("bypass secret: no mode, no action", () => {
  assert.equal(run(SECRET, []).code, 2);
  assert.equal(read("argv"), null);
});

const T_KEYS = "PublicOrigin\tCognitoDomainPrefix\tWorkerScheduleState\tAlarmEmail\tEscalationEmail\tAwsMonthlyBudgetUsd\tVercelTeamSlug\tVercelProjectName\tVercelEnvironment\tVercelBypassSecretArn\tVercelBypassSecretVersionId\tProtectiveRetentionDays";
const S_KEYS_BEFORE = "PublicOrigin\tCognitoDomainPrefix\tWorkerScheduleState\tAlarmEmail\tEscalationEmail\tAwsMonthlyBudgetUsd\tVercelTeamSlug\tVercelProjectName\tVercelEnvironment\tProtectiveRetentionDays";
// The seven-resource change set observed live (two direct changes, five
// Dynamic dependants); see bypassChangeSetPolicy.test.ts for the policy itself.
type Fx = { changeSet: { Parameters: { ParameterKey: string; ParameterValue?: string; UsePreviousValue?: boolean }[]; Changes: { ResourceChange: { LogicalResourceId: string; Replacement: string; Details: { Evaluation?: string; ChangeSource?: string; CausingEntity?: string; Target: { Attribute: string; Name?: string; RequiresRecreation?: string } }[] } }[] }; stackParameters: { ParameterKey: string; ParameterValue: string }[]; secretArn: string; versionId: string };
const OBSERVED = JSON.parse(fs.readFileSync("src/lib/flightDeck/fixtures/bypass-change-set-observed.json", "utf8")) as Fx;
const ARN = OBSERVED.secretArn;
const VID = OBSERVED.versionId;
const observedEnv = (mutate: (f: Fx) => void = () => undefined) => {
  const f = structuredClone(OBSERVED);
  mutate(f);
  return { CHANGESET_JSON: JSON.stringify(f.changeSet), STACK_PARAMS_JSON: JSON.stringify(f.stackParameters) };
};
const baseEnv = { TEMPLATE_KEYS: T_KEYS, STACK_KEYS: S_KEYS_BEFORE, SCHED: "DISABLED", ...observedEnv() };
const rc = (f: Fx, id: string) => f.changeSet.Changes.find((c) => c.ResourceChange.LogicalResourceId === id)!.ResourceChange;
const paramsOf = () => {
  const a = read("change-set-args")!.split("\n");
  return a.slice(a.indexOf("--parameters") + 1).filter((x) => x.startsWith("ParameterKey="));
};

test("change set (first time, the observed seven-resource set): accepted, every detail listed for review, never executed", () => {
  const r = run(CHANGE, ["--secret-arn", ARN, "--version-id", VID], { env: baseEnv });
  assert.equal(r.code, 0, r.out);
  const p = paramsOf();
  assert.equal(p.length, T_KEYS.split("\t").length, "every template parameter, so none falls back to a default");
  assert.ok(p.includes(`ParameterKey=VercelBypassSecretArn,ParameterValue=${ARN}`));
  assert.ok(p.includes(`ParameterKey=VercelBypassSecretVersionId,ParameterValue=${VID}`));
  for (const k of S_KEYS_BEFORE.split("\t")) {
    assert.ok(p.includes(`ParameterKey=${k},UsePreviousValue=true`), k);
  }
  assert.ok(!p.some((x) => x.startsWith("ParameterKey=WorkerScheduleState,ParameterValue")), "the schedule is never set");
  const args = read("change-set-args")!;
  assert.match(args, /CAPABILITY_IAM/);
  assert.match(args, /file:\/\/deploy\/flight-deck\/flight-deck\.template\.json/);
  assert.match(r.out, /WorkerScheduleState is DISABLED and will stay DISABLED/);
  // Every one of the seven resources is shown, with its cause.
  for (const line of [
    // The live shape: two Static parameter references and one Dynamic direct modification, per connection.
    /WorkerConnection {2}Modify {2}replace=False {2}AuthParameters {2}Static {2}ParameterReference {2}VercelBypassSecretArn/,
    /WorkerConnection {2}Modify {2}replace=False {2}AuthParameters {2}Static {2}ParameterReference {2}VercelBypassSecretVersionId/,
    /WorkerConnection {2}Modify {2}replace=False {2}AuthParameters {2}Dynamic {2}DirectModification {2}-/,
    /StatusConnection {2}Modify {2}replace=False {2}AuthParameters {2}Dynamic {2}DirectModification {2}-/,
    /WorkerDestination {2}Modify {2}replace=False {2}ConnectionArn {2}Dynamic {2}ResourceAttribute {2}WorkerConnection\.Arn/,
    /StatusDestination {2}Modify {2}replace=False {2}ConnectionArn {2}Dynamic {2}ResourceAttribute {2}StatusConnection\.Arn/,
    /WorkerInvokeRole {2}Modify {2}replace=False {2}Policies {2}Dynamic {2}ResourceAttribute {2}StatusDestination\.Arn/,
    /WorkerSchedule {2}Modify {2}replace=False {2}Targets {2}Dynamic {2}ResourceAttribute {2}WorkerInvokeRole\.Arn/,
    /StatusMonitor {2}Modify {2}replace=False {2}Targets {2}Dynamic {2}ResourceAttribute {2}StatusDestination\.Arn/,
  ]) {
    assert.match(r.out, line);
  }
  assert.match(r.out, /Review the COMPLETE change set yourself before executing it/);
  assert.match(r.out, /describe-change-set .*--output json/);
  assert.match(r.out, /Then, and only then, execute with:\n {2}aws cloudformation execute-change-set/, "prints the command for the founder");
  assert.equal(read("EXECUTED"), null, "the script itself never executes the change set");
});

test("change set (rotation): only the version ID changes; the ARN keeps its value", () => {
  const newVid = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
  const env = observedEnv((f) => {
    for (const id of ["WorkerConnection", "StatusConnection"]) {
      rc(f, id).Details = [{ Target: { Attribute: "Properties", Name: "AuthParameters", RequiresRecreation: "Never" }, Evaluation: "Static", ChangeSource: "ParameterReference", CausingEntity: "VercelBypassSecretVersionId" }];
    }
    f.stackParameters.find((x) => x.ParameterKey === "VercelBypassSecretArn")!.ParameterValue = ARN;
    f.stackParameters.find((x) => x.ParameterKey === "VercelBypassSecretVersionId")!.ParameterValue = VID;
    f.stackParameters.find((x) => x.ParameterKey === "WorkerScheduleState")!.ParameterValue = "ENABLED";
    f.changeSet.Parameters.find((x) => x.ParameterKey === "WorkerScheduleState")!.ParameterValue = "ENABLED";
    f.changeSet.Parameters.find((x) => x.ParameterKey === "VercelBypassSecretVersionId")!.ParameterValue = newVid;
  });
  const r = run(CHANGE, ["--version-id", newVid], { env: { ...baseEnv, ...env, STACK_KEYS: `${S_KEYS_BEFORE}\tVercelBypassSecretArn\tVercelBypassSecretVersionId`, SCHED: "ENABLED" } });
  assert.equal(r.code, 0, r.out);
  const p = paramsOf();
  assert.ok(p.includes("ParameterKey=VercelBypassSecretArn,UsePreviousValue=true"));
  assert.ok(p.includes(`ParameterKey=VercelBypassSecretVersionId,ParameterValue=${newVid}`));
  assert.ok(p.includes("ParameterKey=WorkerScheduleState,UsePreviousValue=true"), "an enabled schedule also stays as it is");
  assert.match(r.out, /WorkerScheduleState is ENABLED and will stay ENABLED/);
});

test("change set: refuses unsafe or unexpected situations, creating or executing nothing it should not", () => {
  // A template parameter the stack lacks would take its default: stop before creating anything.
  let r = run(CHANGE, ["--secret-arn", ARN, "--version-id", VID], { env: { ...baseEnv, STACK_KEYS: S_KEYS_BEFORE.replace("\tAwsMonthlyBudgetUsd", "") } });
  assert.notEqual(r.code, 0);
  assert.match(r.out, /template parameter AwsMonthlyBudgetUsd is not in the deployed stack/);
  assert.equal(read("change-set-args"), null);
  // First time without the ARN.
  r = run(CHANGE, ["--version-id", VID], { env: baseEnv });
  assert.notEqual(r.code, 0);
  assert.equal(read("change-set-args"), null);
  // Malformed inputs.
  assert.equal(run(CHANGE, ["--secret-arn", ARN], { env: baseEnv }).code, 2);
  assert.equal(run(CHANGE, ["--secret-arn", "not-an-arn", "--version-id", VID], { env: baseEnv }).code, 2);
  // Unexpected change sets, end to end through the script.
  const cases: [string, (f: Fx) => void, RegExp][] = [
    ["a replacement", (f) => (rc(f, "WorkerConnection").Replacement = "True"), /WorkerConnection: replacement True/],
    ["an unexpected dependant property", (f) => (rc(f, "WorkerSchedule").Details[0].Target.Name = "State"), /WorkerSchedule detail 1: State caused by/],
    ["a Static change to a dependant", (f) => (rc(f, "WorkerDestination").Details[0].Evaluation = "Static"), /WorkerDestination detail 1: evaluation Static, expected Dynamic/],
    [
      "an additional resource",
      (f) =>
        f.changeSet.Changes.push({
          ResourceChange: { LogicalResourceId: "OperatorPool", Replacement: "False", Details: [{ Target: { Attribute: "Properties", Name: "MfaConfiguration", RequiresRecreation: "Never" }, Evaluation: "Static", ChangeSource: "DirectModification" }] },
          ...({ Type: "Resource" } as object),
        } as Fx["changeSet"]["Changes"][number]),
      /OperatorPool .*not part of this change/,
    ],
    ["a missing connection", (f) => (f.changeSet.Changes = f.changeSet.Changes.filter((c) => c.ResourceChange.LogicalResourceId !== "StatusConnection")), /StatusConnection is not modified/],
    ["a changed schedule parameter", (f) => (f.changeSet.Parameters.find((x) => x.ParameterKey === "WorkerScheduleState")!.ParameterValue = "ENABLED"), /WorkerScheduleState would change from DISABLED to ENABLED/],
  ];
  for (const [label, mutate, problem] of cases) {
    r = run(CHANGE, ["--secret-arn", ARN, "--version-id", VID], { env: { ...baseEnv, ...observedEnv(mutate) } });
    assert.notEqual(r.code, 0, label);
    assert.match(r.out, /STOP: this change set does not match what the bypass update may change/, label);
    assert.match(r.out, problem, label);
    assert.match(r.out, /Do not execute it\. Delete it with:\n {2}aws cloudformation delete-change-set/, label);
    assert.doesNotMatch(r.out, /Then, and only then, execute with/, label);
    assert.equal(read("EXECUTED"), null, label);
  }
  // A description that is not JSON is refused too.
  r = run(CHANGE, ["--secret-arn", ARN, "--version-id", VID], { env: { ...baseEnv, CHANGESET_JSON: "not json" } });
  assert.notEqual(r.code, 0);
  assert.match(r.out, /could not be read as JSON/);
  // A change set CloudFormation could not create (for example, no changes).
  r = run(CHANGE, ["--version-id", VID], { env: { ...baseEnv, STACK_KEYS: `${S_KEYS_BEFORE}\tVercelBypassSecretArn\tVercelBypassSecretVersionId`, WAIT_RC: "255" } });
  assert.notEqual(r.code, 0);
  assert.match(r.out, /the change set was not created/);
});

// ---------- Account identity: tiro-stage only ----------

test("both scripts confirm the AWS account is tiro-stage first, and refuse any other", () => {
  for (const mode of ["create", "rotate"]) {
    // The right account: the check runs before the value is asked for.
    let r = run(SECRET, [mode], { input: `${FAKE}\n` });
    assert.equal(r.code, 0, r.out);
    const argv = read("argv")!;
    assert.ok(argv.indexOf("get-caller-identity") < argv.indexOf("secretsmanager"), "identity checked before Secrets Manager");
    assert.match(r.out, /AWS account 821507736007 \(tiro-stage\)/);
    // Another account, or no confirmable identity: stop before the prompt.
    for (const env of ([{ STUB_ACCOUNT: "111122223333" }, { STUB_STS_FAIL: "1" }] as Record<string, string>[])) {
      r = run(SECRET, [mode], { input: `${FAKE}\n`, env });
      assert.notEqual(r.code, 0, JSON.stringify(env));
      assert.match(r.out, /STOP: .*Nothing was stored/);
      assert.doesNotMatch(r.out, /Paste the/, "never asks for the value");
      assert.ok(!read("argv")!.includes("secretsmanager"), "Secrets Manager never called");
      assert.equal(read("stdin"), null);
    }
  }
  for (const env of ([{ STUB_ACCOUNT: "111122223333" }, { STUB_STS_FAIL: "1" }] as Record<string, string>[])) {
    const r = run(CHANGE, ["--secret-arn", ARN, "--version-id", VID], { env: { ...baseEnv, ...env } });
    assert.notEqual(r.code, 0, JSON.stringify(env));
    assert.match(r.out, /STOP: .*Nothing was created/);
    assert.ok(!read("argv")!.includes("cloudformation"), "no CloudFormation call at all");
    assert.equal(read("change-set-args"), null);
  }
  // A secret ARN from another account or region is refused before any call.
  for (const arn of [ARN.replace("821507736007", "111122223333"), ARN.replace("us-east-1", "eu-west-2")]) {
    const r = run(CHANGE, ["--secret-arn", arn, "--version-id", VID], { env: baseEnv });
    assert.equal(r.code, 2, arn);
    assert.equal(read("argv"), null);
  }
});

// ---------- Re-checking an existing change set (read-only) ----------

const LIVE = "vercel-bypass-20261021T184902Z";

test("existing change set: the live one is re-checked read-only; nothing is created, waited on, executed, or deleted", () => {
  const r = run(CHANGE, ["--existing-change-set", LIVE, "--secret-arn", ARN, "--version-id", VID], { env: baseEnv });
  assert.equal(r.code, 0, r.out);
  const argv = read("argv")!;
  assert.match(argv, /get-caller-identity/, "the account is checked");
  assert.ok(argv.includes(LIVE), "the named change set is described");
  for (const op of ["create-change-set", "execute-change-set", "delete-change-set", "\nwait\n"]) {
    assert.ok(!argv.includes(op), `no ${op.trim()}`);
  }
  assert.equal(read("change-set-args"), null);
  assert.equal(read("EXECUTED"), null);
  assert.ok(r.out.includes(`Re-checking existing change set ${LIVE} (read-only).`), r.out);
  assert.match(r.out, /WorkerConnection {2}Modify {2}replace=False {2}AuthParameters {2}Dynamic {2}DirectModification/);
  assert.match(r.out, /Then, and only then, execute with:/, "execution stays a separate, manual step");
});

test("existing change set: a bad name, a wrong account, or a failing change set is refused without acting", () => {
  // Only names this script creates.
  for (const name of ["vercel-bypass-latest", "other-change-set", "vercel-bypass-20261021T184902Z;rm"]) {
    const r = run(CHANGE, ["--existing-change-set", name, "--secret-arn", ARN, "--version-id", VID], { env: baseEnv });
    assert.equal(r.code, 2, name);
    assert.equal(read("argv"), null, `no AWS call for ${name}`);
  }
  // Another account: stop before any CloudFormation call.
  let r = run(CHANGE, ["--existing-change-set", LIVE, "--secret-arn", ARN, "--version-id", VID], { env: { ...baseEnv, STUB_ACCOUNT: "111122223333" } });
  assert.notEqual(r.code, 0);
  assert.ok(!read("argv")!.includes("cloudformation"));
  // A change set outside the policy: refused, and only the delete command is printed (never run).
  r = run(CHANGE, ["--existing-change-set", LIVE, "--secret-arn", ARN, "--version-id", VID], {
    env: { ...baseEnv, ...observedEnv((f) => (rc(f, "WorkerConnection").Details[2].Evaluation = "Static")) },
  });
  assert.notEqual(r.code, 0);
  assert.match(r.out, /a direct modification must be Dynamic/);
  assert.match(r.out, /delete-change-set/);
  assert.ok(!read("argv")!.includes("delete-change-set"), "the delete command is printed, not run");
  assert.doesNotMatch(r.out, /Then, and only then, execute with/);
});
