// Minimal staff workflow UI — vanilla JS, no build step, no framework.
// Every call goes through apiFetch() (auth.js), which attaches the signed-in
// staff member's Cognito ID token. The API itself (backend/src/api/router.ts)
// is what actually attributes actions to that identity and runs every
// permission/lifecycle check — this page only renders what the API returns.
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderAuthBar() {
  const bar = document.getElementById("auth-bar");
  const session = currentIdToken();
  const app = document.getElementById("app");
  if (!session) {
    app.hidden = true;
    bar.innerHTML = `<button id="sign-in">Sign in</button>`;
    document.getElementById("sign-in").addEventListener("click", () => {
      redirectToSignIn().catch((error) => alert(error.message));
    });
    return;
  }
  app.hidden = false;
  const identity = session.claims.email ?? session.claims.sub;
  bar.innerHTML = `<span>Signed in as <strong>${escapeHtml(identity)}</strong></span> <button id="sign-out">Sign out</button>`;
  document.getElementById("sign-out").addEventListener("click", signOut);
}

async function loadRequests() {
  const status = document.getElementById("status-filter").value;
  const output = document.getElementById("requests-output");
  output.textContent = "Loading…";
  const { status: httpStatus, body } = await apiFetch(`/lifecycle-requests?status=${encodeURIComponent(status)}`);
  if (httpStatus !== 200) {
    output.innerHTML = `<p class="error">${escapeHtml(body?.error ?? `HTTP ${httpStatus}`)}</p>`;
    return;
  }
  const requests = body.requests;
  if (requests.length === 0) {
    output.innerHTML = `<p class="muted">No ${escapeHtml(status)} requests.</p>`;
    return;
  }
  const rows = requests
    .map(
      (r) => `<tr>
        <td><code>${escapeHtml(r.recordId)}</code></td>
        <td>${escapeHtml(r.action)}</td>
        <td>${escapeHtml(r.requesterCapacity)}</td>
        <td>${escapeHtml(r.reason)}</td>
        <td>${escapeHtml(r.createdAt)}</td>
        <td><button data-load-record="${escapeHtml(r.recordId)}">Open</button></td>
      </tr>`,
    )
    .join("");
  output.innerHTML = `<table><thead><tr><th>recordId</th><th>action</th><th>requesterCapacity</th><th>reason</th><th>createdAt</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  output.querySelectorAll("[data-load-record]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById("record-id-input").value = button.dataset.loadRecord;
      loadRecord(button.dataset.loadRecord);
    });
  });
}

// Prepends a durable entry to the page-level action log (index.html's
// #action-log, a sibling of #record-output, never touched by
// loadRecord()'s re-render). Reviewer-caught finding: actionForm's own
// `.result` div shows the response too, but loadRecord()'s reload callback
// (onDone) wipes the ENTIRE #record-output container, including that
// result, almost immediately after a successful submit — losing
// start-deletion's returned requestId and, after any later reload,
// every past response's requesterCapacity. Logging here keeps every
// response readable regardless of what gets reloaded afterward.
function logAction(recordId, action, responseBody) {
  const log = document.getElementById("action-log");
  const entry = document.createElement("div");
  entry.className = "action-log-entry";
  entry.innerHTML = `
    <p class="muted">${escapeHtml(new Date().toISOString())} — <strong>${escapeHtml(action)}</strong> on <code>${escapeHtml(recordId)}</code></p>
    <pre>${escapeHtml(JSON.stringify(responseBody, null, 2))}</pre>`;
  log.insertBefore(entry, log.firstChild);
}

function actionForm(recordId, action, extraFields, onDone) {
  const fieldsHtml = extraFields
    .map((f) => `<label>${escapeHtml(f.label)}<input name="${f.name}" value="${escapeHtml(f.value ?? "")}" ${f.required ? "required" : ""} /></label>`)
    .join("");
  const container = document.createElement("div");
  container.innerHTML = `
    <form class="inline">
      <strong>${escapeHtml(action)}</strong>
      <label>Reason<input name="reason" required /></label>
      ${fieldsHtml}
      <div><button type="submit">Submit</button></div>
      <div class="result"></div>
    </form>`;
  const form = container.querySelector("form");
  // Generated ONCE per form instance (not per submit) and reused across
  // every retry of THIS same logical operation — reviewer-caught finding:
  // without a client-supplied requestId, the API mints a fresh one on
  // every call (router.ts: `validated.value.requestId ?? uuidv7()`), so a
  // lost response followed by the user clicking Submit again created a
  // genuinely separate, duplicate operation instead of safely resuming
  // the first one. A fresh form (e.g. after a successful reload) gets its
  // own new id, correctly — only retries of the SAME unsent/failed attempt
  // should share one.
  const requestId = crypto.randomUUID();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const body = { reason: data.get("reason"), requestId };
    for (const f of extraFields) {
      const value = data.get(f.name);
      // optional: an empty text input sends "" — the API's optional
      // fields (mandateRef/jurisdiction/expiresAt) expect null for "not
      // provided", and reject "" as neither null nor a non-empty string.
      // numeric: for expectedControlVersion/expectedRecordVersion (approve-*)
      // — the API requires real numbers, not numeric strings.
      body[f.name] = f.array
        ? value.split(",").map((s) => s.trim()).filter(Boolean)
        : f.optional && value === ""
          ? null
          : f.numeric
            ? Number(value)
            : value;
    }
    const resultEl = form.querySelector(".result");
    resultEl.textContent = "Submitting…";
    const { status, body: responseBody } = await apiFetch(`/records/${encodeURIComponent(recordId)}/${action}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    resultEl.innerHTML = `<pre>${escapeHtml(JSON.stringify(responseBody, null, 2))}</pre>`;
    logAction(recordId, action, responseBody);
    if (status === 200 && onDone) onDone();
  });
  return container;
}

