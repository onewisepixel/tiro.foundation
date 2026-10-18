// TEST ONLY: a minimal S3-compatible server for exercising the Flight Deck
// S3 protective-log adapter (src/lib/flightDeck/s3Sink.ts) with the real
// AWS SDK, without an AWS account. Path-style requests on 127.0.0.1.
//
// Implements exactly what the adapter uses: PutObject (with If-None-Match:*
// returning 412 when the key exists, and the SDK's aws-chunked encoding
// with checksum trailers), GetObject, and ListObjectsV2 (prefix,
// start-after, max-keys). It does not check signatures. Every request's
// method, key and relevant headers are recorded for assertions.
import http from "node:http";

function decodeAwsChunked(buf) {
  const out = [];
  let i = 0;
  for (;;) {
    const lineEnd = buf.indexOf("\r\n", i);
    if (lineEnd < 0) break;
    const size = parseInt(buf.subarray(i, lineEnd).toString("latin1").split(";")[0], 16);
    i = lineEnd + 2;
    if (!size) break;
    out.push(buf.subarray(i, i + size));
    i += size + 2;
  }
  return Buffer.concat(out);
}

const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function startFakeS3() {
  const objects = new Map(); // "bucket/key" -> Buffer
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const url = new URL(req.url, "http://localhost");
      const [, bucket, ...rest] = url.pathname.split("/");
      const key = decodeURIComponent(rest.join("/"));
      const full = `${bucket}/${key}`;
      requests.push({
        method: req.method,
        key,
        ifNoneMatch: req.headers["if-none-match"] ?? null,
        checksum: req.headers["x-amz-checksum-sha256"] ?? req.headers["x-amz-trailer"] ?? req.headers["x-amz-sdk-checksum-algorithm"] ?? null,
        authorized: /^AWS4-HMAC-SHA256 /.test(req.headers.authorization ?? ""),
      });
      const err = (status, code) => {
        res.writeHead(status, { "Content-Type": "application/xml" });
        res.end(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${code}</Message></Error>`);
      };
      if (req.method === "PUT" && key) {
        if (req.headers["if-none-match"] === "*" && objects.has(full)) {
          return err(412, "PreconditionFailed");
        }
        let body = Buffer.concat(chunks);
        if (String(req.headers["content-encoding"] ?? "").includes("aws-chunked")) {
          body = decodeAwsChunked(body);
        }
        objects.set(full, body);
        res.writeHead(200, { ETag: `"${objects.size}"` });
        return res.end();
      }
      if (req.method === "GET" && key) {
        const body = objects.get(full);
        if (!body) {
          return err(404, "NoSuchKey");
        }
        res.writeHead(200, { "Content-Type": "application/json", "Content-Length": body.length });
        return res.end(body);
      }
      if (req.method === "GET" && url.searchParams.get("list-type") === "2") {
        const prefix = url.searchParams.get("prefix") ?? "";
        const startAfter = url.searchParams.get("start-after") ?? "";
        const max = Number(url.searchParams.get("max-keys") ?? 1000);
        const keys = [...objects.keys()]
          .filter((k) => k.startsWith(`${bucket}/`))
          .map((k) => k.slice(bucket.length + 1))
          .filter((k) => k.startsWith(prefix) && k > startAfter)
          .sort()
          .slice(0, max);
        res.writeHead(200, { "Content-Type": "application/xml" });
        return res.end(
          `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${xml(bucket)}</Name><Prefix>${xml(prefix)}</Prefix><KeyCount>${keys.length}</KeyCount><MaxKeys>${max}</MaxKeys><IsTruncated>false</IsTruncated>${keys
            .map((k) => `<Contents><Key>${xml(k)}</Key><Size>${objects.get(`${bucket}/${k}`).length}</Size></Contents>`)
            .join("")}</ListBucketResult>`,
        );
      }
      err(400, "NotImplemented");
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  return { endpoint: `http://127.0.0.1:${port}`, objects, requests, stop: () => new Promise((r) => server.close(r)) };
}
