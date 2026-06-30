// MailInboxPage — read-only view onto the Outlook inbox via /api/mail/fetch.
// Polled every 30s by useMailFetch. Server caps each response at
// MAIL_FETCH_LIMIT (default 50) and the hook keeps at most 200 rows
// in memory across polls.

import { useMemo, useState } from 'react';
import { useMailFetch } from '../lib/useMailFetch';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function addrLine(a: { name?: string; address?: string }): string {
  if (a.name && a.address) return `${a.name} <${a.address}>`;
  return a.address ?? a.name ?? '';
}

export function MailInboxPage() {
  const {
    data,
    loading,
    refreshing,
    error,
    disabled,
    since,
    refresh,
    stop,
    markRead,
    pendingReads,
    deleteMail,
    pendingDeletes,
  } = useMailFetch({ intervalMs: 30_000, keep: 200 });
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const headerStatus = useMemo(() => {
    if (loading) return 'Loading inbox…';
    if (disabled) return 'IMAP fetch disabled (server IMAP_HOST not set)';
    if (error) return `Error: ${error}`;
    if (refreshing) return 'Refreshing…';
    if (data.length === 0) return 'No messages yet.';
    return `${data.length} message${data.length === 1 ? '' : 's'} since ${formatDate(since)}`;
  }, [loading, refreshing, error, disabled, data.length, since]);

  return (
    <div className="mail-inbox">
      <header className="mail-inbox__header">
        <h2>Mail Inbox (IMAP)</h2>
        <div className="mail-inbox__status" role="status">
          {headerStatus}
        </div>
        <div className="mail-inbox__actions">
          <button type="button" onClick={() => void refresh()} disabled={loading || disabled}>
            Refresh
          </button>
          <button type="button" onClick={stop}>
            Stop polling
          </button>
        </div>
      </header>

      {disabled && (
        <div className="mail-inbox__banner">
          Server-side IMAP is not configured. Set <code>IMAP_HOST</code>,
          <code>IMAP_USER</code>, and <code>IMAP_PASSWORD</code> on the
          server, then refresh.
        </div>
      )}

      {error && !disabled && (
        <div className="mail-inbox__banner mail-inbox__banner--error">
          Could not fetch inbox: {error}
        </div>
      )}

      <ul className="mail-inbox__list">
        {data.map((m) => {
          const isPending = pendingReads.has(m.uid);
          return (
            <li
              key={`${m.mailbox}:${m.uid}`}
              className={`mail-inbox__item${m.seen ? ' is-seen' : ' is-unseen'}${
                isPending ? ' is-pending' : ''
              }${pendingDeletes.has(m.uid) ? ' is-deleting' : ''}`}
              onClick={() => {
                if (disabled || m.seen || isPending) return;
                void markRead(m.uid);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !m.seen && !disabled && !isPending) {
                  e.preventDefault();
                  void markRead(m.uid);
                }
              }}
            >
              <div className="mail-inbox__item-row">
                <span className="mail-inbox__subject">{m.subject || '(no subject)'}</span>
                <span className="mail-inbox__date">{formatDate(m.internalDate)}</span>
                <button
                  type="button"
                  className="mail-inbox__delete"
                  disabled={disabled || pendingDeletes.has(m.uid)}
                  aria-label={`Delete message: ${m.subject || '(no subject)'}`}
                  onClick={(e) => {
                    // Don't let the row's own onClick fire.
                    e.stopPropagation();
                    setConfirmDelete(m.uid);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {pendingDeletes.has(m.uid) ? 'Deleting…' : 'Delete'}
                </button>
              </div>
              <div className="mail-inbox__item-row mail-inbox__item-row--meta">
                <span>From: {m.from.map(addrLine).join(', ') || '—'}</span>
                <span>{m.mailbox}</span>
              </div>
              {m.text && (
                <pre className="mail-inbox__preview">{m.text.slice(0, 240)}</pre>
              )}
            </li>
          );
        })}
      </ul>

      {data.length === 0 && !loading && !disabled && !error && (
        <p className="mail-inbox__empty">Inbox is empty.</p>
      )}

      {confirmDelete !== null && (
        <div
          className="mail-inbox__modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mail-inbox-confirm-title"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="mail-inbox__modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="mail-inbox-confirm-title">Delete this message?</h3>
            <p>
              The message will be removed from the <code>{data.find((d) => d.uid === confirmDelete)?.mailbox ?? 'INBOX'}</code> mailbox on the
              Outlook server. This cannot be undone.
            </p>
            <div className="mail-inbox__modal-actions">
              <button type="button" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="mail-inbox__modal-danger"
                onClick={() => {
                  const uid = confirmDelete;
                  setConfirmDelete(null);
                  void deleteMail(uid);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}