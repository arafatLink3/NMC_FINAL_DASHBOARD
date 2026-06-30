// useMailFetch — polls /api/mail/fetch on an interval and exposes the
// inbox view-model. Tracks the most recent `internalDate` across calls
// so the next tick only asks the server for newer mail (server caps the
// result at `MAIL_FETCH_LIMIT`).
//
// Returns:
//   data         — concatenated, newest-first list of FetchedMail
//   loading      — true on the very first fetch only
//   refreshing   — true on every subsequent fetch
//   error        — last error message (string) or null
//   since        — current watermark (ISO), updated on each successful fetch
//   refresh()    — manual refetch that resets the watermark to undefined
//   stop()       — pauses polling (the effect re-runs when called again)
//
// Notes:
//   - When `enabled` is false the hook never fetches (e.g. when the
//     user is not signed in or the IMAP transport is disabled).
//   - 503 imap_disabled is treated as a soft state (returned via
//     `disabled`) rather than an error so the UI can show a banner.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from './api';
import type { FetchedMail } from '@nmc/api-client';

export interface UseMailFetchOptions {
  /** Poll cadence in milliseconds. Defaults to 30s. Set to 0 to disable polling. */
  intervalMs?: number;
  /** Hard cap on accumulated messages kept in memory. Defaults to 200. */
  keep?: number;
  /** Initial watermark. When omitted, the first fetch returns the latest messages. */
  initialSince?: string;
  /** Disable fetching (e.g. while the user is logged out). */
  enabled?: boolean;
}

