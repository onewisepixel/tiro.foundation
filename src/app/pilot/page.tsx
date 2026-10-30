import type { Metadata } from "next";
import Link from "next/link";
import Movement, { MovementTitle } from "@/components/trace/Movement";
import OriginPoint from "@/components/trace/OriginPoint";
import PilotInterestForm from "@/components/pilot/PilotInterestForm";
import { PRIVACY_NOTICE_VERSION } from "@/lib/flightDeck/config";
import { PRIVACY_NOTICE_DRAFT } from "@/lib/flightDeck/pilotCopy";
import { getRuntime, isPublicFormOpen, issueFormToken } from "@/lib/flightDeck/runtime";

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
    <main className="relative min-h-screen bg-[var(--tiro-bg)] pt-16 text-[var(--tiro-text)]">
      <Movement
        id="invitation"
        index="01"
        name="Invitation"
        register="witness"
        header={
          <>
            <h1 id="invitation-title" className="lt-display max-w-4xl text-[2.6rem] sm:text-6xl md:text-7xl">
              A pilot is forming.
            </h1>
            <p className="mt-8 max-w-[var(--lt-measure)] text-lg leading-relaxed text-[var(--tiro-text-soft)] md:text-xl">
              TIRO is exploring a first, bounded pilot for preserving cultural and linguistic memory with its context, its provenance, and the authority of the people it
              comes from intact. It begins with conversations.
            </p>
            <p className="mt-6 max-w-[var(--lt-measure)] text-base leading-relaxed text-[var(--tiro-text-muted)]">
              To record something does not make it ours. Before anything is recorded, the people and communities a memory belongs to need to shape what a pilot is,
              who decides, and what it must never do. That is why relationships, and the authority they carry, come first.
            </p>
          </>
        }
      />

      <Movement
        id="status"
        index="02"
        name="Status"
        register="respect"
        header={<MovementTitle id="status">What this is, and what it is not.</MovementTitle>}
      >
        <div className="mt-10 grid max-w-4xl gap-8 md:grid-cols-2">
          <div className="fd-panel">
            <p className="lt-label mb-4 text-[var(--tiro-accent)]">We are inviting</p>
            <p className="text-base leading-relaxed text-[var(--tiro-text-soft)]">
              Conversations and consultation. A name, an email address, the kind of interest you have, and, if you like, which topics you would like to talk about.
            </p>
          </div>
          <div className="fd-panel">
            <p className="lt-label mb-4 text-[var(--tiro-contested)]">We are not collecting</p>
            <ul className="space-y-2 text-base leading-relaxed text-[var(--tiro-text-soft)]">
              {NOT_REQUESTED.map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden="true" className="text-[var(--tiro-contested)]">
                    ✕
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-8 max-w-[var(--lt-measure)] text-sm leading-relaxed text-[var(--tiro-text-muted)]">
          Please do not send any of these, here or by email. Expressing interest is not consent to collect, preserve, or publish anything, and does not name you
          publicly. Read how TIRO holds what is entrusted to it:{" "}
          <Link href="/community-rights" className="tiro-link">
            Community Rights &amp; Stewardship
          </Link>
          .
        </p>
      </Movement>

      <Movement id="ways" index="03" name="Participate" register="participate" header={<MovementTitle id="ways">Ways to take part.</MovementTitle>}>
        <ul className="mt-12 max-w-3xl">
          {WAYS.map((w) => (
            <li key={w.title} className="border-b border-[var(--tiro-border)] py-6">
              <h3 className="font-[family-name:var(--font-display)] text-2xl md:text-3xl">{w.title}</h3>
              <p className="mt-2 max-w-[var(--lt-measure)] text-base leading-relaxed text-[var(--tiro-text-muted)]">{w.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8 max-w-[var(--lt-measure)] text-sm leading-relaxed text-[var(--tiro-text-muted)]">
          These are expressions of interest. None of them is a selection, a role, or a verified authority.
        </p>
      </Movement>

      <Movement id="process" index="04" name="How it proceeds" register="preserve" header={<MovementTitle id="process">How it proceeds.</MovementTitle>}>
        <ol className="mt-12 max-w-3xl">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-5 border-b border-[var(--tiro-border)] py-6">
              <span className="flex flex-col items-center pt-1" aria-hidden="true">
                <OriginPoint size={16} tone={i === STEPS.length - 1 ? "accent" : "mineral"} absent={i === STEPS.length - 1} />
              </span>
              <div>
                <h3 className="font-[family-name:var(--font-display)] text-2xl">
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.title}
                </h3>
                <p className="mt-2 max-w-[var(--lt-measure)] text-base leading-relaxed text-[var(--tiro-text-muted)]">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-8 max-w-[var(--lt-measure)] text-sm leading-relaxed text-[var(--tiro-text-muted)]">
          We do not promise a reply time. TIRO is small and deliberate, and every inquiry is read by a person.
        </p>
      </Movement>

      <Movement
        id="interest"
        index="05"
        name="Express interest"
        register="participate"
        end
        header={<MovementTitle id="interest">Start a conversation.</MovementTitle>}
      >
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
            <div className="fd-panel">
              <p className="lt-label mb-4 text-[var(--tiro-accent)]">Form not yet open</p>
              <p className="text-base leading-relaxed text-[var(--tiro-text-soft)]">
                The interest form will open once its privacy notice has been reviewed and its records have a secure home. Until then, you are welcome to write to
              </p>
              {/* <wbr /> lets the address break before its "@" when it cannot fit on the narrowest phones. */}
              <a href="mailto:custodians@tiro.foundation" className="mt-4 inline-block font-[family-name:var(--font-display)] text-2xl italic text-[var(--tiro-text)] hover:text-[var(--tiro-accent)]">
                custodians<wbr />@tiro.foundation
              </a>
              <p className="mt-4 text-sm leading-relaxed text-[var(--tiro-text-muted)]">
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
      </Movement>
    </main>
  );
}
