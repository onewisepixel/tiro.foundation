// The policy a Flight Deck staging bypass change set must satisfy before
// staging-bypass-change-set.sh will offer it for execution. It reads the
// full DescribeChangeSet JSON and checks every resource change and every
// change detail, not just the count of modified resources.
//
// Why there is more than two resources: CloudFormation reports the two
// connections as direct changes, and also reports every resource whose
// properties read an attribute of a changed resource (Fn::GetAtt, including
// ${X.Arn} in Fn::Sub) as a Dynamic change, because it cannot know before
// execution whether that attribute will change. Here the connection ARNs
// do not change on an in-place update, but CloudFormation still lists the
// dependants. Each of those is allowed only for its exact property and
// exact causing attribute; nothing is whitelisted by resource name alone.
//
//   aws cloudformation describe-change-set ... --output json \
//     | node bypass-change-set-policy.mjs --stack <name> \
//         --stack-parameters '<describe-stacks Parameters JSON>' \
//         --version-id <id> [--secret-arn <arn>]
//
// Exit 0 and print the reviewed changes when acceptable; exit 1 with every
// problem otherwise. Reads identifiers and non-secret parameters only.

const DIRECT = ["WorkerConnection", "StatusConnection"];
const BYPASS_PARAMETERS = ["VercelBypassSecretArn", "VercelBypassSecretVersionId"];

// resource -> allowed [property, causing entity] pairs (Dynamic, ResourceAttribute).
const DEPENDANTS = {
  WorkerDestination: [["ConnectionArn", "WorkerConnection.Arn"]],
  StatusDestination: [["ConnectionArn", "StatusConnection.Arn"]],
  WorkerInvokeRole: [
    ["Policies", "WorkerDestination.Arn"],
    ["Policies", "StatusDestination.Arn"],
  ],
  WorkerSchedule: [
    ["Targets", "WorkerInvokeRole.Arn"],
    ["Targets", "WorkerDestination.Arn"],
  ],
  StatusMonitor: [
    ["Targets", "StatusDestination.Arn"],
    ["Targets", "WorkerInvokeRole.Arn"],
  ],
};
const TYPES = {
  WorkerConnection: "AWS::Events::Connection",
  StatusConnection: "AWS::Events::Connection",
  WorkerDestination: "AWS::Events::ApiDestination",
  StatusDestination: "AWS::Events::ApiDestination",
  WorkerInvokeRole: "AWS::IAM::Role",
  WorkerSchedule: "AWS::Events::Rule",
  StatusMonitor: "AWS::Events::Rule",
};

const pathWithin = (path, name) => path === undefined || path === null || path === `/Properties/${name}` || path.startsWith(`/Properties/${name}/`);

function checkTarget(where, d, name, problems) {
  const t = d.Target ?? {};
  if (t.Attribute !== "Properties") problems.push(`${where}: changes ${t.Attribute ?? "an unknown attribute"}, not a property`);
  if (t.Name !== name) problems.push(`${where}: changes property ${t.Name ?? "(none)"}, expected ${name}`);
  if (t.RequiresRecreation !== "Never") problems.push(`${where}: RequiresRecreation is ${t.RequiresRecreation ?? "(missing)"}, expected Never`);
  if (!pathWithin(t.Path, name)) problems.push(`${where}: path ${t.Path} is outside /Properties/${name}`);
  if (t.AttributeChangeType !== undefined && !["Modify", "Add"].includes(t.AttributeChangeType)) problems.push(`${where}: AttributeChangeType ${t.AttributeChangeType}`);
}