async function loadRecord(recordId) {
  const purpose = document.getElementById("record-purpose").value;
  const audience = document.getElementById("record-audience").value;
  const output = document.getElementById("record-output");
  output.textContent = "Loading…";
  const { status, body } = await apiFetch(
    `/records/${encodeURIComponent(recordId)}?purpose=${encodeURIComponent(purpose)}&audience=${encodeURIComponent(audience)}`,
  );
  if (status !== 200) {
    output.innerHTML = `<p class="error">${escapeHtml(body?.error ?? `HTTP ${status}`)}</p>`;
    return;
  }
  // access.allowed decides what's in the response at all — see router.ts's
  // GET /records/:id. allowed: full content + evidence; denied: a limited
  // metadata view (no title/summary/mediaRefs, counts instead of
  // authorityClaims/legalRights/consentGrants contents).
  const accessNote = body.access.allowed
    ? `<p>Access: <strong>allowed</strong> for ${escapeHtml(purpose)}/${escapeHtml(audience)} — ${escapeHtml(body.access.reason)}</p>`
    : `<p class="banner">Access: <strong>denied</strong> for ${escapeHtml(purpose)}/${escapeHtml(audience)} — ${escapeHtml(body.access.reason)}. Showing the limited metadata view only (no content, no consent/authority evidence).</p>`;
  const evidenceHtml = body.access.allowed
    ? `<h3>Authority claims</h3><pre>${escapeHtml(JSON.stringify(body.authorityClaims, null, 2))}</pre>
       <h3>Legal rights</h3><pre>${escapeHtml(JSON.stringify(body.legalRights, null, 2))}</pre>
       <h3>Consent grants</h3><pre>${escapeHtml(JSON.stringify(body.consentGrants, null, 2))}</pre>`
    : `<h3>Evidence (limited view — counts only)</h3>
       <pre>authorityClaimCount: ${body.authorityClaimCount}
legalRightCount: ${body.legalRightCount}
consentGrantCount: ${body.consentGrantCount}</pre>`;
  // Media is listed with its own Download buttons only when the record's
  // full detail (not the limited view) is present — mediaRefs metadata only
  // exists on the allowed branch of GET /records/:id. The actual bytes are
  // never fetched here or cached; each click below is its own fresh,
  // separately-authorized call to GET /records/:id/media/:mediaId — see
  // router.ts / services/media.ts. A denied record simply has no download
  // buttons to show, by construction.
  const mediaHtml =
    body.access.allowed && Array.isArray(body.record.mediaRefs) && body.record.mediaRefs.length > 0
      ? `<h3>Media</h3>
         <table><thead><tr><th>mediaId</th><th>contentType</th><th>bytes</th><th>bound version</th><th></th></tr></thead><tbody>
           ${body.record.mediaRefs
             .map(
               (m) => `<tr>
                 <td><code>${escapeHtml(m.mediaId)}</code></td>
                 <td>${escapeHtml(m.contentType ?? "")}</td>
                 <td>${escapeHtml(String(m.bytes))}</td>
                 <td>${m.versionId ? escapeHtml(m.versionId) : '<span class="muted">legacy — not retrievable</span>'}</td>
                 <td>${m.versionId ? `<button data-download-media="${escapeHtml(m.mediaId)}">Download</button>` : ""}</td>
               </tr>`,
             )
             .join("")}
         </tbody></table>
         <div id="media-download-result"></div>`
      : "";

  output.innerHTML = `
    ${accessNote}
    <h3>Record</h3>
    <pre>${escapeHtml(JSON.stringify(body.record, null, 2))}</pre>
    <h3>Control (restriction register)</h3>
    <pre>${escapeHtml(JSON.stringify(body.control, null, 2))}</pre>
    ${evidenceHtml}
    ${mediaHtml}
    <h3>Custody copies</h3>
    <pre>${escapeHtml(JSON.stringify(body.custodyCopies, null, 2))}</pre>
    <h3>Audit receipts</h3>
    <pre>${escapeHtml(JSON.stringify(body.auditReceipts, null, 2))}</pre>
    <h3>Corrections${body.access.allowed ? "" : " (count only — see below)"}</h3>
    <pre>${escapeHtml(JSON.stringify(body.access.allowed ? body.corrections : `correctionCount: ${body.correctionCount}`, null, 2))}</pre>
    <h3>Redactions (metadata only — never the pre-redaction original)</h3>
    <pre>${escapeHtml(JSON.stringify(body.redactions, null, 2))}</pre>
    <h3>Actions</h3>
    <div class="actions" id="actions-container"></div>
  `;
  output.querySelectorAll("[data-download-media]").forEach((button) => {
    button.addEventListener("click", async () => {
      const mediaId = button.dataset.downloadMedia;
      const resultEl = document.getElementById("media-download-result");
      resultEl.textContent = "Downloading…";
      const result = await apiFetchBinary(
        `/records/${encodeURIComponent(recordId)}/media/${encodeURIComponent(mediaId)}?purpose=${encodeURIComponent(purpose)}&audience=${encodeURIComponent(audience)}`,
      );
      if (!result.ok) {
        resultEl.innerHTML = `<p class="error">${escapeHtml(result.body?.error ?? `HTTP ${result.status}`)}</p>`;
        return;
      }
      // Standard client-side save-as: a Blob URL + a transient anchor click.
      // The API enforcement above is what's authoritative — this is purely
      // how an already-authorized response reaches the browser's save
      // dialog, same as any ordinary file download.
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = mediaId;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      resultEl.innerHTML = `<p class="muted">Downloaded ${escapeHtml(String(result.blob.size))} bytes.</p>`;
    });
  });
  const actions = document.getElementById("actions-container");
  const reload = () => loadRecord(recordId);
  actions.append(actionForm(recordId, "restrict", [{ name: "purposes", label: "Purposes (comma-separated)", required: true, array: true }], reload));
  actions.append(actionForm(recordId, "withdraw", [], reload));
  actions.append(actionForm(recordId, "retain", [], reload));
  actions.append(actionForm(recordId, "start-deletion", [], reload));
  actions.append(actionForm(recordId, "complete-deletion", [{ name: "deletionRequestId", label: "Deletion requestId (from start-deletion's response)", required: true }], reload));
  actions.append(actionForm(recordId, "revoke-consent", [{ name: "consentId", label: "Consent id", required: true }], reload));
  actions.append(
    actionForm(
      recordId,
      "correct",
      [
        { name: "field", label: "Field (title, summary, or provenanceRef)", required: true },
        { name: "correctedValue", label: "Corrected value", required: true },
      ],
      reload,
    ),
  );
  actions.append(actionForm(recordId, "dispute-correction", [{ name: "correctionId", label: "Correction id (from Corrections above)", required: true }], reload));
  actions.append(actionForm(recordId, "redact-text", [{ name: "field", label: "Field (title, summary, or provenanceRef)", required: true }], reload));
  actions.append(actionForm(recordId, "redact-media", [{ name: "mediaId", label: "Media id (from Media above)", required: true }], reload));

  // Reviewer-caught finding: this was ONLY ever rendered in the intake
  // detail view (loadIntakeSubmission), which 404s once a record is
  // "preserved" — the review queue's "pending publication" entries open
  // THIS view instead (control.currentCustodyStatus === "preserved"), so
  // there was no way to actually click approve-publication at all. Shown
  // only when the record is in the right state to use it; controlVersion/
  // recordVersion are pre-filled from this same response, already fresh.
  if (body.access.allowed && body.control?.currentCustodyStatus === "preserved" && body.control?.currentPublicationStatus === "not-published") {
    actions.append(
      actionForm(
        recordId,
        "approve-publication",
        [
          { name: "expectedControlVersion", label: "Expected control version", required: true, numeric: true, value: body.control.controlVersion },
          { name: "expectedRecordVersion", label: "Expected record version", required: true, numeric: true, value: body.record.version },
          { name: "consentGrantIds", label: "Consent grant ids to verify (comma-separated)", required: true, array: true },
        ],
        reload,
      ),
    );
  }

  // Permission-check isn't a lifecycle action (no reason/mutation), so it
  // gets its own small form rather than reusing actionForm().
  const checkForm = document.createElement("form");
  checkForm.className = "inline";
  checkForm.innerHTML = `
    <strong>permission-check</strong>
    <label>Purpose<select name="purpose">
      <option>publication</option><option>preservation</option><option>collection</option>
      <option>research</option><option>derivatives</option><option>model-training</option>
      <option>synthetic-reproduction</option><option>commercial-use</option>
    </select></label>
    <label>Audience<select name="audience"><option>public</option><option>staff</option><option>research-partner</option></select></label>
    <div><button type="submit">Check</button></div>
    <div class="result"></div>`;
  checkForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(checkForm);
    const { body: result } = await apiFetch(`/records/${encodeURIComponent(recordId)}/permission-check`, {
      method: "POST",
      body: JSON.stringify({ purpose: data.get("purpose"), audience: data.get("audience") }),
    });
    checkForm.querySelector(".result").innerHTML = `<pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>`;
    logAction(recordId, "permission-check", result);
  });
  actions.append(checkForm);
}

