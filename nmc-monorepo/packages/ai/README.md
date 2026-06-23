# `@nmc/ai`

Faithful TypeScript port of `NMC Dashboard/js/ai.js` — pure, framework-agnostic rule-based AI.

## What's here

| Function | Source |
| --- | --- |
| `classify(category, freeText, train?)` | `CATEGORY_RULES` lookup + tag/substring fallback |
| `parseTicket(raw)` | regex label parser (Category, BTS/Area, IC, Fault, ETR, Root, TT, ping, Rx/Tx dBm) |
| `suggestContact(q, contacts, n?, learn?)` | exact > zone > district > token > learned scoring |
| `engineerAt(date, rosters)` | 14–16 collision window |
| `inferZone(text)` | `BL_*`, `DHK-*`, `CTG`, `BR_*` patterns |
| `buildTimeOptions()` | 24h × 15-min step |
| `parseTimeToISO / diffDuration / durationOverThreshold` | duration helpers |
| `DropdownConfig` | defaults + text-only field set + getter/setter |

## Design notes

- **No side effects, no I/O.** All persistence is the caller's job (server → Sequelize, web/RN → `@nmc/store`).
- **No `window` / `localStorage` coupling.** The legacy `global.NMCStore` reference is gone; callers inject `train` / `learn` maps explicitly.
- **Identical observable behavior** — unit tests mirror the legacy semantics; running them next to the legacy HTML is the regression check.

## Usage

```ts
import { classify, parseTicket, suggestContact, engineerAt } from '@nmc/ai';

const r = classify('FO Link down', 'fiber cut on the uplink');
// → { category: 'FO Link down', dept: 'NCSS', issue: 'Fiber / Physical', ... }

const t = parseTicket(rawText);
// → { category, bts, ic, serviceImpacted, faultTime, etr, rootCause, ticketId, ping, laser }

const onDuty = engineerAt(new Date(), rosters);
// → { shift, engineers, collision }
```