export interface UseMailFetchResult {
  data: FetchedMail[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** Server returned 503 — IMAP is not configured. */
  disabled: boolean;
  since: string | null;
  refresh: () => Promise<void>;
  stop: () => void;
  /**
   * Mark a message as read on the IMAP server and update the local
   * cache. Optimistically flips `seen` to true before the network
   * call so the UI feels instant; rolls back on error.
   */
  markRead: (uid: number) => Promise<void>;
  /** UIDs that are currently in flight (UI can dim them). */
  pendingReads: Set<number>;
  /**
   * Delete a message from the IMAP server. Optimistically removes
   * the row from the local cache; restores it on failure.
   */
  deleteMail: (uid: number) => Promise<void>;
  /** UIDs whose delete is currently in flight. */
  pendingDeletes: Set<number>;
}

const DEFAULT_INTERVAL = 30_000;
const DEFAULT_KEEP = 200;

export function useMailFetch(opts: UseMailFetchOptions = {}): UseMailFetchResult {
  const {
    intervalMs = DEFAULT_INTERVAL,
    keep = DEFAULT_KEEP,
    initialSince,
    enabled = true,
  } = opts;
  const api = useApi();
  const [data, setData] = useState<FetchedMail[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState<boolean>(false);
  const [since, setSince] = useState<string | null>(initialSince ?? null);
  const [pendingReads, setPendingReads] = useState<Set<number>>(() => new Set<number>());
  const [pendingDeletes, setPendingDeletes] = useState<Set<number>>(() => new Set<number>());
  // Polling is paused when the user clicks "stop" or when the component
  // unmounts. We use a ref so changes don't re-trigger the effect.
  const runningRef = useRef<boolean>(true);

  const runOnce = useCallback(
    async (mode: 'initial' | 'refresh', watermark: string | null) => {
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      try {
        const res = await api.fetchMail(
          watermark ? { since: watermark } : { limit: Math.min(keep, 50) },
        );
        if (!res || !Array.isArray(res.rows)) {
          setError('invalid_response');
          return;
        }
        setError(null);
        setDisabled(false);
        setData((prev) => {
          // Newest first; dedupe by uid so back-to-back polls don't
          // duplicate the same message.
          const seen = new Set<number>();
          const merged: FetchedMail[] = [];
          for (const row of res.rows) {
            if (seen.has(row.uid)) continue;
            seen.add(row.uid);
            merged.push(row);
          }
          // If a watermark was provided, the server already filtered.
          // If not, replace the list with the freshest window.
          const next = watermark ? [...merged, ...prev] : merged;
          next.sort((a: FetchedMail, b: FetchedMail) => {
            const ta = a.internalDate ? Date.parse(a.internalDate) : 0;
            const tb = b.internalDate ? Date.parse(b.internalDate) : 0;
            return tb - ta;
          });
          return next.slice(0, keep);
        });
        // Advance the watermark to the newest message we just saw.
        const newest = res.rows
          .map((r: FetchedMail) => (r.internalDate ? Date.parse(r.internalDate) : 0))
          .reduce((a: number, b: number) => Math.max(a, b), 0);
        if (newest > 0) setSince(new Date(newest).toISOString());
      } catch (err: unknown) {
        const message =
          (err as { message?: string; detail?: string })?.message ??
          (err as { detail?: string })?.detail ??
          String(err);
        // 503 imap_disabled surfaces as a typed error from the api-client;
        // detect it via the status code on the error object.
        const status = (err as { status?: number; statusCode?: number })?.status ??
          (err as { statusCode?: number })?.statusCode;
        if (status === 503) {
          setDisabled(true);
          setError(null);
        } else {
          setError(message);
        }
      } finally {
        if (mode === 'initial') setLoading(false);
        else setRefreshing(false);
      }
    },
    [api, keep],
  );

  // Single effect that schedules the initial fetch + the polling loop.
  useEffect(() => {
    if (!enabled) return;
    runningRef.current = true;
    setSince(initialSince ?? null);
    setData([]);
    void runOnce('initial', initialSince ?? null);
    if (intervalMs <= 0) return;
    const handle = window.setInterval(() => {
      if (!runningRef.current) return;
      void runOnce('refresh', sinceRef.current);
    }, intervalMs);
    return () => window.clearInterval(handle);
    // We intentionally omit `since` so polling uses a ref-tracked copy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, initialSince, runOnce]);

  // Mirror `since` into a ref so the interval callback always sees the
  // freshest watermark without re-binding the timer.
  const sinceRef = useRef<string | null>(since);
  useEffect(() => {
    sinceRef.current = since;
  }, [since]);

  const refresh = useCallback(async () => {
    runningRef.current = true;
    setSince(null);
    setData([]);
    await runOnce('initial', null);
  }, [runOnce]);

  const stop = useCallback(() => {
    runningRef.current = false;
  }, []);

  const markRead = useCallback(
    async (uid: number) => {
      // Optimistic update — flip the seen flag locally so the row
      // un-bold / dims immediately.
      setData((prev) =>
        prev.map((row) => (row.uid === uid ? { ...row, seen: true } : row)),
      );
      setPendingReads((prev) => {
        const next = new Set(prev);
        next.add(uid);
        return next;
      });
      try {
        const updated = await api.markMailRead({ uid });
        // Reconcile with whatever the server returned (handles races
        // where another tab marked the message read at the same time).
        setData((prev) =>
          prev.map((row) => (row.uid === uid ? { ...row, ...updated } : row)),
        );
      } catch (err: unknown) {
        // Roll back the optimistic flag on failure.
        setData((prev) =>
          prev.map((row) => (row.uid === uid ? { ...row, seen: false } : row)),
        );
        const status = (err as { status?: number; statusCode?: number })?.status ??
          (err as { statusCode?: number })?.statusCode;
        if (status !== 503) {
          const message =
            (err as { message?: string; detail?: string })?.message ??
            (err as { detail?: string })?.detail ??
            String(err);
          setError(message);
        }
      } finally {
        setPendingReads((prev) => {
          const next = new Set(prev);
          next.delete(uid);
          return next;
        });
      }
    },
    [api],
  );

  const deleteMail = useCallback(
    async (uid: number) => {
      // Snapshot the row so we can put it back if the server rejects.
      let snapshot: FetchedMail | undefined;
      setData((prev) => {
        snapshot = prev.find((row) => row.uid === uid);
        return prev.filter((row) => row.uid !== uid);
      });
      setPendingDeletes((prev) => {
        const next = new Set(prev);
        next.add(uid);
        return next;
      });
      try {
        await api.deleteMail({ uid });
      } catch (err: unknown) {
        // Restore the row at its original index if we still have it.
        if (snapshot) {
          const removed = snapshot;
          setData((prev) => {
            // Avoid duplicates if a poll re-added the same UID while
            // we were waiting on the network.
            if (prev.some((row) => row.uid === removed.uid)) return prev;
            return [removed, ...prev];
          });
        }
        const status = (err as { status?: number; statusCode?: number })?.status ??
          (err as { statusCode?: number })?.statusCode;
        if (status !== 503) {
          const message =
            (err as { message?: string; detail?: string })?.message ??
            (err as { detail?: string })?.detail ??
            String(err);
          setError(message);
        }
      } finally {
        setPendingDeletes((prev) => {
          const next = new Set(prev);
          next.delete(uid);
          return next;
        });
      }
    },
    [api],
  );

  return {
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
  };
}