// --- Staff intake and review -----------------------------------------------
// GET /intake/:recordId is a DIFFERENT route from GET /records/:recordId —
// it only ever returns a submission still "quarantined", and it is
// authorized by nothing more than "signed in staff" (there's no verified
// grant to check yet; that's the whole point of review). Once approved,
// the normal "Look up a record" section above is the right place to view
// it — see services/intakeViews.ts.

// Stable across retries of the SAME unsent/failed attempt (same reasoning
// as actionForm's per-form requestId) — regenerated only after a
// successful creation, so the NEXT, genuinely new submission gets its own
// fresh id rather than ever reusing a completed one.
let createSubmissionRequestId = crypto.randomUUID();

async function createSubmission(event) {
  event.preventDefault();
  const data = new FormData(event.target);
  const output = document.getElementById("create-submission-output");
  output.textContent = "Submitting…";
  const { status, body } = await apiFetch("/intake", {
    method: "POST",
    body: JSON.stringify({
      reason: data.get("reason"),
      requestId: createSubmissionRequestId,
      fixtureSetId: data.get("fixtureSetId"),
      title: data.get("title"),
      summary: data.get("summary"),
      provenanceRef: data.get("provenanceRef"),
    }),
  });
  if (status !== 200) {
    output.innerHTML = `<p class="error">${escapeHtml(body?.error ?? `HTTP ${status}`)}</p>`;
    return;
  }
  createSubmissionRequestId = crypto.randomUUID();
  output.innerHTML = `
    <p class="muted">Created <code>${escapeHtml(body.recordId)}</code>.</p>
    <pre>${escapeHtml(JSON.stringify(body, null, 2))}</pre>
    <button id="open-new-submission">Open in intake review below</button>`;
  document.getElementById("open-new-submission").addEventListener("click", () => {
    document.getElementById("intake-id-input").value = body.recordId;
    loadIntakeSubmission(body.recordId);
  });
}

