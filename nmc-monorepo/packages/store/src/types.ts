/**
 * Storage abstraction. The legacy NMC Dashboard stored everything in
 * `localStorage` under the `nmc.` prefix. This package keeps the same
 * API shape (`get`/`set`/`list`/`add`/`update`/`remove`) so the new
 * UIs can keep the same mental model, but uses IndexedDB in the browser
 * and AsyncStorage in React Native (so the same code works on the APK).
 *
 * The minimal record shape is `{ id, ...data, createdAt, updatedAt }`.
 */

export type AnyRecord = Record<string, unknown> & { id: string; createdAt: string; updatedAt: string };

export interface StoreAdapter {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  /** Return all records for a "table" key. */
  list<T = AnyRecord>(key: string): Promise<T[]>;
  /** Append a record to a "table" key (array of records). */
  add<T = AnyRecord>(key: string, record: AnyRecord): Promise<T>;
  /** Patch a record by id within a "table" key. */
  update<T = AnyRecord>(key: string, id: string, patch: Partial<T>): Promise<T | null>;
  /** Remove a record by id from a "table" key. */
  removeItem<T = AnyRecord>(key: string, id: string): Promise<T | null>;
  /** Clear a single key (or all keys with the prefix when `key` is null). */
  clear(key?: string): Promise<void>;
  /** Wipe everything (used by the "Reset" button in Settings). */
  resetAll(): Promise<void>;
  /** List raw keys (debugging). */
  keys(): Promise<string[]>;
}
