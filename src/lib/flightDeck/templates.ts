// Sample campaign and message templates (Flight Deck directive §8).
//
// These are DRAFTS FOR REVIEW, not activated content. Each cites the
// public, accepted source it draws on. None claims a partnership, a
// participant, a collection outcome, a count, incorporation, or tax status,
// and none asks anyone for memories, recordings, or material. They are
// deterministic text, not model output; [bracketed] slots are filled by a
// person before review.
import type { ContentChannel } from "./types";

export type ContentTemplate = {
  key: string;
  title: string;
  channel: ContentChannel;
  originCategory: "abstraction" | "demonstration" | "evidence";
  sourceReference: string;
  assetDescription: string | null;
  body: string;
};

export const CONTENT_TEMPLATES: ContentTemplate[] = [
  {
    key: "why-tiro-exists",
    title: "Introduction: why TIRO exists",
    channel: "instagram",
    originCategory: "abstraction",
    sourceReference: "Manifesto v0.2, opening and §I (accepted 2026-10-02)",
    assetDescription: "The approved TIRO mark on the Indigo ground. Original geometry; depicts no person, place, or culture.",
    body: [
      "Civilization is not merely what humanity builds. It is what humanity manages not to forget.",
      "",
      "TIRO is being built as a custodian for memory: languages, stories, and knowledge carried with their context, and with the rights of the people they come from intact.",
      "",
      "To record something does not make it ours. To store something does not give us authority over it.",
      "",
      "Read the Manifesto: tiro.foundation/manifesto",
    ].join("\n"),
  },
  {
    key: "custody-not-ownership",
    title: "Custody, not ownership",
    channel: "linkedin",
    originCategory: "abstraction",
    sourceReference: "Community Rights & Cultural Data Stewardship, “Custody, not ownership” and “Source authority” (/community-rights)",
    assetDescription: "Text-only post, or the six-primitive boundary diagram labeled as a diagram.",
    body: [
      "Custody, not ownership.",
      "",
      "Communities and contributors remain the cultural and intellectual principals of what they entrust. TIRO's role is custodian, not owner.",
      "",
      "That is why authority and consent come before anything else in how TIRO is being designed. Who has authority over a memory is a separate question from who recorded it, who submitted it, or who signed a form. Where authority is shared, disputed, or uncertain, the record has to say so.",
      "",
      "Our stewardship policy: tiro.foundation/community-rights",
    ].join("\n"),
  },
  {
    key: "pilot-begins-with-listening",
    title: "Why a pilot begins with listening",
    channel: "linkedin",
    originCategory: "abstraction",
    sourceReference: "Manifesto v0.2 §III–IV; /pilot status statement",
    assetDescription: null,
    body: [
      "TIRO is exploring a first, bounded pilot. It begins with conversations, not collection.",
      "",
      "Before any memory is recorded, the people and communities it belongs to need to shape what a pilot is, who decides, and what it must never do. We are inviting conversations with community representatives, archivists, researchers, and translators.",
      "",
      "We are not accepting recordings, stories, or cultural material at this stage.",
      "",
      "If you would like to talk: tiro.foundation/pilot",
    ].join("\n"),
  },
  {
    key: "what-participation-can-mean",
    title: "What participation can mean",
    channel: "instagram",
    originCategory: "abstraction",
    sourceReference: "/pilot “Ways to participate”",
    assetDescription: "Four short text cards on the Paper register. No portraits, no stock imagery.",
    body: [
      "What participation in a TIRO pilot could mean:",
      "",
      "Community advisor: helping decide what a pilot should and should not do.",
      "Researcher or archivist: bringing practice in provenance, preservation, and ethics.",
      "Translator: carrying meaning across languages without flattening it.",
      "Potential contributor: someone who may, later and only with explicit consent, entrust material.",
      "",
      "Expressing interest is the start of a conversation. It does not mean selection, and it commits no one to anything.",
      "",
      "tiro.foundation/pilot",
    ].join("\n"),
  },
  {
    key: "founder-progress-note",
    title: "Founder progress note",
    channel: "newsletter",
    originCategory: "evidence",
    sourceReference: "Repository status at time of writing: docs/design/living-trace.md, docs/backend/status.md, docs/flight-deck/acceptance.md",
    assetDescription: "Optional screenshot of the public site, labeled with its date. Demonstration records must be labeled as demonstrations.",
    body: [
      "A short note on where TIRO stands. [Founder: confirm every line against current evidence before review.]",
      "",
      "Built: the public site and its design language; a demonstration of how a record shows its source, consent, and boundaries, using clearly labeled synthetic examples; and the beginnings of a private system for looking after relationships and correspondence.",
      "",
      "Not built, and not claimed: any collection of real memories. That waits on community consultation, legal and stewardship review, and tested procedures for consent, withdrawal, and restoration.",
      "",
      "Still under review: the record and relationship contract that will govern how memories are described.",
      "",
      "[One sentence on what is next.]",
      "",
      "You are receiving this because you asked for updates. Unsubscribe: [unsubscribe link]",
    ].join("\n"),
  },
];

