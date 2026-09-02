export type MemoryMedia = {
  type: "image" | "audio" | "video" | "none";
  src?: string;
  alt?: string;
  caption?: string;
  duration?: string;
  credit?: string;
};

export type RelatedNode = {
  label: string;
  type: "Person" | "Place" | "Theme" | "Institution" | "Language";
  href?: string;
};

export type MemoryRecord = {
  id: string;
  recordId: string;
  archiveStatus: string;
  lastReviewed: string;
  accessLevel: string;
  confidenceLevel?: string;
  multipleVersions?: string;
  translatorNotes?: string;
  disputedDetails?: string;
  communityAnnotations?: string;
  title: string;
  summary: string;
  location: string;
  language: string;
  era: string;
  contributor: string;
  sourceAuthority: string;
  legalRights?: string;
  consentStatus: string;
  consentWithdrawal: string;
  provenance: string;
  rightsUsage: string;
  sensitivity?: string;
  media: MemoryMedia;
  transcript: string;
  culturalContext: string;
  tags: string[];
  relatedNodes: RelatedNode[];
  relatedMemories: {
    title: string;
    summary: string;
    href: string;
  }[];
};

export const memories: MemoryRecord[] = [
  {
    id: "lagos-port-harcourt-migration",
    recordId: "TIR-MEM-0001",
    archiveStatus: "Verified",
    lastReviewed: "2026-06-04",
    accessLevel: "Public",
    confidenceLevel: "High (oral account cross-checked with two community witnesses)",
    multipleVersions:
      "Version 1.2 (2026-06-04) — minor transcript punctuation and time-marker clarifications.",
    translatorNotes:
      "Certain Pidgin phrases retain original cadence to preserve relational meaning.",
    disputedDetails:
      "Year of first relocation is remembered as either 1988 or 1989 across family retellings.",
    communityAnnotations:
      "Local reviewers noted that dock labor references map to a wider informal hiring network in the period.",
    title: "Migration Story from Lagos to Port Harcourt",
    summary:
      "A family recollection from the late 1980s tracing movement, labor, and belonging across Nigerian urban communities.",
    location: "Lagos and Port Harcourt, Nigeria",
    language: "Nigerian Pidgin and English",
    era: "Late 1980s to early 1990s",
    contributor:
      "Recorded with Elder Chidinma N. by TIRO field researcher A. Okafor",
    sourceAuthority:
      "Elder Chidinma N. and the family whose migration this account describes",
    consentStatus: "Explicitly granted for educational and archival use",
    consentWithdrawal:
      "Elder Chidinma N. or a designated family representative may request withdrawal or restriction at any time by contacting TIRO with record ID TIR-MEM-0001. TIRO will cease public access and distribution within its systems; a preservation copy may be retained per the terms disclosed at consent.",
    provenance:
      "Captured during a neighborhood oral-history session in Diobu, with audio witness confirmation and local steward review before cataloging.",
    rightsUsage:
      "May be quoted for non-commercial education and research with full attribution. Commercial reuse requires renewed contributor authorization.",
    sensitivity: "General historical account; no public redaction required.",
    media: {
      type: "audio",
      caption:
        "Session excerpt from the contributor's migration account, preserved in voice-first format.",
      duration: "04:26",
      credit: "TIRO Memory Workshop Field Capture (Demo Placeholder)",
    },
    transcript: `I still remember the morning we left Lagos. The lorry was loaded before first light, and my mother kept counting the bags like each one was a person.

In Lagos, everything was movement and noise. In Port Harcourt, we had to learn the rhythm again. New streets, new prices, new people, but the same hunger to belong.

At first, my father worked at the docks on temporary shifts. My mother sold cooked beans by the roadside until she could rent a small stall. What saved us was not money first. It was people. Neighbors who showed us where to fetch water, which church could help with school uniforms, and who to trust in the market.

When I tell this story now, I do not tell it as struggle only. I tell it as memory of how a family becomes community when strangers choose to carry each other for a while.`,
    culturalContext:
      "This record documents social infrastructure often absent from formal policy archives: neighborhood trust, kinship labor, and language adaptation during internal migration. It demonstrates why custodial memory systems must preserve lived context in addition to event chronology.",
    tags: [
      "Oral History",
      "Migration",
      "Nigeria",
      "Urban Memory",
      "Kinship",
      "Labor",
    ],
    relatedNodes: [
      { label: "Lagos", type: "Place", href: "/nodes/lagos" },
      { label: "Port Harcourt", type: "Place" },
      { label: "Internal Migration", type: "Theme" },
      { label: "Nigerian Pidgin", type: "Language", href: "/nodes/nigerian-pidgin" },
      { label: "Informal Labor", type: "Theme" },
    ],
    relatedMemories: [
      {
        title: "Childhood Memory of Rain Season in Enugu",
        summary:
          "An account of monsoon routines, school life, and neighborhood preparation in southeastern Nigeria.",
        href: "/memories/rain-season-enugu",
      },
      {
        title: "Market Song Remembered in Lagos",
        summary:
          "A preserved performance fragment linking commerce, rhythm, and collective memory.",
        href: "/memories/market-song-lagos",
      },
    ],
  },
  {
    id: "rain-season-enugu",
    recordId: "TIR-MEM-0002",
    archiveStatus: "Verified",
    lastReviewed: "2026-06-04",
    accessLevel: "Public",
    confidenceLevel: "Moderate-High (single narrator, context reviewed by language steward)",
    translatorNotes:
      "Original Igbo weather idioms are translated with bracketed sense-equivalents in internal notes.",
    title: "Childhood Memory of Rain Season in Enugu",
    summary:
      "A recollection of daily life shaped by seasonal rain, from shared drainage work to evening storytelling.",
    location: "Enugu, Nigeria",
    language: "English and Igbo",
    era: "Early 1990s",
    contributor:
      "Shared by Nkem O. during TIRO community memory circle, translated with contributor review",
    sourceAuthority: "Nkem O. and the Achara Layout community memory circle",
    consentStatus: "Explicitly granted for public educational display",
    consentWithdrawal:
      "Nkem O. may request withdrawal or restriction at any time by contacting TIRO with record ID TIR-MEM-0002. TIRO will cease public access and distribution within its systems; a preservation copy may be retained per the terms disclosed at consent.",
    provenance:
      "Recorded in a facilitated workshop in Achara Layout with transcript review by contributor and language steward.",
    rightsUsage:
      "Open for educational citation with attribution. No synthetic voice replication or derivative dramatization without additional consent.",
    media: {
      type: "image",
      alt: "Archival placeholder plate for rain-season neighborhood memory",
      caption:
        "Archival plate placeholder representing family drainage work before evening rainfall.",
      credit: "TIRO Memory Workshop Visual Placeholder",
    },
    transcript: `Rain season changed our timetable. Before school we checked the gutter near the compound to make sure water could pass. If the sky turned dark by afternoon, everyone rushed home early.

When rain came hard, the whole street sounded like one drum. Afterward, elders sat outside and compared the season with older years: which roofs held, which roads failed, which families had to move.

For us children, rain was both work and wonder. We carried sandbags, then sat with our aunties to hear stories while clothes dried by the kitchen fire.`,
    culturalContext:
      "The memory records ecological adaptation at household scale: communal drainage, weather interpretation, and oral intergenerational learning. It captures how climate and culture shape routine labor and local identity.",
    tags: ["Climate Memory", "Enugu", "Family", "Infrastructure", "Igbo"],
    relatedNodes: [
      { label: "Enugu", type: "Place" },
      { label: "Seasonal Rain", type: "Theme" },
      { label: "Household Infrastructure", type: "Theme" },
      { label: "Igbo", type: "Language" },
    ],
    relatedMemories: [
      {
        title: "Migration Story from Lagos to Port Harcourt",
        summary:
          "A family recollection tracing movement, labor, and belonging across Nigerian cities.",
        href: "/memories/lagos-port-harcourt-migration",
      },
      {
        title: "Market Song Remembered in Lagos",
        summary:
          "A preserved market performance linking rhythm with trade memory.",
        href: "/memories/market-song-lagos",
      },
    ],
  },
  {
    id: "market-song-lagos",
    recordId: "TIR-MEM-0003",
    archiveStatus: "Verified",
    lastReviewed: "2026-06-04",
    accessLevel: "Public",
    confidenceLevel: "Moderate (performance memory reconstructed from recollection)",
    multipleVersions:
      "Version 1.1 (2026-06-04) — chorus segmentation adjusted after performer review.",
    disputedDetails:
      "Some lyrical lines vary between contributor and secondary listeners from the same market era.",
    title: "Market Song Remembered in Lagos",
    summary:
      "A remembered call-and-response fragment from roadside trading, documented as both performance and economic signal.",
    location: "Lagos Island, Nigeria",
    language: "Yoruba and Nigerian Pidgin",
    era: "Mid 1970s recollected in 2000s",
    contributor: "Narrated and sung by Elder Fatai A. in TIRO oral archive session",
    sourceAuthority:
      "Elder Fatai A. and the Lagos Island trading community the song originates from",
    consentStatus: "Granted with performance context restrictions",
    consentWithdrawal:
      "Elder Fatai A. may request withdrawal or restriction at any time by contacting TIRO with record ID TIR-MEM-0003. TIRO will cease public access and distribution within its systems; a preservation copy may be retained per the terms disclosed at consent.",
    provenance:
      "Captured in a supervised oral-history studio session; melodic phrases reviewed with contributor for contextual accuracy.",
    rightsUsage:
      "Playback permitted for scholarship and educational exhibition. Standalone commercial music sampling is not authorized.",
    media: {
      type: "video",
      caption:
        "Performance documentation placeholder for market song cadence and gesture.",
      duration: "02:11",
      credit: "TIRO Studio Documentation (Demo Placeholder)",
    },
    transcript: `The song began as invitation, then warning, then humor. A seller could signal low stock, better price, or fresh goods only by changing rhythm and tone.

Some lines were fixed, but many were improvised based on weather, police presence, or crowd mood. Older traders said the song kept memory of market ethics: fairness, wit, and timing.

Even after loudspeakers arrived, fragments remained. People still recognized who had sung by listening to one phrase.`,
    culturalContext:
      "This record demonstrates voice as market infrastructure. Songs carried information, reputational signals, and social regulation. Preserving performance memory supports future study of language, economics, and urban sound culture.",
    tags: ["Market Culture", "Lagos", "Performance", "Yoruba", "Oral Tradition"],
    relatedNodes: [
      { label: "Lagos", type: "Place", href: "/nodes/lagos" },
      { label: "Lagos Island", type: "Place" },
      { label: "Market Song", type: "Theme" },
      { label: "Yoruba", type: "Language" },
      { label: "Nigerian Pidgin", type: "Language", href: "/nodes/nigerian-pidgin" },
      { label: "Informal Trade", type: "Theme" },
    ],
    relatedMemories: [
      {
        title: "Migration Story from Lagos to Port Harcourt",
        summary:
          "A family recollection tracing movement, labor, and belonging across Nigerian cities.",
        href: "/memories/lagos-port-harcourt-migration",
      },
      {
        title: "Childhood Memory of Rain Season in Enugu",
        summary:
          "An account of monsoon routines and neighborhood resilience in Enugu.",
        href: "/memories/rain-season-enugu",
      },
    ],
  },
];

export function getMemoryById(id: string): MemoryRecord | undefined {
  return memories.find((memory) => memory.id === id);
}
