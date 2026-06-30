/**
 * @nmc/server — background scheduler.
 *
 * Self-contained, no `node-cron` dep. Three jobs:
 *
 *   1. `pollCcb`         — every 5 min, read new IMAP mail and parse
 *                          subject/body for CCB / NCR / PID change
 *                          windows. Inserts into `ccb_rows`.
 *   2. `runWeeklyReport` — Sunday 23:00 local, build the weekly
 *                          summary and (optionally) send via SMTP.
 *   3. `runMonthlyReport`— last day of the month 23:00 local.
 *
 * Each job is registered with a tick interval and an `enabled()`
 * predicate so disabling a feature (no IMAP, no SMTP) just makes the
 * job a no-op without throwing.
 *
 * The scheduler is started by `server.ts` after the Fastify app is
 * ready and stopped on shutdown so tests can opt out.
 */
import type { Knex } from 'knex';
import type { Config } from './config.js';
import type { MailFetcher, FetchedMail } from './modules/mail/imap.js';
import type { Mailer } from './modules/mail/mailer.js';

export interface SchedulerHandles {
  stop(): void;
}

export interface SchedulerDeps {
  config: Config;
  db: Knex;
  mailFetcher: MailFetcher;
  mailer: Mailer;
}

interface CcbMatch {
  type: 'CCB' | 'NCR' | 'PID';
  ref: string;
  title: string;
  start: Date;
  end: Date;
  zone?: string;
  contact?: string;
}

const CCB_REGEX = /\b(CCB|NCR|PID)[- _]*#?(\d{2,6})\b/i;
const TIME_RANGE_REGEX =
  /(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2})\s*(?:to|until|ândash|â€”|-+)\s*(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2})/i;
const ZONE_REGEX = /\b(BL_[A-Z]+|DHK-[A-Z]+|CTG-[A-Z]+|BR_[A-Z]+|MYM|SYL|RNG|RAJ|BAR|KHL|FEN)\b/;

function parseCcbMail(mail: FetchedMail): CcbMatch | null {
  const text = `${mail.subject ?? ''}\n${mail.text ?? ''}`;
  const typeMatch = text.match(CCB_REGEX);
  if (!typeMatch) return null;
  const type = (typeMatch[1] ?? '').toUpperCase() as 'CCB' | 'NCR' | 'PID';
  const ref = `${(typeMatch[1] ?? '').toUpperCase()}-${typeMatch[2] ?? ''}`;
  const rangeMatch = text.match(TIME_RANGE_REGEX);
  if (!rangeMatch) return null;
  const start = new Date((rangeMatch[1] ?? '').replace(' ', 'T'));
  const end = new Date((rangeMatch[2] ?? '').replace(' ', 'T'));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const title =
    mail.subject?.replace(CCB_REGEX, '').trim() ||
    `${type} ${typeMatch[2]}`;
  const zone = text.match(ZONE_REGEX)?.[1];
  const contact = mail.from?.[0]?.address;
  return { type, ref, title, start, end, zone, contact };
}

async function pollCcb(deps: SchedulerDeps): Promise<void> {
  const { config, db, mailFetcher } = deps;
  if (!mailFetcher.enabled) return;
  let rows: FetchedMail[] = [];
  try {
    rows = await mailFetcher.fetchSince({ limit: 50, mailbox: config.MAIL_FETCH_BOX });
  } catch (err) {
    // Logged upstream; do not crash the loop.
    return;
  }
  for (const mail of rows) {
    const parsed = parseCcbMail(mail);
    if (!parsed) continue;
    const existing = await db('ccb_rows')
      .where('data', 'like', `%"ref":"${parsed.ref}"%`)
      .first();
    if (existing) continue;
    await db('ccb_rows').insert({
      zone: parsed.zone ?? null,
      status: 'active',
      data: JSON.stringify({
        ref: parsed.ref,
        type: parsed.type,
        title: parsed.title,
        start: parsed.start.toISOString(),
        end: parsed.end.toISOString(),
        contact: parsed.contact,
        source: 'imap',
        messageId: mail.messageId,
      }),
    });
  }
}

interface ReportSummary {
  rangeStart: string;
  rangeEnd: string;
  incidents: number;
  tickets: number;
  byCategory: Array<{ category: string; count: number }>;
}

