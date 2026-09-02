import type { Metadata } from "next";
import TiroMark from "@/components/TiroMark";

export const metadata: Metadata = {
  title: "Manifesto v0.2 — The Tiro Foundation",
  description:
    "There is enlightenment in exploration, but empathy is essential. TIRO's founding manifesto on memory, intelligence, and stewardship.",
};

const preludeParagraphs = [
  "Humanity has always been defined by its ability to transmit.",
  "A story remembered beyond the life of its teller. A language carried across generations. A lesson preserved after the circumstances that produced it have disappeared. A question inherited by people not yet born.",
  "Civilization is not merely what humanity builds. It is what humanity manages not to forget.",
  "Today, our capacity to create, record, compute, and communicate is expanding at extraordinary speed. Intelligence is becoming abundant. Information is becoming effectively infinite. Systems increasingly mediate how people learn, remember, create, govern, and understand one another.",
  "But greater capability does not guarantee greater wisdom.",
  "Technology can preserve memory or flatten it. It can connect cultures or extract from them. It can expand human agency or quietly replace it. It can carry meaning forward or produce so much noise that meaning becomes impossible to distinguish.",
  "TIRO exists in that tension.",
  "We believe technological progress can remain recognizably human. We believe the future should inherit not only humanity's information, but its context, contradictions, languages, stories, perspectives, and memory. We believe this requires deliberate stewardship.",
];

const sections: { numeral: string; title: string; paragraphs: string[] }[] = [
  {
    numeral: "I",
    title: "Memory",
    paragraphs: [
      "Memory is not simply data about the past. It is continuity.",
      "Human knowledge has never existed exclusively in libraries, institutions, databases, or written records. It lives in voices. In rituals. In names. In songs. In techniques learned by watching. In stories repeated at tables and under trees. In languages whose meanings cannot always survive translation.",
      "Some of this knowledge is documented. Much of it is not.",
      "Every time a language falls silent, an elder dies unheard, an archive deteriorates, or a community loses control of its own history, humanity's inheritance becomes smaller.",
      "TIRO exists to resist that loss.",
      "But preservation cannot become possession. To record something does not make it ours. To store something does not give us authority over it. To make knowledge accessible does not erase the rights, intentions, or dignity of the people from whom it came.",
      "TIRO therefore approaches memory as a custodian. We preserve without claiming ownership. We document without pretending neutrality means absence of responsibility. We seek provenance, context, consent, and continuity. We collect not for curation, but for connection. We record not merely for preservation, but for transmission.",
      "Because culture is infrastructure. And archives are sacred.",
    ],
  },
  {
    numeral: "II",
    title: "Intelligence",
    paragraphs: [
      "Intelligence is a tool. It is not the mission.",
      "The technologies available to humanity will continue to change. Artificial intelligence will become more capable. Interfaces will disappear and reappear. Models, platforms, devices, and architectures that seem permanent today will eventually become historical artifacts themselves.",
      "TIRO cannot be bound to any of them.",
      "Our responsibility is not to a particular technology. It is to what technology can help humanity preserve, understand, transmit, and discover.",
      "We build tools for continuity. Tools should make memory more accessible without making it less human. They should help a person encounter a voice rather than replace that voice. They should reveal provenance rather than manufacture authority. They should help communities preserve knowledge without requiring those communities to surrender control of it. They should extend human capability without quietly redefining human value.",
      "For TIRO, intelligence therefore includes restraint. The question is never only whether something can be built. We must also ask: Should it be built? Who benefits from it? Whose knowledge does it contain? Who has authority over that knowledge? What happens when the technology outlives its creators? And what must remain human even when automation becomes possible?",
      "Empathy is a technical requirement. Systems inherit the values of their creators. Aesthetics shape cognition. Thoughtful restraint is a form of intelligence.",
    ],
  },
  {
    numeral: "III",
    title: "Stewardship",
    paragraphs: [
      "Some things become more important when no one can own them completely. Memory is one of them.",
      "TIRO seeks to become a neutral, trusted custodian for human memory. Neutrality does not mean indifference. It means that custody should not confer authority to rewrite, exploit, commercialize, or erase what has been entrusted.",
      "A custodian protects. A custodian preserves provenance. A custodian remembers obligations as carefully as it remembers objects. A custodian builds systems capable of surviving individual people, individual technologies, individual institutions, and eventually individual generations.",
      "This requires permanence by design. Redundancy. Transparency. Accountability. Distributed trust. Institutional memory. Governance capable of surviving its founders. And the humility to recognize that TIRO itself must never become more important than the memory it exists to protect.",
      "The measure of TIRO will therefore not be how much it owns. It will be how much remains because it existed.",
    ],
  },
  {
    numeral: "IV",
    title: "The Principle of the Node",
    paragraphs: [
      "TIRO begins with a node. A node is not a center. It is a point of connection.",
      "A node listens. A node remembers. A node bears witness. It receives what has been entrusted to it, preserves the relationship between knowledge and its source, and transmits only what it has the right to transmit.",
      "A node does not need to possess everything around it to strengthen the network. Its value comes from connection, integrity, and trust.",
      "This principle extends beyond technology. A person can be a node. A community can be a node. An archive can be a node. A university, library, village, museum, language group, or institution can become a node. TIRO itself is a node.",
      "The ambition is not to construct a single repository into which the world's memory disappears. It is to help create an enduring network through which memory can survive.",
      "Origin. Transmission. Resonance. Every node carries something forward.",
    ],
  },
  {
    numeral: "V",
    title: "The Witness",
    paragraphs: [
      "There is a difference between speaking for someone and allowing someone to be heard. TIRO chooses the latter.",
      "As intelligent systems become capable of synthesizing enormous bodies of human knowledge, the temptation will be to allow them to become authorities over that knowledge. TIRO rejects that role.",
      "Our systems should be witnesses before they are interpreters. Where possible, they should lead people toward the human source: the speaker, the recording, the document, the community, the history, the provenance, the uncertainty, the competing account.",
      "Technology may help translate. It may help search. It may connect fragments separated by geography, language, or time. It may reveal relationships no individual could discover alone. But it must never confuse synthesis with ownership or confidence with truth.",
      "Humanity does not need another machine claiming to remember on its behalf. It needs systems that help humanity remember for itself.",
    ],
  },
  {
    numeral: "VI",
    title: "The Long View",
    paragraphs: [
      "TIRO is being built for people we will never meet. That changes the work.",
      "A system designed for a quarter behaves differently from one designed for a century. A project designed around its founder behaves differently from an institution designed to survive one. An archive designed for engagement behaves differently from one designed for inheritance.",
      "We choose the long view. This means accepting that much of TIRO's most important work may be quiet.",
      "A recording safely duplicated. A language documented before its last fluent speakers disappear. A provenance chain preserved. A community retaining control over material others would have extracted. A researcher finding something decades after it was recorded. A descendant hearing the voice of an ancestor who expected only to be remembered.",
      "These may never become spectacular achievements. They are enough. Permanence is its own form of ambition.",
    ],
  },
  {
    numeral: "VII",
    title: "Our Obligation",
    paragraphs: [
      "TIRO does not begin with the assumption that humanity's memory belongs in one place. It begins with an obligation:",
      "What has been entrusted should not be carelessly lost. What belongs to a people should not become ours merely because we preserved it. What technology makes possible should remain accountable to the humans it affects. What we build should be capable of surviving us. And what survives us should carry forward more than information.",
      "It should carry meaning.",
      "TIRO began as an attempt to reconcile technological acceleration with human meaning. That remains the work.",
      "Memory gives us continuity. Intelligence gives us capability. Stewardship gives us direction. Together, they offer the possibility of progress that remains recognizably human.",
      "We do not know what humanity will become. We can help ensure it remembers what it has been.",
    ],
  },
];

