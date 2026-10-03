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

function actionForm(recordId, action, extraFields, onDone) {
  const fieldsHtml = extraFields
    .map((f) => `<label>${escapeHtml(f.label)}<input name="${f.name}" ${f.required ? "required" : ""} /></label>`)
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
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const body = { reason: data.get("reason") };
    for (const f of extraFields) {
      const value = data.get(f.name);
      body[f.name] = f.array ? value.split(",").map((s) => s.trim()).filter(Boolean) : value;
    }
    const resultEl = form.querySelector(".result");
    resultEl.textContent = "Submitting…";
    const { status, body: responseBody } = await apiFetch(`/records/${encodeURIComponent(recordId)}/${action}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    resultEl.innerHTML = `<pre>${escapeHtml(JSON.stringify(responseBody, null, 2))}</pre>`;
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
  output.innerHTML = `
    ${accessNote}
    <h3>Record</h3>
    <pre>${escapeHtml(JSON.stringify(body.record, null, 2))}</pre>
    <h3>Control (restriction register)</h3>
    <pre>${escapeHtml(JSON.stringify(body.control, null, 2))}</pre>
    ${evidenceHtml}
    <h3>Custody copies</h3>
    <pre>${escapeHtml(JSON.stringify(body.custodyCopies, null, 2))}</pre>
    <h3>Audit receipts</h3>
    <pre>${escapeHtml(JSON.stringify(body.auditReceipts, null, 2))}</pre>
    <h3>Actions</h3>
    <div class="actions" id="actions-container"></div>
  `;
  const actions = document.getElementById("actions-container");
  const reload = () => loadRecord(recordId);
  actions.append(actionForm(recordId, "restrict", [{ name: "purposes", label: "Purposes (comma-separated)", required: true, array: true }], reload));
  actions.append(actionForm(recordId, "withdraw", [], reload));
  actions.append(actionForm(recordId, "retain", [], reload));
  actions.append(actionForm(recordId, "start-deletion", [], reload));
  actions.append(actionForm(recordId, "complete-deletion", [{ name: "deletionRequestId", label: "Deletion requestId (from start-deletion's response)", required: true }], reload));
  actions.append(actionForm(recordId, "revoke-consent", [{ name: "consentId", label: "Consent id", required: true }], reload));

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
  });
  actions.append(checkForm);
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
if (currentIdToken()) {
  loadRequests();
}
