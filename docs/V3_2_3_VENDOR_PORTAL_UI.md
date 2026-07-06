# REOS Enterprise v3.2.3 — Vendor Portal UI

v3.2.3 adds the vendor-specific portal dashboard and workflow UI.

## Files

| File | Purpose |
| --- | --- |
| `src/VendorPortal.gs` | Vendor portal dashboard data, vendor updates, completion records, task completion, payment visibility, and portal account support. |
| `src/VendorPortal.html` | Dashboard UI for reviewing vendor portal data and creating vendor updates. |
| `docs/V3_2_3_VENDOR_PORTAL_UI.md` | Vendor Portal UI documentation. |

## New Sheets

| Sheet | Purpose |
| --- | --- |
| `VENDOR_PORTAL_UPDATES` | Vendor work/status updates. |
| `VENDOR_WORK_SUBMISSIONS` | Vendor completion records and document links. |

## Features

- Vendor KPIs
- Assigned work and work order visibility
- Payment visibility
- Shared documents
- Messages
- Tasks
- Work status updates
- Completion records

## Menu Access

`REOS → Open Vendor Portal UI`

Admin access is required.

## Acceptance Criteria

- Vendor portal sheets are created automatically.
- Vendor dashboard loads only for `Vendor` portal accounts.
- Assignments, work orders, payments, documents, messages, tasks, updates, and completion records display.
- Vendor Portal UI appears in the REOS menu.

## Next Roadmap

Proceed to **v3.2.4 Client/Lender Portal UI**.
