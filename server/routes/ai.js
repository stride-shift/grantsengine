import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { resolveOrg } from '../middleware/org.js';
import { logAgentRun } from '../db.js';

const router = Router();
export const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

// ── Call Claude API ──

async function callClaude(apiKey, { system, messages, max_tokens, model }) {
  const body = {
    model: model || CLAUDE_MODEL,
    max_tokens: max_tokens || 1500,
    messages: messages || [],
  };
  if (system) body.system = system;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
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

// ── Standalone caller for server-side jobs (no Express req/res) ──
export async function callGemini(system, user, { search = false, maxTokens = 1500 } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('No ANTHROPIC_API_KEY configured');

  const response = await callClaude(apiKey, {
    system,
    messages: [{ role: 'user', content: user }],
    max_tokens: maxTokens,
  });

  if (!response.ok) {
    const errText = await response.text();
    let msg = `Claude API error (${response.status})`;
    try { msg = JSON.parse(errText).error?.message || msg; } catch {}
    throw new Error(msg);
  }

  const data = await response.json();
  return data.content?.filter(b => b.type === 'text').map(b => b.text).join('\n\n') || '';
}

// POST /api/org/:slug/ai/messages — proxied Claude API call (authenticated)
router.post('/org/:slug/ai/messages', resolveOrg, requireAuth, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'No ANTHROPIC_API_KEY configured. Add ANTHROPIC_API_KEY to your environment variables.' } });
  }

  const start = Date.now();
  try {
    // Strip internal metadata fields before forwarding
    const { _agent_type, _grant_id, model: _model, tools: _tools, ...apiBody } = req.body;

    const response = await callClaude(apiKey, apiBody);
    const data = await response.text();
    const duration = Date.now() - start;

    if (!response.ok) {
      let errMsg = `Claude API error (${response.status})`;
      try { errMsg = JSON.parse(data).error?.message || errMsg; } catch {}
      res.status(response.status).json({ error: { message: errMsg } });
      return;
    }

    const parsed = JSON.parse(data);

    // Log the agent run for audit
    try {
      await logAgentRun(req.orgId, {
        agent_type: _agent_type || 'chat',
        grant_id: _grant_id || null,
        prompt_summary: (apiBody.messages?.[0]?.content || '').slice(0, 200),
        result_summary: parsed.content?.[0]?.text?.slice(0, 200) || '',
        tokens_in: parsed.usage?.input_tokens || 0,
        tokens_out: parsed.usage?.output_tokens || 0,
        duration_ms: duration,
        status: 'completed',
        member_id: req.memberId || null,
      });
    } catch { /* audit logging is best-effort */ }

    res.status(200).json(parsed);
  } catch (err) {
    res.status(502).json({ error: { message: `Proxy error: ${err.message}` } });
  }
});

export default router;
