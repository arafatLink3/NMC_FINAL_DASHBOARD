/**
 * @nmc/server — inbound IMAP transport.
 *
 * `MailFetcher.fetchSince` reads new mail from the configured Outlook
 * IMAP mailbox and returns a normalized list suitable for the
 * dashboard's mail log / inbox page.
 *
 * The fetcher mirrors the lazy-init pattern used by `Mailer` so the
 * server can boot without IMAP credentials (e.g. in tests). It is
 * stateless across calls — each `fetchSince` opens a short-lived
 * IMAP connection, pulls the requested range, and disconnects.
 *
 * Watermarks:
 *   - The caller passes an ISO `since` timestamp. Anything whose
 *     `internalDate` is >= since is returned.
 *   - When `since` is undefined, the most recent MAIL_FETCH_LIMIT
 *     messages are returned (descending).
 */
import { ImapFlow, type ImapFlowOptions } from 'imapflow';
import { simpleParser, type AddressObject } from 'mailparser';
import type { Config } from '../../config.js';
import { MailRepository } from './repository.js';

export interface FetchedAddress {
  name?: string;
  address?: string;
}

export interface FetchedMail {
  /** IMAP UIDL / UID. Stable across calls so the UI can de-dupe. */
  uid: number;
  /** Message-ID header (RFC 5322), when the server provided one. */
  messageId: string | null;
  subject: string;
  from: FetchedAddress[];
  to: FetchedAddress[];
  cc: FetchedAddress[];
  /** Plain-text body (best-effort). */
  text: string;
  /** HTML body when present. */
  html: string | null;
  /** When the message was originally received by the IMAP server. */
  internalDate: string | null;
  /** Has the message been marked as read on the server. */
  seen: boolean;
  /** Mailbox / folder the message came from. */
  mailbox: string;
}

export interface FetchMailOptions {
  /** ISO timestamp. Only messages with internalDate >= since are returned. */
  since?: string;
  /** Optional explicit mailbox override; defaults to config MAIL_FETCH_BOX. */
  mailbox?: string;
  /** Optional explicit result cap; defaults to config MAIL_FETCH_LIMIT. */
  limit?: number;
}

function toAddressList(obj: AddressObject | AddressObject[] | undefined): FetchedAddress[] {
  if (!obj) return [];
  const list = Array.isArray(obj) ? obj : [obj];
  return list.flatMap((entry) =>
    entry.value.map((v) => ({
      name: v.name ?? undefined,
      address: v.address ?? undefined,
    })),
  );
}

export class MailFetcher {
  /** Optional repository — when present, fetched rows are persisted so
   *  the dashboard inbox survives a server restart. */
  private repo?: MailRepository;

  constructor(private readonly config: Config) {}

  /** Attach a repository for write-through caching. Safe to call once. */
  attachRepository(repo: MailRepository): void {
    this.repo = repo;
  }

  /** True when IMAP is configured. False means the endpoint should 503. */
  get enabled(): boolean {
    return Boolean(this.config.IMAP_HOST);
  }

  private buildOptions(): ImapFlowOptions {
    if (!this.config.IMAP_HOST) {
      throw new Error('IMAP not configured (IMAP_HOST is empty)');
    }
    const opts: ImapFlowOptions = {
      host: this.config.IMAP_HOST,
      port: this.config.IMAP_PORT,
      secure: this.config.IMAP_SECURE,
      logger: false,
      // Cap connection / socket timeouts so a dead IMAP host does not
      // hold the request handler open for minutes.
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
    };
    if (this.config.IMAP_USER || this.config.IMAP_PASSWORD) {
      opts.auth = {
        user: this.config.IMAP_USER,
        pass: this.config.IMAP_PASSWORD,
      };
    }
    return opts;
  }

