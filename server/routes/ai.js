import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { resolveOrg } from '../middleware/org.js';
import { logAgentRun } from '../db.js';
import { assertSafeUrl } from '../lib/ssrfGuard.js';
import { classifyApplyHtml } from '../lib/applyLinkClassifier.js';

const router = Router();
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const SEARCH_MODEL = process.env.OPENAI_SEARCH_MODEL || 'gpt-4o';
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

function getApiKey() {
  return process.env.OPENAI_API_KEY;
}

// Fetch that retries transient OpenAI failures (429 + 5xx) with backoff.
// Used by the standalone server-side callers (scout, scraper) which previously
// had no retry — a single 429 would silently drop a whole scout market.
async function fetchWithRetry(url, opts, { retries = 3 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, opts);
    if (response.ok || (response.status !== 429 && response.status < 500) || attempt >= retries) {
      return response;
    }
    const wait = Math.min(30_000, 2_000 * (attempt + 1) * (attempt + 1));
    console.warn(`[OpenAI] ${response.status} — retrying in ${wait / 1000}s (attempt ${attempt + 1}/${retries})`);
    await new Promise(r => setTimeout(r, wait));
  }
}

// ── Chat completions: standard text generation ──
async function callChatCompletions(apiKey, { system, messages, max_tokens, model, responseJson }) {
  const openaiMessages = [];
  if (system) openaiMessages.push({ role: 'system', content: system });
  for (const msg of (messages || [])) {
    openaiMessages.push({
      role: msg.role === 'model' ? 'assistant' : msg.role,
      content: msg.content,
    });
  }

  const body = {
    model: model || DEFAULT_MODEL,
    messages: openaiMessages,
    max_tokens: max_tokens || 1500,
  };
  if (responseJson) body.response_format = { type: 'json_object' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetchWithRetry(OPENAI_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
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

// ── Responses API: chat with built-in web_search tool ──
async function callResponsesWithSearch(apiKey, { system, user, max_tokens, model }) {
  const input = [];
  if (system) input.push({ role: 'system', content: system });
  input.push({ role: 'user', content: user });

  const body = {
    model: model || SEARCH_MODEL,
    input,
    tools: [{ type: 'web_search_preview' }],
    max_output_tokens: max_tokens || 4000,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetchWithRetry(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
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

// ── Extract text from Chat Completions response ──
function extractChatText(data) {
  return data.choices?.[0]?.message?.content || '';
}

// ── Extract text + sources from Responses API output ──
function extractResponsesText(data) {
  if (data.output_text) return data.output_text;
  const parts = [];
  for (const item of (data.output || [])) {
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c.type === 'output_text' && c.text) parts.push(c.text);
      }
    }
  }
  return parts.join('\n\n');
}

function extractResponsesSources(data) {
  const sources = [];
  const seen = new Set();
  for (const item of (data.output || [])) {
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const c of item.content) {
        for (const ann of (c.annotations || [])) {
          if (ann.type === 'url_citation' && ann.url && !seen.has(ann.url)) {
            seen.add(ann.url);
            sources.push({ url: ann.url, title: ann.title || null });
          }
        }
      }
    }
  }
  return sources.length > 0 ? sources : null;
}

// ── Standalone caller for server-side jobs (no Express req/res) ──
export async function callOpenAI(system, user, { search = false, maxTokens = 1500 } = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No OPENAI_API_KEY configured');

  if (search) {
    const response = await callResponsesWithSearch(apiKey, { system, user, max_tokens: maxTokens });
    if (!response.ok) {
      const errText = await response.text();
      let msg = `OpenAI API error (${response.status})`;
      try { msg = JSON.parse(errText).error?.message || msg; } catch {}
      throw new Error(msg);
    }
    const data = await response.json();
    return extractResponsesText(data);
  }

  const response = await callChatCompletions(apiKey, {
    system,
    messages: [{ role: 'user', content: user }],
    max_tokens: maxTokens,
  });

  if (!response.ok) {
    const errText = await response.text();
    let msg = `OpenAI API error (${response.status})`;
    try { msg = JSON.parse(errText).error?.message || msg; } catch {}
    throw new Error(msg);
  }

  const data = await response.json();
  return extractChatText(data);
}

// ── Standalone caller that also returns web search sources ──
export async function callOpenAIWithSearch(system, user, { maxTokens = 4000 } = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No OPENAI_API_KEY configured');

  const response = await callResponsesWithSearch(apiKey, { system, user, max_tokens: maxTokens });
  if (!response.ok) {
    const errText = await response.text();
    let msg = `OpenAI API error (${response.status})`;
    try { msg = JSON.parse(errText).error?.message || msg; } catch {}
    throw new Error(msg);
  }

  const data = await response.json();
  return {
    text: extractResponsesText(data),
    sources: extractResponsesSources(data),
  };
}

// ── Standalone Claude (Anthropic) caller for the grant scraper ──
// Uses Claude Haiku 4.5. When `search` is true the web_search server tool is
// enabled so Claude can confirm facts/links and won't return what it can't verify.
// Lazy-imports the SDK so this module still loads if the dep isn't installed yet.
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';

let _anthropicClient = null;
async function getAnthropic() {
  if (_anthropicClient) return _anthropicClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('No ANTHROPIC_API_KEY configured');
  let Anthropic;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch {
    throw new Error('@anthropic-ai/sdk is not installed — run `npm install`');
  }
  _anthropicClient = new Anthropic({ apiKey });
  return _anthropicClient;
}

function extractClaudeText(message) {
  return (message.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

export async function callClaude(system, user, { search = false, maxTokens = 4000 } = {}) {
  const client = await getAnthropic();
  // allowed_callers 'direct': Haiku doesn't support programmatic tool calling,
  // so the web_search tool must be restricted to model-initiated calls.
  const tools = search ? [{ type: 'web_search_20260209', name: 'web_search', allowed_callers: ['direct'] }] : undefined;

  const messages = [{ role: 'user', content: user }];
  let message;
  // Server-side tool loops can return stop_reason "pause_turn" when they hit the
  // internal iteration cap — re-send to resume. Cap continuations to avoid loops.
  for (let i = 0; i < 5; i++) {
    message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages,
      ...(tools ? { tools } : {}),
    });
    if (message.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: message.content });
  }
  return extractClaudeText(message);
}

