# REOS Enterprise v3.2.2 — Investor Portal UI

v3.2.2 adds the investor-specific portal dashboard and admin tooling.

## Added Files

| File | Purpose |
| --- | --- |
| `src/InvestorPortal.gs` | Investor portal data service, investor updates, watchlist, portfolio KPIs, and property performance. |
| `src/InvestorPortal.html` | Admin/investor dashboard UI for reviewing investor portal data. |
| `docs/V3_2_2_INVESTOR_PORTAL_UI.md` | Investor Portal UI documentation. |

## New Sheets

| Sheet | Purpose |
| --- | --- |
| `INVESTOR_PORTAL_UPDATES` | Stores investor-facing updates. |
| `INVESTOR_PROPERTY_WATCHLIST` | Stores investor property watchlist records. |

## Features

- Investor portfolio KPIs
- Net income visibility
- Cash requirement visibility
- Property performance table
- Monthly performance chart
- Investor documents
- Investor messages
- Investor tasks
- Investor updates
- Investor property watchlist

## Menu Access

`REOS → Open Investor Portal`

Admin access is required.

## Workflow

1. Create an investor portal account in Portal Foundation.
2. Share documents and tasks with the investor account.
3. Open Investor Portal.
4. Enter the investor Portal Account ID.
5. Review investor portfolio KPIs and performance.
6. Create investor updates and watchlist records.

## Acceptance Criteria

- Investor portal sheets are created automatically.
- Investor dashboard loads only for `Investor` portal accounts.
- Investor KPIs calculate from finance dashboard data.
- Investor documents, messages, tasks, updates, and watchlist records display.
- Investor Portal appears in the REOS menu.

## Next Roadmap

Proceed to **v3.2.3 Vendor Portal UI**.
