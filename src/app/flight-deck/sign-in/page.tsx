import { notFound } from "next/navigation";
import { Notice, PageTitle } from "@/components/flight-deck/ui";
import { SubmitButton } from "@/components/flight-deck/client";
import { DEMO_IDENTITIES } from "@/lib/flightDeck/identities";
import { getConsoleRuntime } from "@/lib/flightDeck/runtime";
import { signIn } from "../actions";

const ROLE_TEXT = {
  founder: "Everything, including approval, resumption, deletion and settings.",
  operator: "Prepares drafts and keeps relationships current. Cannot approve, resume, or delete.",
  reviewer: "Reads and decides on approvals. Cannot edit drafts.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const rt = await getConsoleRuntime();
  if (!rt) {
    notFound();
  }
  const params = await searchParams;
  if (rt.mode === "production") {
    return (
      <div className="max-w-xl">
        <PageTitle eyebrow="Flight Deck" title="Sign in">
          Flight Deck is for named TIRO operators. You will sign in with your operator account and a second factor; then Flight Deck checks that you are an active
          operator before anything is shown.
        </PageTitle>
        <Notice params={params} />
        <a href="/flight-deck/auth/login" className="fd-button" data-tone="primary">
          Continue to sign in
        </a>
      </div>
    );
  }
  return (
    <div className="max-w-xl">
      <PageTitle eyebrow="Flight Deck · local demo" title="Choose a test identity">
        These are synthetic test identities for this machine only. They have no passwords because they are not accounts. A deployed Flight Deck requires a real
        identity provider with multi-factor authentication; until one is configured, this page and everything behind it do not exist outside local development.
      </PageTitle>
      <Notice params={params} />
      <ul className="space-y-3">
        {DEMO_IDENTITIES.map((identity) => (
          <li key={identity.id} className="fd-panel flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-semibold">{identity.displayName}</p>
              <p className="mt-1 text-sm text-[var(--tiro-text-muted)]">{ROLE_TEXT[identity.role]}</p>
            </div>
            <form action={signIn}>
              <input type="hidden" name="userId" value={identity.id} />
              <SubmitButton tone={identity.role === "founder" ? "primary" : undefined}>Continue as {identity.role}</SubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
