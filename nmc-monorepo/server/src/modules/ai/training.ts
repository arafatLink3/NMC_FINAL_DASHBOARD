/**
 * @nmc/server — AI training persistence.
 *
 * Stores manual (category, department, subCategory?) overrides that
 * the AI classifier should prefer over the rule-based default. The
 * SPA used to keep these in `localStorage`; they are now server-side
 * so every operator in the same org sees the same overrides.
 */
import type { Knex } from 'knex';

export interface TrainingRecord {
  category: string;
  department: string;
  subCategory?: string | null;
  trainedAt?: string;
}

export class AiTrainingRepository {
  constructor(private readonly db: Knex) {}

  /** Upsert a single override. Last write wins. */
  async upsert(input: TrainingRecord): Promise<TrainingRecord> {
    await this.db('ai_training')
      .insert({
        category: input.category,
        department: input.department,
        sub_category: input.subCategory ?? null,
      })
      .onConflict(['category', 'department', 'sub_category'])
      .merge(['trained_at']);
    const row = await this.db('ai_training')
      .where({
        category: input.category,
        department: input.department,
      })
      .first();
    return {
      category: input.category,
      department: input.department,
      subCategory: row?.sub_category ?? null,
      trainedAt: row?.trained_at ? new Date(row.trained_at).toISOString() : new Date().toISOString(),
    };
  }

  /** Look up an override by category (latest wins on duplicate keys). */
  async forCategory(category: string): Promise<TrainingRecord | null> {
    const row = await this.db('ai_training')
      .where({ category })
      .orderBy('trained_at', 'desc')
      .first();
    if (!row) return null;
    return {
      category: row.category,
      department: row.department,
      subCategory: row.sub_category,
      trainedAt: row.trained_at ? new Date(row.trained_at).toISOString() : undefined,
    };
  }

  /** Bulk fetch — used by /api/ai/rules to surface learned overrides. */
  async all(): Promise<TrainingRecord[]> {
    const rows = await this.db('ai_training').orderBy('trained_at', 'desc');
    return rows.map((r) => ({
      category: r.category,
      department: r.department,
      subCategory: r.sub_category,
      trainedAt: r.trained_at ? new Date(r.trained_at).toISOString() : undefined,
    }));
  }
}