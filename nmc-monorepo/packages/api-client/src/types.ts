/**
 * Shared TypeScript shapes used by the API client.
 * These mirror the legacy localStorage records in `NMC Dashboard/js/store.js`
 * (contacts, bras, scr, rosters, ccb, tickets, incidents, mailLog, …) and
 * the wire-protocol used by `controllers/brasController.js`.
 */

import type {
  CategoryRule,
  ClassifyResult,
  ContactRecord,
  DropdownKey,
  ParsedTicket,
  RosterEngineer,
  RosterShiftEntry,
} from '@nmc/ai';

export type { ContactRecord, RosterEngineer, RosterShiftEntry };

export type Role = 'admin' | 'operator' | 'viewer';

export interface User {
  id: string;
  username: string;
  /** Display name (alias of `fullName`). */
  name?: string;
  fullName?: string;
  /** Optional email surfaced by some auth providers. */
  email?: string;
  role: Role;
  createdAt: string;
  [k: string]: unknown;
}

export interface AuthSession {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
}

export interface SignupInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface TicketRecord {
  id: string;
  /** Legacy short-form ticket number (alias of `ticketId`). */
  tt?: string;
  ticketId?: string;
  category: string;
  subCategory?: string;
  zone?: string;
  bts?: string;
  ic?: string;
  customer?: string;
  faultTime?: string;
  etr?: string;
  restoreTime?: string;
  durationMin?: number;
  rootCause?: string;
  actionTaken?: string;
  rcaProvider?: string;
  issueType?: string;
  department?: string;
  team?: string;
  informedPerson?: string;
  whatsapp?: string;
  mail?: string;
  /** UI page shorthand for `currentStatus` / `team`. */
  status?: 'open' | 'closed' | 'pending' | string;
  currentStatus: 'open' | 'closed' | 'pending';
  raw?: string;
  source?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  [k: string]: unknown;
}

export interface IncidentRecord {
  id: string;
  session?: string;
  name?: string;
  incidentName?: string;
  category?: string;
  subCategory?: string;
  zone?: string;
  ic?: string;
  faultTime?: string;
  restorationTime?: string;
  duration?: string;
  ticketId?: string;
  type?: string;
  rootCause?: string;
  rcaProvider?: string;
  actionTaken?: string;
  issueType?: string;
  department?: string;
  /** Alias for `department` used by some pages. */
  dept?: string;
  team?: string;
  informedPerson?: string;
  whatsapp?: string;
  mail?: string;
  currentStatus?: string;
  /** Legacy flag — `'yes'` once the incident is resolved. */
  solved?: string;
  /** ISO timestamp of when the incident was resolved. */
  endTime?: string;
  /** Legacy alias for `endTime` used by the close flow. */
  restored?: string;
  resolvedBy?: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
  [k: string]: unknown;
}

export interface BrasRecord {
  id: string;
  name: string;
  zone?: string;
  district?: string;
  bts?: string;
  serviceAgent?: string;
  brasName?: string;
  loopback?: string;
  pop?: string;
  type?: string;
  model?: string;
  uplink?: string;
  capacity?: string;
  vendor?: string;
  address?: string;
  contact?: string;
  status?: string;
  /** UI shorthand for `status`. */
  ping?: string;
  createdAt: string;
  updatedAt: string;
  [k: string]: unknown;
}

export interface NmsLink {
  id: string;
  label: string;
  url: string;
  category?: string;
  description?: string;
  createdAt: string;
  [k: string]: unknown;
}

export interface MailLogEntry {
  id: string;
  template: string;
  subject: string;
  body: string;
  recipients?: string[];
  /** UI page shorthand. */
  channel?: 'copy' | 'whatsapp' | 'mailto';
  /** UI page shorthand for `sentAt`. */
  createdAt?: string;
  sentAt: string;
  sentBy?: string;
  [k: string]: unknown;
}

export interface CcbRecord {
  id: string;
  /** Change-control item title. Legacy alias for `name`. */
  title?: string;
  name?: string;
  /** ISO date the change window starts. */
  start?: string;
  /** ISO date the change window ends. */
  end?: string;
  /** Type of change ('CCB' | 'NCR' | 'PID' | ...). */
  type?: string;
  zone?: string;
  status?: string;
  contact?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  [k: string]: unknown;
}

export interface ScrRecord {
  id: string;
  name: string;
  zone?: string;
  vendor?: string;
  capacity?: string;
  status?: string;
  contact?: string;
  /** Utilisation (used Mbps). */
  used?: number | string;
  /** Legacy link / circuit identifier. */
  link?: string;
  createdAt: string;
  updatedAt: string;
  [k: string]: unknown;
}

