# REOS Enterprise v3.1.1 — Finance Enhancements

This incremental release extends v3.1 Financial Management with invoice line items, PDF-ready invoice output, accounting categories, and aging reports.

## Added Files

| File | Purpose |
| --- | --- |
| `src/FinanceEnhancements.gs` | Server-side enhancement engine for invoice lines, recalculation, aging, PDF-ready snapshots, and category mapping. |
| `src/FinanceEnhancements.html` | Admin UI for finance enhancement workflows. |
| `docs/V3_1_1_FINANCE_ENHANCEMENTS.md` | v3.1.1 finance enhancement documentation. |

## New Sheets

| Sheet | Purpose |
| --- | --- |
| `FIN_INVOICE_LINES` | Stores invoice line items. |
| `FIN_ACCOUNT_CATEGORIES` | Stores accounting categories and QuickBooks account mapping. |
| `FIN_INVOICE_PDFS` | Stores PDF-ready invoice HTML snapshots and future Drive links. |

## Included in This Increment

- Invoice line item foundation.
- Automatic invoice subtotal, tax, total, and balance recalculation.
- PDF-ready invoice HTML snapshot.
- Accounting category seed data.
- Receivables aging.
- Vendor payables aging.
- Finance Enhancements dashboard.

## Menu Access

`REOS → Open Finance Enhancements`

Admin access is required.

## Next Increment

v3.1.2 QuickBooks Connector:

- OAuth settings foundation
- Company connection records
- Chart of Accounts sync table
- Customer/vendor sync queues
- Invoice/payment export mapping
- Sync log dashboard
