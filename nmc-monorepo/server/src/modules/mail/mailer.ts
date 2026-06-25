/**
 * @nmc/server — outbound SMTP transport.
 *
 * `Mailer.send` does the real SMTP delivery for /api/mail/send. It is a
 * thin wrapper around nodemailer that:
 *
 *   - Lazily creates a transporter from the runtime config so the server
 *     can boot without SMTP credentials (e.g. in tests).
 *   - Splits / trims / dedupes a "to" string that may be
 *     `a@x.com, b@x.com; c@x.com`.
 *   - Returns whether the message was actually accepted by the SMTP
 *     server, plus the underlying nodemailer `info` object so callers
 *     can persist a server-side message-id for traceability.
 *
 * This deliberately mirrors the original C# SendMail signature so the
 * frontend can keep using a single "send" flow regardless of the
 * channel (mailto / WhatsApp / SMTP).
 */
import nodemailer, { type Transporter } from 'nodemailer';
import type { Config } from '../../config.js';

export interface SendMailInput {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  /** Plain-text body. The mailer will also send a `<pre>` HTML twin. */
  body: string;
  /** Override the configured sender. */
  senderEmail?: string;
  senderName?: string;
}

export interface SendMailResult {
  ok: boolean;
  /** SMTP server message-id (e.g. `<abc@smtp.gmail.com>`), or null on failure. */
  messageId: string | null;
  /** nodemailer / SMTP error message, or null on success. */
  error: string | null;
  /** Final deduped recipient arrays that were actually addressed. */
  accepted: { to: string[]; cc: string[]; bcc: string[] };
}

const ADDR_SEP = /[;,]+/g;

function splitAddresses(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(ADDR_SEP)) {
    const v = part.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

export class Mailer {
  private transporter: Transporter | null = null;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor(private readonly config: Config) {
    this.fromEmail = config.SMTP_FROM_EMAIL;
    this.fromName = config.SMTP_FROM_NAME;
  }

  /** True when SMTP is configured. False means the endpoint should 503. */
  get enabled(): boolean {
    return Boolean(this.config.SMTP_HOST);
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    if (!this.config.SMTP_HOST) {
      throw new Error('SMTP not configured (SMTP_HOST is empty)');
    }
    this.transporter = nodemailer.createTransport({
      host: this.config.SMTP_HOST,
      port: this.config.SMTP_PORT,
      secure: this.config.SMTP_SECURE,
      auth:
        this.config.SMTP_USER || this.config.SMTP_PASSWORD
          ? { user: this.config.SMTP_USER, pass: this.config.SMTP_PASSWORD }
          : undefined,
      // Cap connection / socket timeouts so a dead SMTP host does not
      // hold the request handler open for minutes.
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
    });
    return this.transporter;
  }

  async send(input: SendMailInput): Promise<SendMailResult> {
    const to = splitAddresses(input.to);
    const cc = splitAddresses(input.cc);
    const bcc = splitAddresses(input.bcc);

    if (to.length === 0) {
      return {
        ok: false,
        messageId: null,
        error: 'no_recipients',
        accepted: { to, cc, bcc },
      };
    }

    const fromAddr = input.senderEmail?.trim() || this.fromEmail;
    const fromName = input.senderName?.trim() || this.fromName;

    try {
      const info = await this.getTransporter().sendMail({
        from: `"${fromName}" <${fromAddr}>`,
        to: to.join(', '),
        cc: cc.length ? cc.join(', ') : undefined,
        bcc: bcc.length ? bcc.join(', ') : undefined,
        subject: input.subject,
        text: input.body,
        // Match the legacy C# behaviour: HTML body, with the pre-formatted
        // plain-text body wrapped in a <pre> so it renders monospace.
        html: `<pre style="font-family:Menlo,Consolas,monospace;white-space:pre-wrap">${escapeHtml(input.body)}</pre>`,
      });
      return {
        ok: true,
        messageId: info.messageId ?? null,
        error: null,
        accepted: { to, cc, bcc },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        messageId: null,
        error: message,
        accepted: { to, cc, bcc },
      };
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
