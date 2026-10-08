// The real Lambda entrypoint — the only file in this package that knows
// about API Gateway's event shape or constructs a real DynamoDBClient.
// Everything it does is: parse the event, extract the authenticated
// caller's identity from the JWT authorizer's claims, hand off to
// router.ts, and format the response. No logic lives here.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { DynamoFixtureStore, DynamoIntakeRegisterCommitter, DynamoRestrictionRegisterStore } from "../store/dynamoStore";
import { S3MediaStore } from "../store/s3MediaStore";
import { routeRequest, type ApiRequest } from "./router";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const PRIMARY_TABLE = requireEnv("TIRO_PRIMARY_TABLE");
const REGISTER_TABLE = requireEnv("TIRO_REGISTER_TABLE");
const STATUS_INDEX = process.env.TIRO_STATUS_INDEX ?? "GSI1-status-index";
const MEDIA_BUCKET = requireEnv("TIRO_MEDIA_BUCKET");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

// Constructed once per Lambda execution environment (cold start), reused
// across warm invocations — the standard Lambda pattern for avoiding a new
// client (and its connection pool) on every request.
const client = new DynamoDBClient({ region: REGION });
const fixtureStore = new DynamoFixtureStore({ client, primaryTableName: PRIMARY_TABLE, statusIndexName: STATUS_INDEX });
const registerStore = new DynamoRestrictionRegisterStore({ client, tableName: REGISTER_TABLE });
const intakeCommitter = new DynamoIntakeRegisterCommitter({ client, primaryTableName: PRIMARY_TABLE, registerTableName: REGISTER_TABLE });
const s3Client = new S3Client({ region: REGION });
const mediaStore = new S3MediaStore({ client: s3Client, bucketName: MEDIA_BUCKET });

// Minimal shape of what we read from an API Gateway HTTP API (payload
// format 2.0) event — not the full AWS type, just the fields this handler
// actually touches.
export type HttpApiEvent = {
  requestContext: {
    http: { method: string; path: string };
    authorizer?: { jwt?: { claims?: Record<string, string> } };
  };
  rawPath: string;
  queryStringParameters?: Record<string, string> | null;
  body?: string | null;
  isBase64Encoded?: boolean;
};

type HttpApiResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
};

export function extractCallerIdentity(event: HttpApiEvent): string {
  const claims = event.requestContext.authorizer?.jwt?.claims;
  // email is the staff pool's sign-in alias (see infra/lib/fixture-backend-stack.ts);
  // sub is always present as a fallback so a claims shape change never
  // silently attributes an action to "unknown".
  const identity = claims?.email ?? claims?.sub;
  if (!identity) {
    // Should be unreachable — API Gateway's JWT authorizer rejects the
    // request before it ever reaches this Lambda if the token is missing
    // or invalid. Refusing to proceed with no identity is the safe default
    // if that ever changes.
    throw new Error("No authenticated caller identity on the request.");
  }
  return `staff:${identity}`;
}

export function parseBody(event: HttpApiEvent): unknown {
  if (!event.body) {
    return undefined;
  }
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function handler(event: HttpApiEvent): Promise<HttpApiResponse> {
  const headers = { "content-type": "application/json" };
  try {
    const callerIdentity = extractCallerIdentity(event);
    const method = event.requestContext.http.method;
    if (method !== "GET" && method !== "POST") {
      return { statusCode: 405, headers, body: JSON.stringify({ error: `Method ${method} not allowed.` }) };
    }
    const pathSegments = event.rawPath.split("/").filter((segment) => segment.length > 0);
    const request: ApiRequest = {
      method,
      pathSegments,
      queryParams: event.queryStringParameters ?? {},
      body: parseBody(event),
    };
    const response = await routeRequest(fixtureStore, registerStore, mediaStore, intakeCommitter, callerIdentity, request);
    if (response.binary) {
      // Media bytes: private/no-store so neither a browser nor any
      // intermediary caches a response whose authorization could change on
      // the very next request (a withdrawal or revocation a moment later
      // must deny the next fetch, not serve a cached "allowed" copy).
      return {
        statusCode: response.statusCode,
        headers: { "content-type": response.binary.contentType, "cache-control": "private, no-store" },
        body: response.binary.base64Body,
        isBase64Encoded: true,
      };
    }
    return { statusCode: response.statusCode, headers, body: JSON.stringify(response.body) };
  } catch (error) {
    // Deliberately minimal — never echo internal error details (table
    // names, stack traces) back to a caller, even an authenticated one.
    console.error("Unhandled error in staff API handler:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Internal error." }) };
  }
}
