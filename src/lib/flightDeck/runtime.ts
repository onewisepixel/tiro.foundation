// Server-only wiring for Flight Deck. Every page, action and route handler
// goes through here, and every one of them fails closed: when the request
// is not a local-demo request, there is no store, no provider, and no
// actor, so there is nothing to read or write.
import "server-only";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { FormTokens, InMemoryRateLimiter, clientKey } from "./abuse";
import type { Actor } from "./access";
import { channelFlags, decideMode, localDemoActive, publicFormOpen, type ChannelFlags } from "./config";
import { DisabledEmailProvider, DisabledSocialPublisher, LocalOutboxEmailProvider, LocalOutboxSocialPublisher, type Providers } from "./providers";
import { buildSeedState } from "./seed";
import { LocalFileOperationsStore } from "./store";
import { readSession, SESSION_COOKIE } from "./session";

export type Runtime = {
  mode: "local-demo";
  store: LocalFileOperationsStore;
  providers: Providers;
  flags: ChannelFlags;
  tokens: FormTokens;
  limiter: InMemoryRateLimiter;
  // Keys the in-memory rate limiter; client addresses are never stored.
  clientSecret: string;
};

const LOCAL_DIR = path.join(process.cwd(), ".flight-deck");

type Singletons = { runtime?: Omit<Runtime, "flags" | "providers"> & { seeded: Promise<void> }; providers?: Providers; providersFor?: string };
const g = globalThis as unknown as { __flightDeck?: Singletons };
const singletons = () => (g.__flightDeck ??= {});

async function host(): Promise<string | null> {
  return (await headers()).get("host");
}

// Null unless this request is a local-demo request. Callers must treat
// null as "this feature does not exist here".
export async function getRuntime(): Promise<Runtime | null> {
  if (!localDemoActive(process.env, await host())) {
    return null;
  }
  const s = singletons();
  if (!s.runtime) {
    const store = new LocalFileOperationsStore(process.env.FLIGHT_DECK_LOCAL_STORE_PATH ? path.resolve(process.env.FLIGHT_DECK_LOCAL_STORE_PATH) : path.join(LOCAL_DIR, "local-store.json"));
    // First use of an empty local store loads the synthetic seed.
    const seeded = store.read((tx) => tx.list("prospects").length + tx.list("audit").length).then(async (n) => {
      if (n === 0) {
        await store.replace(await buildSeedState());
      }
    });
    s.runtime = { mode: "local-demo", store, tokens: new FormTokens(randomBytes(32).toString("hex")), limiter: new InMemoryRateLimiter(), clientSecret: randomBytes(32).toString("hex"), seeded };
  }
  await s.runtime.seeded;
  const flags = channelFlags(process.env);
  const signature = `${flags.outboundEmail}:${flags.socialPublishing}`;
  if (!s.providers || s.providersFor !== signature) {
    // Even with a flag on, local demo selects only the dry-run outbox.
    s.providers = {
      email: flags.outboundEmail ? new LocalOutboxEmailProvider(path.join(LOCAL_DIR, "outbox")) : new DisabledEmailProvider(),
      social: flags.socialPublishing ? new LocalOutboxSocialPublisher(path.join(LOCAL_DIR, "outbox")) : new DisabledSocialPublisher(),
    };
    s.providersFor = signature;
  }
  const { seeded, ...rest } = s.runtime;
  void seeded;
  return { ...rest, flags, providers: s.providers };
}

export async function getActor(): Promise<Actor | null> {
  if (!localDemoActive(process.env, await host())) {
    return null;
  }
  return readSession((await cookies()).get(SESSION_COOKIE)?.value, Date.now());
}

export async function isPublicFormOpen(): Promise<boolean> {
  return publicFormOpen(process.env, await host());
}

export async function requestClientKey(secret: string): Promise<string> {
  const h = await headers();
  return clientKey(h.get("x-forwarded-for"), h.get("x-real-ip"), secret);
}

export function modeReason(): string {
  const d = decideMode(process.env);
  return d.mode === "local-demo" ? "local-demo" : d.reason;
}

// Issued at render time; the server refuses it if submitted implausibly
// fast or after it expires (abuse.ts).
export function issueFormToken(runtime: Runtime): string {
  return runtime.tokens.issue(Date.now());
}