// The one other genuinely new UI pattern (besides create-submission's
// non-/records/:id/:action shape above) — there is no existing file-input
// precedent anywhere else in this file. Reads the file as a small
// in-memory buffer and base64-encodes it client-side, since apiFetch
// always JSON-stringifies its body; the API enforces the real size cap
// server-side regardless (services/intake.ts's addMedia, MAX_MEDIA_BYTES).
function mediaUploadForm(recordId, onDone) {
  const container = document.createElement("div");
  container.innerHTML = `
    <form class="inline">
      <strong>add-media</strong>
      <label>Reason<input name="reason" required /></label>
      <label>File<input type="file" name="file" required /></label>
      <div><button type="submit">Upload</button></div>
      <div class="result"></div>
    </form>`;
  const form = container.querySelector("form");
  // Stable across retries of the same upload attempt — same reasoning as
  // actionForm's per-form requestId.
  const requestId = crypto.randomUUID();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fileInput = form.querySelector('input[type="file"]');
    const file = fileInput.files[0];
    const resultEl = form.querySelector(".result");
    if (!file) return;
    resultEl.textContent = "Uploading…";
    const buffer = await file.arrayBuffer();
    const base64 = btoa(Array.from(new Uint8Array(buffer), (b) => String.fromCharCode(b)).join(""));
    const reason = new FormData(form).get("reason");
    const { status, body } = await apiFetch(`/records/${encodeURIComponent(recordId)}/add-media`, {
      method: "POST",
      body: JSON.stringify({ reason, requestId, contentType: file.type || "application/octet-stream", base64 }),
    });
    resultEl.innerHTML = `<pre>${escapeHtml(JSON.stringify(body, null, 2))}</pre>`;
    logAction(recordId, "add-media", body);
    if (status === 200 && onDone) onDone();
  });
  return container;
}

