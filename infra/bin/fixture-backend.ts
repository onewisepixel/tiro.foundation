#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { FixtureBackendStack } from "../lib/fixture-backend-stack";

const app = new App();

// Namespace comes from context/env so each drill gets isolated, disposable
// resources — see docs/backend/decision-and-cost.md and the brief's §6
// drill-namespace instruction. Defaults to "dev" for a stable local stack.
const namespace = app.node.tryGetContext("namespace") ?? process.env.TIRO_FIXTURE_NAMESPACE ?? "dev";

new FixtureBackendStack(app, `TiroFixtureBackend-${namespace}`, {
  namespace,
  billingAlarmThresholdUsd: 5,
  billingAlarmEmail: process.env.TIRO_BILLING_ALARM_EMAIL,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
