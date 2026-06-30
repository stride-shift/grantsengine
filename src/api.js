/* ═══════════════════════════════════════
   API Layer — Org-scoped, authenticated
   ═══════════════════════════════════════ */

// ── Auth state ──
let _token = localStorage.getItem('gt_token');
let _slug = localStorage.getItem('gt_slug');
let _member = JSON.parse(localStorage.getItem('gt_member') || 'null');

export const setAuth = (token, slug, member = null) => {
  _token = token;
  _slug = slug;
  _member = member;
  if (token) {
    localStorage.setItem('gt_token', token);
    localStorage.setItem('gt_slug', slug);
    if (member) localStorage.setItem('gt_member', JSON.stringify(member));
    else localStorage.removeItem('gt_member');
  } else {
    localStorage.removeItem('gt_token');
    localStorage.removeItem('gt_slug');
    localStorage.removeItem('gt_member');
  }
};

export const getAuth = () => ({ token: _token, slug: _slug });
export const getCurrentMember = () => _member;
export const isLoggedIn = () => !!_token && !!_slug;

// ── Fetch wrapper (org-scoped, auth headers, error checking) ──
const f = async (path, opts = {}) => {
  const url = path.startsWith('/api') ? path : `/api/org/${_slug}${path}`;
  const headers = { ...opts.headers };

  // Only set Content-Type for non-FormData requests (browser sets multipart boundary for FormData)
  if (!(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (_token) headers['Authorization'] = `Bearer ${_token}`;

  const res = await fetch(url, { ...opts, headers });

  if (res.status === 401) {
    setAuth(null, null);
    window.location.reload();
    throw new Error('Session expired');
  }

  // Check for server errors on non-AI calls (AI calls handle errors themselves)
  if (!res.ok && !opts._skipOkCheck) {
    let msg = `Request failed (${res.status})`;
    try {
      const errBody = await res.clone().json();
      const err = errBody.error;
      msg = (typeof err === 'object' ? err?.message : err) || errBody.message || msg;
    } catch { /* non-JSON error body */ }
    throw new Error(msg);
  }

  return res;
};

// ── Auth (legacy org-level) ──

export const login = async (slug, password) => {
  const res = await fetch(`/api/org/${slug}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Login failed');
  }
  const data = await res.json();
  setAuth(data.token, slug);
  return data;
};

export const logout = async () => {
  try {
    await f('/auth/logout', { method: 'POST' });
  } catch { /* ignore */ }
  setAuth(null, null);
};

export const setPassword = async (slug, password) => {
  const res = await fetch(`/api/org/${slug}/auth/set-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to set password');
  }
  const data = await res.json();
  setAuth(data.token, slug);
  return data;
};

// ── Auth (member-level) ──

export const memberLogin = async (slug, memberId, password) => {
  const res = await fetch(`/api/org/${slug}/auth/member-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Login failed');
  }
  const data = await res.json();
  setAuth(data.token, slug, data.member);
  return data;
};

// ── Auth (email-based, org-agnostic — primary login path) ──
// User signs in with just email + password; the org is resolved server-side from
// the globally-unique email. Stores token + resolved slug + member like memberLogin.
export const loginWithEmail = async (email, password) => {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Login failed');
  }
  const data = await res.json();
  // The unified login route returns EITHER an org-member session OR a standalone
  // super-admin session. A standalone super-admin has no org: store the dedicated
  // super-admin token and DON'T open an org session — the caller routes to the
  // full-page console. Org logins persist token+slug+member as before.
  if (data.superAdmin) {
    setSaToken(data.token);
  } else {
    setAuth(data.token, data.slug || data.org?.slug, data.member);
  }
  return data;
};

// Email-only password reset request (org-agnostic). The server resolves the
// member from the email and emails the reset link. Anti-enumeration: the server
// always responds ok, and we never surface whether the email exists.
export const requestPasswordResetByEmail = async (email) => {
  const res = await fetch('/api/auth/request-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return res.json().catch(() => ({ ok: true }));
};

// Authenticated password set/change (self or director). First-time setup for a
// member with no password uses the emailed reset link instead (see requestPasswordReset).
export const memberSetPassword = async (slug, memberId, password) => {
  const res = await f('/auth/member-set-password', {
    method: 'POST',
    body: JSON.stringify({ memberId, password }),
  });
  return res.json();
};

export const getTeamPublic = async (slug) => {
  const res = await fetch(`/api/org/${slug}/team/public`);
  if (!res.ok) return [];
  return res.json();
};

// ── Admin ──

export const getAdminSessions = async () => {
  const res = await f('/admin/sessions/active');
  return res.json();
};

export const getAdminSessionHistory = async (limit = 30) => {
  const res = await f(`/admin/sessions/history?limit=${limit}`);
  return res.json();
};

export const getAdminActivity = async (memberId = null, limit = 100) => {
  const qs = memberId ? `?member_id=${memberId}&limit=${limit}` : `?limit=${limit}`;
  const res = await f(`/admin/activity${qs}`);
  return res.json();
};

export const requestPasswordReset = async (slug, memberId) => {
  const res = await fetch(`/api/org/${slug}/auth/request-reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to send reset link');
  }
  return res.json();
};

export const resetPasswordWithToken = async (slug, token, newPassword) => {
  const res = await fetch(`/api/org/${slug}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Password reset failed');
  }
  const data = await res.json();
  setAuth(data.token, slug, data.member);
  return data;
};

export const adminResetPassword = async (memberId, password) => {
  const res = await f('/auth/admin-reset-password', {
    method: 'POST', body: JSON.stringify({ memberId, password }),
  });
  return res.json();
};

// ── Orgs (some public, some auth-required) ──

export const getOrgs = async () => {
  const res = await fetch('/api/orgs');
  const text = await res.text();
  if (!text) return [];
  return JSON.parse(text);
};

export const createNewOrg = async (data, adminKey) => {
  const headers = { 'Content-Type': 'application/json' };
  if (adminKey) headers['X-Admin-Key'] = adminKey;
  const res = await fetch('/api/orgs', {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    let msg = 'Failed to create org';
    try {
      const err = await res.json();
      msg = err.error || msg;
    } catch { /* non-JSON error body */ }
    throw new Error(msg);
  }
  const text = await res.text();
  if (!text) return { slug: data.slug, name: data.name };
  return JSON.parse(text);
};

export const deleteOrg = async (slug, adminKey) => {
  const res = await fetch(`/api/orgs/${slug}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Key': adminKey },
  });
  if (!res.ok) {
    let msg = 'Failed to delete org';
    try {
      const err = await res.json();
      msg = err.error || msg;
    } catch { /* non-JSON error body */ }
    throw new Error(msg);
  }
  return res.json();
};

export const getOrg = async () => {
  const res = await f('');
  return res.json();
};

export const updateOrg = async (data) => {
  const res = await f('', { method: 'PUT', body: JSON.stringify(data) });
  return res.json();
};

export const uploadOrgLogo = async (file) => {
  const form = new FormData();
  form.append('logo', file);
  const res = await f('/logo', { method: 'PUT', body: form });
  return res.json();
};

// ── Profile ──

export const getProfile = async () => {
  const res = await f('/profile');
  return res.json();
};

export const updateProfile = async (data) => {
  const res = await f('/profile', { method: 'PUT', body: JSON.stringify(data) });
  return res.json();
};

// ── Config ──

export const getConfig = async () => {
  const res = await f('/config');
  return res.json();
};

export const updateConfig = async (data) => {
  const res = await f('/config', { method: 'PUT', body: JSON.stringify(data) });
  return res.json();
};

// ── Team ──

export const getTeam = async () => {
  const res = await f('/team');
  return res.json();
};

export const upsertTeamMember = async (member) => {
  const method = member.id ? 'PUT' : 'POST';
  const url = member.id ? `/team/${member.id}` : '/team';
  const res = await f(url, { method, body: JSON.stringify(member) });
  return res.json();
};

export const deleteTeamMember = async (id) => {
  const res = await f(`/team/${id}`, { method: 'DELETE' });
  return res.json();
};

// ── Grants ──

export const getGrants = async () => {
  const res = await f('/grants');
  return res.json();
};

export const saveGrant = async (grant) => {
  const res = await f(`/grants/${grant.id}`, { method: 'PUT', body: JSON.stringify(grant) });
  return res.json();
};

export const addGrant = async (grant) => {
  const res = await f('/grants', { method: 'POST', body: JSON.stringify(grant) });
  return res.json();
};

export const removeGrant = async (id) => {
  const res = await f(`/grants/${id}`, { method: 'DELETE' });
  return res.json();
};

export const replaceGrants = async (grants) => {
  const res = await f('/grants', { method: 'PUT', body: JSON.stringify(grants) });
  return res.json();
};

// ── Pipeline Config ──

export const getPipelineConfig = async () => {
  const res = await f('/pipeline-config');
  return res.json();
};

// ── Approvals ──

export const getApprovals = async () => {
  const res = await f('/approvals');
  return res.json();
};

// ── Compliance ──

export const getCompliance = async () => {
  const res = await f('/compliance');
  return res.json();
};

export const updateComplianceDoc = async (id, data) => {
  const res = await f(`/compliance/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return res.json();
};

export const createComplianceDoc = async (data) => {
  const res = await f('/compliance', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.json();
};

// ── KV ──

export const kvGet = async (key) => {
  const res = await f(`/kv/${key}`);
  return res.json();
};

export const kvSet = async (key, value) => {
  const res = await f(`/kv/${key}`, { method: 'PUT', body: JSON.stringify(value) });
  return res.json();
};

// ── AI proxy (org-scoped) ──

export const api = async (sys, usr, search = false, maxTok = 1500) => {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const body = {
        max_tokens: maxTok,
        messages: [{ role: 'user', content: usr }],
      };
      if (sys) body.system = sys;
      if (search) body.search = true; // Enable web-search grounding (OpenAI Responses API)

      const res = await f('/ai/messages', {
        method: 'POST',
        body: JSON.stringify(body),
        _skipOkCheck: true, // AI handler manages its own error/retry logic
      });

      // Rate limit — retry with backoff
      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = parseInt(res.headers.get('retry-after')) || (10 * (attempt + 1));
        console.log(`Rate limited (429) — retrying in ${retryAfter}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        continue;
      }

      // Overloaded / transient server errors — retry with backoff
      if ((res.status === 529 || res.status === 500 || res.status === 502 || res.status === 503) && attempt < MAX_RETRIES) {
        const wait = 15 * (attempt + 1);
        console.log(`API ${res.status} — retrying in ${wait}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, wait * 1000));
        continue;
      }

      if (!res.ok) {
        const errText = (await res.text()).slice(0, 500);
        // Parse and return friendly messages
        try {
          const errJson = JSON.parse(errText);
          const msg = errJson.error?.message || errJson.error?.type || errText;
          if (res.status === 429) {
            if (msg.includes('input tokens')) return 'Rate limit reached — too many input tokens. Please wait 60 seconds and try again.';
            return 'Rate limit reached — please wait a moment and try again.';
          }
          if (res.status === 529) return 'The AI service is temporarily overloaded — please try again shortly.';
          return `Error: ${msg}`;
        } catch {
          return `Error (${res.status}): ${errText.slice(0, 200)}`;
        }
      }

      const d = await res.json();
      if (d.error) return `Error: ${d.error.message || d.error.type}`;
      if (d.stop_reason === 'max_tokens') {
        console.warn(`[AI] Output truncated (hit token limit). Used ${d.usage?.output_tokens} tokens.`);
      }
      const texts = d.content?.filter(b => b.type === 'text').map(b => b.text).filter(Boolean);
      return texts?.length ? texts.join('\n\n') : 'No response — try again.';
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 5000 * (attempt + 1)));
        continue;
      }
      return `Connection error: ${e.message}`;
    }
  }
  return 'Request failed after multiple retries — please try again.';
};

// ── URL Verification ──
export const verifyUrls = async (urls) => {
  const res = await f('/ai/verify-urls', {
    method: 'POST',
    body: JSON.stringify({ urls }),
  });
  const data = await res.json();
  return data.results || [];
};

// ── Uploads ──

export const getUploads = async (grantId) => {
  const qs = grantId ? `?grant_id=${grantId}` : '';
  const res = await f(`/uploads${qs}`);
  return res.json();
};

export const uploadFile = async (file, grantId, category, visibility) => {
  const form = new FormData();
  form.append('file', file);
  if (grantId) form.append('grant_id', grantId);
  if (category) form.append('category', category);
  if (visibility) form.append('visibility', visibility);
  const res = await f('/uploads', { method: 'POST', body: form });
  return res.json();
};

export const addYouTubeUrl = async (url, grantId, category) => {
  const res = await f('/uploads/youtube', {
    method: 'POST',
    body: JSON.stringify({ url, grant_id: grantId, category }),
  });
  return res.json();
};

export const deleteUpload = async (id) => {
  const res = await f(`/uploads/${id}`, { method: 'DELETE' });
  return res.json();
};

export const getUploadsByCategory = async (category) => {
  const res = await f(`/uploads?category=${encodeURIComponent(category)}`);
  return res.json();
};

export const getUploadFull = async (id) => {
  const res = await f(`/uploads/${id}`);
  return res.json();
};

export const getUploadDownloadUrl = async (id) => {
  const res = await f(`/uploads/${id}/download`);
  return res.json();
};

export const getUploadsContext = async (grantId) => {
  const qs = grantId ? `?grant_id=${grantId}` : '';
  const res = await f(`/uploads/context${qs}`);
  return res.json();
};

// ── Google Calendar ──

export const getGcalStatus = async () => {
  const res = await f('/gcal/status');
  return res.json();
};

export const getGcalAuthUrl = async () => {
  const { slug } = getAuth();
  const member = getCurrentMember();
  const memberId = member?.id || '';
  const res = await fetch(`/api/auth/google/url?slug=${slug}&memberId=${memberId}`);
  return res.json();
};

export const disconnectGcal = async () => {
  const res = await f('/gcal/disconnect', { method: 'POST' });
  return res.json();
};

export const syncGrantToGcal = async (grant) => {
  const res = await f('/gcal/sync', {
    method: 'POST',
    body: JSON.stringify({
      grantId: grant.id, grantName: grant.name, funder: grant.funder,
      deadline: grant.deadline, owner: grant.owner, ask: grant.ask,
      stage: grant.stage, applyUrl: grant.applyUrl,
    }),
  });
  return res.json();
};

export const syncAllToGcal = async () => {
  const res = await f('/gcal/sync-all', { method: 'POST' });
  return res.json();
};

export const reassignGcal = async (grantId, oldOwner, newOwner, grant) => {
  const res = await f('/gcal/reassign', {
    method: 'POST',
    body: JSON.stringify({
      grantId, oldOwner, newOwner,
      grantName: grant.name, funder: grant.funder,
      deadline: grant.deadline, ask: grant.ask,
      stage: grant.stage, applyUrl: grant.applyUrl,
    }),
  });
  return res.json();
};

// ── Auto-fill application forms ──

export const detectForm = async (grantId) => {
  const res = await f(`/grants/${grantId}/detect-form`, { method: 'POST' });
  return res.json();
};

export const getAutofillJob = async (jobId) => {
  const res = await f(`/autofill/${jobId}`);
  return res.json();
};

export const updateAutofillMappings = async (jobId, fieldMappings) => {
  const res = await f(`/autofill/${jobId}`, {
    method: 'PUT',
    body: JSON.stringify({ field_mappings: fieldMappings }),
  });
  return res.json();
};

export const runAutofill = async (jobId, credentials) => {
  const res = await f(`/autofill/${jobId}/fill`, {
    method: 'POST',
    body: JSON.stringify({ credentials }),
    _skipOkCheck: true,
  });
  return res.json();
};

export const submitAutofill = async (jobId) => {
  const res = await f(`/autofill/${jobId}/submit`, { method: 'POST', _skipOkCheck: true });
  return res.json();
};

// ── Super Admin (platform-level) ──
// A super-admin is EITHER a standalone platform account (dedicated super-admin
// session token, stored under `ge_sa_token`) OR a normal org member whose email is
// registered server-side in super_admins. The backend's requireSuperAdmin accepts
// BOTH a super-admin session token and an org session token whose member is a
// super-admin. saFetch sends the dedicated super-admin token when one is present
// (standalone ?superadmin console), otherwise falls back to the org session token
// (embedded Admin sub-tab). It prepends /api/superadmin and never touches _slug.

let _saToken = localStorage.getItem('ge_sa_token');
export const getSaToken = () => _saToken;
export const setSaToken = (t) => {
  _saToken = t;
  if (t) localStorage.setItem('ge_sa_token', t);
  else localStorage.removeItem('ge_sa_token');
};
export const saIsLoggedIn = () => !!_saToken;

// NOTE: The standalone super-admin login route is gone — the unified
// /api/auth/login (loginWithEmail) now returns a super-admin session for an email
// that isn't an org member but IS a super-admin, and stores ge_sa_token there.

export const superAdminLogout = async () => {
  try {
    if (_saToken) {
      await fetch('/api/superadmin/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${_saToken}` },
      });
    }
  } catch { /* best-effort */ }
  setSaToken(null);
};

