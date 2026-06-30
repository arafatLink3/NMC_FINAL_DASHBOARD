/**
 * AI proxy — re-exposes the local @nmc/ai helpers behind HTTP so
 * the SPA can keep using fetch() instead of bundling AI logic.
 *
 * The shared package does the actual parsing; this layer only
 * validates payloads with zod and shapes responses.
 *
 * Route map (matches the package's actual surface area):
 *   POST /api/ai/parse-ticket  → parseTicket(text)            (legacy: parse-contact)
 *   POST /api/ai/parse-incident→ parseTicket(text)            (incident variant)
 *   POST /api/ai/classify      → classify(category, freeText)
 *   POST /api/ai/learn         → learn(current, category, dept)
 *   POST /api/ai/parse-roster  → engineerAt(zone, dateIso)
 *   POST /api/ai/suggest       → suggestContact(query, contacts, n, learn?)
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  parseTicket,
  classify,
  learn,
  engineerAt,
  suggestContact,
  learnContact,
} from '@nmc/ai';
import { AiTrainingRepository } from './training.js';

const ParseTicketBody = z.object({ text: z.string().min(1) });
const ClassifyBody = z.object({
  category: z.string().default(''),
  text: z.string().default(''),
});
const LearnBody = z.object({
  current: z.record(z.string(), z.string()).optional(),
  category: z.string().min(1),
  dept: z.string().min(1),
});
const RosterBody = z.object({
  dateIso: z.string().min(1),
  rosters: z.array(z.record(z.string(), z.unknown())),
});
const SuggestBody = z.object({
  query: z.string().min(1),
  contacts: z.array(z.record(z.string(), z.unknown())),
  n: z.number().int().positive().optional(),
  learn: z.record(z.string(), z.string()).optional(),
});
const LearnContactBody = z.object({
  current: z.record(z.string(), z.string()).optional(),
  query: z.string().min(1),
  contactId: z.string().min(1),
});

export function registerAiRoutes(app: FastifyInstance, training: AiTrainingRepository): void {
  // /parse-contact kept as a back-compat alias — the legacy SPA calls it.
  const handleParseTicket = async (
    req: { body: unknown },
    reply: { code: (n: number) => { send: (b: unknown) => unknown }; send: (b: unknown) => unknown },
  ) => {
    const parsed = ParseTicketBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_input' });
    return reply.send(parseTicket(parsed.data.text));
  };

  app.post('/api/ai/parse-contact', handleParseTicket);
  app.post('/api/ai/parse-ticket', handleParseTicket);
  app.post('/api/ai/parse-incident', handleParseTicket);

  app.post('/api/ai/classify', async (req, reply) => {
    const parsed = ClassifyBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_input' });
    const result = classify(parsed.data.category, parsed.data.text);
    // If an operator has previously trained this category, prefer the
    // learned department / sub-category over the rule engine.
    const override = await training.forCategory(parsed.data.category || (result as { category?: string }).category || '');
    if (override) {
      return reply.send({ ...result, department: override.department, trained: true });
    }
    return reply.send({ ...result, trained: false });
  });

  app.post('/api/ai/learn', async (req, reply) => {
    const parsed = LearnBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_input' });
    return reply.send(learn(parsed.data.current, parsed.data.category, parsed.data.dept));
  });

  // POST /api/ai/train — persist a (category, department, subCategory?)
  // override. Replaces the legacy localStorage 'nmc.aiTraining' key.
  const TrainBody = z.object({
    category: z.string().min(1),
    department: z.string().min(1),
    subCategory: z.string().optional(),
  });
  app.post('/api/ai/train', async (req, reply) => {
    const parsed = TrainBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_input' });
    const record = await training.upsert(parsed.data);
    return reply.send(record);
  });

  // GET /api/ai/training — return all overrides for the admin view.
  app.get('/api/ai/training', async (_req, reply) => {
    const rows = await training.all();
    return reply.send({ rows, total: rows.length });
  });

  app.post('/api/ai/parse-roster', async (req, reply) => {
    const parsed = RosterBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_input' });
    const rosters = parsed.data.rosters as unknown as Parameters<typeof engineerAt>[1];
    return reply.send(engineerAt(parsed.data.dateIso, rosters));
  });

  app.post('/api/ai/suggest', async (req, reply) => {
    const parsed = SuggestBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_input' });
    // Coerce loose contact records into the typed shape; the package
    // only reads string fields, so the cast is safe.
    const contacts = parsed.data.contacts as unknown as Parameters<typeof suggestContact>[1];
    return reply.send(suggestContact(parsed.data.query, contacts, parsed.data.n, parsed.data.learn));
  });

  app.post('/api/ai/learn-contact', async (req, reply) => {
    const parsed = LearnContactBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_input' });
    return reply.send(learnContact(parsed.data.current, parsed.data.query, parsed.data.contactId));
  });
}
