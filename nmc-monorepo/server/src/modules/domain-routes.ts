/**
 * Registers the standard SPA domain CRUD endpoints.
 *   /api/tickets /api/incidents /api/contacts /api/nms
 *   /api/roster  /api/scr       /api/ccb       /api/mail /api/settings
 *
 * Specialty endpoints:
 *   POST /api/contacts/search  — fuzzy search across `data`
 *   POST /api/contacts/learn   — upsert (admin only)
 *   POST /api/mail/send        — record an outbound message
 */
import type { FastifyInstance } from 'fastify';
import type { Knex } from 'knex';
import { z } from 'zod';
import { registerCrud } from './crud-factory.js';

interface SearchBody {
  query?: string;
  zone?: string;
  limit?: number;
}

export function registerDomainRoutes(app: FastifyInstance, db: Knex): void {
  const domains = [
    { table: 'tickets', prefix: '/api/tickets' },
    { table: 'incidents', prefix: '/api/incidents' },
    { table: 'contacts', prefix: '/api/contacts' },
    { table: 'nms_links', prefix: '/api/nms' },
    { table: 'roster_rows', prefix: '/api/roster' },
    { table: 'scr_rows', prefix: '/api/scr' },
    { table: 'ccb_rows', prefix: '/api/ccb' },
    // mail_messages is exposed under `/api/mail/log` so the
    // IMAP-fetched mail routes (`/api/mail/:uid`, `/api/mail/list`,
    // `/api/mail/count`) keep `/api/mail/:uid` free of the auto-crud.
    { table: 'mail_messages', prefix: '/api/mail/log' },
    { table: 'settings', prefix: '/api/settings' },
  ];
  for (const d of domains) registerCrud(app, db, d);

  app.post('/api/contacts/search', async (req, reply) => {
    const parsed = z
      .object({
        query: z.string().min(1),
        zone: z.string().optional(),
        limit: z.number().int().positive().max(1000).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_input' });
    const q = db('contacts');
    if (parsed.data.zone) q.where('zone', parsed.data.zone);
    const like = `%${parsed.data.query}%`;
    q.where('data', 'like', like);
    if (parsed.data.limit) q.limit(parsed.data.limit);
    const rows = await q.orderBy('id', 'desc');
    return reply.send({ rows });
  });

  app.post(
    '/api/contacts/learn',
    { preHandler: [app.requireRole('admin')] },
    async (req, reply) => {
      const parsed = z
        .object({ data: z.record(z.string(), z.unknown()), zone: z.string().optional() })
        .safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'bad_input' });
      const [id] = await db('contacts').insert({
        data: JSON.stringify(parsed.data.data),
        zone: parsed.data.zone ?? null,
        status: 'learned',
      });
      const row = await db('contacts').where({ id }).first();
      return reply.code(201).send(row);
    }
  );

  app.post(
    '/api/mail/send',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      if (!app.mailer.enabled) {
        return reply
          .code(503)
          .send({ error: 'smtp_disabled', message: 'SMTP_HOST is not configured on the server' });
      }

      const parsed = z
        .object({
          template: z.string().min(1).optional(),
          zone: z.string().optional(),
          to: z.string().min(1),
          cc: z.string().optional(),
          bcc: z.string().optional(),
          subject: z.string().min(1),
          body: z.string().min(1),
          senderEmail: z.string().email().optional(),
          senderName: z.string().min(1).max(120).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'bad_input' });

      const result = await app.mailer.send({
        to: parsed.data.to,
        cc: parsed.data.cc,
        bcc: parsed.data.bcc,
        subject: parsed.data.subject,
        body: parsed.data.body,
        senderEmail: parsed.data.senderEmail,
        senderName: parsed.data.senderName,
      });

      const [id] = await db('mail_messages').insert({
        zone: parsed.data.zone ?? null,
        status: result.ok ? 'sent' : 'failed',
        data: JSON.stringify({
          template: parsed.data.template ?? null,
          to: parsed.data.to,
          cc: parsed.data.cc ?? null,
          bcc: parsed.data.bcc ?? null,
          subject: parsed.data.subject,
          body: parsed.data.body,
          messageId: result.messageId,
          error: result.error,
          accepted: result.accepted,
          sentBy: req.user?.username ?? null,
        }),
      });
      const row = await db('mail_messages').where({ id }).first();
      if (!result.ok) {
        return reply.code(502).send({ error: 'smtp_send_failed', message: result.error, log: row });
      }
      return reply.code(201).send(row);
    }
  );
}
