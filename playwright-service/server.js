import express from 'express';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 8080;
const SERVICE_KEY = process.env.PLAYWRIGHT_SECRET;

// In-memory session store (for MVP — production would use Redis or DB)
// sessionId → { browser, context, page, grantId }
const sessions = new Map();

// Supabase for screenshot storage
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ── Auth middleware ──
function requireServiceKey(req, res, next) {
  const key = req.headers['x-service-key'];
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Service not configured (missing PLAYWRIGHT_SECRET)' });
  if (key !== SERVICE_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── Health check (no auth) ──
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'grants-engine-playwright', version: '1.0.0' });
});

// ── Upload screenshot to Supabase ──
async function uploadScreenshot(buffer, orgId, jobId, pageIndex) {
  const supa = getSupabase();
  if (!supa) return null;
  const filename = `autofill/${orgId}/${jobId}-page${pageIndex}-${Date.now()}.png`;
  const { error } = await supa.storage.from('uploads').upload(filename, buffer, {
    contentType: 'image/png',
    upsert: true,
  });
  if (error) {
    console.error('[Upload] Failed:', error.message);
    return null;
  }
  const { data } = supa.storage.from('uploads').getPublicUrl(filename);
  return data?.publicUrl || null;
}

// ── Fill form fields ──
async function fillFields(page, fieldMappings) {
  const results = [];
  for (const m of fieldMappings) {
    if (!m.suggestedValue) continue;
    try {
      // Try multiple selector strategies
      const selectors = [
        `[name="${m.fieldName}"]`,
        `#${m.fieldName}`,
        `[id="${m.fieldName}"]`,
        `[aria-label*="${m.fieldName}"]`,
      ];
      let filled = false;
      for (const sel of selectors) {
        const el = await page.$(sel);
        if (!el) continue;
        const tag = await el.evaluate(n => n.tagName?.toLowerCase());
        const type = await el.evaluate(n => n.type?.toLowerCase());

        if (tag === 'select') {
          await el.selectOption({ label: m.suggestedValue }).catch(() => el.selectOption(m.suggestedValue));
        } else if (type === 'checkbox' || type === 'radio') {
          const truthy = ['true', 'yes', '1', 'on'].includes((m.suggestedValue + '').toLowerCase());
          if (truthy) await el.check().catch(() => {});
        } else if (type === 'file') {
          // File uploads require pre-staged files — skip for now
          console.log(`[Fill] Skipped file field ${m.fieldName} (not yet supported)`);
        } else {
          await el.fill(m.suggestedValue + '');
        }
        filled = true;
        results.push({ field: m.fieldName, status: 'filled' });
        break;
      }
      if (!filled) results.push({ field: m.fieldName, status: 'not-found' });
    } catch (err) {
      results.push({ field: m.fieldName, status: 'error', error: err.message });
    }
  }
  return results;
}

// ── POST /fill — fill the form and keep the browser open for review ──
app.post('/fill', requireServiceKey, async (req, res) => {
  const { jobId, orgId, url, credentials, fieldMappings } = req.body;
  if (!jobId || !url) return res.status(400).json({ error: 'jobId and url required' });

  const sessionId = crypto.randomBytes(16).toString('hex');
  console.log(`[Fill] Starting job ${jobId} → session ${sessionId} → ${url}`);

  let browser, context, page;
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Login if credentials provided
    if (credentials?.username && credentials?.password) {
      try {
        // Common login field patterns
        const userField = await page.$('input[type="email"], input[name="email"], input[name="username"], input[id="email"], input[id="username"]');
        const passField = await page.$('input[type="password"]');
        if (userField && passField) {
          await userField.fill(credentials.username);
          await passField.fill(credentials.password);
          await page.keyboard.press('Enter');
          await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
        }
      } catch (err) {
        console.log('[Fill] Login attempt failed:', err.message);
      }
    }

    // Fill the form
    const fillResults = await fillFields(page, fieldMappings || []);

    // Take screenshot of filled form
    const screenshotBuffer = await page.screenshot({ fullPage: true });
    const screenshotUrl = await uploadScreenshot(screenshotBuffer, orgId || 'unknown', jobId, 0);

    // Keep session alive for review → submit
    sessions.set(sessionId, {
      browser, context, page, jobId, createdAt: Date.now(),
    });

    // Auto-cleanup after 15 minutes
    setTimeout(() => {
      const s = sessions.get(sessionId);
      if (s) { s.browser.close().catch(() => {}); sessions.delete(sessionId); }
    }, 15 * 60 * 1000);

    res.json({
      sessionId,
      screenshots: screenshotUrl ? [{ url: screenshotUrl, pageIndex: 0 }] : [],
      fillResults,
      status: 'ready-for-review',
    });
  } catch (err) {
    console.error('[Fill] Error:', err.message);
    if (browser) await browser.close().catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

// ── POST /submit — click final submit button ──
app.post('/submit', requireServiceKey, async (req, res) => {
  const { sessionId } = req.body;
  const session = sessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found or expired' });

  try {
    const page = session.page;
    // Find submit button — try common patterns
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Submit")',
      'button:has-text("Send")',
      'button:has-text("Apply")',
    ];
    let submitted = false;
    for (const sel of submitSelectors) {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        submitted = true;
        break;
      }
    }
    if (!submitted) {
      return res.status(400).json({ error: 'Could not find submit button' });
    }

    // Wait for navigation or confirmation
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

    // Capture confirmation
    const confirmBuffer = await page.screenshot({ fullPage: true });
    const confirmUrl = await uploadScreenshot(confirmBuffer, 'confirm', session.jobId, 99);
    const confirmationText = await page.innerText('body').catch(() => '');

    // Cleanup
    await session.browser.close().catch(() => {});
    sessions.delete(sessionId);

    res.json({
      success: true,
      confirmationScreenshots: confirmUrl ? [{ url: confirmUrl, pageIndex: 99 }] : [],
      confirmationText: confirmationText.slice(0, 2000),
    });
  } catch (err) {
    console.error('[Submit] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /cancel — close session without submitting ──
app.post('/cancel', requireServiceKey, async (req, res) => {
  const { sessionId } = req.body;
  const session = sessions.get(sessionId);
  if (session) {
    await session.browser.close().catch(() => {});
    sessions.delete(sessionId);
  }
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Playwright service listening on port ${PORT}`);
  console.log(`Auth: ${SERVICE_KEY ? 'configured' : 'MISSING PLAYWRIGHT_SECRET'}`);
  console.log(`Storage: ${process.env.SUPABASE_URL ? 'configured' : 'disabled (screenshots won\'t persist)'}`);
});
