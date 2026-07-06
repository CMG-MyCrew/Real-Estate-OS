# REOS Enterprise v3.1 — Financial Management & Accounting Integrations

v3.1 adds financial operations to REOS Enterprise, including invoices, vendor payments, expenses, payment approvals, property P&L, and QuickBooks-ready exports.

## Added Files

| File | Purpose |
| --- | --- |
| `src/FinanceManager.gs` | Server-side finance module for invoices, vendor payments, expenses, approvals, P&L, and exports. |
| `src/FinanceManager.html` | Admin UI for financial workflows and finance KPIs. |
| `docs/V3_1_FINANCIAL_MANAGEMENT.md` | v3.1 financial management documentation. |

## New Sheets

| Sheet | Purpose |
| --- | --- |
| `FIN_INVOICES` | Client/property invoices and receivables. |
| `FIN_VENDOR_PAYMENTS` | Vendor payment requests and payment status. |
| `FIN_EXPENSES` | Property-level expenses and receipts. |
| `FIN_PAYMENT_APPROVALS` | Payment approval workflow. |
| `FIN_QB_EXPORTS` | QuickBooks-ready export records. |

## Features

- Create invoices.
- Record invoice payments.
- Create vendor payment requests.
- Require operations and finance approval for vendor payments.
- Mark vendor payments as paid.
- Track property expenses.
- Generate property P&L summary.
- Generate QuickBooks-ready CSV JSON export records.
- Display finance KPIs in a Finance Manager dashboard.

## Menu Access

`REOS → Open Finance Manager`

Admin access is required.

## Recommended v3.1 Workflow

1. Create property/client invoices.
2. Record payments against invoices.
3. Create vendor payment requests from work orders.
4. Approve payments through the payment approval workflow.
5. Mark approved payments as paid after ACH/check confirmation.
6. Record expenses and attach receipt URLs.
7. Review property P&L.
8. Generate QuickBooks-ready export.

## Acceptance Criteria

- Finance sheets are created automatically.
- Invoices can be created and balances calculated.
- Invoice payments update paid amount, balance, and invoice status.
- Vendor payments can be created and routed for approval.
- Payment approvals update payment status.
- Expenses can be recorded by property/category.
- Property P&L calculates revenue, vendor payments, expenses, and net.
- QuickBooks-ready export records are generated.

## Next Roadmap

After v3.1, proceed to **v3.2 Investor, Lender, and Client Portals**.
