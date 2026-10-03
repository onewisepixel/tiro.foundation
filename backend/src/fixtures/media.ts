// Impure counterpart to fixtures/seed.ts's pure Fixture builders — uploads
// REAL bytes to a MediaStore and binds the result (real versionId, real
// SHA-256, real contentType) onto a Fixture's media, adding the matching
// CustodyCopy that lets completeDeletion (services/lifecycle.ts) track and
// later purge it. Kept separate from seed.ts on purpose: not every test
// needs real media I/O, so buildSeedFixtures() stays synchronous and
// media-free by default — this is opt-in, for tests/drills that actually
// exercise media.
import { uuidv7 } from "../domain/id";
import type { Fixture } from "./seed";
import type { MediaStore } from "../store/mediaStore";

function keyFor(fixtureSetId: string, recordId: string, mediaId: string, ext: string): string {
  return `fixtures/${fixtureSetId}/${recordId}/${mediaId}.${ext}`;
}

// Binds the fixture's existing (if any) text MediaRef to a real uploaded
// object, adds one real binary MediaRef, and gives the binary object a
// SECOND S3 version (same key, different bytes) — demonstrating both
// version-pinning (the MediaRef stays bound to the FIRST version even
// though a second now exists) and the exact scenario completeDeletion's
// purge step must handle: more than one version to inventory and remove.
// Mutates and returns the same fixture object.
export async function bindSeedMedia(mediaStore: MediaStore, fixture: Fixture): Promise<Fixture> {
  const { recordId, fixtureSetId } = fixture.record;

  if (fixture.record.mediaRefs.length > 0) {
    const textRef = fixture.record.mediaRefs[0];
    const body = Buffer.from(`[SYNTHETIC] dummy text content for record ${recordId}.\n`);
    const key = keyFor(fixtureSetId, recordId, textRef.mediaId, "txt");
    const uploaded = await mediaStore.putObject(key, body, "text/plain");
    textRef.objectKey = key;
    textRef.bytes = uploaded.bytes;
    textRef.checksumSha256 = uploaded.sha256;
    textRef.contentType = "text/plain";
    textRef.versionId = uploaded.versionId;
    fixture.custodyCopies.push({
      recordId,
      copyId: uuidv7(),
      location: "primary",
      objectVersionId: uploaded.versionId,
      mediaId: textRef.mediaId,
      createdAt: new Date().toISOString(),
      reconciledAt: null,
    });
  }

  // One real binary object, given TWO versions at the same key. The
  // MediaRef stays pinned to the FIRST version's id — pulling it back must
  // keep returning v1's exact bytes even though the key now has a newer
  // "current" version, and deleting this record must purge BOTH.
  const binaryMediaId = uuidv7();
  const binaryKey = keyFor(fixtureSetId, recordId, binaryMediaId, "bin");
  const v1Body = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd, 0xfc]);
  const v1 = await mediaStore.putObject(binaryKey, v1Body, "application/octet-stream");
  const v2Body = Buffer.from([0x10, 0x11, 0x12, 0x13, 0xef, 0xee, 0xed, 0xec, 0x00]);
  await mediaStore.putObject(binaryKey, v2Body, "application/octet-stream");

  fixture.record.mediaRefs.push({
    mediaId: binaryMediaId,
    objectKey: binaryKey,
    bytes: v1.bytes,
    checksumSha256: v1.sha256,
    contentType: "application/octet-stream",
    versionId: v1.versionId,
  });
  fixture.custodyCopies.push({
    recordId,
    copyId: uuidv7(),
    location: "primary",
    objectVersionId: v1.versionId,
    mediaId: binaryMediaId,
    createdAt: new Date().toISOString(),
    reconciledAt: null,
  });

  return fixture;
}
