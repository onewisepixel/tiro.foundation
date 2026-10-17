// Actors, server-side authorization, and the append-only audit trail.
import { newId } from "./ids";
import type { OpsTx } from "./store";
import type { Role } from "./types";

export type Actor = { id: string; role: Role; displayName: string } | { id: "system"; role: "system"; displayName: "Flight Deck automation" };
export type PublicActor = { id: "public"; role: "public" };

export const SYSTEM: Actor = { id: "system", role: "system", displayName: "Flight Deck automation" };
export const PUBLIC: PublicActor = { id: "public", role: "public" };

export const CAPABILITIES = [
  "read",
  "edit-relationships",
  "edit-drafts",
  "approve",
  "dispatch",
  "manage-suppression",
  "delete-records",
  "export",
  "pause",
  "resume",
  "settings",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

// founder: everything. operator: day-to-day preparation, never approval,
// resumption, or deletion. reviewer: read and decide, never edit — so an
// approval is never granted by the person who wrote the draft unless that
// person is the founder. Anyone may pause.
const GRANTS: Record<Role | "system", readonly Capability[]> = {
  founder: CAPABILITIES,
  operator: ["read", "edit-relationships", "edit-drafts", "dispatch", "manage-suppression", "export", "pause"],
  reviewer: ["read", "approve", "pause"],
  system: ["read", "dispatch", "manage-suppression"],
};

export class AccessDenied extends Error {
  constructor(readonly capability: Capability) {
    super(`not permitted: ${capability}`);
  }
}

export function can(actor: Actor | null | undefined, capability: Capability): boolean {
  return !!actor && GRANTS[actor.role].includes(capability);
}

export function requireCapability(actor: Actor | null | undefined, capability: Capability): asserts actor is Actor {
  if (!can(actor, capability)) {
    throw new AccessDenied(capability);
  }
}

// Minimal, safe events: who (id + capacity), what (a code), which object
// (an opaque id), when, and why (a code). The schema admits no free text,
// so a message body, a note, an address, or a token cannot be logged here.
export function audit(
  tx: OpsTx,
  actor: Actor | PublicActor,
  action: string,
  objectType: string,
  objectId: string | null,
  reason: string | null = null,
) {
  tx.insert("audit", {
    id: newId("evt"),
    at: tx.nowIso,
    actorId: actor.id,
    actorRole: actor.role,
    action,
    objectType,
    objectId,
    reason,
    synthetic: true,
  });
}