export interface RosterRecord {
  id: string;
  name: string;
  shift: 'morning' | 'evening' | 'night' | string;
  start: string; // ISO date
  end: string;   // ISO date
  /** Date this roster row covers (YYYY-MM-DD). */
  date?: string;
  /** Department / group alias. */
  dept?: string;
  /** Team alias (BNOC | BTS | NCSS | NGNC | S&T | NMC …). */
  team?: string;
  /** Engineers on shift. */
  engineers?: RosterEngineer[] | string[];
  group?: string; // 'BNOC' | 'BTS' | 'NCSS' | 'NGNC' | 'S&T' | 'NMC' | ...
  contact?: string;
  notes?: string;
  [k: string]: unknown;
}

export interface Settings {
  wa_group?: string;
  shiftCollisionMin?: number;
  defaultTicketType?: string;
  defaultDepartment?: string;
  [k: string]: unknown;
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  zone?: string;
  status?: string;
  from?: string;
  to?: string;
  [k: string]: unknown;
}

export type ParseTicketResponse = ParsedTicket;
export type ClassifyResponse = ClassifyResult;
export type RulesResponse = { rules: CategoryRule[]; dropdowns: Record<DropdownKey, string[]> };
export type RosterQuery = { at: string };
export type RosterResponse = { shift: 'morning' | 'evening' | 'night' | 'collision'; engineers: RosterShiftEntry[]; nextShift: RosterShiftEntry[] };

export interface ContactLearnInput {
  query: string;
  contactId: string;
}

export interface MailSendInput {
  template: 'NTTN' | 'IIG' | 'TelcoPOP' | 'BRAS' | 'Weekly' | 'Monthly' | string;
  /** Subject line (overrides the template default if supplied). */
  subject?: string;
  /** Comma- or semicolon-separated recipient list. The server splits on both. */
  to?: string;
  cc?: string;
  bcc?: string;
  zone?: string;
  body?: string;
  recipients?: string[];
  via?: 'mailto' | 'whatsapp' | 'copy' | 'smtp';
  /** Override the configured sender identity for this send only. */
  senderEmail?: string;
  senderName?: string;
}

export interface BrasImportResult {
  inserted: number;
  updated: number;
  errors: { row: number; message: string }[];
}

export interface FetchedAddress {
  name?: string;
  address?: string;
}

export interface FetchedMail {
  uid: number;
  messageId: string | null;
  subject: string;
  from: FetchedAddress[];
  to: FetchedAddress[];
  cc: FetchedAddress[];
  text: string;
  html: string | null;
  internalDate: string | null;
  seen: boolean;
  mailbox: string;
}

export interface FetchMailQuery {
  /** ISO timestamp watermark. Omit to fetch the most recent messages. */
  since?: string;
  mailbox?: string;
  limit?: number;
}

export interface FetchMailResponse {
  rows: FetchedMail[];
  total: number;
}

export interface MarkReadInput {
  /** IMAP UID of the message to mark as read. */
  uid: number;
  /** Optional mailbox override; defaults to the server's MAIL_FETCH_BOX. */
  mailbox?: string;
}

export interface DeleteMailInput {
  uid: number;
  /** Optional mailbox override; defaults to the server's MAIL_FETCH_BOX. */
  mailbox?: string;
}

export interface ListMailQuery {
  since?: string;
  mailbox?: string;
  limit?: number;
}

export interface ListMailResponse {
  rows: FetchedMail[];
  total: number;
}

export interface MailCountResponse {
  mailbox: string;
  total: number;
}

export interface TrainInput {
  category: string;
  department: string;
  /** Free-text sub-category override. */
  subCategory?: string;
}

export interface TrainResponse {
  category: string;
  department: string;
  trainedAt: string;
}

export interface AttachmentMeta {
  filename: string;
  contentType: string;
  size: number;
  s3Key: string;
}

export interface ListAttachmentsResponse {
  uid: number;
  mailbox: string;
  attachments: AttachmentMeta[];
}

export interface UploadResponse {
  s3Key: string;
  url: string;
  size: number;
  contentType: string;
}

// --- Azure AD / Entra ID SSO ------------------------------------------
export interface AzureStatusResponse {
  enabled: boolean;
  redirectUri: string;
}

export interface AzureStartResponse {
  url: string;
  state: string;
}

export interface AzureProfile {
  oid: string;
  tid: string;
  preferred_username: string;
  name: string;
}