export type MessageTemplate = { key: string; label: string; purpose: "first-contact" | "follow-up" | "reply"; subject: string; body: string };

const SIGNATURE = ["[Founder name]", "The Tiro Foundation (TIRO)", "custodians@tiro.foundation", "tiro.foundation"].join("\n");

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    key: "institutional-introduction",
    label: "One-to-one institutional introduction",
    purpose: "first-contact",
    subject: "An exploratory conversation about community-led memory preservation",
    body: [
      "Dear [name],",
      "",
      "I am writing from TIRO, a project developing custodial systems for cultural and linguistic memory. I found [organization]'s [specific public work, with where you saw it], and it is closely related to what we are trying to do well: [one sentence on the specific relevance].",
      "",
      "TIRO is at an early stage. We are exploring a bounded pilot and are not collecting any material. Before anything is built further, we want to learn from people with experience in [archiving / community stewardship / language work].",
      "",
      "Would you be open to a short, exploratory conversation? There is no commitment involved, and I am happy to share our stewardship principles beforehand: tiro.foundation/community-rights",
      "",
      "If you would rather not hear from us again, reply and say so, and we will not contact you further.",
      "",
      "With thanks,",
      SIGNATURE,
    ].join("\n"),
  },
  {
    key: "inquiry-reply",
    label: "Reply to an inquiry",
    purpose: "reply",
    subject: "Re: your interest in the TIRO pilot",
    body: [
      "Dear [name],",
      "",
      "Thank you for writing to TIRO about the pilot. [One or two sentences responding to what they actually said.]",
      "",
      "The pilot is still being shaped, and we are not collecting any material yet. If it would help, I would be glad to arrange a short conversation: [proposed times or a scheduling link approved for use].",
      "",
      "If you would prefer we did not write again, just reply and say so.",
      "",
      "With thanks,",
      SIGNATURE,
    ].join("\n"),
  },
  {
    key: "single-follow-up",
    label: "Single follow-up (no further messages)",
    purpose: "follow-up",
    subject: "Following up, once",
    body: [
      "Dear [name],",
      "",
      "I wrote on [date] about [topic]. I am following up once in case it was missed; I will not write again about this unless you reply.",
      "",
      "With thanks,",
      SIGNATURE,
    ].join("\n"),
  },
];

// Transactional only. Sent in response to a submission the person just
// made; it carries no marketing, adds them to nothing, and says plainly
// what happens next without promising a turnaround.
export function acknowledgementMessage(displayName: string) {
  return {
    subject: "We received your note about the TIRO pilot",
    body: [
      `Dear ${displayName},`,
      "",
      "Thank you for your interest in the TIRO pilot. This is an automatic confirmation that we received your inquiry.",
      "",
      "A person at TIRO reads every inquiry. If a conversation would be useful, we will write to you from custodians@tiro.foundation. We are not collecting any memories, recordings, or material at this stage, so please do not send any.",
      "",
      "This message does not subscribe you to anything. If you would like us to delete your inquiry or not contact you, reply to this message or write to custodians@tiro.foundation.",
      "",
      "The Tiro Foundation (TIRO)",
    ].join("\n"),
  };
}

export function optOutConfirmationMessage(displayName: string, scope: "all" | "outreach" | "newsletter") {
  const what = scope === "newsletter" ? "occasional updates" : scope === "outreach" ? "further outreach" : "any further contact";
  return {
    subject: "Confirmed: you will not receive further messages",
    body: [
      `Dear ${displayName},`,
      "",
      `This confirms that TIRO will not send you ${what}. You do not need to do anything else.`,
      "",
      "We keep only a protected record that you opted out, so that we do not contact you again by mistake. To ask us to delete anything else we hold, write to custodians@tiro.foundation.",
      "",
      "The Tiro Foundation (TIRO)",
    ].join("\n"),
  };
}
