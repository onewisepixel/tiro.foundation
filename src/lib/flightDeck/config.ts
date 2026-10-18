// Flight Deck runtime mode and feature flags. Everything defaults to OFF.
//
// Three modes:
//
//   disabled    The default everywhere. /flight-deck answers 404, the
//               public /pilot form shows an honest "not open yet" state and
//               accepts nothing, and no adapter is constructed.
//   local-demo  Synthetic fixtures (a local file, or a local Postgres) and
//               test identities, for development on one machine.
//   production  Cognito sign-in, a Postgres operations store, durable rate
//               limiting, and the scheduled worker. Exists only when EVERY
//               required setting below is present and well-formed. Even
//               then, nothing opens on configuration alone: the console
//               needs the founder's recorded "console" gate, and the public
//               form needs its own recorded gate, its own flag, and a
//               privacy notice that is no longer a draft (runtime.ts).
//
// Local demo is refused unless ALL of these hold, so a stray variable on a
// deployed host cannot enable it:
//   - FLIGHT_DECK_MODE=local-demo is set explicitly;
//   - NODE_ENV is not "production" (next build / next start force it);
//   - no hosting-platform marker is present in the environment;
//   - the request's Host is a loopback address (checked per request).
// Query parameters and cookies are never consulted.
//
// There is deliberately no archive-intake flag of any kind.

export type FlightDeckEnv = Readonly<Record<string, string | undefined>>;

const PLATFORM_MARKERS = [
  "VERCEL",
  "VERCEL_ENV",
  "NETLIFY",
  "CF_PAGES",
  "RENDER",
  "FLY_APP_NAME",
  "K_SERVICE",
  "AWS_LAMBDA_FUNCTION_NAME",
  "AWS_EXECUTION_ENV",
  "ECS_CONTAINER_METADATA_URI",
  "ECS_CONTAINER_METADATA_URI_V4",
  "AMPLIFY_APP_ID",
  "WEBSITE_INSTANCE_ID",
  "RAILWAY_ENVIRONMENT",
  "HEROKU_APP_ID",
  "CODESPACES",
];

export type ModeDecision = { mode: "local-demo" } | { mode: "production" } | { mode: "disabled"; reason: string };

// ---------- Production configuration ----------

export type ProductionConfig = {
  // The protective event log (protective.ts, s3Sink.ts): a versioned,
  // Object Lock bucket. Mandatory.
  protective: { bucket: string; region: string; prefix: string; endpoint?: string };
  databaseUrl: string;
  databaseCa: string | null;
  pepper: string;
  sessionSecret: string;
  workerToken: string;
  monitorToken: string;
  cognito: {
    region: string;
    userPoolId: string;
    clientId: string;
    clientSecret: string;
    domain: string;
    publicOrigin: string;
    requiredGroup: string;
  };
};

const PLACEHOLDER = /<|>|placeholder|changeme|change-me|example|xxx|todo|secret-here/i;
const secret = (v: string | undefined) => !!v && v.length >= 32 && !PLACEHOLDER.test(v);
const httpsOrigin = (v: string | undefined) => !!v && /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(v) && !PLACEHOLDER.test(v);

