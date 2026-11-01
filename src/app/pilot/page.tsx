import type { Metadata } from "next";
import Link from "next/link";
import OriginPoint from "@/components/trace/OriginPoint";
import PilotInterestForm from "@/components/pilot/PilotInterestForm";
import { PRIVACY_NOTICE_VERSION } from "@/lib/flightDeck/config";
import { PRIVACY_NOTICE_DRAFT } from "@/lib/flightDeck/pilotCopy";
import { getRuntime, isPublicFormOpen, issueFormToken } from "@/lib/flightDeck/runtime";
import "@/components/archive/archive.css";
import "./pilot.css";

export const metadata: Metadata = {
  title: "A pilot is forming — The Tiro Foundation",
  description: "TIRO is exploring a first, bounded pilot and inviting conversations. It is not collecting memories, recordings, or cultural material.",
};

const NOT_REQUESTED = ["Recordings, audio, or video", "Stories, testimony, or memories", "Photographs, scans, or documents", "Cultural artifacts, sacred or restricted knowledge", "Identity documents or proof of authority"];

const WAYS = [
  {
    title: "As someone who may want to contribute",
    body: "You would like to understand what a pilot could involve before deciding anything. Nothing is asked of you now, and expressing interest commits you to nothing.",
  },
  {
    title: "As a community representative or potential partner",
    body: "You are part of, or work with, a community, archive, library, or cultural institution. Authority to speak for a community is never assumed from a form: it is something a pilot would establish with the community, in consultation.",
  },
  {
    title: "As a researcher, archivist, translator, or volunteer",
    body: "You bring practice a pilot would need: provenance, preservation, language, ethics, or simply time. We would like to learn from you.",
  },
];

const STEPS = [
  { title: "Inquiry", body: "You write to us here or by email. A person reads it." },
  { title: "Introductory conversation", body: "If it would be useful to both sides, an unhurried conversation about what you hope for and what concerns you." },
  { title: "Consultation", body: "Community, legal, and stewardship consultation on what a pilot should and must never do, and who decides." },
  { title: "Authorized pilot onboarding, if approved", body: "Only after those gates are met, and only with separate, explicit consent for any material. Many conversations will rightly end before this step." },
];

function cleanReferral(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && /^[a-z0-9_-]{1,40}$/i.test(v) ? v.toLowerCase() : null;
}

