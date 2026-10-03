// CDK stack for the fixture-only preservation backend.
//
// NOT YET DEPLOYED — this environment has no AWS CLI or credentials, so
// nothing here has touched a real account. `npx cdk synth` HAS been run
// locally (via `npx tsx`, no CDK CLI install needed) and produces valid
// CloudFormation in environment-agnostic mode — that only proves the
// template is well-formed, not that it deploys cleanly or behaves as
// intended against a live account. See docs/backend/decision-and-cost.md
// for the capacity/cost reasoning behind the specific numbers below, and
// docs/backend/evidence-matrix.md for what's deployed versus prepared.
import { Duration, RemovalPolicy, Stack, StackProps, Tags } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as logs from "aws-cdk-lib/aws-logs";

export type FixtureBackendStackProps = StackProps & {
  // A short, unique namespace per the brief's §6 drill-isolation instruction
  // — e.g. "dev", or "drill-20261002-1". Used as a resource-name/tag prefix
  // so cleanup can delete only this namespace's disposable resources.
  namespace: string;
  // CloudWatch billing alarm threshold in USD. A notification, not a cap —
  // see docs/backend/decision-and-cost.md.
  billingAlarmThresholdUsd?: number;
};

export class FixtureBackendStack extends Stack {
  public readonly primaryTable: dynamodb.Table;
  public readonly restrictionRegisterTable: dynamodb.Table;
  public readonly mediaBucket: s3.Bucket;
  public readonly staffUserPool: cognito.UserPool;

  constructor(scope: Construct, id: string, props: FixtureBackendStackProps) {
    super(scope, id, props);

    const { namespace } = props;
    Tags.of(this).add("project", "tiro-fixture-backend");
    Tags.of(this).add("namespace", namespace);
    Tags.of(this).add("milestone", "fixture-preservation-drill");
    Tags.of(this).add("syntheticOnly", "true");

    // --- Primary table: single-table design, see decision-and-cost.md §1-2.
    // Provisioned, low capacity, comfortably inside the always-free 25/25/25
    // allowance even with the register table (below) sharing it.
    this.primaryTable = new dynamodb.Table(this, "PrimaryTable", {
      tableName: `tiro-fixture-primary-${namespace}`,
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 5,
      writeCapacity: 5,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      // DESTROY, not RETAIN: this is a disposable fixture-drill resource in
      // a namespaced stack. A real-collection table would use RETAIN.
      removalPolicy: RemovalPolicy.DESTROY,
    });
    this.primaryTable.addGlobalSecondaryIndex({
      indexName: "GSI1-status-index",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
      readCapacity: 5,
      writeCapacity: 5,
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // --- Restriction register: a SEPARATE table, per docs/ethos.txt §12 and
    // the brief's explicit "kept outside the data being rolled back"
    // instruction. Deliberately: no GSI (every read is a strongly
    // consistent GetItem by recordId), its own low provisioned capacity, and
    // — critically — excluded from any bulk restore/import tooling by being
    // a structurally separate resource, not a flag on shared code.
    this.restrictionRegisterTable = new dynamodb.Table(this, "RestrictionRegisterTable", {
      tableName: `tiro-restriction-register-${namespace}`,
      partitionKey: { name: "recordId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 5,
      writeCapacity: 5,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // --- Media bucket: private, versioned (so delete markers/old versions
    // are inventoriable per §5's S3-versioning caveat), encrypted, public
    // access fully blocked.
    //
    // Deliberately no explicit bucketName: S3 names must be globally unique
    // across every AWS account, not just this one, so hand-rolling one from
    // namespace + account ID either collides or — in environment-agnostic
    // synth (no resolved account/region) — embeds an unresolved CDK token
    // into the name string and fails S3's naming validation outright before
    // a single real credential is involved. Let CloudFormation generate the
    // physical name; read it back via `mediaBucket.bucketName` wherever a
    // consumer (Lambda env var, runbook command) needs it.
    this.mediaBucket = new s3.Bucket(this, "MediaBucket", {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          // Old noncurrent versions (left behind by delete markers) expire
          // rather than accumulating indefinitely — keeps this near-zero
          // cost and keeps "what's actually still retrievable" bounded.
          noncurrentVersionExpiration: Duration.days(30),
        },
      ],
    });

    // --- Staff Cognito pool. Public self-signup disabled — invited test
    // staff only, per §3.
    this.staffUserPool = new cognito.UserPool(this, "StaffUserPool", {
      userPoolName: `tiro-fixture-staff-${namespace}`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      accountRecovery: cognito.AccountRecovery.NONE,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    this.staffUserPool.addClient("StaffUserPoolClient", {
      authFlows: { userSrp: true },
      generateSecret: false,
    });

    // --- Bounded log retention (§2: "bounded log retention" keeps CloudWatch
    // Logs cost near-zero). Any Lambda added later should log to a group
    // with this same retention, not the default "never expire".
    new logs.LogGroup(this, "FixtureBackendLogGroup", {
      logGroupName: `/tiro/fixture-backend/${namespace}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // --- Billing alarm: a notification tripwire, not an enforced cap — see
    // decision-and-cost.md. NOTE: AWS billing metrics publish to CloudWatch
    // in us-east-1 only; this alarm is only meaningful if this stack (or at
    // least this alarm) is deployed there, regardless of where the other
    // resources above live.
    if (props.billingAlarmThresholdUsd) {
      new cloudwatch.Alarm(this, "BillingAlarm", {
        alarmName: `tiro-fixture-backend-billing-${namespace}`,
        metric: new cloudwatch.Metric({
          namespace: "AWS/Billing",
          metricName: "EstimatedCharges",
          dimensionsMap: { Currency: "USD" },
          period: Duration.hours(6),
          statistic: "Maximum",
        }),
        threshold: props.billingAlarmThresholdUsd,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      });
    }
  }
}
