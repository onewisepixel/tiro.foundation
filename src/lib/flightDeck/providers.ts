// Integration ports. 0.1 ships two implementations of each:
//
//   Disabled*        the default: refuses, so the job is held truthfully
//                    as "provider-disabled" and the item becomes
//                    manual-ready (copy, send by hand, attest).
//   LocalOutbox*     dry run for local demo: writes the exact message to
//                    a file under .flight-deck/outbox/ and reports
//                    "simulated". Nothing leaves the machine, and a
//                    simulated result is never shown as sent.
//
// There is NO network provider in this codebase. Adding one (an email
// service, a social platform API) requires a founder decision, a privacy
// review, scoped credentials held server-side, and a dry run; see
// docs/flight-deck/integrations.md. Provider tokens never reach client
// code: nothing in this file is imported by a client component.
import fs from "node:fs";
import path from "node:path";
import { newId, sha256 } from "./ids";

export type ProviderResult =
  | { kind: "confirmed"; providerName: string; providerMessageId: string; requestId: string; externalUrl?: string | null }
  | { kind: "simulated"; providerName: string; requestId: string }
  | { kind: "failed"; retryable: boolean; code: string }
  | { kind: "unavailable"; code: string };

export type EmailPurpose = "transactional" | "outreach" | "newsletter";

export type EmailMessage = {
  to: string;
  subject: string;
  body: string;
  purpose: EmailPurpose;
  idempotencyKey: string;
};

export interface EmailProvider {
  readonly name: string;
  readonly live: boolean;
  send(message: EmailMessage): Promise<ProviderResult>;
}

export type SocialPost = { channel: string; body: string; idempotencyKey: string };

export interface SocialPublisher {
  readonly name: string;
  readonly live: boolean;
  publish(post: SocialPost): Promise<ProviderResult>;
}

export class DisabledEmailProvider implements EmailProvider {
  readonly name = "disabled";
  readonly live = false;
  async send(): Promise<ProviderResult> {
    return { kind: "unavailable", code: "provider-disabled" };
  }
}

export class DisabledSocialPublisher implements SocialPublisher {
  readonly name = "disabled";
  readonly live = false;
  async publish(): Promise<ProviderResult> {
    return { kind: "unavailable", code: "provider-disabled" };
  }
}

// Fault injection for tests: queued results are returned (in order)
// before the outbox behaves normally.
type Faults = ProviderResult[];

abstract class LocalOutbox {
  readonly live = false;
  private seen = new Map<string, string>();

  constructor(
    private readonly dir: string | null,
    protected readonly faults: Faults = [],
  ) {}

  // Same idempotency key -> same request id, and the file is written once.
  protected record(key: string, text: string): ProviderResult {
    const fault = this.faults.shift();
    if (fault) {
      return fault;
    }
    const file = this.dir ? path.join(this.dir, `${sha256(key).slice(0, 24)}.txt`) : null;
    let existing = this.seen.get(key);
    if (!existing && file && fs.existsSync(file)) {
      existing = /^request: (\S+)$/m.exec(fs.readFileSync(file, "utf8"))?.[1];
    }
    if (existing) {
      this.seen.set(key, existing);
      return { kind: "simulated", providerName: "local-outbox", requestId: existing };
    }
    const requestId = newId("dry");
    this.seen.set(key, requestId);
    if (file && this.dir) {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(file, `DRY RUN. NOT SENT.\nrequest: ${requestId}\nidempotency: ${key}\n\n${text}\n`, { encoding: "utf8", mode: 0o600 });
    }
    return { kind: "simulated", providerName: "local-outbox", requestId };
  }

  sentCount() {
    return this.seen.size;
  }
}

export class LocalOutboxEmailProvider extends LocalOutbox implements EmailProvider {
  readonly name = "local-outbox";
  async send(m: EmailMessage) {
    return this.record(m.idempotencyKey, `to: ${m.to}\npurpose: ${m.purpose}\nsubject: ${m.subject}\n\n${m.body}`);
  }
}

export class LocalOutboxSocialPublisher extends LocalOutbox implements SocialPublisher {
  readonly name = "local-outbox";
  async publish(p: SocialPost) {
    return this.record(p.idempotencyKey, `channel: ${p.channel}\n\n${p.body}`);
  }
}

export type Providers = { email: EmailProvider; social: SocialPublisher };
