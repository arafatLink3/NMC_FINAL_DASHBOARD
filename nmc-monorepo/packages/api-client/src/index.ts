/**
 * @nmc/api-client — shared typed REST client for the NMC portal.
 *
 * Usage:
 *
 *   import { createClient, bindEndpoints, type NmcApi } from '@nmc/api-client';
 *
 *   const http = createClient({
 *     baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
 *     refresh: async (rt) => {
 *       const r = await fetch('/api/auth/refresh', {
 *         method: 'POST',
 *         headers: { 'content-type': 'application/json' },
 *         body: JSON.stringify({ refreshToken: rt }),
 *       });
 *       if (!r.ok) throw new Error('refresh failed');
 *       return r.json();
 *     },
 *   });
 *
 *   const api: NmcApi = bindEndpoints(http);
 *   const tickets = await api.listTickets({ page: 1, pageSize: 50 });
 */

export {
  ApiClient,
  createClient,
  type CreateClientOptions,
} from './client.js';

export {
  ApiError,
  isApiError,
  type ApiErrorPayload,
} from './errors.js';

export {
  MemoryTokenStorage,
  memoryTokenStorage,
  localStorageTokenStorage,
  type TokenStorage,
} from './storage.js';

export { bindEndpoints, type NmcApi } from './endpoints.js';

export type {
  // auth
  Role,
  User,
  AuthSession,
  LoginInput,
  LoginResponse,
  // domain
  TicketRecord,
  IncidentRecord,
  ContactRecord,
  BrasRecord,
  BrasImportResult,
  NmsLink,
  MailLogEntry,
  MailSendInput,
  CcbRecord,
  ScrRecord,
  RosterRecord,
  Settings,
  // generic
  Paginated,
  ListQuery,
  // AI proxy
  ParseTicketResponse,
  ClassifyResponse,
  RulesResponse,
  RosterQuery,
  RosterResponse,
  ContactLearnInput,
  // IMAP fetch
  FetchedAddress,
  FetchedMail,
  FetchMailQuery,
  FetchMailResponse,
  MarkReadInput,
  DeleteMailInput,
  ListMailQuery,
  ListMailResponse,
  MailCountResponse,
  // AI training
  TrainInput,
  TrainResponse,
  // Object storage
  AttachmentMeta,
  ListAttachmentsResponse,
  UploadResponse,
  // Azure AD / Entra ID SSO
  AzureStatusResponse,
  AzureStartResponse,
  AzureProfile,
} from './types.js';
