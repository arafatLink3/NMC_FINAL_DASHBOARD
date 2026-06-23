/**
 * Endpoint map. Every domain in the legacy `NMC Dashboard/js/pages/*.js`
 * gets a thin wrapper that returns typed records.
 *
 * The shape of inputs/outputs matches the localStorage records from
 * `js/store.js` 1:1 (id, createdAt, updatedAt, …) so the UI can keep
 * rendering the same DataTables.
 */

import type { ApiClient } from './client.js';
import type { ContactRecord } from '@nmc/ai';
import type {
  AuthSession,
  BrasImportResult,
  BrasRecord,
  CcbRecord,
  ClassifyResponse,
  ContactLearnInput,
  IncidentRecord,
  ListQuery,
  LoginInput,
  MailLogEntry,
  MailSendInput,
  NmsLink,
  Paginated,
  ParseTicketResponse,
  RosterQuery,
  RosterRecord,
  RosterResponse,
  RulesResponse,
  ScrRecord,
  Settings,
  SignupInput,
  TicketRecord,
  User,
} from './types.js';

export interface NmcApi {
  // auth
  login(input: LoginInput): Promise<AuthSession>;
  signup(input: SignupInput): Promise<AuthSession>;
  logout(): Promise<void>;
  refresh(): Promise<AuthSession>;
  me(): Promise<User>;

  // AI helpers (proxy to server-side rules engine; falls back to local)
  parseTicket(raw: string): Promise<ParseTicketResponse>;
  classify(text: string): Promise<ClassifyResponse>;
  rules(): Promise<RulesResponse>;
  rosterAt(q: RosterQuery): Promise<RosterResponse>;

