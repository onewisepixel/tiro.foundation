// Public wording for the /pilot interest form. One source for what the
// page shows and what the server stores: the exact checkbox wording and
// its version are recorded with every permission, so it can be reproduced
// later. Changing any string here requires bumping the matching version
// in config.ts (PILOT_FORM_VERSION / PRIVACY_NOTICE_VERSION).
import type { ParticipationInterest } from "./types";

export const PUBLIC_CATEGORIES: { value: Exclude<ParticipationInterest, "institution">; label: string; hint: string }[] = [
  {
    value: "interested-contributor",
    label: "I may want to contribute to a future pilot",
    hint: "You would like to hear how a pilot might work before deciding anything.",
  },
  {
    value: "community-partner",
    label: "I represent, or work with, a community or organization",
    hint: "For example a community association, archive, library, or cultural institution. This does not confirm anyone's authority; that is established later, in consultation.",
  },
  {
    value: "specialist-volunteer",
    label: "I am a researcher, archivist, translator, or volunteer",
    hint: "You have skills a pilot could need, and would like to talk about them.",
  },
];

export const CONSENT_WORDING = {
  noticeAck: "I have read the privacy notice for this form and understand how TIRO will use these details.",
  replyConsent: "TIRO may reply to me by email about this inquiry.",
  updatesOptIn: "Also send me occasional updates about TIRO's work. This is separate from my inquiry, and I can unsubscribe at any time.",
} as const;

export const NOTE_GUIDANCE =
  "Optional, up to 500 characters: why you are interested, or what you would like to talk about. Please do not include stories, memories, personal or sensitive details, or links to any material. We are not collecting any of these yet.";

export const NOTE_MAX = 500;

// DRAFT privacy notice for the interest form. Proposed wording only: it has
// not had legal review, and the form must not open to the public until it
// has (docs/flight-deck/privacy-launch-gates.md). Kept short and literal.
export const PRIVACY_NOTICE_DRAFT: { heading: string; body: string }[] = [
  {
    heading: "What this form collects",
    body: "The name or form of address you give, your email address, the kind of interest you choose, and, only if you provide them, an organization, a broad region, and a short note. It also records which version of this notice you were shown and when you submitted.",
  },
  {
    heading: "What it is used for",
    body: "To read your inquiry, reply to you about it, and, if a conversation follows, keep a simple record of that conversation. If you separately tick the updates box, to send occasional updates. Nothing else.",
  },
  {
    heading: "What it is not",
    body: "Submitting this form is not consent to collect, preserve, or publish any memory, story, or cultural material, and it does not name you publicly. It does not confirm anyone's authority to speak for a community. Those are separate decisions, made later and only with their own explicit consent.",
  },
  {
    heading: "Where it is kept and who sees it",
    body: "In TIRO's private operations records, separate from the Memory Project archive, visible only to the people at TIRO who handle inquiries. The storage provider and its location will be named here before this form opens.",
  },
  {
    heading: "How long it is kept",
    body: "Proposed: an inquiry that does not lead to a conversation is deleted twelve months after its last activity. If you ask us to stop contacting you, we keep only a protected record that you opted out, so we do not contact you again.",
  },
  {
    heading: "Your choices",
    body: "You can ask what we hold about you, ask us to correct or delete it, or ask us to stop contacting you, by writing to custodians@tiro.foundation. Unsubscribing from updates does not prevent a reply to an inquiry you have made, unless you ask us to stop all contact.",
  },
];
