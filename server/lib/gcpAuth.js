/**
 * Service-to-service auth for calling another Cloud Run service.
 *
 * The org's Domain Restricted Sharing policy forbids `allUsers`, so internal
 * services (e.g. the Playwright service) cannot be made public. Instead the
 * caller's runtime service account is granted roles/run.invoker on the target and
 * sends a Google-signed ID token (audience = the target's base URL). On Cloud Run
 * that token comes from the metadata server. Off-GCP (local dev) the metadata
 * server is unreachable, so we return null and the caller proceeds without it
 * (local Playwright is reached over plain localhost with no IAM layer).
 */

const _tokenCache = new Map(); // audience -> { token, exp }

/** Fetch (and cache ~50 min) a Google ID token for the given audience, or null off-GCP. */
export async function getIdToken(audience) {
  if (!audience) return null;
  const now = Date.now();
  const cached = _tokenCache.get(audience);
  if (cached && cached.exp > now) return cached.token;
  try {
    const res = await fetch(
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`,
      { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(2000) }
    );
    if (!res.ok) return null;
    const token = (await res.text()).trim();
    if (!token) return null;
    _tokenCache.set(audience, { token, exp: now + 50 * 60 * 1000 }); // ID tokens last ~1h
    return token;
  } catch {
    return null; // not on GCP (local dev) — no IAM token available
  }
}

/**
 * Build request headers for a call to a secret-gated internal Cloud Run service:
 * JSON + the shared X-Service-Key + (on Cloud Run) a Bearer ID token so the call
 * passes Cloud Run's IAM invoker check. `serviceUrl` is the audience.
 */
export async function serviceAuthHeaders(serviceUrl, serviceKey) {
  const headers = { 'Content-Type': 'application/json', 'X-Service-Key': serviceKey };
  const idToken = await getIdToken(serviceUrl);
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  return headers;
}