// POST /api/org/:slug/ai/messages — proxied OpenAI API call (authenticated)
router.post('/org/:slug/ai/messages', resolveOrg, requireAuth, async (req, res) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'No OPENAI_API_KEY configured. Add OPENAI_API_KEY to your environment variables.' } });
  }

  const start = Date.now();
  try {
    const { _agent_type, _grant_id, model: _model, tools: _tools, ...apiBody } = req.body;

    // Extract search flag from request — enables OpenAI web_search via Responses API
    const useSearch = apiBody.search === true;
    delete apiBody.search;

    let text, sources = null, usage = { input_tokens: 0, output_tokens: 0 };

    if (useSearch) {
      const userContent = (apiBody.messages || []).map(m => m.content).join('\n\n');
      const response = await callResponsesWithSearch(apiKey, {
        system: apiBody.system,
        user: userContent,
        max_tokens: apiBody.max_tokens,
      });
      const rawData = await response.text();
      if (!response.ok) {
        let errMsg = `OpenAI API error (${response.status})`;
        try { errMsg = JSON.parse(rawData).error?.message || errMsg; } catch {}
        return res.status(response.status).json({ error: { message: errMsg } });
      }
      const parsed = JSON.parse(rawData);
      text = extractResponsesText(parsed);
      sources = extractResponsesSources(parsed);
      usage = {
        input_tokens: parsed.usage?.input_tokens || 0,
        output_tokens: parsed.usage?.output_tokens || 0,
      };
    } else {
      const response = await callChatCompletions(apiKey, {
        system: apiBody.system,
        messages: apiBody.messages,
        max_tokens: apiBody.max_tokens,
      });
      const rawData = await response.text();
      if (!response.ok) {
        let errMsg = `OpenAI API error (${response.status})`;
        try { errMsg = JSON.parse(rawData).error?.message || errMsg; } catch {}
        return res.status(response.status).json({ error: { message: errMsg } });
      }
      const parsed = JSON.parse(rawData);
      text = extractChatText(parsed);
      usage = {
        input_tokens: parsed.usage?.prompt_tokens || 0,
        output_tokens: parsed.usage?.completion_tokens || 0,
      };
    }

    const duration = Date.now() - start;

    // Normalize response to match frontend expectations (Anthropic-style format)
    const normalizedResponse = {
      content: [{ type: 'text', text }],
      usage,
    };
    if (sources) normalizedResponse.grounding_sources = sources;

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
      // Caller reads the GET body to classify apply-page vs homepage; HEAD has none.
      return { ok: true, response };
    } catch (err) {
      return { ok: false, err };
    } finally {
      clearTimeout(timer);
    }
  };

  const results = await Promise.all(
    urls.slice(0, 20).map(async (url) => {
      // SSRF guard: never let a user-supplied URL reach internal/metadata hosts
      try {
        await assertSafeUrl(url);
      } catch (e) {
        return { url, status: 0, ok: false, reason: 'blocked', error: e.message };
      }
      // Try GET first — many servers (esp. Cloudflare-fronted) treat HEAD weirdly
      let attempt = await fetchWithTimeout(url, 'GET');
      const gotGetBody = attempt.ok; // a GET response whose HTML we can classify
      // If GET fails, fall back to HEAD (some servers explicitly block GET to bots)
      if (!attempt.ok) attempt = await fetchWithTimeout(url, 'HEAD');

      if (!attempt.ok) {
        return { url, status: 0, ok: false, reason: 'unreachable', error: attempt.err?.message || 'fetch failed', applyKind: 'dead' };
      }
      const r = attempt.response;
      const cls = classifyStatus(r.status);
      // Classify apply-page vs homepage from the HTML when we have a readable GET body;
      // an unreachable/4xx/5xx link is 'dead' so a re-check can flag a rotted URL.
      let applyKind = cls.ok ? 'unknown' : 'dead';
      if (cls.ok && gotGetBody) {
        try { applyKind = classifyApplyHtml(await r.text()); } catch { /* leave unknown */ }
      }
      return {
        url,
        status: r.status,
        ok: cls.ok,
        reason: cls.reason,
        redirect: r.redirected ? r.url : null,
        applyKind,
      };
    })
  );

  res.json({ results });
});

export default router;
