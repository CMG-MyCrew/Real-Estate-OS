# REOS Enterprise v3.1.2 — QuickBooks Connector Foundation

This increment adds the QuickBooks connector foundation in dry-run mode.

## Added Files

| File | Purpose |
| --- | --- |
| `src/QuickBooksConnector.gs` | Server-side connector foundation for connection records, mappings, export queue, and dry-run sync logs. |
| `src/QuickBooksConnector.html` | Admin UI for connector setup and dry-run sync review. |
| `docs/V3_1_2_QUICKBOOKS_CONNECTOR.md` | QuickBooks connector documentation. |

## New Sheets

| Sheet | Purpose |
| --- | --- |
| `QB_CONNECTIONS` | Stores QuickBooks connection configuration and OAuth property names. |
| `QB_SYNC_LOG` | Stores sync activity and dry-run results. |
| `QB_ACCOUNT_MAP` | Maps REOS finance categories to QuickBooks accounts. |
| `QB_ENTITY_MAP` | Maps REOS entities to QuickBooks customers, vendors, invoices, bills, and purchases. |
| `QB_EXPORT_QUEUE` | Stores queued accounting objects for export/import operations. |

## Included in This Increment

- QuickBooks connection registry.
- OAuth setting placeholders.
- Account mapping seed from `FIN_ACCOUNT_CATEGORIES`.
- Finance export queue for invoices, vendor payments, and expenses.
- Dry-run sync processor.
- Sync logging.
- QuickBooks Connector dashboard.

## Menu Access

`REOS → Open QuickBooks Connector`

Admin access is required.

## Important

This increment does not send live data to QuickBooks. It prepares records and performs dry-run logging only.

## Next Increment

v3.1.2.2:

- OAuth authorization URL builder
- Token exchange handler
- Refresh token handler
- QuickBooks API request wrapper
- Sandbox connection test