async function loadIntakeSubmission(recordId) {
  const output = document.getElementById("intake-output");
  output.textContent = "Loading…";
  const { status, body } = await apiFetch(`/intake/${encodeURIComponent(recordId)}`);
  if (status !== 200) {
    output.innerHTML = `<p class="error">${escapeHtml(body?.error ?? `HTTP ${status}`)} — if this was just approved, use "Look up a record" above instead.</p>`;
    return;
  }
  // Reviewer-caught finding: claimant/holder/purposes alone aren't enough
  // to actually review a claim — a reviewer needs the scope/evidenceRef
  // (claims), rightType/jurisdiction/evidenceRef (rights), and
  // signerCapacitySummary/mandateRef/expiresAt/retentionTermsRef/
  // withdrawalContact (grants) that were deliberately captured at intake
  // time precisely so a reviewer could evaluate them.
  const claimRows = body.authorityClaims
    .map(
      (c) =>
        `<tr><td><code>${escapeHtml(c.claimId)}</code></td><td>${escapeHtml(c.status)}</td><td>${escapeHtml(c.claimant)}</td><td>${escapeHtml(c.scope)}</td><td>${escapeHtml(c.evidenceRef)}</td></tr>`,
    )
    .join("");
  const rightRows = body.legalRights
    .map(
      (r) =>
        `<tr><td><code>${escapeHtml(r.rightId)}</code></td><td>${escapeHtml(r.status)}</td><td>${escapeHtml(r.holder)}</td><td>${escapeHtml(r.rightType)}</td><td>${escapeHtml(r.jurisdiction ?? "")}</td><td>${escapeHtml(r.evidenceRef)}</td></tr>`,
    )
    .join("");
  const grantRows = body.consentGrants
    .map(
      (g) =>
        `<tr><td><code>${escapeHtml(g.consentId)}</code></td><td>${escapeHtml(g.signerCapacityVerified ? "verified" : "unverified")}</td><td>${escapeHtml(g.signerCapacitySummary)}</td><td>${escapeHtml(g.purposes.join(", "))}</td><td>${escapeHtml(g.audience)}</td><td>${escapeHtml(g.mandateRef ?? "")}</td><td>${escapeHtml(g.expiresAt ?? "")}</td><td>${escapeHtml(g.retentionTermsRef)}</td><td>${escapeHtml(g.withdrawalContact)}</td></tr>`,
    )
    .join("");
  const mediaRows = body.record.mediaRefs
    .map(
      (m) => `<tr><td><code>${escapeHtml(m.mediaId)}</code></td><td>${escapeHtml(m.contentType ?? "")}</td>
        <td><button data-preview-intake-media="${escapeHtml(m.mediaId)}">Preview</button></td></tr>`,
    )
    .join("");

  output.innerHTML = `
    <p class="muted">controlVersion <code>${body.controlVersion}</code>, recordVersion <code>${body.recordVersion}</code> — needed for approve-preservation/approve-publication below, pre-filled.</p>
    <h3>Record</h3>
    <pre>${escapeHtml(JSON.stringify(body.record, null, 2))}</pre>
    <h3>Authority claims</h3>
    <table><thead><tr><th>claimId</th><th>status</th><th>claimant</th><th>scope</th><th>evidenceRef</th></tr></thead><tbody>${claimRows}</tbody></table>
    <h3>Legal rights</h3>
    <table><thead><tr><th>rightId</th><th>status</th><th>holder</th><th>rightType</th><th>jurisdiction</th><th>evidenceRef</th></tr></thead><tbody>${rightRows}</tbody></table>
    <h3>Consent grants</h3>
    <table><thead><tr><th>consentId</th><th>status</th><th>signerCapacitySummary</th><th>purposes</th><th>audience</th><th>mandateRef</th><th>expiresAt</th><th>retentionTermsRef</th><th>withdrawalContact</th></tr></thead><tbody>${grantRows}</tbody></table>
    <h3>Media</h3>
    <table><thead><tr><th>mediaId</th><th>contentType</th><th></th></tr></thead><tbody>${mediaRows}</tbody></table>
    <div id="intake-media-preview"></div>
    <h3>Add/correct evidence</h3>
    <div class="actions" id="intake-evidence-actions"></div>
    <h3>Review decision</h3>
    <div class="actions" id="intake-review-actions"></div>
  `;
  output.querySelectorAll("[data-preview-intake-media]").forEach((button) => {
    button.addEventListener("click", async () => {
      const mediaId = button.dataset.previewIntakeMedia;
      const previewEl = document.getElementById("intake-media-preview");
      previewEl.textContent = "Loading preview…";
      const result = await apiFetchBinary(`/intake/${encodeURIComponent(recordId)}/media/${encodeURIComponent(mediaId)}`);
      if (!result.ok) {
        previewEl.innerHTML = `<p class="error">${escapeHtml(result.body?.error ?? `HTTP ${result.status}`)}</p>`;
        return;
      }
      const url = URL.createObjectURL(result.blob);
      previewEl.innerHTML = `<p class="muted">${escapeHtml(String(result.blob.size))} bytes.</p>`;
      const link = document.createElement("a");
      link.href = url;
      link.textContent = "Open preview in a new tab";
      link.target = "_blank";
      previewEl.appendChild(link);
    });
  });

  const reload = () => loadIntakeSubmission(recordId);
  const evidenceActions = document.getElementById("intake-evidence-actions");
  evidenceActions.append(actionForm(recordId, "add-authority-claim", [
    { name: "claimant", label: "Claimant", required: true },
    { name: "scope", label: "Scope", required: true },
    { name: "evidenceRef", label: "Evidence ref", required: true },
  ], reload));
  evidenceActions.append(actionForm(recordId, "add-legal-right", [
    { name: "holder", label: "Holder", required: true },
    { name: "rightType", label: "Right type", required: true },
    { name: "jurisdiction", label: "Jurisdiction (optional)", optional: true },
    { name: "evidenceRef", label: "Evidence ref", required: true },
  ], reload));
  evidenceActions.append(actionForm(recordId, "add-consent-grant", [
    { name: "signerCapacitySummary", label: "Signer capacity summary", required: true },
    { name: "purposes", label: "Purposes (comma-separated)", required: true, array: true },
    { name: "audience", label: "Audience (public/staff/research-partner)", required: true },
    { name: "mandateRef", label: "Mandate ref (optional)", optional: true },
    { name: "expiresAt", label: "Expires at (ISO, optional)", optional: true },
    { name: "retentionTermsRef", label: "Retention terms ref", required: true },
    { name: "withdrawalContact", label: "Withdrawal contact", required: true },
  ], reload));
  evidenceActions.append(mediaUploadForm(recordId, reload));
  evidenceActions.append(actionForm(recordId, "supersede-authority-claim", [
    { name: "supersededClaimId", label: "Superseded claim id", required: true },
    { name: "claimant", label: "Corrected claimant", required: true },
    { name: "scope", label: "Scope", required: true },
    { name: "evidenceRef", label: "Evidence ref", required: true },
  ], reload));
  evidenceActions.append(actionForm(recordId, "supersede-legal-right", [
    { name: "supersededRightId", label: "Superseded right id", required: true },
    { name: "holder", label: "Corrected holder", required: true },
    { name: "rightType", label: "Right type", required: true },
    { name: "jurisdiction", label: "Jurisdiction (optional)", optional: true },
    { name: "evidenceRef", label: "Evidence ref", required: true },
  ], reload));
  evidenceActions.append(actionForm(recordId, "correct", [
    { name: "field", label: "Field (title, summary, or provenanceRef)", required: true },
    { name: "correctedValue", label: "Corrected value", required: true },
  ], reload));

  const reviewActions = document.getElementById("intake-review-actions");
  reviewActions.append(actionForm(recordId, "approve-preservation", [
    { name: "expectedControlVersion", label: "Expected control version", required: true, numeric: true, value: body.controlVersion },
    { name: "expectedRecordVersion", label: "Expected record version", required: true, numeric: true, value: body.recordVersion },
    { name: "authorityClaimIds", label: "Authority claim ids to approve (comma-separated)", required: true, array: true },
    { name: "legalRightIds", label: "Legal right ids to approve (comma-separated, may be empty)", array: true },
    { name: "consentGrantIds", label: "Consent grant ids to verify (comma-separated)", required: true, array: true },
  ], reload));
  reviewActions.append(actionForm(recordId, "approve-publication", [
    { name: "expectedControlVersion", label: "Expected control version", required: true, numeric: true, value: body.controlVersion },
    { name: "expectedRecordVersion", label: "Expected record version", required: true, numeric: true, value: body.recordVersion },
    { name: "consentGrantIds", label: "Consent grant ids to verify (comma-separated)", required: true, array: true },
  ], reload));
  reviewActions.append(actionForm(recordId, "request-changes", [], reload));
  reviewActions.append(actionForm(recordId, "reject-submission", [], reload));
}