// Every problem, not just the first, so a deployment check can list them.
// Values are never echoed: only the names of what is missing or invalid.
export function productionConfigProblems(env: FlightDeckEnv): string[] {
  const problems: string[] = [];
  const db = env.FLIGHT_DECK_DATABASE_URL;
  if (!db || !/^postgres(ql)?:\/\//.test(db) || PLACEHOLDER.test(db)) {
    problems.push("FLIGHT_DECK_DATABASE_URL");
  } else if (!/[?&]sslmode=(verify-full|verify-ca|require)\b/.test(db)) {
    problems.push("FLIGHT_DECK_DATABASE_URL (TLS required: sslmode=verify-full)");
  }
  for (const name of ["FLIGHT_DECK_EMAIL_HASH_PEPPER", "FLIGHT_DECK_SESSION_SECRET", "FLIGHT_DECK_WORKER_TOKEN", "FLIGHT_DECK_MONITOR_TOKEN", "FLIGHT_DECK_COGNITO_CLIENT_SECRET"]) {
    if (!secret(env[name])) {
      problems.push(`${name} (at least 32 random characters)`);
    }
  }
  const distinct = ["FLIGHT_DECK_EMAIL_HASH_PEPPER", "FLIGHT_DECK_SESSION_SECRET", "FLIGHT_DECK_WORKER_TOKEN", "FLIGHT_DECK_MONITOR_TOKEN"].map((n) => env[n]).filter(Boolean);
  if (new Set(distinct).size !== distinct.length) {
    problems.push("secrets must all be different");
  }
  if (!/^[a-z]{2}(-gov)?-[a-z]+-\d$/.test(env.FLIGHT_DECK_COGNITO_REGION ?? "")) {
    problems.push("FLIGHT_DECK_COGNITO_REGION");
  }
  if (!/^[a-z]{2}(-gov)?-[a-z]+-\d_[A-Za-z0-9]{1,55}$/.test(env.FLIGHT_DECK_COGNITO_USER_POOL_ID ?? "") || !(env.FLIGHT_DECK_COGNITO_USER_POOL_ID ?? "").startsWith(`${env.FLIGHT_DECK_COGNITO_REGION}_`)) {
    problems.push("FLIGHT_DECK_COGNITO_USER_POOL_ID");
  }
  if (!/^[a-z0-9]{20,128}$/i.test(env.FLIGHT_DECK_COGNITO_CLIENT_ID ?? "")) {
    problems.push("FLIGHT_DECK_COGNITO_CLIENT_ID");
  }
  if (!httpsOrigin(env.FLIGHT_DECK_COGNITO_DOMAIN)) {
    problems.push("FLIGHT_DECK_COGNITO_DOMAIN (https origin)");
  }
  if (!httpsOrigin(env.FLIGHT_DECK_PUBLIC_ORIGIN)) {
    problems.push("FLIGHT_DECK_PUBLIC_ORIGIN (https origin)");
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.FLIGHT_DECK_PROTECTIVE_BUCKET ?? "") || PLACEHOLDER.test(env.FLIGHT_DECK_PROTECTIVE_BUCKET ?? "")) {
    problems.push("FLIGHT_DECK_PROTECTIVE_BUCKET (the protective event log bucket)");
  }
  if (!/^[a-z]{2}(-gov)?-[a-z]+-\d$/.test(env.FLIGHT_DECK_PROTECTIVE_REGION ?? "")) {
    problems.push("FLIGHT_DECK_PROTECTIVE_REGION");
  }
  // An S3-compatible endpoint override is accepted only over https, or
  // over http on this machine (the local production rehearsal).
  const ep = env.FLIGHT_DECK_PROTECTIVE_ENDPOINT;
  if (ep && !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(ep) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(ep)) {
    problems.push("FLIGHT_DECK_PROTECTIVE_ENDPOINT (https, or http on loopback only)");
  }
  return problems;
}

export function productionConfig(env: FlightDeckEnv): ProductionConfig | null {
  if (productionConfigProblems(env).length) {
    return null;
  }
  return {
    protective: {
      bucket: env.FLIGHT_DECK_PROTECTIVE_BUCKET!,
      region: env.FLIGHT_DECK_PROTECTIVE_REGION!,
      prefix: env.FLIGHT_DECK_PROTECTIVE_PREFIX || "flight-deck/",
      ...(env.FLIGHT_DECK_PROTECTIVE_ENDPOINT ? { endpoint: env.FLIGHT_DECK_PROTECTIVE_ENDPOINT } : {}),
    },
    databaseUrl: env.FLIGHT_DECK_DATABASE_URL!,
    databaseCa: env.FLIGHT_DECK_DATABASE_CA_PEM ?? null,
    pepper: env.FLIGHT_DECK_EMAIL_HASH_PEPPER!,
    sessionSecret: env.FLIGHT_DECK_SESSION_SECRET!,
    workerToken: env.FLIGHT_DECK_WORKER_TOKEN!,
    monitorToken: env.FLIGHT_DECK_MONITOR_TOKEN!,
    cognito: {
      region: env.FLIGHT_DECK_COGNITO_REGION!,
      userPoolId: env.FLIGHT_DECK_COGNITO_USER_POOL_ID!,
      clientId: env.FLIGHT_DECK_COGNITO_CLIENT_ID!,
      clientSecret: env.FLIGHT_DECK_COGNITO_CLIENT_SECRET!,
      domain: env.FLIGHT_DECK_COGNITO_DOMAIN!.replace(/\/+$/, ""),
      publicOrigin: env.FLIGHT_DECK_PUBLIC_ORIGIN!.replace(/\/+$/, ""),
      requiredGroup: env.FLIGHT_DECK_COGNITO_REQUIRED_GROUP || "flight-deck",
    },
  };
}

