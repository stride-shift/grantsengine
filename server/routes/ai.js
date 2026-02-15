import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { resolveOrg } from '../middleware/org.js';
import { logAgentRun } from '../db.js';

const router = Router();
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// POST /api/org/:slug/ai/messages — proxied Anthropic API call (authenticated)
router.post('/org/:slug/ai/messages', resolveOrg, requireAuth, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'No ANTHROPIC_API_KEY configured.' } });
  }

  const start = Date.now();
  try {
    // Strip internal metadata fields before forwarding to Anthropic
    const { _agent_type, _grant_id, ...apiBody } = req.body;

    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(apiBody),
    });

    const data = await response.text();
    const duration = Date.now() - start;

    // Log the agent run for audit
    try {
      const parsed = JSON.parse(data);
      logAgentRun(req.orgId, {
        agent_type: _agent_type || 'chat',
        grant_id: _grant_id || null,
        prompt_summary: (apiBody.messages?.[0]?.content || '').slice(0, 200),
        result_summary: parsed.content?.[0]?.text?.slice(0, 200) || '',
        tokens_in: parsed.usage?.input_tokens || 0,
        tokens_out: parsed.usage?.output_tokens || 0,
        duration_ms: duration,
        status: response.ok ? 'completed' : 'error',
      });
    } catch { /* audit logging is best-effort */ }

    res.status(response.status).set('Content-Type', 'application/json').send(data);
  } catch (err) {
    res.status(502).json({ error: { message: `Proxy error: ${err.message}` } });
  }
});

// POST /api/messages — backward-compatible unauthenticated proxy (for dev/testing)
router.post('/messages', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'No ANTHROPIC_API_KEY configured.' } });
  }

  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.text();
    res.status(response.status).set('Content-Type', 'application/json').send(data);
  } catch (err) {
    res.status(502).json({ error: { message: `Proxy error: ${err.message}` } });
  }
});

export default router;
