/**
 * Shared types for the rule-based AI engine.
 *
 * These types are intentionally a strict structural mirror of the legacy
 * `js/ai.js` IIFE return shapes so the rest of the app can be ported
 * mechanically.
 */

export interface CategoryRule {
  cat: string;
  dept: string;
  issue: string;
  tags: string[];
}

export interface ClassifyResult {
  category: string;
  dept: string;
  /** Alias for `dept` used by UI pages. */
  department?: string;
  issue: string;
  forwardDepartment: string;
  responsibleTeam: string;
  /** Optional tags surfaced from the matched rule. */
  tags?: string[];
}

export interface ParsedTicket {
  raw: string;
  category: string;
  /** Alias for `category` used by some UI pages. */
  subCategory?: string;
  bts: string;
  /** Alias for `bts` used by some UI pages. */
  incidentName?: string;
  ic: number;
  icRaw: string;
  serviceImpacted: 'YES' | '0';
  faultTime: string;
  etr: string;
  rootCause: string;
  ticketId: string;
  ping: { transmitted?: string; received?: string; loss?: string };
  laser: { rx?: string; tx?: string };
}

/**
 * Legacy NMC Dashboard contact shape (mirrors `js/pages/contacts.js`):
 *   { id, name, role, dept, rawDept, organization, zone, phone, email,
 *     ipPhone, id_val, source, tags, notes, createdAt, updatedAt }
 *
 * The contact page also surfaces a Google-Sheet CSV with these columns:
 *   Department, Name, Designation, Phone Number, Escalation, ID, Area, IP Phone
 */
export interface ContactRecord {
  id: string;
  name?: string;
  /** Legacy alias — Google Sheet column "Designation". */
  role?: string;
  /** Canonical department key (NMC / NGNC / BNOC / S&T / BTS & Power / NCSS-* / Others-*). */
  dept?: string;
  /** Raw, free-form department string as imported (preserved for round-tripping). */
  rawDept?: string;
  /** Legacy alias — Google Sheet column "Area". */
  organization?: string;
  zone?: string;
  district?: string;
  bts?: string;
  phone?: string;
  email?: string;
  /** Legacy — Google Sheet column "IP Phone". */
  ipPhone?: string;
  /** Legacy — Google Sheet column "ID" (employee/vendor id, not the row id). */
  id_val?: string;
  /** Source tag — 'sheet' (Google Sheet import) or 'manual'. */
  source?: 'sheet' | 'manual' | string;
  tags?: string[];
  /** Free-form notes for legacy import. */
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  [k: string]: unknown;
}

/** A single engineer record as it appears on a roster row. */
export interface RosterEngineer {
  name: string;
  dept?: string;
}

export interface RosterShiftEntry {
  date: string;       // YYYY-MM-DD
  dept: string;       // 'NMC' | 'BNOC' | ...
  shift: string;      // 'Morning' | 'Evening' | 'Night'
  /** May be undefined when the row exists but no engineers were listed yet. */
  engineers?: RosterEngineer[];
}

export interface EngineerAtResult {
  shift: 'Morning' | 'Evening' | 'Night';
  /** Flattened across all matched roster rows; empty if none were staffed. */
  engineers: RosterEngineer[];
  collision: boolean;
}

export type DropdownKey =
  | 'session'
  | 'sessionEngineers'
  | 'name'
  | 'date'
  | 'faultTime'
  | 'restorationTime'
  | 'currentStatus'
  | 'ticketType'
  | 'forwardDepartment'
  | 'responsibleTeam'
  | 'issueType'
  | 'incidentCategory'
  | 'incidentSubCategory'
  | 'queryMail'
  | 'zone'
  | 'serviceImpacted'
  | 'durationOver4h'
  | 'whatsappNotified'
  | 'mailGenerated'
  | 'rcaDocumentStatus';

export type DropdownOptions = Partial<Record<DropdownKey, string[]>>;

export type AITrainingMap = Record<string, string>; // category → dept
export type ContactLearnMap = Record<string, string>; // query → contactId
