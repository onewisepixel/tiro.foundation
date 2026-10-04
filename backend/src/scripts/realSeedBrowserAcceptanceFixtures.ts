// Manually-invoked script — NOT part of `npm test`, NOT run in CI. Seeds the
// exact fixtures docs/backend/browser-acceptance-checklist.md walks a human
// tester through, by hand, in a real browser against the real deployed
// staff UI — and prints the record ids that checklist asks for.
//
// Seeds, into the REAL deployed stack:
//   - "allowed": a fresh active-authorized fixture with REAL bound S3 media
//     (one text object, one binary object with two versions) — the record
//     the checklist runs correct/dispute/redact-text/redact-media/export/
//     deletion against.
//   - "deniedAuthority": a fresh disputed-authority fixture — used to show
//     the UI's denied-access (limited metadata) view.
//   - "deniedConsent": a fresh expired-consent fixture — a second, distinct
//     denied-access case (different reason: expired, not disputed).
//
// Cleanup: none. Every fixture this prints is meant to be used, then left
// in place (the checklist's own deletion step removes the "allowed" one;
// the two denied-access fixtures are left, same precedent as every other
// synthetic fixture seeded in this project).
//
// Run with:
// AWS_PROFILE=tiro-fixture-deploy AWS_REGION=us-east-1 \
//   TIRO_PRIMARY_TABLE=... TIRO_REGISTER_TABLE=... TIRO_MEDIA_BUCKET=... \
//   npx tsx backend/src/scripts/realSeedBrowserAcceptanceFixtures.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { DynamoFixtureStore, DynamoRestrictionRegisterStore } from "../store/dynamoStore";
import { S3MediaStore } from "../store/s3MediaStore";
import { seedStore } from "../fixtures/load";
import { buildSeedFixtures } from "../fixtures/seed";
import { bindSeedMedia } from "../fixtures/media";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const PRIMARY_TABLE = requireEnv("TIRO_PRIMARY_TABLE");
const REGISTER_TABLE = requireEnv("TIRO_REGISTER_TABLE");
const MEDIA_BUCKET = requireEnv("TIRO_MEDIA_BUCKET");
const STATUS_INDEX = process.env.TIRO_STATUS_INDEX ?? "GSI1-status-index";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

async function main() {
  const dynamoClient = new DynamoDBClient({ region: REGION });
  const s3Client = new S3Client({ region: REGION });
  const fixtureStore = new DynamoFixtureStore({ client: dynamoClient, primaryTableName: PRIMARY_TABLE, statusIndexName: STATUS_INDEX });
  const registerStore = new DynamoRestrictionRegisterStore({ client: dynamoClient, tableName: REGISTER_TABLE });
  const mediaStore = new S3MediaStore({ client: s3Client, bucketName: MEDIA_BUCKET });

  const [allowed, deniedConsent, deniedAuthority] = buildSeedFixtures();
  await bindSeedMedia(mediaStore, allowed);
  await seedStore(fixtureStore, registerStore, [allowed, deniedConsent, deniedAuthority]);

  const textMedia = allowed.record.mediaRefs[0];
  const binaryMedia = allowed.record.mediaRefs[1];

  console.log("\n==================== BROWSER ACCEPTANCE FIXTURES SEEDED ====================");
  console.log("\nUse these with docs/backend/browser-acceptance-checklist.md:\n");
  console.log(`ALLOWED record id (correct/dispute/redact/export/deletion):\n  ${allowed.record.recordId}`);
  console.log(`  text mediaId (for redact-media step 1):   ${textMedia.mediaId}`);
  console.log(`  binary mediaId (stays fetchable in step):  ${binaryMedia.mediaId}`);
  console.log(`\nDENIED (expired consent) record id:\n  ${deniedConsent.record.recordId}`);
  console.log(`\nDENIED (disputed authority) record id:\n  ${deniedAuthority.record.recordId}`);
  console.log("\nAll three are isSynthetic:true fixtures, safe to leave in place.");
}

main().catch((error) => {
  console.error("Seeding browser acceptance fixtures failed:", error);
  process.exitCode = 1;
});
