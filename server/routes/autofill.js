import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { resolveOrg } from '../middleware/org.js';
import {
  getGrantById, getOrgProfile, getComplianceDocs,
  createAutofillJob, getAutofillJob, updateAutofillJob, getAutofillJobsByGrant,
} from '../db.js';

const router = Router();
const orgAuth = [resolveOrg, requireAuth];
const w = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// ── Gemini helper for form detection from HTML ──
async function detectFormFromHTML(url, html) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const systemPrompt = `You analyse HTML of grant application pages and extract form field information.

Return ONLY a JSON object with this exact structure:
{
  "formType": "online-form" | "pdf-download" | "email-submission" | "login-required" | "unknown",
  "requiresLogin": true | false,
  "fields": [
    {
      "name": "field-name-or-id",
      "label": "Human-readable label",
      "type": "text" | "textarea" | "number" | "email" | "tel" | "url" | "date" | "select" | "radio" | "checkbox" | "file",
      "required": true | false,
      "options": ["option1", "option2"],
      "maxLength": 500,
      "placeholder": "..."
    }
  ],
  "submitButtonText": "Submit Application",
  "notes": "Any important observations about how to submit"
}

Rules:
- Extract every visible form input, textarea, select, radio, checkbox, file input
- Use the visible label text, not just the field name
- Mark required fields from asterisks, "required" text, or HTML required attribute
- For selects, extract all options
- If the page shows "you must log in to apply" or similar, set requiresLogin: true
- If the page is not a form (just info/PDF download), set formType accordingly`;

  const userMessage = `URL: ${url}\n\nHTML (truncated to 40k chars):\n${(html || '').slice(0, 40000)}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: { maxOutputTokens: 4000, responseMimeType: 'application/json' },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${err.slice(0, 300)}`);
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.filter(p => p.text).map(p => p.text).join('');
  try {
    return JSON.parse(text);
  } catch {
    return { formType: 'unknown', requiresLogin: false, fields: [], notes: 'Could not parse form structure' };
  }
}

// ── Gemini helper for field-to-data mapping ──
async function mapFieldsToData(fields, context) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const systemPrompt = `You map form fields to organisation/grant data for auto-fill.

Given a list of form fields and available data, return ONLY a JSON array:
[
  {
    "fieldName": "exact field name from input",
    "suggestedValue": "The value to fill in",
    "source": "org_profile | grant | compliance | ai_draft | owner | empty",
    "confidence": "high" | "medium" | "low",
    "notes": "Why this value was chosen, or 'requires manual input' if unclear"
  }
]

Rules:
- For empty fields (user must fill manually), set suggestedValue: "" and confidence: "low"
- For textarea/description fields, pull from aiDraft, aiSections, or ORG programmes
- For budget fields, use grant.ask or budgetTable
- For org fields (name, PBO, NPO), use org_profile.reg_numbers or context
- For dates, use grant.deadline where relevant
- Be specific — don't make up data that isn't in the context
- For fields requiring programme descriptions, write 2-3 sentences pulled from the provided aiDraft/aiSections`;

  const userMessage = `FORM FIELDS:\n${JSON.stringify(fields, null, 2)}\n\nAVAILABLE DATA:\n${JSON.stringify(context, null, 2)}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: { maxOutputTokens: 6000, responseMimeType: 'application/json' },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini mapping error: ${err.slice(0, 300)}`);
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.filter(p => p.text).map(p => p.text).join('');
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

// POST /api/org/:slug/grants/:id/detect-form
// Fetches the grant's applyUrl, sends HTML to Gemini, returns detected fields + suggested mappings
router.post('/org/:slug/grants/:id/detect-form', ...orgAuth, w(async (req, res) => {
  const grant = await getGrantById(req.params.id, req.orgId);
  if (!grant) return res.status(404).json({ error: 'Grant not found' });
  if (!grant.applyUrl) return res.status(400).json({ error: 'Grant has no applyUrl — add one in the grant profile first' });

  // Fetch the form page HTML
  let html = '';
  let fetchError = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const pageResponse = await fetch(grant.applyUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (GrantEngine Form Detector)' },
    });
    clearTimeout(timeout);
    if (pageResponse.ok) {
      html = await pageResponse.text();
    } else {
      fetchError = `Page returned ${pageResponse.status}`;
    }
  } catch (err) {
    fetchError = err.message;
  }

  // Detect form structure
  let formStructure;
  try {
    formStructure = await detectFormFromHTML(grant.applyUrl, html);
  } catch (err) {
    return res.status(500).json({ error: `Form detection failed: ${err.message}`, fetchError });
  }

  // Build context for field mapping
  const profile = await getOrgProfile(req.orgId);
  const complianceDocs = await getComplianceDocs(req.orgId);
  const regNumbers = profile?.reg_numbers || {};
  const mappingContext = {
    org: {
      name: req.org.name,
      website: req.org.website,
      industry: req.org.industry,
      country: req.org.country,
      legal_address: profile?.legal_address,
      reg_numbers: regNumbers,
      bank_details: profile?.bank_details,
      mission: profile?.mission,
      context: profile?.context_slim?.slice(0, 2000),
    },
    compliance: complianceDocs.filter(c => c.status === 'valid' || c.status === 'uploaded').map(c => ({ name: c.name, doc_id: c.doc_id })),
    grant: {
      name: grant.name,
      funder: grant.funder,
      type: grant.type,
      ask: grant.ask,
      deadline: grant.deadline,
      focus: grant.focus,
      funderBudget: grant.funderBudget,
    },
    proposal: {
      draft_excerpt: (grant.aiDraft || '').slice(0, 6000),
      sections: grant.aiSections ? Object.fromEntries(
        Object.entries(grant.aiSections).slice(0, 6).map(([k, v]) => [k, (v?.text || '').slice(0, 1500)])
      ) : null,
      budgetTable: grant.budgetTable,
    },
  };

  // Map fields to data
  let mappings = [];
  try {
    mappings = await mapFieldsToData(formStructure.fields || [], mappingContext);
  } catch (err) {
    console.error('[Autofill] Mapping failed:', err.message);
  }

  // Create job record
  const jobId = await createAutofillJob(req.orgId, {
    grant_id: grant.id,
    apply_url: grant.applyUrl,
    form_type: formStructure.formType,
    detected_fields: formStructure.fields || [],
    field_mappings: mappings,
    status: 'ready-for-review',
  });

  res.json({
    jobId,
    formType: formStructure.formType,
    requiresLogin: formStructure.requiresLogin,
    fields: formStructure.fields || [],
    mappings,
    submitButtonText: formStructure.submitButtonText,
    notes: formStructure.notes,
    fetchError,
  });
}));