export default function ManifestoPage() {
  return (
    <main className="relative min-h-screen bg-[var(--tiro-bg)] pt-28 text-[var(--tiro-text)] md:pt-32">
      <section className="px-6 pb-14 pt-8 text-center md:pb-16 md:pt-12">
        <TiroMark variant="primary" className="mx-auto mb-8 h-16 w-auto text-[var(--tiro-mark)] md:h-20" />

        <p className="tiro-eyebrow mb-6">Manifesto v0.2</p>

        <h1 className="mx-auto mb-10 max-w-2xl font-[family-name:var(--font-display)] text-3xl italic leading-snug tracking-tight md:text-5xl">
          There is enlightenment in exploration, but empathy is essential.
        </h1>

        <hr className="tiro-rule mx-auto w-16" />
      </section>

      <section className="px-6 pb-16 md:pb-20">
        <div className="mx-auto max-w-2xl space-y-5 text-sm leading-[1.9] text-[var(--tiro-text-muted)] md:text-base">
          {preludeParagraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </section>

      <section className="px-6 pb-16 md:pb-20">
        <div className="tiro-card mx-auto max-w-2xl text-center">
          <p className="font-[family-name:var(--font-display)] text-xl italic leading-relaxed text-[var(--tiro-text-soft)] md:text-2xl">
            &ldquo;Civilization is not merely what humanity builds. It is what
            humanity manages not to forget.&rdquo;
          </p>
        </div>
      </section>

      {sections.map((section) => (
        <section key={section.numeral} className="px-6 pb-16 md:pb-20">
          <div className="mx-auto max-w-2xl">
            <p className="tiro-eyebrow mb-4">{section.numeral}</p>
            <h2 className="mb-6 font-[family-name:var(--font-display)] text-2xl italic tracking-tight text-[var(--tiro-text)] md:text-3xl">
              {section.title}
            </h2>
            <div className="space-y-5 text-sm leading-[1.9] text-[var(--tiro-text-muted)] md:text-base">
              {section.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </div>
          <hr className="tiro-rule mx-auto mt-16 max-w-2xl md:mt-20" />
        </section>
      ))}

      <section className="px-6 pb-28 text-center md:pb-36">
        <div className="mx-auto max-w-xl">
          <p className="mb-10 font-[family-name:var(--font-display)] text-xl italic leading-relaxed text-[var(--tiro-text-soft)] md:text-2xl">
            There is enlightenment in exploration, but empathy is essential.
          </p>
          <p className="font-[family-name:var(--font-logo)] text-sm uppercase tracking-[0.2em] text-[var(--tiro-text)]">
            TIRO
          </p>
          <p className="mt-2 font-[family-name:var(--font-code)] text-xs uppercase tracking-[0.2em] text-[var(--tiro-text-subtle)]">
            Memory. Intelligence. Stewardship.
          </p>
        </div>
      </section>
    </main>
  );
}
