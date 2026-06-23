/**
 * Generic CRUD factory.
 *
 * Many legacy SPA pages (tickets, incidents, nms, scr, ccb, …) read
 * a paginated, filterable list of records. This helper registers
 * `GET /api/<table>` + `POST /api/<table>` + `GET /api/<table>/:id` +
 * `PUT /api/<table>/:id` + `DELETE /api/<table>/:id` against a single
 * Knex table, applying optional `search` / `zone` / `status` /
 * `from` / `to` filters.
 *
 * The table is assumed to have:
 *   - integer `id` PK
 *   - optional `zone`  (text)
 *   - optional `status` (text)
 *   - optional `created_at` timestamp
 *   - free-form `data` JSON column (so the seed shape can carry
 *     legacy fields without a schema migration per page)
 */
import type { FastifyInstance } from 'fastify';
import type { Knex } from 'knex';

export interface CrudOptions {
  table: string;
  prefix: string; // e.g. '/api/tickets'
  searchableColumns?: string[]; // default: ['data']
  guarded?: boolean; // wrap writes in requireAuth
}

interface ListQuery {
  search?: string;
  zone?: string;
  status?: string;
  from?: string;
  to?: string;
  limit?: string;
  offset?: string;
}

function parseListQuery(q: ListQuery) {
  const out: {
    search?: string;
    zone?: string;
    status?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  } = {};
  if (q.search) out.search = q.search;
  if (q.zone) out.zone = q.zone;
  if (q.status) out.status = q.status;
  if (q.from) out.from = q.from;
  if (q.to) out.to = q.to;
  if (q.limit) out.limit = Math.min(1000, Math.max(1, Number(q.limit)));
  if (q.offset) out.offset = Math.max(0, Number(q.offset));
  return out;
}

export function registerCrud(
  app: FastifyInstance,
  db: Knex,
  opts: CrudOptions
): void {
  const cols = opts.searchableColumns ?? ['data'];
  const pre = opts.guarded ? { preHandler: [app.requireAuth] } : {};

  app.get(opts.prefix, async (req, reply) => {
    const params = parseListQuery(req.query as ListQuery);
    const q = db(opts.table);
    if (params.zone) q.where('zone', params.zone);
    if (params.status) q.where('status', params.status);
    if (params.from) q.where('created_at', '>=', params.from);
    if (params.to) q.where('created_at', '<=', params.to);
    if (params.search) {
      const like = `%${params.search}%`;
      q.where((b) => {
        for (const c of cols) b.orWhere(c, 'like', like);
      });
    }
    const totalRow = await q.clone().count<{ c: number }[]>({ c: '*' });
    const total = Number(totalRow[0]?.c ?? 0);
    if (params.limit != null) q.limit(params.limit);
    if (params.offset != null) q.offset(params.offset);
    q.orderBy('id', 'desc');
    const rows = await q;
    return reply.send({ rows, total });
  });

  app.get(`${opts.prefix}/:id`, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'bad_id' });
    }
    const row = await db(opts.table).where({ id }).first();
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return reply.send(row);
  });

  app.post(opts.prefix, pre, async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    const [id] = await db(opts.table).insert(body);
    const created = await db(opts.table).where({ id }).first();
    return reply.code(201).send(created);
  });

  app.put(`${opts.prefix}/:id`, pre, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'bad_id' });
    }
    await db(opts.table).where({ id }).update(req.body as Record<string, unknown>);
    const row = await db(opts.table).where({ id }).first();
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return reply.send(row);
  });

  app.delete(`${opts.prefix}/:id`, pre, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'bad_id' });
    }
    const n = await db(opts.table).where({ id }).delete();
    if (!n) return reply.code(404).send({ error: 'not_found' });
    return reply.code(204).send();
  });
}