export function decideMode(env: FlightDeckEnv): ModeDecision {
  if (env.FLIGHT_DECK_MODE === "production") {
    if (env.NODE_ENV !== "production") {
      return { mode: "disabled", reason: "production-mode-requires-production-build" };
    }
    return productionConfigProblems(env).length ? { mode: "disabled", reason: "production-config-incomplete" } : { mode: "production" };
  }
  if (env.FLIGHT_DECK_MODE !== "local-demo") {
    return { mode: "disabled", reason: env.FLIGHT_DECK_MODE ? "unknown-mode" : "not-configured" };
  }
  if (env.NODE_ENV === "production") {
    return { mode: "disabled", reason: "local-demo-refused-in-production-build" };
  }
  const marker = PLATFORM_MARKERS.find((name) => env[name] !== undefined && env[name] !== "");
  if (marker) {
    return { mode: "disabled", reason: "local-demo-refused-on-hosting-platform" };
  }
  return { mode: "local-demo" };
}

// Host header without port; bracketed IPv6 kept as-is.
export function isLoopbackHost(host: string | null | undefined): boolean {
  if (!host) {
    return false;
  }
  const h = host.trim().toLowerCase();
  const name = h.startsWith("[") ? h.slice(0, h.indexOf("]") + 1) : h.split(":")[0];
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]";
}

export function localDemoActive(env: FlightDeckEnv, host: string | null | undefined): boolean {
  return decideMode(env).mode === "local-demo" && isLoopbackHost(host);
}

// The mode that applies to this request, or null (feature absent).
// Production requests must arrive on the configured public host.
export function requestMode(env: FlightDeckEnv, host: string | null | undefined): "local-demo" | "production" | null {
  const d = decideMode(env);
  if (d.mode === "local-demo") {
    return isLoopbackHost(host) ? "local-demo" : null;
  }
  if (d.mode === "production") {
    const expected = new URL(env.FLIGHT_DECK_PUBLIC_ORIGIN!).host.toLowerCase();
    return host?.trim().toLowerCase() === expected ? "production" : null;
  }
  return null;
}

// Channel flags. In local demo a flag can only ever select the dry-run
// outbox. In production, email and social stay disabled whatever the flag
// says: no live provider is implemented (docs/flight-deck/integrations.md).
export type ChannelFlags = {
  publicForm: boolean;
  outboundEmail: boolean;
  socialPublishing: boolean;
  backgroundJobs: boolean;
};

const on = (value: string | undefined) => value === "true";

export function channelFlags(env: FlightDeckEnv): ChannelFlags {
  return {
    publicForm: on(env.FLIGHT_DECK_PUBLIC_FORM_ENABLED),
    outboundEmail: on(env.FLIGHT_DECK_OUTBOUND_EMAIL_ENABLED),
    socialPublishing: on(env.FLIGHT_DECK_SOCIAL_PUBLISHING_ENABLED),
    backgroundJobs: on(env.FLIGHT_DECK_BACKGROUND_JOBS_ENABLED),
  };
}

// Local demo: the form opens with its flag (synthetic store). Production
// additionally needs the recorded public-form gate (runtime.ts
// isPublicFormOpen), and never while the notice is a draft.
export function publicFormOpen(env: FlightDeckEnv, host: string | null | undefined): boolean {
  return localDemoActive(env, host) && channelFlags(env).publicForm;
}

// Versions of the public copy a submitter is shown. Stored on every
// submission and permission so the exact wording can be reproduced.
export const PILOT_FORM_VERSION = "pilot-eoi-0.2";
export const PRIVACY_NOTICE_VERSION = "pilot-privacy-draft-0.2";

// The production form cannot open while the notice is a draft. Replacing
// the notice with reviewed text means giving it a version without "draft".
export const privacyNoticeIsDraft = () => PRIVACY_NOTICE_VERSION.includes("draft");
