import Link from "next/link";
import { SubmitButton } from "@/components/flight-deck/client";
import { Field, Notice, PageTitle, Return } from "@/components/flight-deck/ui";
import { createProspectAction } from "../../actions";
import { requirePage } from "../../guard";

export default async function NewProspectPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage();
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageTitle eyebrow="Relationships · new" title="Add a researched or referred contact">
        One legitimate contact at a time. Record where the public business contact was found, when, and why contacting them is relevant. No purchased or scraped
        lists. A first message is possible only after a founder or reviewer accepts this basis.
      </PageTitle>
      <Notice params={params} />
      <form action={createProspectAction} className="grid max-w-3xl gap-6 md:grid-cols-2">
        <Return to="/flight-deck/relationships/new" />
        <Field label="Name or form of address" htmlFor="displayName">
          <input id="displayName" name="displayName" required maxLength={120} className="tiro-input" />
        </Field>
        <Field label="Kind" htmlFor="kind">
          <select id="kind" name="kind" className="tiro-input">
            <option value="person">Person</option>
            <option value="organization">Organization</option>
          </select>
        </Field>
        <Field label="Public business email (optional)" htmlFor="email" hint="Only an address the person or organization publishes for this kind of contact.">
          <input id="email" name="email" type="email" maxLength={254} className="tiro-input" />
        </Field>
        <Field label="Organization (optional)" htmlFor="organizationName">
          <input id="organizationName" name="organizationName" maxLength={160} className="tiro-input" />
        </Field>
        <Field label="Region (optional, broad)" htmlFor="region">
          <input id="region" name="region" maxLength={80} className="tiro-input" />
        </Field>
        <Field label="Relevance" htmlFor="participationInterest">
          <select id="participationInterest" name="participationInterest" className="tiro-input">
            <option value="institution">Institution</option>
            <option value="community-partner">Community / partner</option>
            <option value="specialist-volunteer">Specialist / volunteer</option>
            <option value="interested-contributor">Potential contributor</option>
          </select>
        </Field>
        <Field label="Source" htmlFor="source">
          <select id="source" name="source" className="tiro-input">
            <option value="manual-research">Researched (public source)</option>
            <option value="referral">Referral / introduction</option>
          </select>
        </Field>
        <Field label="Priority (your judgment of timing, not of the person)" htmlFor="priority">
          <select id="priority" name="priority" className="tiro-input" defaultValue="normal">
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </Field>
        <Field label="Source evidence (https link)" htmlFor="sourceEvidenceUrl" hint="The page where the contact and its relevance were found.">
          <input id="sourceEvidenceUrl" name="sourceEvidenceUrl" type="url" required pattern="https://.+" maxLength={500} className="tiro-input" />
        </Field>
        <Field label="Observed on" htmlFor="sourceObservedOn">
          <input id="sourceObservedOn" name="sourceObservedOn" type="date" required defaultValue={today} className="tiro-input" />
        </Field>
        <div className="md:col-span-2">
          <Field label="Why contact is legitimate and relevant" htmlFor="contactReason" hint="10–500 characters. No sensitive or personal details beyond what the source publishes.">
            <textarea id="contactReason" name="contactReason" required minLength={10} maxLength={500} rows={3} className="tiro-input" />
          </Field>
        </div>
        <div className="flex flex-wrap gap-3 md:col-span-2">
          <SubmitButton tone="primary">Add contact for review</SubmitButton>
          <Link href="/flight-deck/relationships" className="fd-button">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
