import Link from "next/link";
import { SubmitButton } from "@/components/flight-deck/client";
import { Field, Notice, PageTitle, Return } from "@/components/flight-deck/ui";
import { PLAYBOOKS } from "@/lib/flightDeck/cases";
import { CASE_KINDS } from "@/lib/flightDeck/types";
import { openCaseAction } from "../../actions";
import { requirePage } from "../../guard";

export default async function NewCasePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rt } = await requirePage();
  const params = await searchParams;
  const prospectId = typeof params.prospect === "string" ? params.prospect : null;
  const prospects = await rt.store.read((tx) => tx.list("prospects").map((p) => ({ id: p.id, name: p.displayName })).sort((a, b) => a.name.localeCompare(b.name)));
  const back = `/flight-deck/cases/new${prospectId ? `?prospect=${prospectId}` : ""}`;
  return (
    <>
      <PageTitle eyebrow="Exceptions · new" title="Open a case">
        Choose what happened. The case sets a deadline and a checklist, and for most kinds holds outreach to the person until it is resolved.
      </PageTitle>
      <Notice params={params} />
      <form action={openCaseAction} className="grid max-w-3xl gap-6">
        <Return to={back.split("?")[0]} />
        <fieldset>
          <legend className="tiro-field-label !text-sm">What happened</legend>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {CASE_KINDS.map((k, i) => (
              <label key={k} className="tiro-check border border-[var(--tiro-border)] p-3 text-sm hover:border-[var(--tiro-border-strong)]">
                <input type="radio" name="kind" value={k} required defaultChecked={i === 0} />
                <span>
                  <span className="block text-[var(--tiro-text)]">{PLAYBOOKS[k].label}</span>
                  <span className="tiro-field-hint !text-xs">
                    {PLAYBOOKS[k].purpose} Due within {PLAYBOOKS[k].dueDays} day{PLAYBOOKS[k].dueDays === 1 ? "" : "s"}.
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Person (required for most kinds)" htmlFor="prospectId">
            <select id="prospectId" name="prospectId" className="tiro-input" defaultValue={prospectId ?? ""}>
              <option value="">No one linked</option>
              {prospects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Received via" htmlFor="receivedVia">
            <select id="receivedVia" name="receivedVia" className="tiro-input">
              {["email", "web-form", "phone", "in-person", "post", "internal"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field
          label="What was done or is needed (not what it said)"
          htmlFor="summary"
          hint="Up to 200 characters. Describe handling only, e.g. “Email with an attachment; attachment not opened, deleted.” Never quote, summarize, or describe material, and avoid names."
        >
          <input id="summary" name="summary" required maxLength={200} className="tiro-input" autoComplete="off" />
        </Field>
        <div className="grid gap-6 md:grid-cols-2">
          <Field label="For an opt-out: scope" htmlFor="optOutScope" hint="Applied the moment the case is opened.">
            <select id="optOutScope" name="optOutScope" className="tiro-input" defaultValue="all">
              <option value="all">All contact</option>
              <option value="outreach">Outreach and follow-ups</option>
              <option value="newsletter">Updates only</option>
            </select>
          </Field>
          <label className="tiro-check self-end text-sm">
            <input type="checkbox" name="pauseOutbound" value="yes" />
            For an incident: pause all outbound activity now
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <SubmitButton tone="primary">Open case</SubmitButton>
          <Link href="/flight-deck/cases" className="fd-button">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