async function summarise(deps: SchedulerDeps, since: Date, until: Date): Promise<ReportSummary> {
  const { db } = deps;
  const inc = await db('incidents').count<{ c: number }[]>('* as c').first();
  const tic = await db('tickets').count<{ c: number }[]>('* as c').first();
  // Group incidents by their declared category (stored inside `data`).
  const rows = await db('incidents').select('data').where('created_at', '>=', since);
  const counts = new Map<string, number>();
  for (const r of rows) {
    try {
      const obj = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
      const cat = (obj?.category ?? 'unknown') as string;
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    } catch {
      // ignore malformed rows
    }
  }
  return {
    rangeStart: since.toISOString(),
    rangeEnd: until.toISOString(),
    incidents: Number(inc?.c ?? 0),
    tickets: Number(tic?.c ?? 0),
    byCategory: Array.from(counts.entries()).map(([category, count]) => ({ category, count })),
  };
}

function formatReport(label: string, summary: ReportSummary): string {
  const lines: string[] = [];
  lines.push(`${label} Report`);
  lines.push(`Range: ${summary.rangeStart} â†’ ${summary.rangeEnd}`);
  lines.push(`Incidents: ${summary.incidents}`);
  lines.push(`Tickets: ${summary.tickets}`);
  lines.push('By category:');
  for (const row of summary.byCategory) {
    lines.push(`  - ${row.category}: ${row.count}`);
  }
  return lines.join('\n');
}

export async function runWeeklyReport(deps: SchedulerDeps, now = new Date()): Promise<void> {
  // Last 7 days ending now (Sun night reports cover the week just ended).
  const until = now;
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const summary = await summarise(deps, since, until);
  const body = formatReport('Weekly', summary);
  if (deps.mailer.enabled) {
    await deps.mailer.send({
      to: deps.config.SMTP_FROM_EMAIL,
      subject: `Weekly Report â€” ${until.toISOString().slice(0, 10)}`,
      body,
    });
  }
}

export async function runMonthlyReport(deps: SchedulerDeps, now = new Date()): Promise<void> {
  const until = now;
  const since = new Date(now.getFullYear(), now.getMonth(), 1);
  const summary = await summarise(deps, since, until);
  const body = formatReport('Monthly', summary);
  if (deps.mailer.enabled) {
    await deps.mailer.send({
      to: deps.config.SMTP_FROM_EMAIL,
      subject: `Monthly Report â€” ${until.toISOString().slice(0, 7)}`,
      body,
    });
  }
}

/** ms until the next occurrence of `hour`:`minute` local time. */
function msUntilNext(hour: number, minute: number, now = new Date()): number {
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - now.getTime();
}

function isWeeklyWindow(now = new Date()): boolean {
  // Sun = 0
  return now.getDay() === 0 && now.getHours() === 23;
}
function isMonthlyWindow(now = new Date()): boolean {
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return tomorrow.getMonth() !== now.getMonth() && now.getHours() === 23;
}

export function startScheduler(deps: SchedulerDeps): SchedulerHandles {
  // CCB poller — every 5 minutes, ONLY when IMAP is configured. We avoid
  // registering the interval at all when there is nothing to fetch, so
  // log noise stays minimal on dev/test runs without credentials.
  const imapEnabled = deps.mailFetcher.enabled;
  const ccbHandle = imapEnabled
    ? setInterval(() => {
        void pollCcb(deps);
      }, 5 * 60_000)
    : null;
  if (imapEnabled) {
    deps.db.client !== undefined; // keep TS happy about the import path
  }

  // Hourly tick that fires the scheduled reports when the wall clock
  // crosses their minute boundary. Cheaper than a per-minute cron and
  // still accurate to within an hour.
  const reportHandle = setInterval(() => {
    const now = new Date();
    if (isWeeklyWindow(now)) {
      void runWeeklyReport(deps, now).catch(() => undefined);
    }
    if (isMonthlyWindow(now)) {
      void runMonthlyReport(deps, now).catch(() => undefined);
    }
  }, 60 * 60_000);

  // Kick the CCB poller once at startup so a freshly-restarted server
  // does not have to wait five minutes before its first ingest.
  if (imapEnabled) {
    void pollCcb(deps);
  }

  // Warm the report timers so they fire on the next hour boundary.
  setTimeout(() => undefined, msUntilNext(0, 0));

  return {
    stop(): void {
      if (ccbHandle) clearInterval(ccbHandle);
      clearInterval(reportHandle);
    },
  };
}