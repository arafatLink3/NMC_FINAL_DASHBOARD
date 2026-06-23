/**
 * BRAS controller — HTTP request handlers.
 *
 * The wire shape matches the legacy SPA 1:1 so the existing frontend
 * can be re-pointed at this server without code changes. Routes:
 *   GET    /api/bras/search    — query: search, kind, zone, status, fromDate, toDate, category
 *   POST   /api/bras           — create
 *   GET    /api/bras/:id       — read one
 *   PUT    /api/bras/:id       — update
 *   DELETE /api/bras/:id       — delete
 *   POST   /api/bras/import    — multipart xlsx upload
 *   GET    /api/bras/export    — xlsx download
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import ExcelJS from 'exceljs';
import {
  BrasRepository,
  type BrasRecordDTO,
  type BrasSearchParams,
  normaliseContact,
} from './repository.js';
import { BRAS_COLUMNS } from './repository.js';

interface SearchQuery {
  search?: string;
  kind?: string;
  zone?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  category?: string;
  limit?: string;
  offset?: string;
}

function parseSearchQuery(q: SearchQuery): BrasSearchParams {
  const out: BrasSearchParams = {};
  if (q.search) out.search = q.search;
  if (q.kind) out.kind = q.kind;
  if (q.zone) out.zone = q.zone;
  if (q.status) out.status = q.status;
  if (q.category) out.category = q.category;
  if (q.fromDate) out.fromDate = q.fromDate;
  if (q.toDate) out.toDate = q.toDate;
  if (q.limit) out.limit = Math.min(1000, Math.max(1, Number(q.limit)));
  if (q.offset) out.offset = Math.max(0, Number(q.offset));
  return out;
}

const HEADER_ALIASES: Record<string, keyof BrasRecordDTO> = {
  region: 'region',
  zone: 'zone',
  station: 'station',
  address: 'address',
  vendor: 'vendor',
  kind: 'kind',
  category: 'category',
  'period start': 'period_start',
  'period_start': 'period_start',
  'period end': 'period_end',
  'period_end': 'period_end',
  status: 'status',
  'contact prefix': 'contact_prefix',
  'contact_prefix': 'contact_prefix',
  'contact phone': 'contact_phone',
  'contact_phone': 'contact_phone',
  'contact dashed': 'contact_dashed',
  'contact_dashed': 'contact_dashed',
  'contact email': 'contact_email',
  'contact_email': 'contact_email',
  notes: 'notes',
};

function rowFromSheetRow(row: ExcelJS.Row): Partial<Omit<BrasRecordDTO, 'id'>> {
  const out: Record<string, string | null> = {};
  row.eachCell((cell, colNumber) => {
    const headerCell = row.worksheet.getRow(1).getCell(colNumber);
    const raw = String(headerCell.value ?? '').trim().toLowerCase();
    const key = HEADER_ALIASES[raw];
    if (!key) return;
    const v = cell.value;
    out[key] = v == null ? null : typeof v === 'string' ? v.trim() : String(v);
  });
  return out as Partial<Omit<BrasRecordDTO, 'id'>>;
}

export function registerBrasController(
  app: FastifyInstance,
  repo: BrasRepository
): void {
  app.get<{ Querystring: SearchQuery }>(
    '/api/bras/search',
    async (req, reply) => {
      const params = parseSearchQuery(req.query);
      const { rows, total } = await repo.search(params);
      return reply.send({ rows, total });
    }
  );

  app.get<{ Params: { id: string } }>(
    '/api/bras/:id',
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return reply.code(400).send({ error: 'bad_id' });
      }
      const row = await repo.byId(id);
      if (!row) return reply.code(404).send({ error: 'not_found' });
      return reply.send(row);
    }
  );

  app.post<{ Body: Omit<BrasRecordDTO, 'id'> }>(
    '/api/bras',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const created = await repo.create(req.body);
      return reply.code(201).send(created);
    }
  );

  app.put<{ Params: { id: string }; Body: Partial<BrasRecordDTO> }>(
    '/api/bras/:id',
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return reply.code(400).send({ error: 'bad_id' });
      }
      const updated = await repo.update(id, req.body);
      if (!updated) return reply.code(404).send({ error: 'not_found' });
      return reply.send(updated);
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/api/bras/:id',
    { preHandler: [app.requireRole('admin')] },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return reply.code(400).send({ error: 'bad_id' });
      }
      const deleted = await repo.remove(id);
      if (!deleted) return reply.code(404).send({ error: 'not_found' });
      return reply.code(204).send();
    }
  );

  app.post(
    '/api/bras/import',
    {
      preHandler: [app.requireAuth],
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const file = await req.file();
      if (!file) return reply.code(400).send({ error: 'no_file' });
      const buffer = await file.toBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      const sheet = wb.worksheets[0];
      if (!sheet) return reply.code(400).send({ error: 'empty_sheet' });

      const records: Omit<BrasRecordDTO, 'id'>[] = [];
      sheet.eachRow((row, idx) => {
        if (idx === 1) return; // header
        const r = rowFromSheetRow(row);
        if (Object.keys(r).length === 0) return;
        // Fill missing fields with `null` so the row matches the
        // Omit<BrasRecordDTO, 'id'> contract expected by bulkInsert.
        const filled: Omit<BrasRecordDTO, 'id'> = {
          region: null,
          zone: null,
          station: null,
          address: null,
          vendor: null,
          kind: null,
          category: null,
          period_start: null,
          period_end: null,
          status: null,
          contact_prefix: null,
          contact_phone: null,
          contact_dashed: null,
          contact_email: null,
          notes: null,
          ...r,
        };
        records.push(filled);
      });
      const inserted = await repo.bulkInsert(records);
      return reply.send({ inserted });
    }
  );

  app.get(
    '/api/bras/export',
    {
      preHandler: [app.requireAuth],
    },
    async (req, reply) => {
      const { rows } = await repo.search({});
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('BRAS');
      ws.addRow(BRAS_COLUMNS);
      for (const r of rows) {
        ws.addRow(BRAS_COLUMNS.map((c) => (r as BrasRecordDTO)[c] ?? null));
      }
      const buf = await wb.xlsx.writeBuffer();
      reply
        .header(
          'content-type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        .header(
          'content-disposition',
          'attachment; filename="bras-records.xlsx"'
        )
        .send(Buffer.from(buf));
    }
  );
}