  /**
   * Flip `\Seen` on a single message. Returns the refreshed row so the
   * client can update its cache without a follow-up fetch.
   *
   * No-op when the message is already seen — imapflow would otherwise
   * trigger an unnecessary sync.
   */
  async markRead(uid: number, mailbox?: string): Promise<FetchedMail | null> {
    const box = mailbox ?? this.config.MAIL_FETCH_BOX;
    const client = new ImapFlow(this.buildOptions());
    try {
      await client.connect();
      const lock = await client.getMailboxLock(box);
      try {
        await client.messageFlagsAdd(
          { uid },
          ['\\Seen'],
          // uid:true lets imapflow use UIDs instead of sequence numbers
          { uid: true },
        );
        // Re-fetch the row so the caller sees the new flags + a fresh
        // envelope without having to guess what changed.
        for await (const msg of client.fetch(
          [uid],
          { uid: true, source: true, internalDate: true, flags: true, envelope: true },
        )) {
          const parsed = await simpleParser(msg.source as Buffer);
          const mail: FetchedMail = {
            uid: msg.uid as number,
            messageId: parsed.messageId ?? msg.envelope?.messageId ?? null,
            subject: parsed.subject ?? msg.envelope?.subject ?? '',
            from:
              toAddressList(parsed.from) ||
              (msg.envelope?.from ?? []).map((v) => ({
                name: v.name ?? undefined,
                address: v.address ?? undefined,
              })),
            to: toAddressList(parsed.to),
            cc: toAddressList(parsed.cc),
            text: parsed.text ?? '',
            html: typeof parsed.html === 'string' ? parsed.html : null,
            internalDate: msg.internalDate
              ? new Date(msg.internalDate).toISOString()
              : null,
            seen: msg.flags?.has('\\Seen') ?? false,
            mailbox: box,
          };
          // Reconcile cached row so the next poll / another client sees
          // the new flag without re-querying IMAP.
          if (this.repo) await this.repo.upsertBatch([mail], box);
          return mail;
        }
        // IMAP didn't echo the row back (rare race with expunge) —
        // fall back to the cached row's seen flag so the UI still works.
        if (this.repo) {
          return await this.repo.markSeen(uid, box);
        }
        return null;
      } finally {
        lock.release();
      }
    } finally {
      try { await client.logout(); } catch { /* already gone */ }
    }
  }

  /**
   * Delete a single message by UID. Sets `\Deleted` on the message and
   * then EXPUNGEs so the change is persisted; the UID is gone after
   * this call returns. Returns true when the message was found and
   * marked (imapflow's `messageDelete` resolves silently when the
   * UID does not exist — we treat that as not_found).
   */
  async deleteMessage(uid: number, mailbox?: string): Promise<boolean> {
    const box = mailbox ?? this.config.MAIL_FETCH_BOX;
    const client = new ImapFlow(this.buildOptions());
    try {
      await client.connect();
      const lock = await client.getMailboxLock(box);
      try {
        // Confirm the UID exists before we touch flags, so we can
        // return a useful not_found signal to the API caller.
        const existing = await client.search({ uid });
        if (!Array.isArray(existing) || existing.length === 0) {
          // Sync the cache so a UID that was expunged server-side
          // doesn't keep reappearing in the inbox.
          if (this.repo) await this.repo.hardDelete(uid, box);
          return false;
        }
        await client.messageDelete([uid], { uid: true });
        if (this.repo) await this.repo.hardDelete(uid, box);
        return true;
      } finally {
        lock.release();
      }
    } finally {
      try { await client.logout(); } catch { /* already gone */ }
    }
  }

  async fetchSince(opts: FetchMailOptions = {}): Promise<FetchedMail[]> {
    const mailbox = opts.mailbox ?? this.config.MAIL_FETCH_BOX;
    const limit = opts.limit ?? this.config.MAIL_FETCH_LIMIT;
    const client = new ImapFlow(this.buildOptions());

    const results: FetchedMail[] = [];
    try {
      await client.connect();
      const lock = await client.getMailboxLock(mailbox);
      try {
        const searchCriteria = opts.since
          ? { since: new Date(opts.since) }
          : { all: true };

        const uidsRaw = await client.search(searchCriteria as any);
        // imapflow returns `false` when no messages match; coerce to
        // an empty array so the loop below is a no-op.
        const uids: number[] = Array.isArray(uidsRaw) ? uidsRaw : [];
        if (uids.length === 0) return results;

        // IMAP returns UIDs oldest-first. Slice to the most recent
        // `limit` so the result list matches the caller's cap.
        const slice = uids.slice(Math.max(0, uids.length - limit));

        for await (const msg of client.fetch(
          slice,
          { uid: true, source: true, internalDate: true, flags: true, envelope: true },
        )) {
          const parsed = await simpleParser(msg.source as Buffer);
          results.push({
            uid: msg.uid as number,
            messageId: parsed.messageId ?? msg.envelope?.messageId ?? null,
            subject: parsed.subject ?? msg.envelope?.subject ?? '',
            from: toAddressList(parsed.from) ||
              (msg.envelope?.from ?? []).map((v) => ({
                name: v.name ?? undefined,
                address: v.address ?? undefined,
              })),
            to: toAddressList(parsed.to),
            cc: toAddressList(parsed.cc),
            text: parsed.text ?? '',
            html: typeof parsed.html === 'string' ? parsed.html : null,
            internalDate: msg.internalDate
              ? new Date(msg.internalDate).toISOString()
              : null,
            seen: msg.flags?.has('\\Seen') ?? false,
            mailbox,
          });
        }
      } finally {
        lock.release();
      }
    } finally {
      try { await client.logout(); } catch { /* already gone */ }
    }
    // Persist after the connection closes so an IMAP failure never
    // leaves partial rows in the cache.
    if (this.repo && results.length > 0) {
      await this.repo.upsertBatch(results, mailbox);
    }
    return results;
  }
}