// GET /api/org/:slug/grants/:id/autofill-jobs — list all autofill jobs for a grant
router.get('/org/:slug/grants/:id/autofill-jobs', ...orgAuth, w(async (req, res) => {
  const jobs = await getAutofillJobsByGrant(req.params.id, req.orgId);
  res.json(jobs);
}));

// GET /api/org/:slug/autofill/:jobId — get single job
router.get('/org/:slug/autofill/:jobId', ...orgAuth, w(async (req, res) => {
  const job = await getAutofillJob(req.params.jobId, req.orgId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
}));

// PUT /api/org/:slug/autofill/:jobId — update mappings (after user edits)
router.put('/org/:slug/autofill/:jobId', ...orgAuth, w(async (req, res) => {
  const { field_mappings } = req.body;
  if (!Array.isArray(field_mappings)) return res.status(400).json({ error: 'field_mappings array required' });
  await updateAutofillJob(req.params.jobId, req.orgId, { field_mappings });
  res.json({ ok: true });
}));

// POST /api/org/:slug/autofill/:jobId/fill — trigger Playwright service (Phase 2)
router.post('/org/:slug/autofill/:jobId/fill', ...orgAuth, w(async (req, res) => {
  const job = await getAutofillJob(req.params.jobId, req.orgId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const serviceUrl = process.env.PLAYWRIGHT_SERVICE_URL;
  const serviceKey = process.env.PLAYWRIGHT_SECRET;
  if (!serviceUrl || !serviceKey) {
    return res.status(503).json({
      error: 'Playwright service not configured. Use the copy-paste values in the review panel instead.',
      service_configured: false,
    });
  }

  const { credentials } = req.body;
  await updateAutofillJob(req.params.jobId, req.orgId, { status: 'filling' });

  try {
    const fillRes = await fetch(`${serviceUrl}/fill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': serviceKey },
      body: JSON.stringify({
        jobId: job.id,
        url: job.apply_url,
        credentials: credentials || null,
        fieldMappings: job.field_mappings,
      }),
    });
    const data = await fillRes.json();
    await updateAutofillJob(req.params.jobId, req.orgId, {
      session_id: data.sessionId,
      status: fillRes.ok ? 'ready-for-review' : 'error',
      screenshots: data.screenshots || [],
      error_message: data.error || null,
    });
    res.json(data);
  } catch (err) {
    await updateAutofillJob(req.params.jobId, req.orgId, { status: 'error', error_message: err.message });
    res.status(502).json({ error: err.message });
  }
}));

// POST /api/org/:slug/autofill/:jobId/submit — trigger final submission (Phase 2)
router.post('/org/:slug/autofill/:jobId/submit', ...orgAuth, w(async (req, res) => {
  const job = await getAutofillJob(req.params.jobId, req.orgId);
  if (!job || !job.session_id) return res.status(400).json({ error: 'Job not ready for submission' });

  const serviceUrl = process.env.PLAYWRIGHT_SERVICE_URL;
  const serviceKey = process.env.PLAYWRIGHT_SECRET;
  if (!serviceUrl || !serviceKey) return res.status(503).json({ error: 'Playwright service not configured' });

  await updateAutofillJob(req.params.jobId, req.orgId, { status: 'submitting' });

  try {
    const submitRes = await fetch(`${serviceUrl}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': serviceKey },
      body: JSON.stringify({ sessionId: job.session_id }),
    });
    const data = await submitRes.json();
    await updateAutofillJob(req.params.jobId, req.orgId, {
      status: submitRes.ok && data.success ? 'submitted' : 'error',
      confirmation_text: data.confirmationText || null,
      screenshots: [...(job.screenshots || []), ...(data.confirmationScreenshots || [])],
      error_message: data.error || null,
    });
    res.json(data);
  } catch (err) {
    await updateAutofillJob(req.params.jobId, req.orgId, { status: 'error', error_message: err.message });
    res.status(502).json({ error: err.message });
  }
}));

export default router;
