import type { Fixture } from "./seed";
import type { FixtureStore, RestrictionRegisterStore } from "../store/store";

export async function seedStore(
  fixtureStore: FixtureStore,
  registerStore: RestrictionRegisterStore,
  fixtures: Fixture[],
): Promise<void> {
  for (const fixture of fixtures) {
    await fixtureStore.putRecord(fixture.record, undefined);
    for (const claim of fixture.authorityClaims) {
      await fixtureStore.putAuthorityClaim(claim);
    }
    for (const right of fixture.legalRights) {
      await fixtureStore.putLegalRight(right);
    }
    for (const grant of fixture.consentGrants) {
      await fixtureStore.putConsentGrant(grant, undefined);
    }
    for (const copy of fixture.custodyCopies) {
      await fixtureStore.putCustodyCopy(copy);
    }
    await registerStore.setCurrent({
      recordId: fixture.record.recordId,
      controlVersion: 1,
      currentPublicationStatus: fixture.record.publicationStatus,
      currentCustodyStatus: fixture.record.custodyStatus,
      restrictedPurposes: [],
      updatedAt: new Date().toISOString(),
    });
  }
}
