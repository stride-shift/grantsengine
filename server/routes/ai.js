import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { resolveOrg } from '../middleware/org.js';
import { logAgentRun } from '../db.js';

const router = Router();
const GEMINI_MODEL = 'gemini-2.0-flash';

// ── Anthropic → Gemini request translation ──

function toGeminiRequest(anthropicBody) {
  const { system, messages, max_tokens, tools } = anthropicBody;

  const geminiBody = {
    contents: (messages || []).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.map(c => c.text || '').join('\n') : String(m.content)) }],
    })),
    generationConfig: {
      maxOutputTokens: max_tokens || 1500,
    },
  };

  if (system) {
    const sysText = typeof system === 'string' ? system : (Array.isArray(system) ? system.map(s => (typeof s === 'string' ? s : s.text || '')).join('\n') : String(system));
    geminiBody.systemInstruction = { parts: [{ text: sysText }] };
  }

  // Translate web_search tool → Gemini google_search grounding
  if (tools && tools.some(t => t.type === 'web_search_20250305' || t.name === 'web_search')) {
    geminiBody.tools = [{ google_search: {} }];
  }

  return geminiBody;
}

// ── Gemini → Anthropic response translation ──

function toAnthropicResponse(geminiData) {
  const text = geminiData.candidates?.[0]?.content?.parts
    ?.filter(p => p.text)
    .map(p => p.text)
    .join('\n\n') || '';

  return {
    content: [{ type: 'text', text }],
    usage: {
      input_tokens: geminiData.usageMetadata?.promptTokenCount || 0,
      output_tokens: geminiData.usageMetadata?.candidatesTokenCount || 0,
    },
    model: GEMINI_MODEL,
    stop_reason: 'end_turn',
  };
}

function geminiUrl() {
  const apiKey = process.env.GEMINI_API_KEY;
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
}

// POST /api/org/:slug/ai/messages — proxied Gemini API call (authenticated)
router.post('/org/:slug/ai/messages', resolveOrg, requireAuth, async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'No GEMINI_API_KEY configured.' } });
  }

  const start = Date.now();
  try {
    // Strip internal metadata fields before forwarding
    const { _agent_type, _grant_id, ...apiBody } = req.body;
    const geminiBody = toGeminiRequest(apiBody);

    const response = await fetch(geminiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });

    const data = await response.text();
    const duration = Date.now() - start;

    if (!response.ok) {
      // Return error in Anthropic-compatible format
      let errMsg = `Gemini API error (${response.status})`;
      try { errMsg = JSON.parse(data).error?.message || errMsg; } catch {}
      res.status(response.status).json({ error: { message: errMsg } });
      return;
    }

    const parsed = JSON.parse(data);
    const anthropicResponse = toAnthropicResponse(parsed);

    // Log the agent run for audit
    try {
      await logAgentRun(req.orgId, {
        agent_type: _agent_type || 'chat',
        grant_id: _grant_id || null,
        prompt_summary: (apiBody.messages?.[0]?.content || '').slice(0, 200),
        result_summary: anthropicResponse.content?.[0]?.text?.slice(0, 200) || '',
        tokens_in: anthropicResponse.usage?.input_tokens || 0,
        tokens_out: anthropicResponse.usage?.output_tokens || 0,
        duration_ms: duration,
        status: 'completed',
        member_id: req.memberId || null,
      });
    } catch { /* audit logging is best-effort */ }

    res.status(200).json(anthropicResponse);
  } catch (err) {
    res.status(502).json({ error: { message: `Proxy error: ${err.message}` } });
  }
});

// POST /api/messages — backward-compatible unauthenticated proxy (for dev/testing)
router.post('/messages', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'No GEMINI_API_KEY configured.' } });
  }

  try {
    const geminiBody = toGeminiRequest(req.body);

    const response = await fetch(geminiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });

    const data = await response.text();

    if (!response.ok) {
      let errMsg = `Gemini API error (${response.status})`;
      try { errMsg = JSON.parse(data).error?.message || errMsg; } catch {}
      res.status(response.status).json({ error: { message: errMsg } });
      return;
    }

    const parsed = JSON.parse(data);
    const anthropicResponse = toAnthropicResponse(parsed);
    res.status(200).json(anthropicResponse);
  } catch (err) {
    res.status(502).json({ error: { message: `Proxy error: ${err.message}` } });
  }
});

export default router;
