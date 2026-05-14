import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { resolveOrg } from '../middleware/org.js';
import { logAgentRun } from '../db.js';

const router = Router();
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function getApiKey() {
  return process.env.GEMINI_API_KEY;
}

// ── Call Gemini API ──
async function callGeminiAPI(apiKey, { system, messages, max_tokens, search = false }) {
  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  // Convert messages to Gemini format
  const contents = [];
  if (system) {
    // Gemini uses systemInstruction for system prompts
  }
  for (const msg of (messages || [])) {
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    });
  }

  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: max_tokens || 1500,
    },
  };

  // System instruction (Gemini 1.5+ / 2.0 supports this)
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  // Google Search grounding — enables real-time web search
  if (search) {
    body.tools = [{ google_search: {} }];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ── Extract text from Gemini response ──
function extractGeminiText(data) {
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.filter(p => p.text).map(p => p.text).join('\n\n') || '';
}

// ── Extract grounding metadata from Gemini response ──
function extractGroundingMetadata(data) {
  const meta = data.candidates?.[0]?.groundingMetadata;
  if (!meta) return null;
  const sources = meta.groundingChunks?.map(c => ({
    url: c.web?.uri || null,
    title: c.web?.title || null,
  })).filter(s => s.url) || [];
  return sources.length > 0 ? sources : null;
}

// ── Standalone caller for server-side jobs (no Express req/res) ──
export async function callGemini(system, user, { search = false, maxTokens = 1500 } = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No GEMINI_API_KEY configured');

  const response = await callGeminiAPI(apiKey, {
    system,
    messages: [{ role: 'user', content: user }],
    max_tokens: maxTokens,
    search,
  });

  if (!response.ok) {
    const errText = await response.text();
    let msg = `Gemini API error (${response.status})`;
    try { msg = JSON.parse(errText).error?.message || msg; } catch {}
    throw new Error(msg);
  }

  const data = await response.json();
  return extractGeminiText(data);
}

// ── Standalone caller that also returns grounding sources ──
export async function callGeminiWithGrounding(system, user, { maxTokens = 4000 } = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No GEMINI_API_KEY configured');

  const response = await callGeminiAPI(apiKey, {
    system,
    messages: [{ role: 'user', content: user }],
    max_tokens: maxTokens,
    search: true,
  });

  if (!response.ok) {
    const errText = await response.text();
    let msg = `Gemini API error (${response.status})`;
    try { msg = JSON.parse(errText).error?.message || msg; } catch {}
    throw new Error(msg);
  }

  const data = await response.json();
  return {
    text: extractGeminiText(data),
    sources: extractGroundingMetadata(data),
  };
}

// POST /api/org/:slug/ai/messages — proxied Gemini API call (authenticated)
router.post('/org/:slug/ai/messages', resolveOrg, requireAuth, async (req, res) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'No GEMINI_API_KEY configured. Add GEMINI_API_KEY to your environment variables.' } });
  }

  const start = Date.now();
  try {
    const { _agent_type, _grant_id, model: _model, tools: _tools, ...apiBody } = req.body;

    // Extract search flag from request — enables Google Search grounding
    const useSearch = apiBody.search === true;
    delete apiBody.search;

    const response = await callGeminiAPI(apiKey, {
      system: apiBody.system,
      messages: apiBody.messages,
      max_tokens: apiBody.max_tokens,
      search: useSearch,
    });
    const rawData = await response.text();
    const duration = Date.now() - start;

    if (!response.ok) {
      let errMsg = `Gemini API error (${response.status})`;
      try { errMsg = JSON.parse(rawData).error?.message || errMsg; } catch {}
      res.status(response.status).json({ error: { message: errMsg } });
      return;
    }

    const parsed = JSON.parse(rawData);
    const text = extractGeminiText(parsed);
    const sources = extractGroundingMetadata(parsed);

    // Normalize response to match frontend expectations (Anthropic-style format)
    const normalizedResponse = {
      content: [{ type: 'text', text }],
      usage: {
        input_tokens: parsed.usageMetadata?.promptTokenCount || 0,
        output_tokens: parsed.usageMetadata?.candidatesTokenCount || 0,
      },
    };

    // Attach grounding sources if available
    if (sources) {
      normalizedResponse.grounding_sources = sources;
    }

    // Log the agent run for audit
    try {
      await logAgentRun(req.orgId, {
        agent_type: _agent_type || 'chat',
        grant_id: _grant_id || null,
        prompt_summary: (apiBody.messages?.[0]?.content || '').slice(0, 200),
        result_summary: text.slice(0, 200),
        tokens_in: normalizedResponse.usage.input_tokens,
        tokens_out: normalizedResponse.usage.output_tokens,
        duration_ms: duration,
        status: 'completed',
        member_id: req.memberId || null,
      });
    } catch { /* audit logging is best-effort */ }

    res.status(200).json(normalizedResponse);
  } catch (err) {
    res.status(502).json({ error: { message: `Proxy error: ${err.message}` } });
  }
});

// POST /api/org/:slug/ai/verify-urls — batch URL health check.
// Uses a real Chrome User-Agent + standard headers so SA corporate sites
// behind Cloudflare don't immediately 403 a bot.
//
// Returns:
//   ok:    true  — URL is reachable (200, 301/302/303/307/308 redirects, 401, 403)
//   ok:    false — URL is broken (404, 410, DNS fail, connection refused, timeout)
//
// 401/403 count as "exists" because Cloudflare and similar gateways return them
// to non-browser clients even though the page is fine in a real browser.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
};

function classifyStatus(status) {
  if (status >= 200 && status < 300) return { ok: true,  reason: 'ok' };
  if (status >= 300 && status < 400) return { ok: true,  reason: 'redirect' };
  if (status === 401 || status === 403) return { ok: true, reason: 'auth_required' }; // bot-blocked, page exists
  if (status === 404 || status === 410) return { ok: false, reason: 'not_found' };
  if (status >= 500) return { ok: false, reason: 'server_error' };
  return { ok: false, reason: 'unknown' };
}

router.post('/org/:slug/ai/verify-urls', resolveOrg, requireAuth, async (req, res) => {
  const { urls } = req.body;
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'urls array required' });
  }

  const fetchWithTimeout = async (url, method, timeoutMs = 10000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        signal: controller.signal,
        redirect: 'follow',
        headers: BROWSER_HEADERS,
      });
      // Don't read body, just headers
      if (method === 'GET') response.body?.cancel?.();
      return { ok: true, response };
    } catch (err) {
      return { ok: false, err };
    } finally {
      clearTimeout(timer);
    }
  };

  const results = await Promise.all(
    urls.slice(0, 20).map(async (url) => {
      // Try GET first — many servers (esp. Cloudflare-fronted) treat HEAD weirdly
      let attempt = await fetchWithTimeout(url, 'GET');
      // If GET fails, fall back to HEAD (some servers explicitly block GET to bots)
      if (!attempt.ok) attempt = await fetchWithTimeout(url, 'HEAD');

      if (!attempt.ok) {
        return { url, status: 0, ok: false, reason: 'unreachable', error: attempt.err?.message || 'fetch failed' };
      }
      const r = attempt.response;
      const cls = classifyStatus(r.status);
      return {
        url,
        status: r.status,
        ok: cls.ok,
        reason: cls.reason,
        redirect: r.redirected ? r.url : null,
      };
    })
  );

  res.json({ results });
});

export default router;
