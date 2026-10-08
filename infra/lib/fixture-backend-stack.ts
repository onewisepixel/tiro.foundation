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
import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps, Tags } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";
import { fileURLToPath } from "url";

// ESM module (infra/package.json has "type": "module") — no __dirname.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";

export type FixtureBackendStackProps = StackProps & {
  // A short, unique namespace per the brief's §6 drill-isolation instruction
  // — e.g. "dev", or "drill-20261002-1". Used as a resource-name/tag prefix
  // so cleanup can delete only this namespace's disposable resources.
  namespace: string;
  // CloudWatch billing alarm threshold in USD. A notification, not a cap —
  // see docs/backend/decision-and-cost.md.
  billingAlarmThresholdUsd?: number;
  // Where the billing alarm actually notifies. Without this the alarm exists
  // but alerts no one. AWS sends a one-time SNS confirmation link to this
  // address after deploy — it must be clicked before notifications flow.
  billingAlarmEmail?: string;
  // Redirect URLs the staff UI's Cognito Hosted UI login may send tokens
  // back to. Defaults to a local static-server port — this is a
  // staging-only tool, not something deployed to its own hosted origin yet.
  // See staff-ui/README.md.
  staffUiCallbackUrls?: string[];
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
    const staffUserPoolClient = this.staffUserPool.addClient("StaffUserPoolClient", {
      // adminUserPassword: enables `AdminInitiateAuth` — gated by IAM (needs
      // cognito-idp:AdminInitiateAuth on the caller's own credentials, never
      // reachable from the public internet), useful for scripted/CLI staff
      // sign-in and smoke-testing without implementing SRP client-side.
      authFlows: { userSrp: true, adminUserPassword: true },
      generateSecret: false,
      // OAuth/Hosted UI config — used by staff-ui/ (a static page, not part
      // of the public Next.js site) to sign in and obtain a JWT for the API
      // below. Authorization-code + PKCE only — no implicit grant, this
      // client has no secret, and the id token's email claim is what the
      // API attributes lifecycle actions to (see backend/src/api/handler.ts).
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
        callbackUrls: props.staffUiCallbackUrls ?? ["http://localhost:4300/callback.html"],
        logoutUrls: props.staffUiCallbackUrls ?? ["http://localhost:4300/index.html"],
      },
    });
    // Cognito-hosted login page. The domain prefix only needs to be unique
    // within this AWS region (across ALL AWS accounts using it, not just
    // this one) — if "tiro-fixture-staff-<namespace>" ever collides, deploy
    // fails with a clear CloudFormation error; retry with a different
    // namespace, same as any other drill-isolation collision in this stack.
    const staffUserPoolDomain = this.staffUserPool.addDomain("StaffUserPoolDomain", {
      cognitoDomain: { domainPrefix: `tiro-fixture-staff-${namespace}` },
    });

    // --- Bounded log retention (§2: "bounded log retention" keeps CloudWatch
    // Logs cost near-zero). The staff API Lambda below logs here, not to the
    // default "never expire" group Lambda would otherwise create.
    const apiLogGroup = new logs.LogGroup(this, "FixtureBackendLogGroup", {
      logGroupName: `/tiro/fixture-backend/${namespace}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // --- Staff API: a single Lambda ("Lambdalith") behind an HTTP API,
    // gated by the Cognito authorizer above on every route. This is
    // authentication only — confirms a real signed-in staff member is
    // calling — never a substitute for evaluatePermission's own scoped
    // checks, which the Lambda's handler runs unchanged regardless of who
    // the caller is. See backend/src/api/router.ts.
    const apiHandler = new NodejsFunction(this, "StaffApiHandler", {
      functionName: `tiro-fixture-staff-api-${namespace}`,
      entry: path.join(__dirname, "../../backend/src/api/handler.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(10),
      memorySize: 256,
      logGroup: apiLogGroup,
      environment: {
        TIRO_PRIMARY_TABLE: this.primaryTable.tableName,
        TIRO_REGISTER_TABLE: this.restrictionRegisterTable.tableName,
        TIRO_STATUS_INDEX: "GSI1-status-index",
        TIRO_MEDIA_BUCKET: this.mediaBucket.bucketName,
      },
    });
    // Both grants are needed on the SAME Lambda because the service layer
    // it calls (lifecycle.ts) legitimately writes both the primary table
    // and the restriction register as part of one logical action — the
    // register's protection against restore is structural (a separate
    // table, excluded from primary-table backup/restore tooling), not an
    // asymmetric IAM policy on this handler.
    this.primaryTable.grantReadWriteData(apiHandler);
    this.restrictionRegisterTable.grantReadWriteData(apiHandler);
    // Minimal media-bucket IAM: grantRead covers GetObject/GetObjectVersion
    // plus ListBucket/ListBucketVersions (CDK's READ_ACTIONS wildcards,
    // s3:GetObject* and s3:List*) — scoped version reads (services/media.ts)
    // and version/delete-marker inventory (lifecycle.ts's purge step) both
    // need this. grantDelete covers DeleteObject/DeleteObjectVersion — the
    // actual permanent-removal half of that same purge step.
    this.mediaBucket.grantRead(apiHandler);
    this.mediaBucket.grantDelete(apiHandler);
    // Staff intake (services/intake.ts's addMedia) is the first thing this
    // Lambda ever uploads itself — every prior write to this bucket came
    // from a separately-credentialed script (fixtures/media.ts's seeding,
    // the restore drills). Scoped to the exact prefix every media object in
    // this system already uses (fixtures/{fixtureSetId}/{recordId}/...),
    // not general bucket write access.
    this.mediaBucket.grantPut(apiHandler, "fixtures/*");

    const httpApi = new apigwv2.HttpApi(this, "StaffApi", {
      apiName: `tiro-fixture-staff-api-${namespace}`,
      corsPreflight: {
        // Bearer-token auth (never cookies), so a permissive origin list
        // doesn't expose CSRF the way it would for cookie-based auth — a
        // page on another origin still can't read this origin's stored
        // token. Staging-only tool; tighten if this ever serves past that.
        allowOrigins: ["*"],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST],
        allowHeaders: ["authorization", "content-type"],
      },
      defaultAuthorizer: new HttpUserPoolAuthorizer("StaffApiAuthorizer", this.staffUserPool, {
        userPoolClients: [staffUserPoolClient],
      }),
    });
    const apiIntegration = new HttpLambdaIntegration("StaffApiIntegration", apiHandler);
    httpApi.addRoutes({
      path: "/lifecycle-requests",
      methods: [apigwv2.HttpMethod.GET],
      integration: apiIntegration,
    });
    httpApi.addRoutes({
      path: "/records/{recordId}",
      methods: [apigwv2.HttpMethod.GET],
      integration: apiIntegration,
    });
    httpApi.addRoutes({
      path: "/records/{recordId}/{action}",
      methods: [apigwv2.HttpMethod.POST],
      integration: apiIntegration,
    });
    httpApi.addRoutes({
      path: "/records/{recordId}/media/{mediaId}",
      methods: [apigwv2.HttpMethod.GET],
      integration: apiIntegration,
    });
    httpApi.addRoutes({
      path: "/export",
      methods: [apigwv2.HttpMethod.POST],
      integration: apiIntegration,
    });
    // Staff intake and review (services/intake.ts) — confirmed against the
    // existing route table above: API Gateway here has no catch-all proxy
    // integration, so every new path needs its own explicit registration,
    // same as every route above it.
    httpApi.addRoutes({
      path: "/intake",
      methods: [apigwv2.HttpMethod.POST],
      integration: apiIntegration,
    });
    httpApi.addRoutes({
      path: "/intake/queue",
      methods: [apigwv2.HttpMethod.GET],
      integration: apiIntegration,
    });
    httpApi.addRoutes({
      path: "/intake/{recordId}",
      methods: [apigwv2.HttpMethod.GET],
      integration: apiIntegration,
    });
    httpApi.addRoutes({
      path: "/intake/{recordId}/media/{mediaId}",
      methods: [apigwv2.HttpMethod.GET],
      integration: apiIntegration,
    });

    // Public Memory-site connection — read-only, anonymous, purpose
    // "publication" / audience "public" enforced entirely server-side
    // inside services/publicView.ts (never from a caller-supplied query
    // param). Same Lambda, same integration, no new IAM grants — the
    // handler already has read access to both tables and the bucket.
    // HttpNoneAuthorizer overrides the HttpApi's own defaultAuthorizer
    // (the Cognito pool authorizer above) on exactly these three routes;
    // api/handler.ts's own isPublicGetRoutePath allowlist (exact route
    // shapes, not a path-prefix check) is the matching application-level
    // gate that skips extractCallerIdentity for these same three requests.
    httpApi.addRoutes({
      path: "/public/records",
      methods: [apigwv2.HttpMethod.GET],
      integration: apiIntegration,
      authorizer: new apigwv2.HttpNoneAuthorizer(),
    });
    httpApi.addRoutes({
      path: "/public/records/{recordId}",
      methods: [apigwv2.HttpMethod.GET],
      integration: apiIntegration,
      authorizer: new apigwv2.HttpNoneAuthorizer(),
    });
    httpApi.addRoutes({
      path: "/public/records/{recordId}/media/{mediaId}",
      methods: [apigwv2.HttpMethod.GET],
      integration: apiIntegration,
      authorizer: new apigwv2.HttpNoneAuthorizer(),
    });

    new CfnOutput(this, "StaffApiUrl", { value: httpApi.apiEndpoint });
    new CfnOutput(this, "MediaBucketName", { value: this.mediaBucket.bucketName });
    new CfnOutput(this, "StaffUserPoolId", { value: this.staffUserPool.userPoolId });
    new CfnOutput(this, "StaffUserPoolClientId", { value: staffUserPoolClient.userPoolClientId });
    new CfnOutput(this, "StaffUserPoolDomain", {
      value: `${staffUserPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
    });

    // --- Billing alarm: a notification tripwire, not an enforced cap — see
    // decision-and-cost.md. NOTE: AWS billing metrics publish to CloudWatch
    // in us-east-1 only; this alarm is only meaningful if this stack (or at
    // least this alarm) is deployed there, regardless of where the other
    // resources above live.
    if (props.billingAlarmThresholdUsd) {
      const billingTopic = new sns.Topic(this, "BillingAlarmTopic", {
        topicName: `tiro-fixture-backend-billing-${namespace}`,
      });
      if (props.billingAlarmEmail) {
        billingTopic.addSubscription(new snsSubscriptions.EmailSubscription(props.billingAlarmEmail));
      }

      const billingAlarm = new cloudwatch.Alarm(this, "BillingAlarm", {
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
      billingAlarm.addAlarmAction(new cloudwatchActions.SnsAction(billingTopic));
    }
  }
}
