/**
 * @nmc/server — lightweight seed runner.
 *
 * The legacy SPA shipped a single `data/seed.json` and loaded it on
 * first request. Here we port a subset of the most-used fields so the
 * monorepo web app has something to render without an external
 * dataset. All values are neutral placeholders.
 */
import type { Knex } from 'knex';

export interface SeedBrasRecord {
  region: string;
  zone: string;
  station: string;
  address: string;
  vendor: string;
  kind: string;
  category: string;
  period_start: string;
  period_end: string;
  status: 'open' | 'in_progress' | 'pending' | 'resolved' | 'closed';
  contact_prefix: string;
  contact_phone: string;
  contact_dashed: string;
  contact_email: string;
  notes: string;
}

const bras: SeedBrasRecord[] = [
  {
    region: 'Central',
    zone: 'Zone-1',
    station: 'DEMU-A',
    address: '12 Lagos Ave',
    vendor: 'Cisco',
    kind: 'ASR9k',
    category: 'core',
    period_start: '2026-06-01',
    period_end: '2026-06-30',
    status: 'open',
    contact_prefix: '+234',
    contact_phone: '8012345678',
    contact_dashed: '+234-8012345678',
    contact_email: 'noc@example.test',
    notes: 'Initial seed record.',
  },
  {
    region: 'North',
    zone: 'Zone-2',
    station: 'DEMU-B',
    address: '5 Abuja Close',
    vendor: 'Juniper',
    kind: 'MX204',
    category: 'edge',
    period_start: '2026-06-01',
    period_end: '2026-06-30',
    status: 'in_progress',
    contact_prefix: '+234',
    contact_phone: '8098765432',
    contact_dashed: '+234-8098765432',
    contact_email: 'noc2@example.test',
    notes: 'Seeded for sprint demo.',
  },
];

export async function runBrasSeed(knex: Knex): Promise<number> {
  const existing = await knex('bras_records').count<{ c: number }[]>({ c: '*' });
  const count = Number(existing[0]?.c ?? 0);
  if (count > 0) return 0;
  await knex('bras_records').insert(bras);
  return bras.length;
}
