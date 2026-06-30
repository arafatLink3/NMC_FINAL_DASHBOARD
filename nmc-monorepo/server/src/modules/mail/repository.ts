/**
 * @nmc/server — repository for the `fetched_mail` table.
 *
 * Pure data access; no IMAP. MailFetcher writes through this
 * repository so the dashboard inbox survives a server restart and
 * markRead / deleteMessage can update a single row instead of
 * re-querying Outlook on every poll.
 */
import type { Knex } from 'knex';
import type { FetchedMail, FetchedAddress } from './imap.js';

interface FetchedMailRow {
  id: number;
  uid: number;
  mailbox: string;
  message_id: string | null;
  subject: string | null;
  from_json: string | null;
  to_json: string | null;
  cc_json: string | null;
  text_body: string | null;
  html_body: string | null;
  internal_date: string | null;
  seen: number | boolean;
  deleted: number | boolean;
  attachments: string | null;
}

function parseAddr(json: string | null): FetchedAddress[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function parseAttachments(json: string | null): unknown[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function rowToMail(row: FetchedMailRow): FetchedMail {
  return {
    uid: row.uid,
    messageId: row.message_id,
    subject: row.subject ?? '',
    from: parseAddr(row.from_json),
    to: parseAddr(row.to_json),
    cc: parseAddr(row.cc_json),
    text: row.text_body ?? '',
    html: row.html_body,
    internalDate: row.internal_date,
    seen: Boolean(row.seen),
    mailbox: row.mailbox,
  };
}

export class MailRepository {
  constructor(private readonly db: Knex) {}

  /** Upsert a batch of FetchedMail rows keyed by (uid, mailbox). */
  async upsertBatch(rows: FetchedMail[], mailbox: string): Promise<void> {
    if (rows.length === 0) return;
    // SQLite supports a single INSERT ... ON CONFLICT with multi-row.
    // For Postgres the same statement works thanks to standard ON CONFLICT.
    const payload = rows.map((r) => ({
      uid: r.uid,
      mailbox,
      message_id: r.messageId,
      subject: r.subject,
      from_json: JSON.stringify(r.from ?? []),
      to_json: JSON.stringify(r.to ?? []),
      cc_json: JSON.stringify(r.cc ?? []),
      text_body: r.text ?? '',
      html_body: r.html,
      internal_date: r.internalDate,
      seen: r.seen,
      deleted: false,
      attachments: JSON.stringify([]),
    }));
    await this.db('fetched_mail')
      .insert(payload)
      .onConflict(['uid', 'mailbox'])
      .merge([
        'message_id',
        'subject',
        'from_json',
        'to_json',
        'cc_json',
        'text_body',
        'html_body',
        'internal_date',
        'seen',
        'updated_at',
      ]);
  }

  /** Mark a single message seen. Returns the refreshed row or null. */
  async markSeen(uid: number, mailbox: string): Promise<FetchedMail | null> {
    const updated = await this.db('fetched_mail')
      .where({ uid, mailbox })
      .update({ seen: true, updated_at: this.db.fn.now() });
    if (!updated) return null;
    const row = await this.db('fetched_mail').where({ uid, mailbox }).first();
    return row ? rowToMail(row) : null;
  }

  /** Soft-delete a message. Returns true when a row was updated. */
  async softDelete(uid: number, mailbox: string): Promise<boolean> {
    const updated = await this.db('fetched_mail')
      .where({ uid, mailbox })
      .update({ deleted: true, updated_at: this.db.fn.now() });
    return updated > 0;
  }

  /** Hard-remove a message (used after IMAP expunge confirms the delete). */
  async hardDelete(uid: number, mailbox: string): Promise<void> {
    await this.db('fetched_mail').where({ uid, mailbox }).delete();
  }

  /**
   * List non-deleted messages, newest-first. When `since` is given,
   * filters to internal_date >= since. Used by the inbox page so the
   * client can render cached mail without hitting IMAP.
   */
  async list(opts: { since?: string; mailbox?: string; limit?: number } = {}): Promise<FetchedMail[]> {
    const mailbox = opts.mailbox ?? 'INBOX';
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
    const q = this.db('fetched_mail').where({ mailbox, deleted: false });
    if (opts.since) {
      q.andWhere('internal_date', '>=', new Date(opts.since));
    }
    const rows = (await q
      .orderBy('internal_date', 'desc')
      .limit(limit)) as FetchedMailRow[];
    return rows.map(rowToMail);
  }

  /** Total non-deleted count — useful for KPI tiles. */
  async count(mailbox = 'INBOX'): Promise<number> {
    const r = await this.db('fetched_mail')
      .where({ mailbox, deleted: false })
      .count<{ c: number }[]>('* as c')
      .first();
    return Number(r?.c ?? 0);
  }

  /** Read attachments blob for a single message (UI / API). */
  async attachments(uid: number, mailbox: string): Promise<unknown[]> {
    const row = (await this.db('fetched_mail')
      .where({ uid, mailbox })
      .first('attachments')) as Pick<FetchedMailRow, 'attachments'> | undefined;
    return parseAttachments(row?.attachments ?? null);
  }
}