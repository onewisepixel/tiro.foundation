// Disclosure guards: two of the three protections the founder approved on
// 2026-10-30 (docs/design/decisions.md). The third, build-output scanning,
// is scripts/test/verify-disclosure.mjs.
//
//   1. Explicit public-field allowlists. Each record projection declares
//      exactly which fields may reach a page; findOutsideAllowlist reports
//      anything else, at any depth.
//   2. Forbidden-field assertions. findPrivate walks a projection
//      recursively and reports any private KEY, or any VALUE matching a
//      private pattern (canaries), at any depth.
//
// Pure, with no server-only import, so tests can use it anywhere. It
// inspects data; it does not enforce anything at runtime. Enforcement is the
// projection's allow-list construction; these prove it.

// An allowlist: `true` allows a primitive; an object allows exactly its keys;
// a one-element array allows arrays of that shape; "record" allows an object
// with any keys whose values are primitives (e.g. the per-use grant map).
export type Allowlist = true | "record" | readonly [Allowlist] | { readonly [key: string]: Allowlist };

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function findOutsideAllowlist(value: unknown, allow: Allowlist, path = "$"): string[] {
  if (allow === true) {
    return value === null || typeof value !== "object" ? [] : [`${path}: structured value where a primitive is allowed`];
  }
  if (allow === "record") {
    if (!isPlain(value)) return [`${path}: expected an object`];
    return Object.entries(value).flatMap(([k, v]) => (v !== null && typeof v === "object" ? [`${path}.${k}: structured value where a primitive is allowed`] : []));
  }
  if (Array.isArray(allow)) {
    if (!Array.isArray(value)) return [`${path}: expected an array`];
    return value.flatMap((item, i) => findOutsideAllowlist(item, allow[0], `${path}[${i}]`));
  }
  if (!isPlain(value)) return [`${path}: expected an object`];
  const shape = allow as { readonly [key: string]: Allowlist };
  return Object.entries(value).flatMap(([k, v]) => (k in shape ? findOutsideAllowlist(v, shape[k], `${path}.${k}`) : [`${path}.${k}: not in the public allowlist`]));
}

// Keys that exist only inside the internal fixtures. None may appear in a
// projection, at any depth, even with an empty value.
export const PRIVATE_KEYS = [
  // Living Trace archive (src/data/livingTrace/syntheticArchive.ts)
  "internalNotes",
  "authorizedDisclosure",
  "grantRef",
  "disclosure",
  "inNode",
  "visibility",
  // Authority scenario (src/data/livingTrace/authorityScenario.ts)
  "contactRecord",
  "receiptRef",
  "documentRef",
  "authorizedBy",
  "identityPublic",
  "publicLabel",
  "publicRole",
  "mandates",
  "mandate",
  "decisions",
  "requiredFrom",
  "executedBy",
] as const;

export const PRIVATE_VALUES = [/CANARY/];

export function findPrivate(value: unknown, keys: readonly string[] = PRIVATE_KEYS, values: readonly RegExp[] = PRIVATE_VALUES, path = "$"): string[] {
  if (typeof value === "string") {
    return values.some((re) => re.test(value)) ? [`${path}: private value`] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => findPrivate(v, keys, values, `${path}[${i}]`));
  }
  if (isPlain(value)) {
    return Object.entries(value).flatMap(([k, v]) => [...(keys.includes(k) ? [`${path}.${k}: private key`] : []), ...findPrivate(v, keys, values, `${path}.${k}`)]);
  }
  return [];
}

// The Living Trace public record shape (SpecimenRecord in projection.ts),
// declared here so the shared projection module stays unchanged.
export const SPECIMEN_PUBLIC_FIELDS = {
  recordId: true,
  recordKind: true,
  synthetic: true,
  title: true,
  summary: true,
  source: { label: true, note: true },
  capacities: [{ capacity: true, value: true, evidence: true }],
  context: [{ field: true, value: true, evidence: true, note: true }],
  publicationStatus: true,
  custodyStatus: true,
  uses: "record",
  withdrawal: true,
  provenance: [{ at: true, event: true, actor: true, evidence: true }],
  media: { kind: true, note: true },
  transcript: { note: true },
  aiProcessing: true,
} as const satisfies Allowlist;

export const RESTRICTED_NOTICE_FIELDS = { reference: true, notice: true, mayContact: true } as const satisfies Allowlist;