export default async function PilotPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const open = await isPublicFormOpen();
  const runtime = open ? await getRuntime() : null;
  const referral = cleanReferral(params.ref ?? params.utm_source);

  return (
    <main id="top" className="la pl bg-[var(--tiro-bg)] pt-[var(--la-header)] text-[var(--tiro-text)]">
      <header id="invitation" aria-labelledby="invitation-title" className="la-frame pl-wrap pl-head">
        <SectionLabel index="01" name="Invitation" />
        <h1 id="invitation-title" className="pl-h1 mt-6">
          A pilot is forming.
        </h1>
        <p className="pl-intro mt-8">
          TIRO is exploring a first, bounded pilot for preserving cultural and linguistic memory with its context, its provenance, and the authority of the people it
          comes from intact. It begins with conversations.
        </p>
        <p className="pl-reason mt-6">
          To record something does not make it ours. Before anything is recorded, the people and communities a memory belongs to need to shape what a pilot is,
          who decides, and what it must never do. That is why relationships, and the authority they carry, come first.
        </p>
      </header>

      <div className="la-frame pl-wrap">
        <section id="status" aria-labelledby="status-title" className="pl-section">
          <SectionLabel index="02" name="Status" />
          <h2 id="status-title" className="pl-h2 mt-5">
            What this is, and what it is not.
          </h2>
          <div className="pl-ledger">
            <div>
              <p className="pl-term mb-4 text-[var(--tiro-accent)]">We are inviting</p>
              <p>
                Conversations and consultation. A name, an email address, the kind of interest you have, and, if you like, which topics you would like to talk about.
              </p>
            </div>
            <div>
              <p className="pl-term mb-4 text-[var(--tiro-contested)]">We are not collecting</p>
              <ul>
                {NOT_REQUESTED.map((item) => (
                  <li key={item}>
                    <span aria-hidden="true" className="text-[var(--tiro-contested)]">
                      ✕
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="pl-aside">
            Please do not send any of these, here or by email. Expressing interest is not consent to collect, preserve, or publish anything, and does not name you
            publicly. Read how TIRO holds what is entrusted to it:{" "}
            <Link href="/community-rights">Community Rights &amp; Stewardship</Link>.
          </p>
        </section>

        <section id="ways" aria-labelledby="ways-title" className="pl-section">
          <SectionLabel index="03" name="Participate" />
          <h2 id="ways-title" className="pl-h2 mt-5">
            Ways to take part.
          </h2>
          <ul className="pl-entries">
            {WAYS.map((w) => (
              <li key={w.title}>
                <h3 className="pl-h3">{w.title}</h3>
                <p className="pl-text mt-2">{w.body}</p>
              </li>
            ))}
          </ul>
          <p className="pl-aside">These are expressions of interest. None of them is a selection, a role, or a verified authority.</p>
        </section>

        <section id="process" aria-labelledby="process-title" className="pl-section">
          <SectionLabel index="04" name="How it proceeds" />
          <h2 id="process-title" className="pl-h2 mt-5">
            How it proceeds.
          </h2>
          {/* The last step's origin is open: it has not happened, and may not. */}
          <ol className="pl-entries pl-steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="pl-mark" aria-hidden="true">
                  <OriginPoint size={16} tone={i === STEPS.length - 1 ? "accent" : "mineral"} absent={i === STEPS.length - 1} />
                </span>
                <div>
                  <h3 className="pl-h3">
                    <span className="sr-only">Step {i + 1}: </span>
                    {s.title}
                  </h3>
                  <p className="pl-text mt-2">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="pl-aside">We do not promise a reply time. TIRO is small and deliberate, and every inquiry is read by a person.</p>
        </section>

        <section id="interest" aria-labelledby="interest-title" className="pl-section">
          <SectionLabel index="05" name="Express interest" />
          <h2 id="interest-title" className="pl-h2 mt-5">
            Start a conversation.
          </h2>
        <div className="mt-10 max-w-2xl">
          {open && runtime ? (
            <>
              <p className="mb-8 border-l-2 border-[var(--tiro-accent)] pl-4 text-sm leading-relaxed text-[var(--tiro-text-soft)]">
                <strong className="font-semibold">Local demonstration.</strong> This form is running on a development machine. Submissions are stored in a synthetic
                local store, and no email is sent. It is not open to the public.
              </p>
              <PilotInterestForm formToken={issueFormToken(runtime)} noticeVersion={PRIVACY_NOTICE_VERSION} referral={referral} demo />
            </>
          ) : (
            // Closed: a dashed panel, not a form. Nothing here takes input.
            <div className="pl-closed">
              <p className="pl-term mb-4 text-[var(--tiro-accent)]">Form not yet open</p>
              <p className="text-[1.0625rem] leading-relaxed text-[var(--tiro-text-soft)]">
                The interest form will open once its privacy notice has been reviewed and its records have a secure home. Until then, you are welcome to write to
              </p>
              {/* <wbr /> lets the address break before its "@" when it cannot fit on the narrowest phones. */}
              <a href="mailto:custodians@tiro.foundation" className="pl-closed-address">
                custodians<wbr />@tiro.foundation
              </a>
              <p className="mt-5 text-[0.9375rem] leading-relaxed text-[var(--tiro-text-muted)]">
                A line saying what kind of conversation interests you is enough. Please do not attach or send stories, recordings, or other material; if anything like that reaches us, we delete it and tell you.
              </p>
            </div>
          )}
        </div>

        {/* Shown only while the form is open: a closed form collects nothing. */}
        {open && runtime ? (
        <section id="privacy-notice" aria-labelledby="privacy-title" className="mt-16 max-w-2xl scroll-mt-24">
          <h3 id="privacy-title" className="font-[family-name:var(--font-display)] text-2xl md:text-3xl">
            Privacy notice for this form
          </h3>
          <p className="mt-3 inline-flex items-center gap-2 border border-[var(--tiro-accent)] px-2.5 py-1 font-[family-name:var(--font-code)] text-[11px] uppercase tracking-[0.14em] text-[var(--tiro-accent)]">
            Draft · not yet legally reviewed · {PRIVACY_NOTICE_VERSION}
          </p>
          <dl className="mt-6 space-y-5">
            {PRIVACY_NOTICE_DRAFT.map((s) => (
              <div key={s.heading}>
                <dt className="font-semibold text-[var(--tiro-text)]">{s.heading}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-[var(--tiro-text-muted)]">{s.body}</dd>
              </div>
            ))}
          </dl>
        </section>
        ) : null}
        </section>
      </div>
    </main>
  );
}

// "02 / Status": the section's number and name, as on the page before.
function SectionLabel({ index, name }: { index: string; name: string }) {
  return (
    <p className="la-eyebrow">
      {index} <span aria-hidden="true">/</span> {name}
    </p>
  );
}
