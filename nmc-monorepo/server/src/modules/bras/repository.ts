/**
 * BRAS repository — Knex data access layer.
 *
 * Mirrors the field set on `bras_records`; never renames columns.
 * Wire DTOs (`BrasRecordDTO`) are exported so other modules (and the
 * @nmc/api-client package) can share the exact same shape.
 */
import type { Knex } from 'knex';

export interface BrasRecordDTO {
  id?: number;
  region: string | null;
  zone: string | null;
  station: string | null;
  address: string | null;
  vendor: string | null;
  kind: string | null;
  category: string | null;
  period_start: string | null;
  period_end: string | null;
  status: string | null;
  contact_prefix: string | null;
  contact_phone: string | null;
  contact_dashed: string | null;
  contact_email: string | null;
  notes: string | null;
}

export interface BrasSearchParams {
  search?: string;
  kind?: string;
  zone?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

export const BRAS_COLUMNS: ReadonlyArray<keyof BrasRecordDTO> = [
  'id',
  'region',
  'zone',
  'station',
  'address',
  'vendor',
  'kind',
  'category',
  'period_start',
  'period_end',
  'status',
  'contact_prefix',
  'contact_phone',
  'contact_dashed',
  'contact_email',
  'notes',
];

/**
 * Normalise the contact fields. Mirrors the legacy controller:
 *   - strip leading '+' and '-' from `contact_dashed`
 *   - then re-derive a clean phone number
 */
export function normaliseContact<T extends Partial<BrasRecordDTO>>(row: T): T {
  if (row.contact_dashed) {
    row.contact_dashed = row.contact_dashed.replace(/^[+\-]+/, '');
  }
  if (row.contact_prefix && row.contact_phone) {
    // legacy: concatenate prefix + ' ' + phone for downstream display
    row.contact_prefix = row.contact_prefix.trim();
    row.contact_phone = row.contact_phone.trim();
  }
  return row;
}

export class BrasRepository {
  private readonly db: Knex;
  constructor(db: Knex) {
    this.db = db;
  }

  private base() {
    return this.db<BrasRecordDTO>('bras_records');
  }

  async search(params: BrasSearchParams): Promise<{
    rows: BrasRecordDTO[];
    total: number;
  }> {
    const q = this.base();
    if (params.kind) q.where('kind', params.kind);
    if (params.zone) q.where('zone', params.zone);
    if (params.status) q.where('status', params.status);
    if (params.category) q.where('category', params.category);
    if (params.fromDate) q.where('period_start', '>=', params.fromDate);
    if (params.toDate) q.where('period_end', '<=', params.toDate);
    if (params.search) {
      const like = `%${params.search}%`;
      q.where((b) => {
        b.where('station', 'like', like)
          .orWhere('address', 'like', like)
          .orWhere('vendor', 'like', like)
          .orWhere('notes', 'like', like);
      });
    }

    const totalRow = await q.clone().count<{ c: number }[]>({ c: '*' });
    const total = Number(totalRow[0]?.c ?? 0);

    if (params.limit != null) q.limit(params.limit);
    if (params.offset != null) q.offset(params.offset);
    q.orderBy('id', 'desc');

    const rows = await q;
    return { rows: rows.map(normaliseContact), total };
  }

  async byId(id: number): Promise<BrasRecordDTO | null> {
    const row = await this.base().where({ id }).first();
    return row ? normaliseContact(row) : null;
  }

  async create(input: Omit<BrasRecordDTO, 'id'>): Promise<BrasRecordDTO> {
    normaliseContact(input);
    const [id] = await this.base().insert(input);
    return (await this.byId(Number(id)))!;
  }

  async update(
    id: number,
    patch: Partial<Omit<BrasRecordDTO, 'id'>>
  ): Promise<BrasRecordDTO | null> {
    normaliseContact(patch);
    await this.base().where({ id }).update(patch);
    return this.byId(id);
  }

  async remove(id: number): Promise<number> {
    return this.base().where({ id }).delete();
  }

  async bulkInsert(records: ReadonlyArray<Omit<BrasRecordDTO, 'id'>>): Promise<number> {
    if (records.length === 0) return 0;
    const cleaned = records.map((r) => normaliseContact({ ...r }));
    await this.base().insert(cleaned as BrasRecordDTO[]);
    return cleaned.length;
  }
}