async function loadIntakeQueue() {
  const output = document.getElementById("intake-queue-output");
  output.textContent = "Loading…";
  const { status, body } = await apiFetch("/intake/queue");
  if (status !== 200) {
    output.innerHTML = `<p class="error">${escapeHtml(body?.error ?? `HTTP ${status}`)}</p>`;
    return;
  }
  const row = (e, openLabel) => `<tr>
    <td><code>${escapeHtml(e.recordId)}</code></td>
    <td>${escapeHtml(e.title)}</td>
    <td>${escapeHtml(e.fixtureSetId)}</td>
    <td>${escapeHtml(e.createdAt)}</td>
    <td><button data-open-${openLabel}="${escapeHtml(e.recordId)}">Open</button></td>
  </tr>`;
  output.innerHTML = `
    <h3>Pending preservation review</h3>
    <table><thead><tr><th>recordId</th><th>title</th><th>fixtureSetId</th><th>createdAt</th><th></th></tr></thead>
      <tbody>${body.pendingPreservation.map((e) => row(e, "preservation")).join("")}</tbody></table>
    <h3>Pending publication review</h3>
    <p class="muted">Preserved already — opens in "Look up a record" above with purpose=preservation, audience=staff.</p>
    <table><thead><tr><th>recordId</th><th>title</th><th>fixtureSetId</th><th>createdAt</th><th></th></tr></thead>
      <tbody>${body.pendingPublication.map((e) => row(e, "publication")).join("")}</tbody></table>
  `;
  output.querySelectorAll("[data-open-preservation]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById("intake-id-input").value = button.dataset.openPreservation;
      loadIntakeSubmission(button.dataset.openPreservation);
    });
  });
  output.querySelectorAll("[data-open-publication]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById("record-id-input").value = button.dataset.openPublication;
      document.getElementById("record-purpose").value = "preservation";
      document.getElementById("record-audience").value = "staff";
      loadRecord(button.dataset.openPublication);
    });
  });
}

