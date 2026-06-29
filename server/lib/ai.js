// AI-calling layer — model primitives + standalone callers for OpenAI and
// Claude (Anthropic). Imported by route handlers (server/routes/ai.js) and by
// server-side jobs/scrapers (server/jobs/scout.js, server/scraper/scrapeGrants.js)
// so those depend on a lib, not a route module. No Express dependency here.

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const SEARCH_MODEL = process.env.OPENAI_SEARCH_MODEL || 'gpt-4o';
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

export function getApiKey() {
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
export async function callChatCompletions(apiKey, { system, messages, max_tokens, model, responseJson }) {
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
export async function callResponsesWithSearch(apiKey, { system, user, max_tokens, model }) {
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
export function extractChatText(data) {
  return data.choices?.[0]?.message?.content || '';
}

// ── Extract text + sources from Responses API output ──
export function extractResponsesText(data) {
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

export function extractResponsesSources(data) {
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
