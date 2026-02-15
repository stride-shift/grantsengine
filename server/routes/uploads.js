import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  getUploadsByOrg, getUploadsByGrant, getUploadById,
  createUpload, deleteUploadById, getOrgUploadsText, getGrantUploadsText,
} from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { resolveOrg } from '../middleware/org.js';
import { extractText, truncateText } from '../extractors/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'data', 'uploads');

const orgAuth = [resolveOrg, requireAuth];

// Multer config: memory storage for extraction, then write to disk
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

    const orgDir = path.join(UPLOAD_ROOT, req.orgId);
    fs.mkdirSync(orgDir, { recursive: true });

    // Generate unique filename
    const ext = path.extname(req.file.originalname);
    const filename = crypto.randomBytes(16).toString('hex') + ext;
    const filepath = path.join(orgDir, filename);

    // Write file to disk
    fs.writeFileSync(filepath, req.file.buffer);

    // Extract text
    const { text, error } = await extractText(
      req.file.buffer, req.file.mimetype, req.file.originalname
    );

    // Save metadata to DB
    const id = createUpload(req.orgId, {
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

    // Use Anthropic API with web_search to summarize the video
    const apiKey = process.env.ANTHROPIC_API_KEY;
    let extractedText = null;

    if (apiKey) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            messages: [{
              role: 'user',
              content: `Summarize this YouTube video in detail for use as context in grant proposal writing. Extract key points, themes, data, statistics, and notable quotes. Be thorough and specific. URL: ${url}`,
            }],
          }),
        });
        const data = await response.json();
        const texts = data.content?.filter(b => b.type === 'text').map(b => b.text).filter(Boolean);
        extractedText = texts?.length ? texts.join('\n\n') : null;
      } catch (err) {
        console.error('YouTube summary extraction failed:', err.message);
      }
    }

    const id = createUpload(req.orgId, {
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
router.get('/org/:slug/uploads/context', ...orgAuth, (req, res) => {
  const grantId = req.query.grant_id;
  const orgUploads = getOrgUploadsText(req.orgId);
  const grantUploads = grantId ? getGrantUploadsText(req.orgId, grantId) : [];
  res.json({ org_uploads: orgUploads, grant_uploads: grantUploads });
});

// GET /api/org/:slug/uploads — list uploads
router.get('/org/:slug/uploads', ...orgAuth, (req, res) => {
  const grantId = req.query.grant_id;
  const uploads = grantId
    ? getUploadsByGrant(req.orgId, grantId)
    : getUploadsByOrg(req.orgId);
  // Return metadata with truncated text preview
  res.json(uploads.map(u => ({
    ...u,
    extracted_text: u.extracted_text ? u.extracted_text.slice(0, 200) + '...' : null,
    has_text: !!u.extracted_text,
  })));
});

// GET /api/org/:slug/uploads/:id — single upload with full text
router.get('/org/:slug/uploads/:id', ...orgAuth, (req, res) => {
  const up = getUploadById(req.params.id, req.orgId);
  if (!up) return res.status(404).json({ error: 'Upload not found' });
  res.json(up);
});

// DELETE /api/org/:slug/uploads/:id — delete upload
router.delete('/org/:slug/uploads/:id', ...orgAuth, (req, res) => {
  const up = getUploadById(req.params.id, req.orgId);
  if (!up) return res.status(404).json({ error: 'Upload not found' });

  // Delete file from disk (skip for YouTube entries)
  if (up.mime_type !== 'video/youtube') {
    const filepath = path.join(UPLOAD_ROOT, req.orgId, up.filename);
    try { fs.unlinkSync(filepath); } catch { /* file may already be gone */ }
  }

  deleteUploadById(req.params.id, req.orgId);
  res.json({ ok: true });
});

export default router;
