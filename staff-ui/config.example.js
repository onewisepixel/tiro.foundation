// Copy this file to config.js (gitignored — these values are specific to
// one deployed stack/namespace, not committed) and fill in the four values
// `cdk deploy` printed as stack outputs: StaffApiUrl, StaffUserPoolId,
// StaffUserPoolClientId, StaffUserPoolDomain.
window.TIRO_STAFF_CONFIG = {
  apiBaseUrl: "https://REPLACE_ME.execute-api.us-east-1.amazonaws.com",
  cognitoDomain: "https://REPLACE_ME.auth.us-east-1.amazoncognito.com",
  clientId: "REPLACE_ME",
  // Must exactly match a callback/logout URL registered on the Cognito app
  // client (staffUiCallbackUrls in infra/lib/fixture-backend-stack.ts) —
  // Cognito rejects the redirect otherwise. Matches this UI's default
  // "run with npx serve -l 4300" port; change both together if you serve
  // it from a different port.
  callbackUrl: "http://localhost:4300/callback.html",
  logoutUrl: "http://localhost:4300/index.html",
};