export const superAdminVerify = async () => {
  const res = await saFetch('/verify');
  return res.json();
};

const saFetch = async (path, opts = {}) => {
  const headers = { ...opts.headers };
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const tok = _saToken || _token;
  if (tok) headers['Authorization'] = `Bearer ${tok}`;

  const res = await fetch(`/api/superadmin${path}`, { ...opts, headers });

  if (res.status === 401) {
    // Standalone super-admin console: a dead SA token returns to login.
    if (_saToken) {
      setSaToken(null);
      window.location.reload();
      throw new Error('Session expired');
    }
    // Embedded (org-session) super-admin call — no separate SA token. A 401/403 on a
    // /superadmin route here is a permission problem with THIS request, not proof the
    // org session is dead, so don't tear down the whole org login. Surface it as an
    // error for the dashboard to show. A genuinely expired org token is caught by the
    // ordinary org-scoped requests' own expiry handling.
    throw new Error('Super-admin access required.');
  }
  if (!res.ok && !opts._skipOkCheck) {
    let msg = `Request failed (${res.status})`;
    try {
      const errBody = await res.clone().json();
      const err = errBody.error;
      msg = (typeof err === 'object' ? err?.message : err) || errBody.message || msg;
    } catch { /* non-JSON error body */ }
    throw new Error(msg);
  }
  return res;
};

