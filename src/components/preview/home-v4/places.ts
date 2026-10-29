// The six places of Fig. 1, one per movement, inland to open water. Plain
// data, shared by the drawing (a client component) and the page's section
// kickers (server-rendered). x/y place each numbered callout in the
// drawing's 2400 x 640 units; `to` is where its leader line ends.
export type Place = { n: number; name: string; movement: string; gloss: string; href: string | null; x: number; y: number; to: number; left?: boolean };

export const PLACES: Place[] = [
  { n: 1, name: "Canopy", movement: "Encounter", gloss: "One shelter, many supports.", href: null, x: 420, y: 40, to: 128 },
  { n: 2, name: "Terraces", movement: "Witness", gloss: "One voice, many listeners.", href: "#witness", x: 1040, y: 345, to: 426 },
  { n: 3, name: "Raised archive", movement: "Preserve", gloss: "Held above the high-water line.", href: "#preserve", x: 1570, y: 325, to: 378 },
  { n: 4, name: "Boardwalks", movement: "Discover", gloss: "Paths that connect without merging.", href: "#discover", x: 1760, y: 395, to: 450 },
  { n: 5, name: "Closed room", movement: "Respect", gloss: "A room with no public door.", href: "#respect", x: 2025, y: 340, to: 398 },
  { n: 6, name: "Pier's end", movement: "Participate", gloss: "Where the next record begins.", href: "#participate", x: 2250, y: 395, to: 458, left: true },
];
