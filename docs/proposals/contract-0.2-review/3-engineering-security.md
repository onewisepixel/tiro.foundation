# Review packet 3 — Engineering / security

Responsibility: authorization boundaries, dependency tracking, revocation races, storage isolation, information leakage.
Read first: contract §3 (scope boundary), §7.3 (the disclosure rule and `DisclosureAuthorization`), §7.4 (projection properties), §8 (consistency, revocation, caching), §13 (conformance tests), §11 case E.
Existing reference: the synthetic fixture backend's permission path (`backend/src/services/permissions.ts`: `evaluatePermissionSnapshot`, register-last; `backend/src/domain/types.ts`: `RestrictionRegisterEntry`), and the prototype's build-artifact verifier (`scripts/test/verify-disclosure.mjs`).
Respond using the format in [`README.md`](README.md).

**What we need from you is evidence, not only opinion.** Before the consistency protocol is accepted, each scenario in §3 below should be demonstrated by a **controlled concurrency test** against a prototype of the chosen stores (synthetic data only), with the interleaving forced deterministically.

## 1. Issues for your answer

### RI-1 (Critical) — Restricted-record gates
**Conflict.** §7.3 step 1 requires the anchor record to pass record-level checks, including publication for the audience, before **any** disclosure. Yet §7.3's "withheld" level (and decision 2) acknowledges claims held in restricted records.

**Proposed gates for your judgment:**

| Level | Record-level gate | Claim-level gate |
| --- | --- | --- |
| `existence` | Record is not deleted, deletion-pending, or quarantined; **no publication required**; no register override | Explicit `existence` authorization from every required interest |
| `association` | As existence, and the relationship's other end is served | Explicit `existence` **and** `association` authorizations, for this relationship |
| `content` | Full record-level checks, including publication for the audience | Explicit `existence`, `association`, **and** `content` authorizations |

**We ask:** Is there any path by which a restricted record's content or metadata leaks through the existence or association gates (timing, ordering, error shape, opaque-id stability across requests)?

### RI-2 (Critical) — No inferred levels
**Proposed.** Each level is an explicit affirmative scope. `content` is valid only alongside explicit `existence` and `association` scopes. One authorization document may carry several scopes; an evaluator never infers a missing one. Conformance test 3 is restated to match.

**We ask:** Should the evaluator reject an authorization that grants `content` without the lower scopes (a malformed grant), or ignore it (deny)? We propose **reject at write, deny at read**.

### RI-5 (High) — Is register-last a consistent snapshot?
§8.3 reads content and authorizations, then the register last. A consistent read of the register does **not** make the earlier reads of separate stores part of one atomic snapshot.

**We ask:** Show whether the protocol is sound across separate stores. If it is not, propose the minimum that is. Options include:
- version validation (re-read content versions after the register read and compare);
- a single transactional store for control-relevant fields;
- per-object version stamps carried into the register.

### RI-7 (High) — Negative dependencies
A cached decision can depend on objects that did not exist when it was built:
- a new authority dispute;
- a newly established subject interest;
- a new claim added to a relationship;
- a new authorization scope.

A dependency vector over known objects misses these.

**We ask:** Propose how collection membership, relationship indexes, authority sets, and authorization-scope sets become versioned dependencies themselves. For example, each record carries a register-tracked `membershipVersion` covering its claims, interests, and relationships, and every projection depends on it.

## 2. Contract questions assigned to you (§14)

- Q8: Store consistency limits; the in-flight response bound after revocation commit; the split-or-fail behavior for large dependency sets.
- Storage isolation: the restricted evidence and authorization stores must never be reachable from public-serving code paths. Propose how to enforce this structurally (separate accounts or roles), not only by convention.

## 3. Controlled concurrency scenarios

For each: force the interleaving; report the outcome; supply the test. "Required" is the outcome contract 0.2 intends. Tell us if it is unachievable.

| # | Scenario | Interleaving to force | Required outcome |
| --- | --- | --- | --- |
| E-1 | **Revocation during an in-flight read** | Read starts; reads content and authorizations; revocation commits to register; read reaches register-last step | The read observes the revocation and denies. No post-commit response uses pre-commit state. |
| E-2 | **Stale cache write-back** | Read computes an allowed projection; revocation commits and purges caches; the read then writes its result into the cache | The stale result is rejected at cache write: its dependency vector is older than the register. |
| E-3 | **Restore after revocation** | Revoke authorization; restore the authorization store and content store from a backup taken before revocation | Still denied; the register is not restored; all caches flushed; restored objects re-evaluated. |
| E-4 | **Negative dependency: new dispute** | Cache a public projection of R; register a new `disputed` interest on R | Projection invalidated (RI-7); next read holds disclosure. |
| E-5 | **Negative dependency: new subject interest** | Cache a projection; establish a subject interest on a claim in it | Invalidated; the claim is omitted until the subject's interest is authorized. |
| E-6 | **Negative dependency: new claim on a relationship** | Cache an `attested` relationship; add a conflicting claim and a `noted-disagreement` | Invalidated; the relationship is suppressed until its new characterization is authorized. It is never shown as still `attested`. |
| E-7 | **Expiry with no write** | Cache a projection whose authorization expires at T; no register write occurs; read at T+1s | Denied; cache validity was bounded by `expiresAt`. |
| E-8 | **Clock skew on expiry** | Two serving nodes with clocks ±N seconds; read near T | Neither serves after T, given the authoritative time source chosen. Specify the source and the skew tolerance. |
| E-9 | **Cross-store skew** | Content store at version v1 read; content updated to v2 and authorization re-scoped; register read | The decision does not combine v1 content with v2-era authorization (RI-5 validation). |
| E-10 | **Correction race** | A claim is corrected (v1 to v2) while a read holding v1's content authorization is in flight | v2 content is never served under v1's authorization; v1 content is not served after the correction commits. |
| E-11 | **Large dependency set** | A projection whose dependency set exceeds one consistent read | Split into independently consistent parts, or fail closed, and the response says it is partial. Never silently partial. |
| E-12 | **CDN purge failure** | Revocation commits; the CDN purge call fails | The revocation is **not** reported complete; it retries and escalates; the receipt records the failure (`ethos.txt` §12). |
| E-13 | **Reverse-index lag** | The dependency reverse index updates asynchronously; revocation lands before the index includes a new cache entry | No cache entry escapes invalidation. Prove ordering, or validate at read. |

## 4. Leakage checks (extend the prototype verifier)

Port `scripts/test/verify-disclosure.mjs`'s approach to the production stack: canary strings in restricted fixtures, scanned in every response body, header, error, log line, search document, export, RSC payload, and CDN object. Add checks for:
- **Opaque-id stability.** A withheld claim's opaque id must not be stable across audiences or sessions in a way that allows correlation.
- **Timing and ordering.** Undiscoverable versus nonexistent must be indistinguishable (P8).
- **Counts.** No total, page size, or cursor exposes withheld items.
