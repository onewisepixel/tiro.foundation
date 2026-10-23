// scripts/flight-deck/staging-managed-login.sh, run in a real bash against a
// stateful stub `aws`. No AWS call is made. What must never regress:
//   - only the four permitted Cognito writes, each behind a typed confirmation;
//   - every target (account, domain, pool, tier, client) confirmed first;
//   - managed login never switched on without the matching TIRO style;
//   - the client, pool, MFA and recovery configuration proved unchanged, and
//     the client secret never requested or printed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequest } from "../../../deploy/flight-deck/managed-login/build.mjs";

const SCRIPT = "scripts/flight-deck/staging-managed-login.sh";
const POOL = "us-east-1_H1ukCFTYB";
const CLIENT = "3ukekra5fk6p6ce8fgafer4p4a";
const STYLE_ID = "a1b2c3d4-5678-90ab-cdef-111111111111";
const SECRET = "SUPERSECRETclientsecretvalue0123456789";
const work = fs.mkdtempSync(path.join(os.tmpdir(), "fd-managed-login-"));
const CAP = work.replace(/\\/g, "/");

// The stub keeps state in $CAP: the stored style (JSON) and the domain version.
// "@{" stands for a bash "${", which a template literal would interpolate.
const STUB = String.raw`
aws() {
  printf '%s\n' "$*" >> "$CAP/argv"
  local svc="$1" op="$2"
  case "$svc $op" in
    "sts get-caller-identity") printf '%s\n' "@{STUB_ACCOUNT:-821507736007}" ;;
    "cognito-idp describe-user-pool-domain")
      case "$*" in
        *UserPoolId*) printf '%s\n' "@{STUB_DOMAIN_POOL:-us-east-1_H1ukCFTYB}" ;;
        *ManagedLoginVersion*) cat "$CAP/version" ;;
      esac ;;
    "cognito-idp describe-user-pool")
      case "$*" in
        *"UserPool.UserPoolTier"*) printf '%s\n' "@{STUB_TIER:-ESSENTIALS}" ;;
        *) printf '{"Id":"us-east-1_H1ukCFTYB","MfaConfiguration":"ON","AccountRecoverySetting":{"RecoveryMechanisms":[{"Name":"verified_email","Priority":1}]}}\n' ;;
      esac ;;
    "cognito-idp describe-user-pool-client")
      case "$*" in
        *"--query UserPoolClient.UserPoolId"*) printf '%s\n' "@{STUB_CLIENT_POOL:-us-east-1_H1ukCFTYB}" ;;
        *--query*)
          if [ -f "$CAP/mutated" ]; then printf '{"CallbackURLs":["https://elsewhere.example/cb"]}\n'
          else printf '{"CallbackURLs":["https://tiro-flight-deck-staging.vercel.app/flight-deck/auth/callback"],"AllowedOAuthFlows":["code"]}\n'; fi ;;
        *) printf '{"UserPoolClient":{"ClientSecret":"${SECRET}"}}\n' ;;
      esac ;;
    "cognito-idp get-user-pool-mfa-config") printf '{"MfaConfiguration":"ON","SoftwareTokenMfaConfiguration":{"Enabled":true}}\n' ;;
    "cognito-idp describe-managed-login-branding-by-client")
      if [ -f "$CAP/style" ]; then cat "$CAP/style"; else echo "An error occurred (ResourceNotFoundException) when calling the DescribeManagedLoginBrandingByClient operation" >&2; return 254; fi ;;
    "cognito-idp create-managed-login-branding" | "cognito-idp update-managed-login-branding")
      node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);require("fs").writeFileSync(process.argv[1],s);const b={ManagedLoginBrandingId:r.ManagedLoginBrandingId||"${STYLE_ID}",UserPoolId:r.UserPoolId,UseCognitoProvidedValues:false,Settings:r.Settings,Assets:r.Assets};require("fs").writeFileSync(process.argv[2],JSON.stringify({ManagedLoginBranding:b}))})' "$CAP/request-$op" "$CAP/style"
      [ "@{STUB_MUTATE:-}" = 1 ] && : > "$CAP/mutated"
      echo "${STYLE_ID}" ;;
    "cognito-idp update-user-pool-domain")
      case "$*" in *"--managed-login-version 2"*) echo 2 > "$CAP/version" ;; *"--managed-login-version 1"*) echo 1 > "$CAP/version" ;; esac
      [ "@{STUB_MUTATE:-}" = 1 ] && : > "$CAP/mutated"
      echo '{}' ;;
    *) echo "unexpected aws $*" >&2; return 99 ;;
  esac
}
export -f aws
`.replaceAll("@{", "${");

