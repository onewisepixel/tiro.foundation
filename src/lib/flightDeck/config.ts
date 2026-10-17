// Flight Deck runtime mode and feature flags. Everything defaults to OFF.
//
// There are exactly two modes:
//
//   disabled    The default everywhere. /flight-deck answers 404, the
//               public /pilot form shows an honest "not open yet" state and
//               accepts nothing, and no adapter is constructed.
//   local-demo  Synthetic fixtures in an isolated local file store, with
//               test identities, for development on one machine.
//
// There is no production mode in 0.1. A production mode requires a
// selected identity provider, a provisioned operations store, a reviewed
// privacy notice, and recorded launch approval
// (docs/flight-deck/privacy-launch-gates.md); until those exist the code
// has nothing to switch on, so no environment variable can turn it on.
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

export type ModeDecision = { mode: "local-demo" } | { mode: "disabled"; reason: string };

export function decideMode(env: FlightDeckEnv): ModeDecision {
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

// Channel flags. In 0.1 each is additionally capped by mode: in local-demo
// a flag can only ever select the dry-run local outbox, never a network
// provider, because no network provider is implemented.
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

// The public form accepts a submission only when it can be persisted
// safely: in local demo (synthetic, local file) when its flag is on.
// Everywhere else it renders the closed state and the action refuses.
export function publicFormOpen(env: FlightDeckEnv, host: string | null | undefined): boolean {
  return localDemoActive(env, host) && channelFlags(env).publicForm;
}

// Versions of the public copy a submitter is shown. Stored on every
// submission and permission so the exact wording can be reproduced.
export const PILOT_FORM_VERSION = "pilot-eoi-0.1";
export const PRIVACY_NOTICE_VERSION = "pilot-privacy-draft-0.1";
