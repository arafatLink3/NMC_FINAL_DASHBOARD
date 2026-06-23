# NMC Portal

Single-page automation tool for the **Network Monitoring Center (NMC)**.
**No backend. No subscription. No build step.** Just open `index.html` in any modern browser.

## Quick start

1. Open `index.html` in Chrome / Edge / Firefox.
2. First run will auto-seed sample data (a few contacts, BRAS, SCR, roster, CCB).
3. Settings → set your **WhatsApp Group ID** (the number part of the group invite link).

## Pages

| Page | What it does |
| --- | --- |
| **Dashboard** | KPIs, 14-day incident trend, sub-category pie, open tickets, 1h+ reminders |
| **Tickets** | Create a ticket → AI parses raw text → fills the form → auto-adds to Incident Log. One-click **WhatsApp share** for the format and a separate **Close** flow that pushes the close notification. |
| **Incident Log** | Master table with **all 30+ spec columns** (session, name, incident name, category, sub-category, zone, IC, fault / restoration / duration, ticket ID, type, root cause, RCA provider, action taken, issue type, dept, team, informed person, WhatsApp, mail, current status, …). Filter, search, CSV export, manual entry. |
| **Mail Center** | 6 templates: NTTN, IIG, Telco POP, BRAS Bandwidth (zone-wise), Weekly, Monthly. **Copy / WhatsApp / Outlook (`mailto:`)** with one click. Mail log. |
| **Contacts** | Global contact DB. AI search (exact > zone > substring > learned). Mark "👍" to reinforce learning. CSV import/export. |
| **BRAS DB** | Zone, district, BTS, service agent, BRAS name, loopback, contact. Ping button (browser-side hint). |
| **NMS Links** | Quick links to WhatsUpGold / Zabbix / Cacti / Corero / Nexusguard / NCE-IP / Fastnetmon / Observium / Outlook / WhatsApp Web. Editable. |
| **Duty Roster** | 3 shifts (Morning 08–16, Evening 14–22, Night 22–08) per department. "Who is on duty now" widget uses the AI `engineerAt()` with 14–16 collision logic. |
| **NTTN SCR** | Long-haul capacity share — vendor, link, capacity / used / free. |
| **CCB / NCR / PID** | Change-control items with start/end; auto-flags Ongoing/Upcoming/Completed. CSV import/export. |
| **Reports** | Auto-built Weekly (Sun) and Monthly reports. Send to WhatsApp. |

## Duty-roster import (experimental)

`js/rosterParsers.js` can ingest the per-department Excel exports and emit the
same row shape the in-app roster uses (`{date, shift, engineers, ...}`).

| Parser     | Layout                                            | Status |
| ---------- | ------------------------------------------------- | ------ |
| `parseBTS` | BTS & Power: weekday columns (Time Slot × Sun..Sat) | ✅  |
| `parseNGNC`| NGNC: employee × day-of-month grid (M / E / EE / D-O / LE) | ✅ |
| `parseNMC` | NMC: column-header shifts (Morning/Evening/Night/Weekend/Leave) | ⚠️ stub |
| `parseBNOC`| BNOC: 5-shift × 5-name columns                    | ⚠️ stub |
| `parseSNT` | S&T: column-header shifts                         | ⚠️ stub |
| `parseNCSS`| NCSS: wide multi-site calendar                    | ⚠️ stub |

Test it locally:

```bash
node test-parsers.js     # parses every CSV in ./June-2026 and prints a summary
```
| **Settings** | WhatsApp group, shift collision window, default ticket type & dept. **Backup/Restore** as JSON, full reset. |
| **About / Contact** | Documentation & quick directory. |

## Architecture