export function checkBypassChangeSet(cs, { stackName, stackParameters, versionId, secretArn = "" }) {
  const problems = [];
  const changes = Array.isArray(cs?.Changes) ? cs.Changes : [];

  // The change set itself.
  if (cs?.StackName !== stackName) problems.push(`change set belongs to stack ${cs?.StackName ?? "(unknown)"}, expected ${stackName}`);
  if (cs?.Status !== "CREATE_COMPLETE") problems.push(`change set status is ${cs?.Status ?? "(unknown)"}, expected CREATE_COMPLETE`);
  if (cs?.ExecutionStatus !== "AVAILABLE") problems.push(`execution status is ${cs?.ExecutionStatus ?? "(unknown)"}, expected AVAILABLE`);
  if (cs?.NextToken) problems.push("the change set has more than one page of changes; review it by hand");
  if (cs?.IncludeNestedStacks) problems.push("the change set includes nested stacks");
  for (const c of cs?.Capabilities ?? []) if (c !== "CAPABILITY_IAM") problems.push(`unexpected capability ${c}`);

  // Parameters: every value but the two bypass ones must be the stack's current value.
  const current = new Map((stackParameters ?? []).map((p) => [p.ParameterKey, p.ParameterValue]));
  const expected = { VercelBypassSecretVersionId: versionId, ...(secretArn ? { VercelBypassSecretArn: secretArn } : {}) };
  for (const p of cs?.Parameters ?? []) {
    const k = p.ParameterKey;
    if (k in expected) {
      if (p.ParameterValue !== expected[k]) problems.push(`parameter ${k} is ${p.ParameterValue ?? "(unset)"}, expected ${expected[k]}`);
    } else if (p.UsePreviousValue === true) {
      if (!current.has(k)) problems.push(`parameter ${k} uses a previous value the stack does not have`);
    } else if (!current.has(k) || p.ParameterValue !== current.get(k)) {
      problems.push(`parameter ${k} would change from ${current.get(k) ?? "(absent)"} to ${p.ParameterValue ?? "(unset)"}`);
    }
  }
  for (const k of Object.keys(expected)) {
    if (!(cs?.Parameters ?? []).some((p) => p.ParameterKey === k)) problems.push(`parameter ${k} is missing from the change set`);
  }

  // Resource changes.
  const seen = new Set();
  for (const ch of changes) {
    const rc = ch?.ResourceChange;
    if (ch?.Type !== "Resource" || !rc) {
      problems.push(`unexpected change of type ${ch?.Type ?? "(unknown)"}`);
      continue;
    }
    const id = rc.LogicalResourceId;
    if (seen.has(id)) problems.push(`${id} is listed more than once`);
    seen.add(id);
    if (!(id in TYPES)) {
      problems.push(`${id} (${rc.ResourceType}) would ${String(rc.Action).toLowerCase()}: not part of this change`);
      continue;
    }
    if (rc.ResourceType !== TYPES[id]) problems.push(`${id} has type ${rc.ResourceType}, expected ${TYPES[id]}`);
    if (rc.Action !== "Modify") problems.push(`${id}: action ${rc.Action}, expected Modify`);
    if (rc.Replacement !== "False") problems.push(`${id}: replacement ${rc.Replacement}, expected False`);
    if (rc.PolicyAction) problems.push(`${id}: policy action ${rc.PolicyAction}`);
    if (rc.ModuleInfo || rc.ChangeSetId) problems.push(`${id}: comes from a module or nested stack`);
    const scope = rc.Scope ?? [];
    if (scope.length !== 1 || scope[0] !== "Properties") problems.push(`${id}: scope ${JSON.stringify(scope)}, expected ["Properties"]`);
    const details = Array.isArray(rc.Details) ? rc.Details : [];
    if (!details.length) problems.push(`${id}: no change details to verify`);

    details.forEach((d, i) => {
      const where = `${id} detail ${i + 1}`;
      if (DIRECT.includes(id)) {
        // The direct change: AuthParameters, from the template or the two bypass parameters.
        checkTarget(where, d, "AuthParameters", problems);
        if (d.Evaluation !== "Static") problems.push(`${where}: evaluation ${d.Evaluation}, expected Static`);
        const fromTemplate = d.ChangeSource === "DirectModification" && !d.CausingEntity;
        const fromParameter = d.ChangeSource === "ParameterReference" && BYPASS_PARAMETERS.includes(d.CausingEntity);
        if (!fromTemplate && !fromParameter) problems.push(`${where}: caused by ${d.ChangeSource ?? "?"} ${d.CausingEntity ?? ""}`.trimEnd() + ", expected the template or a bypass parameter");
      } else {
        // A dependant: only its exact property, re-evaluated from the exact attribute.
        const allowed = DEPENDANTS[id];
        const name = d.Target?.Name;
        if (!allowed.some(([prop, cause]) => prop === name && cause === d.CausingEntity)) {
          problems.push(`${where}: ${name ?? "(no property)"} caused by ${d.CausingEntity ?? "(nothing)"} is not an expected dependency`);
        }
        checkTarget(where, d, allowed.find(([prop]) => prop === name)?.[0] ?? allowed[0][0], problems);
        if (d.Evaluation !== "Dynamic") problems.push(`${where}: evaluation ${d.Evaluation}, expected Dynamic (a Static change here is a real edit)`);
        if (d.ChangeSource !== "ResourceAttribute") problems.push(`${where}: change source ${d.ChangeSource}, expected ResourceAttribute`);
      }
    });
  }
  for (const id of DIRECT) if (!seen.has(id)) problems.push(`${id} is not modified: the bypass header would not be applied`);
  return { ok: problems.length === 0, problems, changes };
}

// A compact listing of every change detail, for the human review.
export function describeChanges(changes) {
  const rows = [];
  for (const ch of changes) {
    const rc = ch.ResourceChange ?? {};
    for (const d of rc.Details?.length ? rc.Details : [{}]) {
      rows.push([rc.LogicalResourceId, rc.Action, `replace=${rc.Replacement}`, d.Target?.Name ?? "-", d.Evaluation ?? "-", d.ChangeSource ?? "-", d.CausingEntity ?? "-"].join("  "));
    }
  }
  return rows.join("\n");
}

async function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  let cs;
  let stackParameters;
  try {
    cs = JSON.parse(input);
    stackParameters = JSON.parse(arg("stack-parameters") ?? "[]");
  } catch {
    console.error("STOP: the change set description could not be read as JSON");
    return 1;
  }
  const r = checkBypassChangeSet(cs, { stackName: arg("stack"), stackParameters, versionId: arg("version-id"), secretArn: arg("secret-arn") ?? "" });
  console.log(describeChanges(r.changes));
  if (!r.ok) {
    console.error("STOP: this change set does not match what the bypass update may change:");
    for (const p of r.problems) console.error(`  - ${p}`);
    return 1;
  }
  return 0;
}

// Run as a command (not when imported by the tests).
if (/bypass-change-set-policy\.mjs$/.test(process.argv[1] ?? "")) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
