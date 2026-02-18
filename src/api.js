/* ═══════════════════════════════════════
   API Layer — Org-scoped, authenticated
   ═══════════════════════════════════════ */

// ── Auth state ──
let _token = localStorage.getItem('gt_token');
let _slug = localStorage.getItem('gt_slug');

export const setAuth = (token, slug) => {
  _token = token;
  _slug = slug;
  if (token) {
    localStorage.setItem('gt_token', token);
    localStorage.setItem('gt_slug', slug);
  } else {
    localStorage.removeItem('gt_token');
    localStorage.removeItem('gt_slug');
  }
};

export const getAuth = () => ({ token: _token, slug: _slug });
export const isLoggedIn = () => !!_token && !!_slug;

// ── Fetch wrapper (org-scoped, auth headers) ──
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

  return res;
};

// ── Auth ──

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

// ── Orgs (some public, some auth-required) ──

export const getOrgs = async () => {
  const res = await fetch('/api/orgs');
  return res.json();
};

export const createNewOrg = async (data) => {
  const res = await fetch('/api/orgs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create org');
  }
  return res.json();
};

export const getOrg = async () => {
  const res = await f('');
  return res.json();
};

export const updateOrg = async (data) => {
  await f('', { method: 'PUT', body: JSON.stringify(data) });
};

export const uploadOrgLogo = async (file) => {
  const form = new FormData();
  form.append('logo', file);
  const res = await f('/logo', { method: 'PUT', body: form });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Logo upload failed');
  }
  return res.json();
};

// ── Profile ──

export const getProfile = async () => {
  const res = await f('/profile');
  return res.json();
};

export const updateProfile = async (data) => {
  await f('/profile', { method: 'PUT', body: JSON.stringify(data) });
};

// ── Config ──

export const getConfig = async () => {
  const res = await f('/config');
  return res.json();
};

export const updateConfig = async (data) => {
  await f('/config', { method: 'PUT', body: JSON.stringify(data) });
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
  await f(`/team/${id}`, { method: 'DELETE' });
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
  await f(`/grants/${id}`, { method: 'DELETE' });
};

export const replaceGrants = async (grants) => {
  await f('/grants', { method: 'PUT', body: JSON.stringify(grants) });
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
};

export const createComplianceDoc = async (data) => {
  const res = await f('/compliance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  await f(`/kv/${key}`, { method: 'PUT', body: JSON.stringify(value) });
};

// ── AI proxy (org-scoped) ──

export const api = async (sys, usr, search = false, maxTok = 1500) => {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const body = {
        model: 'gemini-2.0-flash',
        max_tokens: maxTok,
        messages: [{ role: 'user', content: usr }],
      };
      if (sys) body.system = sys;
      if (search) body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];

      const res = await f('/ai/messages', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      // Rate limit — retry with backoff
      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = parseInt(res.headers.get('retry-after')) || (10 * (attempt + 1));
        console.log(`Rate limited (429) — retrying in ${retryAfter}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        continue;
      }

      // Overloaded — retry with backoff
      if (res.status === 529 && attempt < MAX_RETRIES) {
        const wait = 15 * (attempt + 1);
        console.log(`API overloaded (529) — retrying in ${wait}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
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

// ── Uploads ──

export const getUploads = async (grantId) => {
  const qs = grantId ? `?grant_id=${grantId}` : '';
  const res = await f(`/uploads${qs}`);
  return res.json();
};

export const uploadFile = async (file, grantId, category) => {
  const form = new FormData();
  form.append('file', file);
  if (grantId) form.append('grant_id', grantId);
  if (category) form.append('category', category);
  const res = await f('/uploads', { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Upload failed');
  }
  return res.json();
};

export const addYouTubeUrl = async (url, grantId, category) => {
  const res = await f('/uploads/youtube', {
    method: 'POST',
    body: JSON.stringify({ url, grant_id: grantId, category }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'YouTube add failed');
  }
  return res.json();
};

export const deleteUpload = async (id) => {
  await f(`/uploads/${id}`, { method: 'DELETE' });
};

export const getUploadsContext = async (grantId) => {
  const qs = grantId ? `?grant_id=${grantId}` : '';
  const res = await f(`/uploads/context${qs}`);
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