export const saGetOrgs = async () => {
  const res = await saFetch('/orgs');
  return res.json();
};

export const saGetOrgActivity = async (orgId, limit = 100) => {
  const res = await saFetch(`/orgs/${orgId}/activity?limit=${limit}`);
  return res.json();
};

export const saGetOrgSessions = async (orgId) => {
  const res = await saFetch(`/orgs/${orgId}/sessions`);
  return res.json();
};

export const saGetOrgUsage = async (orgId) => {
  const res = await saFetch(`/orgs/${orgId}/usage`);
  return res.json();
};

export const saSetSubscription = async (orgId, body) => {
  const res = await saFetch(`/orgs/${orgId}/subscription`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return res.json();
};

// Provision a new organisation. body: { name, slug, website?, industry?, country?, currency? }
export const saCreateOrg = async (body) => {
  const res = await saFetch('/orgs', { method: 'POST', body: JSON.stringify(body) });
  return res.json();
};

// Add a member to an org (server emails them a setup link).
// body: { name, email?, role?, accessLevel? } — accessLevel ∈ super_admin|admin|user.
export const saAddMember = async (orgId, body) => {
  const res = await saFetch(`/orgs/${orgId}/members`, { method: 'POST', body: JSON.stringify(body) });
  return res.json();
};

// List the members of an org (no password_hash; the 'team' placeholder excluded).
export const saGetMembers = async (orgId) => {
  const res = await saFetch(`/orgs/${orgId}/members`);
  return res.json();
};

// Update a member. body: { name?, email?, role?, accessLevel? }. Returns the
// updated member (404 if not found / wrong org).
export const saUpdateMember = async (orgId, memberId, body) => {
  const res = await saFetch(`/orgs/${orgId}/members/${memberId}`, {
    method: 'PUT', body: JSON.stringify(body),
  });
  return res.json();
};

// Delete a member. Returns { ok: true }.
export const saDeleteMember = async (orgId, memberId) => {
  const res = await saFetch(`/orgs/${orgId}/members/${memberId}`, { method: 'DELETE' });
  return res.json();
};

// Create a standalone super-admin (no org). body: { email, name }. Returns
// { ok, email, message } — the message explains how to set the password (via the
// create-superadmin.js server script). 409 if the email is already a super-admin.
export const saCreateAdmin = async (body) => {
  const res = await saFetch('/admins', { method: 'POST', body: JSON.stringify(body) });
  return res.json();
};

export const saDeleteOrg = async (orgId) => {
  const res = await saFetch(`/orgs/${orgId}`, { method: 'DELETE' });
  return res.json();
};

// ── Health ──

export const checkHealth = async () => {
  try {
    const res = await fetch('/api/health');
    return res.json();
  } catch {
    return { ok: false, apiKeyConfigured: false };
  }
};