  // tickets
  listTickets(q?: ListQuery): Promise<Paginated<TicketRecord>>;
  createTicket(t: Omit<TicketRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<TicketRecord>;
  updateTicket(id: string, patch: Partial<TicketRecord>): Promise<TicketRecord>;
  deleteTicket(id: string): Promise<void>;

  // incidents
  listIncidents(q?: ListQuery): Promise<Paginated<IncidentRecord>>;
  createIncident(i: Omit<IncidentRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<IncidentRecord>;
  updateIncident(id: string, patch: Partial<IncidentRecord>): Promise<IncidentRecord>;
  deleteIncident(id: string): Promise<void>;

  // contacts
  listContacts(q?: ListQuery): Promise<Paginated<ContactRecord>>;
  searchContacts(text: string, limit?: number): Promise<ContactRecord[]>;
  learnContact(input: ContactLearnInput): Promise<void>;

  // BRAS
  listBras(q?: ListQuery): Promise<Paginated<BrasRecord>>;
  importBras(file: { name: string; data: ArrayBuffer | Blob }): Promise<BrasImportResult>;
  exportBrasCsv(): Promise<Blob>;

  // NMS links
  listNms(): Promise<NmsLink[]>;
  upsertNms(link: Omit<NmsLink, 'id' | 'createdAt'> & { id?: string }): Promise<NmsLink>;
  deleteNms(id: string): Promise<void>;

  // roster
  listRoster(q?: ListQuery): Promise<Paginated<RosterRecord>>;
  createRoster(r: Omit<RosterRecord, 'id'>): Promise<RosterRecord>;
  updateRoster(id: string, patch: Partial<RosterRecord>): Promise<RosterRecord>;
  deleteRoster(id: string): Promise<void>;

  // SCR / CCB
  listScr(q?: ListQuery): Promise<Paginated<ScrRecord>>;
  createScr(r: Omit<ScrRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<ScrRecord>;
  updateScr(id: string, patch: Partial<ScrRecord>): Promise<ScrRecord>;
  deleteScr(id: string): Promise<void>;

  listCcb(q?: ListQuery): Promise<Paginated<CcbRecord>>;
  createCcb(r: Omit<CcbRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<CcbRecord>;
  updateCcb(id: string, patch: Partial<CcbRecord>): Promise<CcbRecord>;
  deleteCcb(id: string): Promise<void>;

  // mail
  listMailLog(q?: ListQuery): Promise<Paginated<MailLogEntry>>;
  sendMail(input: MailSendInput): Promise<MailLogEntry>;

  // settings
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
}

export function bindEndpoints(c: ApiClient): NmcApi {
  // The Fastify server responds to /auth/login and /auth/signup with
  // { token, user }. Map that onto the richer AuthSession shape the
  // SPA expects, and store the token via the api-client's storage.
  const toSession = (token: string, user: User): AuthSession => {
    const expiresInSec = 60 * 60 * 12; // 12h — matches server JWT TTL default
    return {
      user,
      accessToken: token,
      refreshToken: '',
      expiresAt: Date.now() + expiresInSec * 1000,
    };
  };
  return {
    // auth ─────────────────────────────────────────────────────────────
    async login(input) {
      const r = await c.post<{ token: string; user: User }>('/api/auth/login', input);
      const session = toSession(r.token, r.user);
      await c.tokenStorage.setAccessToken(session.accessToken);
      await c.tokenStorage.setRefreshToken(session.refreshToken);
      return session;
    },
    async signup(input) {
      const r = await c.post<{ token: string; user: User }>('/api/auth/signup', input);
      const session = toSession(r.token, r.user);
      await c.tokenStorage.setAccessToken(session.accessToken);
      await c.tokenStorage.setRefreshToken(session.refreshToken);
      return session;
    },
    async logout() {
      try { await c.post('/api/auth/logout'); } catch { /* ignore */ }
      await c.tokenStorage.clear();
    },
    async refresh() {
      const r = await c.post<{ token: string; user: User }>('/api/auth/refresh');
      const session = toSession(r.token, r.user);
      await c.tokenStorage.setAccessToken(session.accessToken);
      await c.tokenStorage.setRefreshToken(session.refreshToken);
      return session;
    },
    me: () => c.get<User>('/api/auth/me'),

    // AI helpers ──────────────────────────────────────────────────────
    parseTicket: (raw) => c.post<ParseTicketResponse>('/api/ai/parse', { raw }),
    classify:    (text) => c.post<ClassifyResponse>('/api/ai/classify', { text }),
    rules:       () => c.get<RulesResponse>('/api/ai/rules'),
    rosterAt:    (q) => c.get<RosterResponse>('/api/ai/roster', q as Record<string, unknown>),

    // tickets ─────────────────────────────────────────────────────────
    listTickets:   (q) => c.get<Paginated<TicketRecord>>('/api/tickets', q),
    createTicket:  (t) => c.post<TicketRecord>('/api/tickets', t),
    updateTicket:  (id, patch) => c.patch<TicketRecord>(`/api/tickets/${encodeURIComponent(id)}`, patch),
    deleteTicket:  (id) => c.delete<void>(`/api/tickets/${encodeURIComponent(id)}`),

    // incidents ───────────────────────────────────────────────────────
    listIncidents:   (q) => c.get<Paginated<IncidentRecord>>('/api/incidents', q),
    createIncident:  (i) => c.post<IncidentRecord>('/api/incidents', i),
    updateIncident:  (id, patch) => c.patch<IncidentRecord>(`/api/incidents/${encodeURIComponent(id)}`, patch),
    deleteIncident:  (id) => c.delete<void>(`/api/incidents/${encodeURIComponent(id)}`),

    // contacts ────────────────────────────────────────────────────────
    listContacts:    (q) => c.get<Paginated<ContactRecord>>('/api/contacts', q),
    searchContacts:  (text, limit) => c.get<ContactRecord[]>('/api/contacts/search', { text, limit }),
    learnContact:    (input) => c.post<void>('/api/contacts/learn', input),

    // BRAS ────────────────────────────────────────────────────────────
    listBras:        (q) => c.get<Paginated<BrasRecord>>('/api/bras', q),
    importBras:      async (file) => {
      const fd = new FormData();
      fd.append('file', new Blob([file.data as BlobPart]), file.name);
      return c.post<BrasImportResult>('/api/bras/import', fd);
    },
    exportBrasCsv:   async () => {
      const res = await c.fetchRaw('/api/bras/export.csv');
      return res.blob();
    },

    // NMS ─────────────────────────────────────────────────────────────
    listNms:         () => c.get<NmsLink[]>('/api/nms'),
    upsertNms:       (l) => c.post<NmsLink>('/api/nms', l),
    deleteNms:       (id) => c.delete<void>(`/api/nms/${encodeURIComponent(id)}`),

    // roster ──────────────────────────────────────────────────────────
    listRoster:      (q) => c.get<Paginated<RosterRecord>>('/api/roster', q),
    createRoster:    (r) => c.post<RosterRecord>('/api/roster', r),
    updateRoster:    (id, patch) => c.patch<RosterRecord>(`/api/roster/${encodeURIComponent(id)}`, patch),
    deleteRoster:    (id) => c.delete<void>(`/api/roster/${encodeURIComponent(id)}`),

    // SCR / CCB ───────────────────────────────────────────────────────
    listScr:         (q) => c.get<Paginated<ScrRecord>>('/api/scr', q),
    createScr:       (r) => c.post<ScrRecord>('/api/scr', r),
    updateScr:       (id, patch) => c.patch<ScrRecord>(`/api/scr/${encodeURIComponent(id)}`, patch),
    deleteScr:       (id) => c.delete<void>(`/api/scr/${encodeURIComponent(id)}`),

    listCcb:         (q) => c.get<Paginated<CcbRecord>>('/api/ccb', q),
    createCcb:       (r) => c.post<CcbRecord>('/api/ccb', r),
    updateCcb:       (id, patch) => c.patch<CcbRecord>(`/api/ccb/${encodeURIComponent(id)}`, patch),
    deleteCcb:       (id) => c.delete<void>(`/api/ccb/${encodeURIComponent(id)}`),

    // mail ────────────────────────────────────────────────────────────
    listMailLog:     (q) => c.get<Paginated<MailLogEntry>>('/api/mail/log', q),
    sendMail:        (i) => c.post<MailLogEntry>('/api/mail/send', i),

    // settings ────────────────────────────────────────────────────────
    getSettings:     () => c.get<Settings>('/api/settings'),
    updateSettings:  (patch) => c.patch<Settings>('/api/settings', patch),
  };
}
