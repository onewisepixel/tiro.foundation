// Test identities for LOCAL DEMO ONLY. They are not accounts: they have no
// passwords, exist only in this file, and are accepted only while
// config.localDemoActive() holds. A production deployment must replace
// them with a real identity provider (docs/flight-deck/integrations.md).
import type { Actor } from "./access";
import type { IdentityStore } from "./identity";

export const DEMO_IDENTITIES: Extract<Actor, { role: "founder" | "operator" | "reviewer" }>[] = [
  { id: "usr_demofounder01", role: "founder", displayName: "Demo Founder (synthetic)" },
  { id: "usr_demooperator1", role: "operator", displayName: "Demo Operator (synthetic)" },
  { id: "usr_demoreviewer1", role: "reviewer", displayName: "Demo Reviewer (synthetic)" },
];

export function demoIdentity(id: string) {
  return DEMO_IDENTITIES.find((i) => i.id === id) ?? null;
}

export function displayNameFor(id: string | null): string {
  if (!id) {
    return "Unassigned";
  }
  if (id === "system") {
    return "Automation";
  }
  if (id === "public") {
    return "Public form";
  }
  return demoIdentity(id)?.displayName ?? "Unknown user";
}

export const OPERATOR_IDS = DEMO_IDENTITIES.filter((i) => i.role === "operator").map((i) => i.id);

/**
 * Resolve display names and assignable owners from the actual identity
 * directory in cloud deployments. Demo identities are strictly local.
 * Include inactive operators in name resolution for historical attribution,
 * but never offer them as new owners.
 */
export async function operatorDirectory(identity: IdentityStore | null) {
  const operators = identity ? await identity.listOperators() : DEMO_IDENTITIES;
  const names = new Map(operators.map((operator) => [operator.id, operator.displayName]));
  return {
    displayNameFor(id: string | null): string {
      if (!id) return "Unassigned";
      if (id === "system") return "Automation";
      if (id === "public") return "Public form";
      return names.get(id) ?? "Unknown user";
    },
    assignableOwners: operators
      .filter((operator) => ("active" in operator ? operator.active : true) && (operator.role === "founder" || operator.role === "operator"))
      .map((operator) => ({ id: operator.id, displayName: operator.displayName })),
    activeReviewers: operators
      .filter((operator) => ("active" in operator ? operator.active : true))
      .map((operator) => ({ id: operator.id, displayName: operator.displayName })),
  };
}
