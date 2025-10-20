// src/services/emailService.ts
import nodemailer, { type Transporter } from 'nodemailer';

export type EmailAddress = string | string[];

export interface EmailAttachment {
  filename: string;
  path?: string;
  content?: Buffer | string;
  contentType?: string;
  encoding?: string; // e.g. 'base64'
}

export interface SendEmailOptions {
  to: EmailAddress;
  cc?: EmailAddress;
  bcc?: EmailAddress;
  subject: string;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  messageId?: string;
}

export interface SendEmailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
  response: string;
}

const DEFAULT_FROM_EMAIL = process.env.WOLF_EMAIL_USER || 'projects@wolf.org.il';
const DEFAULT_FROM_NAME  = process.env.WOLF_EMAIL_FROM_NAME || 'Wolf Projects';

let transporter: Transporter | null = null;
let transportVerified = false;

function buildTransporter(): Transporter {
  const user = process.env.WOLF_EMAIL_USER || 'projects@wolf.org.il';
  const pass = process.env.WOLF_EMAIL_PASSWORD;
  if (!pass) throw new Error('Missing WOLF_EMAIL_PASSWORD');

  if (!process.env.SMTP_HOST) {
    // Gmail (App Password)
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    pool: true,
    maxConnections: Number(process.env.SMTP_MAX_CONN || 3),
    maxMessages: Number(process.env.SMTP_MAX_MSG || 100),
    auth: {
      user: process.env.SMTP_USER || user,
      pass: process.env.SMTP_PASS || pass,
    },
  });
}

async function getTransporter(): Promise<Transporter> {
  if (!transporter) transporter = buildTransporter();
  if (!transportVerified) {
    await transporter.verify();
    transportVerified = true;
  }
  return transporter!;
}

function normalizeRecipients(val?: EmailAddress): string | undefined {
  if (!val) return undefined;
  return Array.isArray(val)
    ? val.filter(Boolean).map(s => s.trim()).join(', ')
    : val.trim();
}

function validateOptions(opts: SendEmailOptions) {
  if (!opts.to) throw new Error('Missing "to"');
  if (!opts.subject?.trim()) throw new Error('Missing "subject"');
  if (!opts.html?.trim() && !opts.text?.trim()) {
    throw new Error('Either "html" or "text" is required');
  }

  const totalAttachmentsBytes = (opts.attachments || []).reduce((sum, a) => {
    if (Buffer.isBuffer(a.content)) return sum + a.content.length;
    if (typeof a.content === 'string') {
      return sum + Buffer.byteLength(a.content, a.encoding as BufferEncoding | undefined);
    }
    return sum;
  }, 0);

  const MAX_BYTES = Number(process.env.EMAIL_MAX_BYTES || 15 * 1024 * 1024);
  if (totalAttachmentsBytes > MAX_BYTES) {
    throw new Error(`Attachments too large (>${Math.round(MAX_BYTES / 1024 / 1024)}MB)`);
  }
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  validateOptions(options);

  const mailOptions = {
    from: `"${options.fromName || DEFAULT_FROM_NAME}" <${options.fromEmail || DEFAULT_FROM_EMAIL}>`,
    to: normalizeRecipients(options.to),
    cc: normalizeRecipients(options.cc),
    bcc: normalizeRecipients(options.bcc),
    subject: options.subject,
    html: options.html,
    text: options.text,
    attachments: options.attachments,
    replyTo: options.replyTo,
    headers: options.headers,
    messageId: options.messageId,
  };

  const info = await (await getTransporter()).sendMail(mailOptions);
  return {
    messageId: info.messageId,
    accepted: info.accepted as string[],
    rejected: info.rejected as string[],
    response: info.response,
  };
}
