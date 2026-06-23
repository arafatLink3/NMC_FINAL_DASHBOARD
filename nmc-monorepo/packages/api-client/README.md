# @nmc/api-client

Shared, isomorphic typed REST client for the NMC portal.

- Pure ESM, depends only on `@nmc/ai` (workspace package)
- Works in Next.js (Web fetch) and React Native (WHATWG fetch)
- JWT access + refresh, 401-triggered single retry
- Normalised `ApiError` with `status`, `code`, `message`, `details`
- One barrel export: `createClient` + `bindEndpoints` + `NmcApi`

## Layout

```
src/
  client.ts      ← core HTTP client (auth, refresh, errors, FormData)
  endpoints.ts   ← typed NmcApi endpoint map
  errors.ts      ← ApiError + isApiError
  storage.ts     ← TokenStorage adapters (memory, localStorage)
  types.ts       ← domain record types
  index.ts       ← barrel
```

## Quick start

```ts
import { createClient, bindEndpoints, type NmcApi } from '@nmc/api-client';

const http = createClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL!,
  refresh: async (rt) => {
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    });
    return r.json();
  },
});

export const api: NmcApi = bindEndpoints(http);
```

## Mirrors the legacy `NMC Dashboard/js/...`

The record shapes (`TicketRecord`, `IncidentRecord`, `ContactRecord`,
`BrasRecord`, `NmsLink`, `RosterRecord`, `ScrRecord`, `CcbRecord`,
`MailLogEntry`, `Settings`) are 1-to-1 with the localStorage records
from `js/store.js`, and the endpoint paths match the server's REST
contract (see `server/src/routes/...`).