type State = { version?: string; style?: "none" | "tiro" | "other" };
function run(args: string[], state: State = {}, env: Record<string, string> = {}) {
  for (const f of fs.readdirSync(work)) fs.rmSync(path.join(work, f), { force: true });
  fs.writeFileSync(path.join(work, "version"), `${state.version ?? "1"}\n`);
  if (state.style === "tiro" || state.style === "other") {
    const r = createRequest({ userPoolId: POOL, clientId: CLIENT }) as { Settings: { components: { primaryButton: { darkMode: { defaults: { backgroundColor: string } } } } }; Assets: unknown[] };
    if (state.style === "other") r.Settings.components.primaryButton.darkMode.defaults.backgroundColor = "539fe5ff";
    fs.writeFileSync(path.join(work, "style"), JSON.stringify({ ManagedLoginBranding: { ManagedLoginBrandingId: STYLE_ID, UserPoolId: POOL, UseCognitoProvidedValues: false, Settings: r.Settings, Assets: r.Assets } }));
  }
  const cmd = `${STUB}\nbash ${SCRIPT} ${args.map((a) => `'${a}'`).join(" ")}`;
  const r = spawnSync("bash", ["-c", cmd], { encoding: "utf8", env: { ...process.env, CAP, ...env } });
  const argv = fs.existsSync(path.join(work, "argv")) ? fs.readFileSync(path.join(work, "argv"), "utf8") : "";
  const version = fs.readFileSync(path.join(work, "version"), "utf8").trim();
  return { code: r.status, out: `${r.stdout}${r.stderr}`, argv, version };
}
const WRITES = /create-managed-login-branding|update-managed-login-branding|update-user-pool-domain/;
const FORBIDDEN = /update-user-pool-client|update-user-pool |set-user-pool-mfa-config|set-ui-customization|delete-user-pool|admin-|create-user-pool-domain|delete-user-pool-domain|delete-managed-login-branding/;

test("plan is read-only and reports where things stand", () => {
  const r = run(["plan"]);
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.argv, WRITES);
  assert.match(r.out, /AWS account 821507736007 \(tiro-stage\)/);
  assert.match(r.out, /tier ESSENTIALS/);
  assert.match(r.out, /Domain tiro-flight-deck-stage: version 1 \(classic hosted UI\)/);
  assert.match(r.out, /Managed login style for the app client: none/);
  assert.match(r.out, /Plan only: nothing was changed/);
  assert.equal(r.version, "1");
});

test("every change needs its own typed confirmation; nothing reaches AWS without it", () => {
  for (const [cmd, wrong] of [["apply-branding", ""], ["switch-to-managed-login", "apply-branding"], ["rollback-to-classic", "yes"]]) {
    const r = run(wrong ? [cmd, "--confirm", wrong] : [cmd]);
    assert.equal(r.code, 2, cmd);
    assert.equal(r.argv, "", `${cmd}: no AWS call`);
  }
  assert.equal(run(["deploy"]).code, 2);
});

test("the wrong account, domain, pool, tier, or client stops everything before any write", () => {
  const cases: [Record<string, string>, RegExp][] = [
    [{ STUB_ACCOUNT: "111122223333" }, /not tiro-stage/],
    [{ STUB_DOMAIN_POOL: "us-east-1_Other" }, /belongs to user pool 'us-east-1_Other'/],
    [{ STUB_TIER: "LITE" }, /tier is LITE\. Managed login and its branding need Essentials or Plus/],
    [{ STUB_CLIENT_POOL: "us-east-1_Other" }, /is not in us-east-1_H1ukCFTYB/],
  ];
  for (const [env, message] of cases) {
    const r = run(["apply-branding", "--confirm", "apply-branding"], {}, env);
    assert.notEqual(r.code, 0, JSON.stringify(env));
    assert.match(r.out, message);
    assert.doesNotMatch(r.argv, WRITES);
  }
});

test("apply-branding creates the TIRO style from the repository, verifies it, and leaves the domain as it is", () => {
  const r = run(["apply-branding", "--confirm", "apply-branding"]);
  assert.equal(r.code, 0, r.out);
  const sent = JSON.parse(fs.readFileSync(path.join(work, "request-create-managed-login-branding"), "utf8"));
  assert.deepEqual(sent, createRequest({ userPoolId: POOL, clientId: CLIENT }), "exactly the repository's request");
  assert.match(r.argv, /create-managed-login-branding .*--cli-input-json file:\/\/\/dev\/stdin/);
  assert.match(r.out, /matches the repository \(settings and assets\)/);
  assert.match(r.out, /Unchanged: app client/);
  assert.doesNotMatch(r.argv, /update-user-pool-domain/);
  assert.equal(r.version, "1", "users see no change yet");
});

