import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import {
  getUploadsByOrg, getUploadsByGrant, getUploadById,
  createUpload, deleteUploadById, getOrgUploadsText, getGrantUploadsText,
} from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { resolveOrg } from '../middleware/org.js';
import { extractText, truncateText } from '../extractors/index.js';

const orgAuth = [resolveOrg, requireAuth];

// Supabase Storage client
function getStorage() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key).storage.from('uploads');
}

// Multer config: memory storage for extraction + Supabase upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv', 'text/plain', 'text/markdown',
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(txt|md|csv|doc|docx|xlsx|xls|pdf)$/i)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not supported: ${file.mimetype}`));
    }
  },
});

const router = Router();

// POST /api/org/:slug/uploads — upload a file
router.post('/org/:slug/uploads', ...orgAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    // Generate unique filename
    const ext = path.extname(req.file.originalname);
    const filename = crypto.randomBytes(16).toString('hex') + ext;
    const storagePath = `${req.orgId}/${filename}`;

    // Upload to Supabase Storage
    const storage = getStorage();
    if (storage) {
      const { error: uploadErr } = await storage.upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
      });
      if (uploadErr) {
        console.error('Supabase upload error:', uploadErr.message);
        return res.status(500).json({ error: 'File upload failed' });
      }
    }

    // Extract text
    const { text, error } = await extractText(
      req.file.buffer, req.file.mimetype, req.file.originalname
    );

    // Save metadata to DB
    const id = await createUpload(req.orgId, {
      grant_id: req.body.grant_id || null,
      filename,
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      size: req.file.size,
      extracted_text: text ? truncateText(text, 15000) : null,
      category: req.body.category || null,
    });

    res.status(201).json({
      id,
      filename,
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      size: req.file.size,
      has_text: !!text,
      extraction_error: error || null,
      category: req.body.category || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/org/:slug/uploads/youtube — add a YouTube URL
router.post('/org/:slug/uploads/youtube', ...orgAuth, async (req, res) => {
  try {
    const { url, grant_id, category } = req.body;
    if (!url || !url.match(/youtube\.com|youtu\.be/i)) {
      return res.status(400).json({ error: 'Valid YouTube URL required' });
    }

    // Use Gemini API with Google Search grounding to summarize the video
    const apiKey = process.env.GEMINI_API_KEY;
    let extractedText = null;

    if (apiKey) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [{ text: `Summarize this YouTube video in detail for use as context in grant proposal writing. Extract key points, themes, data, statistics, and notable quotes. Be thorough and specific. URL: ${url}` }],
            }],
            tools: [{ google_search: {} }],
            generationConfig: { maxOutputTokens: 2000 },
          }),
        });
        const data = await response.json();
        const texts = data.candidates?.[0]?.content?.parts?.filter(p => p.text).map(p => p.text).filter(Boolean);
        extractedText = texts?.length ? texts.join('\n\n') : null;
      } catch (err) {
        console.error('YouTube summary extraction failed:', err.message);
      }
    }

    const id = await createUpload(req.orgId, {
      grant_id: grant_id || null,
      filename: url,
      original_name: url,
      mime_type: 'video/youtube',
      size: 0,
      extracted_text: extractedText,
      category: category || 'youtube',
    });

    res.status(201).json({
      id,
      original_name: url,
      mime_type: 'video/youtube',
      has_text: !!extractedText,
      category: category || 'youtube',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/org/:slug/uploads/context — extracted text for AI context building
// MUST be before /:id route so "context" isn't treated as an ID
router.get('/org/:slug/uploads/context', ...orgAuth, async (req, res) => {
  const grantId = req.query.grant_id;
  const orgUploads = await getOrgUploadsText(req.orgId);
  const grantUploads = grantId ? await getGrantUploadsText(req.orgId, grantId) : [];
  res.json({ org_uploads: orgUploads, grant_uploads: grantUploads });
});

// GET /api/org/:slug/uploads — list uploads
router.get('/org/:slug/uploads', ...orgAuth, async (req, res) => {
  const grantId = req.query.grant_id;
  const uploads = grantId
    ? await getUploadsByGrant(req.orgId, grantId)
    : await getUploadsByOrg(req.orgId);
  // Return metadata with truncated text preview
  res.json(uploads.map(u => ({
    ...u,
    extracted_text: u.extracted_text ? u.extracted_text.slice(0, 200) + '...' : null,
    has_text: !!u.extracted_text,
  })));
});

// GET /api/org/:slug/uploads/:id — single upload with full text
router.get('/org/:slug/uploads/:id', ...orgAuth, async (req, res) => {
  const up = await getUploadById(req.params.id, req.orgId);
  if (!up) return res.status(404).json({ error: 'Upload not found' });
  res.json(up);
});

// DELETE /api/org/:slug/uploads/:id — delete upload
router.delete('/org/:slug/uploads/:id', ...orgAuth, async (req, res) => {
  const up = await getUploadById(req.params.id, req.orgId);
  if (!up) return res.status(404).json({ error: 'Upload not found' });

  // Delete file from Supabase Storage (skip for YouTube entries)
  if (up.mime_type !== 'video/youtube') {
    const storage = getStorage();
    if (storage) {
      const storagePath = `${req.orgId}/${up.filename}`;
      await storage.remove([storagePath]);
    }
  }

  await deleteUploadById(req.params.id, req.orgId);
  res.json({ ok: true });
});

export default router;
