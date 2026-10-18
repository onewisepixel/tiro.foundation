import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SubmitButton } from "@/components/flight-deck/client";
import { Badge, Field, Notice, PageTitle, Section, when } from "@/components/flight-deck/ui";
import { privacyNoticeIsDraft, PRIVACY_NOTICE_VERSION } from "@/lib/flightDeck/config";
import { GATE_STATEMENTS, isFreshAuth, verifyGate } from "@/lib/flightDeck/gates";
import type { SessionActor } from "@/lib/flightDeck/identity";
import { getActor, getBootstrapRuntime } from "@/lib/flightDeck/runtime";
import { approveGateAction } from "./actions";

const REASON: Record<string, string> = {
  unsigned: "recorded without a verified approval (for example from the old admin script); it opens nothing",
  "bad-signature": "its signature does not verify; it opens nothing",
  "approver-inactive": "its approver is no longer an active operator",
  "approver-not-founder": "its approver is no longer a founder",
  "subject-mismatch": "its approver's identity no longer matches",
  "notice-changed": "the privacy notice has changed since it was approved",
  "wrong-gate": "it is filed under the wrong gate",
};

export default async function GatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const rt = await getBootstrapRuntime();
  if (!rt || rt.mode !== "production" || !rt.identity || !rt.config) {
    notFound();
  }
  const actor = (await getActor(rt)) as SessionActor | null;
  if (!actor) {
    redirect("/flight-deck/sign-in");
  }
  const params = await searchParams;
  const identity = rt.identity;
  const secret = rt.config.sessionSecret;
  const records = await identity.gates();
  const status = await Promise.all(
    (["console", "public-form"] as const).map(async (gate) => {
      const r = records.find((x) => x.gate === gate);
      const check = r ? await verifyGate(r, secret, identity) : null;
      return { gate, record: r ?? null, check };
    }),
  );
  const fresh = isFreshAuth(actor.authTime);
  const founder = actor.role === "founder";
  const consoleOk = status[0].check?.ok === true;

  return (
    <div className="max-w-3xl">
      <PageTitle eyebrow="Flight Deck · launch gates" title="Approvals that open Flight Deck">
        Each approval is made here by a founder who has just signed in with their second factor. It is signed by the server, written to the protective log, and checked
        again every time it is used. Approving the console does not open the public form or permit any message.
      </PageTitle>
      <Notice params={params} />
      {!founder ? <p className="mb-6 text-sm">Only a founder can approve launch gates.</p> : null}
      {founder ? (
        <p className="mb-8 text-sm">
          You last proved your identity {actor.authTime ? when(actor.authTime) : "at an unknown time"}.{" "}
          {fresh ? (
            <Badge tone="done" glyph="✓">
              Fresh enough to approve
            </Badge>
          ) : (
            <a className="tiro-link" href="/flight-deck/auth/login?reauth=1">
              Sign in again to approve (required within 10 minutes)
            </a>
          )}
        </p>
      ) : null}

      {status.map(({ gate, record, check }) => (
        <Section key={gate} title={gate === "console" ? "Console" : "Public interest form"}>
          <p className="mb-3 text-sm">
            {check?.ok ? (
              <Badge tone="done" glyph="✓">
                Approved by {check.approval.operatorId.slice(-6)} on {when(check.approval.approvedAt)}
              </Badge>
            ) : record ? (
              <Badge tone="blocked" glyph="■">
                Not valid: {REASON[(check as { reason: string } | null)?.reason ?? "unsigned"]}
              </Badge>
            ) : (
              <Badge glyph="○">Not approved</Badge>
            )}
          </p>
          {founder && !check?.ok ? (
            gate === "public-form" && !consoleOk ? (
              <p className="text-sm text-[var(--tiro-text-muted)]">Approve the console first.</p>
            ) : gate === "public-form" && privacyNoticeIsDraft() ? (
              <p className="text-sm text-[var(--tiro-text-muted)]">
                Not available: the privacy notice ({PRIVACY_NOTICE_VERSION}) is still a draft. The reviewed notice must be in place first.
              </p>
            ) : (
              <form action={approveGateAction} className="fd-panel space-y-4">
                <input type="hidden" name="gate" value={gate} />
                {gate === "public-form" ? (
                  <>
                    <input type="hidden" name="noticeVersion" value={PRIVACY_NOTICE_VERSION} />
                    <Field label="Reference of your separate written authorization" htmlFor="writtenApprovalRef" hint="For example its title and date. The written authorization itself is kept outside Flight Deck.">
                      <input id="writtenApprovalRef" name="writtenApprovalRef" required minLength={8} maxLength={300} className="tiro-input" />
                    </Field>
                  </>
                ) : null}
                <label className="tiro-check text-sm">
                  <input type="checkbox" name="attest" value="yes" required />
                  {GATE_STATEMENTS[gate]}
                </label>
                <SubmitButton tone="primary">{fresh ? "Approve" : "Sign in again, then approve"}</SubmitButton>
              </form>
            )
          ) : null}
        </Section>
      ))}
      {consoleOk ? (
        <Link href="/flight-deck" className="tiro-link text-sm">
          Go to the console
        </Link>
      ) : null}
    </div>
  );
}
