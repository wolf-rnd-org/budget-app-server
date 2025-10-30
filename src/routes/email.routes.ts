// src/routes/email.routes.ts
import { Router } from 'express';
import { sendEmail } from '../services/email.service.js';

const router = Router();

/**
 * POST /api/emails/send
 * {
 *   "to": "a@b.com" | ["a@b.com","c@d.com"],
 *   "cc": [...], "bcc": [...],
 *   "subject": "string",
 *   "html": "<p>...</p>", // או text
 *   "text": "plain text",
 *   "attachments": [{ "filename": "report.pdf", "path": "/tmp/report.pdf" }]
 * }
 */
router.post('/send', async (req, res) => {
  try {
    const { to, cc, bcc, subject, html, text, attachments } = req.body;

    const result = await sendEmail({
      to, cc, bcc, subject, html, text, attachments,
    });

    res.status(200).json({ ok: true, result });
  } catch (err: any) {
    console.error('Email send failed:', err);
    res.status(400).json({ ok: false, error: err?.message || 'send failed' });
  }
});

export default router;
