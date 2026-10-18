"use client";

// The /pilot expression-of-interest form. Short text fields and fixed
// choices only: there is no file input, no drag-and-drop, and (since 0.2)
// no free-text note, and the server refuses anything else regardless of
// what a client sends.
import { useActionState, useEffect, useRef } from "react";
import { submitInterest, type PilotFormState } from "@/app/pilot/actions";
import { CONSENT_WORDING, PUBLIC_CATEGORIES, PUBLIC_TOPICS, TOPICS_GUIDANCE } from "@/lib/flightDeck/pilotCopy";

type Props = { formToken: string; noticeVersion: string; referral: string | null; demo: boolean };

const INITIAL: PilotFormState = { status: "idle" };

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <p id={id} className="tiro-field-error">
      <span aria-hidden="true">✕</span>
      <span>
        <span className="sr-only">Error: </span>
        {message}
      </span>
    </p>
  );
}

export default function PilotInterestForm({ formToken, noticeVersion, referral, demo }: Props) {
  const [state, action, pending] = useActionState(submitInterest, INITIAL);
  const resultRef = useRef<HTMLDivElement>(null);
  const errors = state.status === "invalid" ? state.fieldErrors : {};
  const v = (state.status === "invalid" || state.status === "refused" ? state.values : undefined) ?? {};
  // A new state remounts the form so the echoed values become its defaults.
  const formKey = "attempt" in state && state.attempt ? state.attempt : state.status;

  // Move focus to the outcome so screen-reader and keyboard users hear it.
  useEffect(() => {
    if (state.status !== "idle") {
      resultRef.current?.focus();
    }
  }, [state]);

  if (state.status === "received") {
    return (
      <div ref={resultRef} tabIndex={-1} role="status" className="fd-panel outline-none">
        <p className="lt-label mb-3 text-[var(--tiro-accent)]">Received</p>
        <h3 className="lt-display text-3xl md:text-4xl">Thank you. Your inquiry has been received.</h3>
        <p className="mt-5 max-w-[var(--lt-measure)] text-base leading-relaxed text-[var(--tiro-text-muted)]">
          A person at TIRO reads every inquiry. If a conversation would be useful, we will write to you from custodians@tiro.foundation. Please do not send stories,
          recordings, or other material: we are not collecting any yet.
        </p>
        <p className="mt-4 max-w-[var(--lt-measure)] text-sm leading-relaxed text-[var(--tiro-text-muted)]">
          This did not subscribe you to anything unless you ticked the updates box. To withdraw this inquiry, write to custodians@tiro.foundation.
        </p>
        {demo ? <p className="mt-4 text-sm text-[var(--tiro-accent)]">Local demo: stored in the synthetic local store on this machine only. No email was sent.</p> : null}
      </div>
    );
  }

  if (state.status === "closed") {
    return (
      <div ref={resultRef} tabIndex={-1} role="status" className="fd-panel outline-none">
        <p className="text-base leading-relaxed text-[var(--tiro-text-soft)]">
          The form is not accepting submissions right now, and nothing was stored. Please write to{" "}
          <a className="tiro-link" href="mailto:custodians@tiro.foundation">
            custodians@tiro.foundation
          </a>{" "}
          instead.
        </p>
      </div>
    );
  }

  const describe = (field: string, hint?: string) => [hint, errors[field] ? `${field}-error` : null].filter(Boolean).join(" ") || undefined;

  return (
    <form key={formKey} action={action} noValidate className="space-y-7" aria-describedby="form-scope">
      <p id="form-scope" className="max-w-[var(--lt-measure)] text-sm leading-relaxed text-[var(--tiro-text-muted)]">
        Fields marked “required” are needed to reply to you. Everything else is optional. This form accepts short text only.
      </p>

      {state.status === "refused" || (state.status === "invalid" && errors.form) ? (
        <div ref={resultRef} tabIndex={-1} role="alert" className="border-l-2 border-[var(--tiro-contested)] pl-4 text-sm leading-relaxed text-[var(--tiro-text)] outline-none">
          {state.status === "refused" ? state.message : errors.form}
        </div>
      ) : state.status === "invalid" ? (
        <div ref={resultRef} tabIndex={-1} role="alert" className="border-l-2 border-[var(--tiro-contested)] pl-4 text-sm leading-relaxed text-[var(--tiro-text)] outline-none">
          Please check the {Object.keys(errors).length === 1 ? "field" : `${Object.keys(errors).length} fields`} marked below.
        </div>
      ) : null}

      <input type="hidden" name="formToken" value={formToken} />
      <input type="hidden" name="noticeVersion" value={noticeVersion} />
      {referral ? <input type="hidden" name="referral" value={referral} /> : null}
      {/* Honeypot: hidden from people and assistive technology alike. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label>
          Leave this empty
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <div>
        <label htmlFor="displayName" className="tiro-field-label">
          Name, or how you would like to be addressed <span className="text-[var(--tiro-text-muted)]">(required)</span>
        </label>
        <input id="displayName" name="displayName" defaultValue={v.displayName} className="tiro-input" required maxLength={120} autoComplete="name" aria-invalid={!!errors.displayName} aria-describedby={describe("displayName")} />
        <FieldError id="displayName-error" message={errors.displayName} />
      </div>

      <div>
        <label htmlFor="email" className="tiro-field-label">
          Email address <span className="text-[var(--tiro-text-muted)]">(required)</span>
        </label>
        <input id="email" name="email" type="email" defaultValue={v.email} className="tiro-input" required maxLength={254} autoComplete="email" inputMode="email" aria-invalid={!!errors.email} aria-describedby={describe("email")} />
        <FieldError id="email-error" message={errors.email} />
      </div>

      <fieldset aria-describedby={errors.category ? "category-error" : undefined}>
        <legend className="tiro-field-label">
          Which describes your interest best? <span className="text-[var(--tiro-text-muted)]">(required)</span>
        </legend>
        <p className="tiro-field-hint">This is how you describe yourself. It does not verify or confer any role or authority.</p>
        <div className="mt-3 space-y-3">
          {PUBLIC_CATEGORIES.map((c) => (
            <label key={c.value} className="tiro-check border border-[var(--tiro-border)] p-3.5 hover:border-[var(--tiro-border-strong)]">
              <input type="radio" name="category" value={c.value} defaultChecked={v.category === c.value} required aria-describedby={`cat-${c.value}-hint`} />
              <span>
                <span className="block text-[var(--tiro-text)]">{c.label}</span>
                <span id={`cat-${c.value}-hint`} className="tiro-field-hint">
                  {c.hint}
                </span>
              </span>
            </label>
          ))}
        </div>
        <FieldError id="category-error" message={errors.category} />
      </fieldset>

      <div className="grid gap-7 md:grid-cols-2">
        <div>
          <label htmlFor="organization" className="tiro-field-label">
            Organization <span className="text-[var(--tiro-text-muted)]">(optional)</span>
          </label>
          <input id="organization" name="organization" defaultValue={v.organization} className="tiro-input" maxLength={160} autoComplete="organization" aria-invalid={!!errors.organization} aria-describedby={describe("organization")} />
          <FieldError id="organization-error" message={errors.organization} />
        </div>
        <div>
          <label htmlFor="region" className="tiro-field-label">
            Country or broad region <span className="text-[var(--tiro-text-muted)]">(optional)</span>
          </label>
          <input id="region" name="region" defaultValue={v.region} className="tiro-input" maxLength={80} aria-invalid={!!errors.region} aria-describedby={describe("region", "region-hint")} />
          <span id="region-hint" className="tiro-field-hint">
            Broad only, for example a country. No addresses.
          </span>
          <FieldError id="region-error" message={errors.region} />
        </div>
      </div>

      <fieldset aria-describedby={["topics-hint", errors.topics ? "topics-error" : null].filter(Boolean).join(" ")}>
        <legend className="tiro-field-label">
          What would you like to talk about? <span className="text-[var(--tiro-text-muted)]">(optional)</span>
        </legend>
        <p id="topics-hint" className="tiro-field-hint">
          {TOPICS_GUIDANCE}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {PUBLIC_TOPICS.map((t) => (
            <label key={t.value} className="tiro-check border border-[var(--tiro-border)] p-3 hover:border-[var(--tiro-border-strong)]">
              <input type="checkbox" name="topics" value={t.value} defaultChecked={v.topics?.includes(t.value)} />
              <span>{t.label}</span>
            </label>
          ))}
        </div>
        <FieldError id="topics-error" message={errors.topics} />
      </fieldset>

      <fieldset className="space-y-4 border-t border-[var(--tiro-border)] pt-6">
        <legend className="sr-only">Permissions</legend>
        <div>
          <label className="tiro-check">
            <input type="checkbox" name="noticeAck" value="yes" defaultChecked={v.noticeAck === "yes"} required aria-invalid={!!errors.noticeAck} aria-describedby={errors.noticeAck ? "noticeAck-error" : undefined} />
            <span>
              {CONSENT_WORDING.noticeAck}{" "}
              <a href="#privacy-notice" className="tiro-link">
                Read the notice
              </a>{" "}
              <span className="text-[var(--tiro-text-muted)]">(required)</span>
            </span>
          </label>
          <FieldError id="noticeAck-error" message={errors.noticeAck} />
        </div>
        <div>
          <label className="tiro-check">
            <input type="checkbox" name="replyConsent" value="yes" defaultChecked={v.replyConsent === "yes"} required aria-invalid={!!errors.replyConsent} aria-describedby={errors.replyConsent ? "replyConsent-error" : undefined} />
            <span>
              {CONSENT_WORDING.replyConsent} <span className="text-[var(--tiro-text-muted)]">(required)</span>
            </span>
          </label>
          <FieldError id="replyConsent-error" message={errors.replyConsent} />
        </div>
        <label className="tiro-check">
          <input type="checkbox" name="updatesOptIn" value="yes" defaultChecked={v.updatesOptIn === "yes"} />
          <span>
            {CONSENT_WORDING.updatesOptIn} <span className="text-[var(--tiro-text-muted)]">(optional)</span>
          </span>
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-5">
        <button type="submit" className="tiro-button tiro-button-primary" disabled={pending} aria-disabled={pending}>
          {pending ? "Sending…" : "Send expression of interest"}
        </button>
        <p className="text-sm text-[var(--tiro-text-muted)]" aria-live="polite">
          {pending ? "Sending your inquiry." : ""}
        </p>
      </div>
    </form>
  );
}
