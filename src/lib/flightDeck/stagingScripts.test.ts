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
    "cloudformation get-template-summary") printf '%s\n' "$TEMPLATE_KEYS" ;;
    "cloudformation describe-stacks")
      case "$*" in *WorkerScheduleState*) printf '%s\n' "$SCHED" ;; *) printf '%s\n' "$STACK_KEYS" ;; esac ;;
    "cloudformation create-change-set") printf '%s\n' "$@" > "$CAP/change-set-args"; echo "arn:aws:cloudformation:change-set" ;;
    "cloudformation wait") return "@{WAIT_RC:-0}" ;;
    "cloudformation describe-change-set") printf '%b\n' "$CHANGES" ;;
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
      assert.equal(read("argv"), null, `aws not called for ${JSON.stringify(input)}`);
    }
  });
}

test("bypass secret: no mode, no action", () => {
  assert.equal(run(SECRET, []).code, 2);
  assert.equal(read("argv"), null);
});

const T_KEYS = "PublicOrigin\tCognitoDomainPrefix\tWorkerScheduleState\tAlarmEmail\tEscalationEmail\tAwsMonthlyBudgetUsd\tVercelTeamSlug\tVercelProjectName\tVercelEnvironment\tVercelBypassSecretArn\tVercelBypassSecretVersionId\tProtectiveRetentionDays";
const S_KEYS_BEFORE = "PublicOrigin\tCognitoDomainPrefix\tWorkerScheduleState\tAlarmEmail\tEscalationEmail\tAwsMonthlyBudgetUsd\tVercelTeamSlug\tVercelProjectName\tVercelEnvironment\tProtectiveRetentionDays";
const OK_CHANGES = "WorkerConnection\\tModify\\tFalse\\nStatusConnection\\tModify\\tFalse";
const ARN = "arn:aws:secretsmanager:us-east-1:821507736007:secret:tiro-flight-deck-staging/vercel-automation-bypass-AbCdEf";
const VID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const baseEnv = { TEMPLATE_KEYS: T_KEYS, STACK_KEYS: S_KEYS_BEFORE, SCHED: "DISABLED", CHANGES: OK_CHANGES };
const paramsOf = () => {
  const a = read("change-set-args")!.split("\n");
  return a.slice(a.indexOf("--parameters") + 1).filter((x) => x.startsWith("ParameterKey="));
};

test("change set (first time): every template parameter is passed; only the two bypass ones change; schedules keep their value; never executed", () => {
  const r = run(CHANGE, ["--secret-arn", ARN, "--version-id", VID], { env: baseEnv });
  assert.equal(r.code, 0, r.out);
  const p = paramsOf();
  assert.equal(p.length, T_KEYS.split("\t").length, "every template parameter, so none falls back to a default");
  assert.ok(p.includes(`ParameterKey=VercelBypassSecretArn,ParameterValue=${ARN}`));
  assert.ok(p.includes(`ParameterKey=VercelBypassSecretVersionId,ParameterValue=${VID}`));
  for (const k of S_KEYS_BEFORE.split("\t")) {
    assert.ok(p.includes(`ParameterKey=${k},UsePreviousValue=true`), k);
  }
  assert.ok(p.includes("ParameterKey=WorkerScheduleState,UsePreviousValue=true"));
  assert.ok(!p.some((x) => x.startsWith("ParameterKey=WorkerScheduleState,ParameterValue")), "the schedule is never set");
  const args = read("change-set-args")!;
  assert.match(args, /CAPABILITY_IAM/);
  assert.match(args, /file:\/\/deploy\/flight-deck\/flight-deck\.template\.json/);
  assert.match(r.out, /WorkerScheduleState is DISABLED and will stay DISABLED/);
  assert.match(r.out, /execute-change-set/, "prints the command for the founder");
  assert.equal(read("EXECUTED"), null, "the script itself never executes the change set");
});

test("change set (rotation): only the version ID changes; the ARN keeps its value", () => {
  const r = run(CHANGE, ["--version-id", VID], { env: { ...baseEnv, STACK_KEYS: `${S_KEYS_BEFORE}\tVercelBypassSecretArn\tVercelBypassSecretVersionId`, SCHED: "ENABLED" } });
  assert.equal(r.code, 0, r.out);
  const p = paramsOf();
  assert.ok(p.includes("ParameterKey=VercelBypassSecretArn,UsePreviousValue=true"));
  assert.ok(p.includes(`ParameterKey=VercelBypassSecretVersionId,ParameterValue=${VID}`));
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
  // Unexpected changes: a replacement, an extra resource, or a missing connection.
  for (const changes of [
    "WorkerConnection\\tModify\\tTrue\\nStatusConnection\\tModify\\tFalse",
    `${OK_CHANGES}\\nWorkerSchedule\\tModify\\tFalse`,
    "WorkerConnection\\tModify\\tFalse",
    "",
  ]) {
    r = run(CHANGE, ["--secret-arn", ARN, "--version-id", VID], { env: { ...baseEnv, CHANGES: changes } });
    assert.notEqual(r.code, 0, changes);
    assert.match(r.out, /STOP: this change set does more than/, changes);
    assert.doesNotMatch(r.out, /After your own review, execute with/);
    assert.equal(read("EXECUTED"), null);
  }
  // A change set CloudFormation could not create (for example, no changes).
  r = run(CHANGE, ["--version-id", VID], { env: { ...baseEnv, STACK_KEYS: `${S_KEYS_BEFORE}\tVercelBypassSecretArn\tVercelBypassSecretVersionId`, WAIT_RC: "255" } });
  assert.notEqual(r.code, 0);
  assert.match(r.out, /the change set was not created/);
});
