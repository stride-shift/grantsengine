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

// POST /api/org/:slug/ai/verify-urls — batch URL health check
router.post('/org/:slug/ai/verify-urls', resolveOrg, requireAuth, async (req, res) => {
  const { urls } = req.body;
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'urls array required' });
  }

  const results = await Promise.all(
    urls.slice(0, 20).map(async (url) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0 (GrantEngine URL Checker)' },
        });
        clearTimeout(timeout);
        return { url, status: response.status, ok: response.ok, redirect: response.redirected ? response.url : null };
      } catch (err) {
        // HEAD failed, try GET (some servers block HEAD)
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            redirect: 'follow',
            headers: { 'User-Agent': 'Mozilla/5.0 (GrantEngine URL Checker)' },
          });
          clearTimeout(timeout);
          // Only read enough to confirm it's alive, don't consume full body
          response.body?.cancel?.();
          return { url, status: response.status, ok: response.ok, redirect: response.redirected ? response.url : null };
        } catch {
          return { url, status: 0, ok: false, error: err.message };
        }
      }
    })
  );

  res.json({ results });
});

export default router;