async function runExport(event) {
  event.preventDefault();
  const data = new FormData(event.target);
  const output = document.getElementById("export-output");
  output.textContent = "Running…";
  const { status, body } = await apiFetch("/export", {
    method: "POST",
    body: JSON.stringify({
      recordIds: data.get("recordIds").split(",").map((s) => s.trim()).filter(Boolean),
      scope: data.get("scope"),
      fixtureSetId: data.get("fixtureSetId"),
      destinationAudience: data.get("destinationAudience"),
    }),
  });
  if (status !== 200) {
    output.innerHTML = `<p class="error">${escapeHtml(body?.error ?? `HTTP ${status}`)}</p>`;
    return;
  }
  output.innerHTML = `<pre>${escapeHtml(JSON.stringify(body, null, 2))}</pre>`;
}

renderAuthBar();
document.getElementById("refresh-requests").addEventListener("click", loadRequests);
document.getElementById("status-filter").addEventListener("change", loadRequests);
document.getElementById("load-record").addEventListener("click", () => {
  const id = document.getElementById("record-id-input").value.trim();
  if (id) loadRecord(id);
});
document.getElementById("export-form").addEventListener("submit", runExport);
document.getElementById("create-submission-form").addEventListener("submit", createSubmission);
document.getElementById("load-intake").addEventListener("click", () => {
  const id = document.getElementById("intake-id-input").value.trim();
  if (id) loadIntakeSubmission(id);
});
document.getElementById("refresh-intake-queue").addEventListener("click", loadIntakeQueue);
if (currentIdToken()) {
  loadRequests();
}