* **Storage** — `localStorage` with the `nmc.` prefix. Keys: `contacts, bras, scr, rosters, ccb, tickets, incidents, mailLog, notifications, aiTraining, contactLearn, settings, nms_links, wa_group`.
* **AI** — `js/ai.js` is a **rule-based** engine:
  * `CATEGORY_RULES` map **27 categories** → department, issue type, forward, responsible.
  * `parseTicket(raw)` extracts Category, BTS/Area, IC, Fault Time, ETR, Root Cause, TT, Rx/Tx, ping stats via regex.
  * `suggestContact(q, contacts, n)` ranks exact > zone > substring > learned.
  * `engineerAt(date, rosters)` returns `{shift, engineers, nextShift}` and handles the **14:00–16:00 collision** (both Morning and Evening are on duty).
  * `inferZone(text)` — pulls the zone from `BL_*`, `DHK-*`, `CTG`, `BR_*` etc.
* **Charts** — pure SVG (line / pie / bar) in `js/components/charts.js`. No Chart.js.
* **Excel** — `js/excel.js` lazy-loads SheetJS (CDN) for `.xlsx`; CSV is built-in.
* **WhatsApp** — `https://wa.me/<groupId>?text=<encoded>` link. Works on desktop and mobile. Optional self-hosted wa-bot can be wired in later.
* **Mail** — `mailto:?subject=...&body=...` opens your default mail client (Outlook).

## File tree

```
NMC Dashboard/
├─ index.html              ← SPA entry
├─ design.html             ← Visual blueprint / structure reference
├─ README.md               ← this file
├─ css/
│  └─ theme.css
├─ js/
│  ├─ store.js             ← localStorage data layer
│  ├─ ai.js                ← rule-based AI engine
│  ├─ app.js               ← SPA controller, router, reminders
│  ├─ excel.js             ← CSV/XLSX helpers
│  ├─ components/
│  │  ├─ notif.js          ← toast / modal / drawer
│  │  ├─ chatbox.js        ← AI chatbox for the Tickets page
│  │  └─ charts.js         ← SVG charts
│  └─ pages/
│     ├─ dashboard.js
│     ├─ tickets.js
│     ├─ incidentLog.js
│     ├─ mail.js
│     ├─ contacts.js
│     ├─ bras.js
│     ├─ nms.js
│     ├─ roster.js
│     ├─ scr.js
│     ├─ ccb.js
│     ├─ reports.js
│     ├─ settings.js
│     ├─ about.js
│     └─ contact.js
└─ data/
   ├─ seed.json                       ← first-run sample data
   ├─ seed-excel-templates.csv
   └─ seed-roster-csv.csv
```

## Ticket → Incident mapping

When you click **Confirm & Save to Incident Log** on the Tickets page, this mapping is applied:

| Ticket field | Incident-of-the-month column |
| --- | --- |
| `Category` | Incident Sub-Category |
| `BTS/Area` | Incident Name |
| `IC > 0` | Service Impacted = `YES`, else `0` |
| `IC` | Impacted Client |
| `Fault Time` | Fault Time |
| `TT` | Ticket ID |
| `Root Cause` | Root Cause |
| _AI_ | Forward Department / Responsible Team / Issue Type |
| _AI engineerAt()_ | Session / Session Engineers / Name |
| Default | Current Status = `Running` |

The same flow with **Close Notification** updates `Restoration Time`, `Duration`, `>4h Duration` and pushes a "Close" message to WhatsApp.

## Customizing

* Add a new monitoring tool → **NMS Links** → Edit list. One per line: `Name | URL | Category | Desc`.
* Add a new email template → open `js/pages/mail.js`, copy a template, add a new entry to `TPLS`, and the field array.
* Change the AI rule → open `js/ai.js`, append to `CATEGORY_RULES`. The dashboard / mail / report pages will pick it up immediately.

## Limitations & notes

* The portal runs in the browser. **Closing the tab does not lose data** (localStorage), but **clearing site data will**. Use **Settings → Export** regularly.
* Browser security blocks ICMP `ping()`. The "Ping" button is a hint, not a real network probe. Use your terminal for actual ping.
* WhatsApp sharing uses the official `wa.me` link model — no paid API needed.
* For automated Outlook ingestion of CCB/NCR/PID emails, add a backend IMAP/Graph poller and POST to a webhook (or just paste text into the CCB page; the schema is identical).
