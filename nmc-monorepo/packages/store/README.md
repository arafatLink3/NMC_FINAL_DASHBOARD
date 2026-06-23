# @nmc/store

Storage abstraction for the NMC portal. The legacy `NMC Dashboard/js/store.js`
stored everything in `localStorage` under the `nmc.` prefix; this package keeps
the same record shape and key names so the new code is a 1:1 replacement.

## Adapters

| Adapter | Where | File |
| --- | --- | --- |
| `localStorageAdapter` | Web fallback | `src/localStorageAdapter.ts` |
| `indexedDbAdapter` | Web (preferred) | `src/indexedDbAdapter.ts` |
| `AsyncStorageAdapter` | React Native (APK) | `src/asyncStorageAdapter.ts` |

The detection helper `detectWebAdapter()` returns IndexedDB when available and
falls back to localStorage otherwise.

## High-level store

`createWebStore()` / `createLocalStore()` / `createAsyncStorageStore(backend)`
returns an `NmcStore` with typed tables:

```ts
const store = createWebStore();
await store.tickets.add({ category: 'BTS Down', currentStatus: 'open' });
const open = (await store.tickets.list()).filter(t => t.currentStatus === 'open');
const json = await store.exportJson();     // backup
await store.importJson(json);              // restore
```

## Key namespacing

All keys are auto-prefixed with `nmc.` (e.g. `tickets` → `nmc.tickets`).