test("apply-branding updates an existing style in place (by its ID), rather than creating a second", () => {
  const r = run(["apply-branding", "--confirm", "apply-branding"], { style: "other" });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.argv, /create-managed-login-branding/);
  const sent = JSON.parse(fs.readFileSync(path.join(work, "request-update-managed-login-branding"), "utf8"));
  assert.equal(sent.ManagedLoginBrandingId, STYLE_ID);
  assert.match(r.out, /matches the repository/);
});

test("switch-to-managed-login refuses without the matching TIRO style; with it, switches the domain to version 2", () => {
  for (const style of ["none", "other"] as const) {
    const r = run(["switch-to-managed-login", "--confirm", "switch-to-managed-login"], { style });
    assert.notEqual(r.code, 0, style);
    assert.match(r.out, /Run apply-branding first/);
    assert.doesNotMatch(r.argv, /update-user-pool-domain/);
    assert.equal(r.version, "1");
  }
  const r = run(["switch-to-managed-login", "--confirm", "switch-to-managed-login"], { style: "tiro" });
  assert.equal(r.code, 0, r.out);
  assert.match(r.argv, /update-user-pool-domain --domain tiro-flight-deck-stage --user-pool-id us-east-1_H1ukCFTYB --managed-login-version 2/);
  assert.equal(r.version, "2");
  assert.match(r.out, /To undo: bash .* rollback-to-classic --confirm rollback-to-classic/);
  // Already on managed login: nothing to do.
  const again = run(["switch-to-managed-login", "--confirm", "switch-to-managed-login"], { style: "tiro", version: "2" });
  assert.equal(again.code, 0);
  assert.doesNotMatch(again.argv, /update-user-pool-domain/);
});

test("rollback-to-classic sets the domain back to version 1 and keeps the style", () => {
  const r = run(["rollback-to-classic", "--confirm", "rollback-to-classic"], { style: "tiro", version: "2" });
  assert.equal(r.code, 0, r.out);
  assert.match(r.argv, /update-user-pool-domain --domain tiro-flight-deck-stage --user-pool-id us-east-1_H1ukCFTYB --managed-login-version 1/);
  assert.equal(r.version, "1");
  assert.doesNotMatch(r.argv, /delete-managed-login-branding/);
  assert.match(r.out, /back on the classic hosted UI/);
  const noop = run(["rollback-to-classic", "--confirm", "rollback-to-classic"], { style: "tiro", version: "1" });
  assert.equal(noop.code, 0);
  assert.doesNotMatch(noop.argv, /update-user-pool-domain/);
});

test("a change to the client, pool, MFA or recovery configuration after a write is caught and reported", () => {
  for (const [args, state] of [
    [["apply-branding", "--confirm", "apply-branding"], {}],
    [["switch-to-managed-login", "--confirm", "switch-to-managed-login"], { style: "tiro" }],
    [["rollback-to-classic", "--confirm", "rollback-to-classic"], { style: "tiro", version: "2" }],
  ] as [string[], State][]) {
    const r = run(args, state, { STUB_MUTATE: "1" });
    assert.notEqual(r.code, 0, args[0]);
    assert.match(r.out, /STOP: the client, pool, MFA, or recovery configuration differs from before/, args[0]);
    assert.match(r.out, /elsewhere\.example/, "the difference is shown");
  }
});

test("only the permitted writes are ever made, and the client secret is never requested or printed", () => {
  const runs = [
    run(["plan"]),
    run(["apply-branding", "--confirm", "apply-branding"]),
    run(["apply-branding", "--confirm", "apply-branding"], { style: "other" }),
    run(["switch-to-managed-login", "--confirm", "switch-to-managed-login"], { style: "tiro" }),
    run(["rollback-to-classic", "--confirm", "rollback-to-classic"], { style: "tiro", version: "2" }),
  ];
  for (const r of runs) {
    assert.doesNotMatch(r.argv, FORBIDDEN);
    assert.ok(!r.out.includes(SECRET), "never printed");
    for (const line of r.argv.split("\n").filter((l) => l.includes("describe-user-pool-client"))) {
      assert.match(line, /--query/, "always an explicit projection");
      assert.doesNotMatch(line, /ClientSecret/);
    }
  }
});
