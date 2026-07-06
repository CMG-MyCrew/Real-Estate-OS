# REOS Enterprise v3.1.3 — Finance Dashboards

v3.1.3 adds executive financial dashboards and dashboard-ready datasets for REOS finance operations.

## Added Files

| File | Purpose |
| --- | --- |
| `src/FinanceDashboards.gs` | Server-side finance dashboard data service, snapshots, budgets, trends, aging, property P&L, and variance calculations. |
| `src/FinanceDashboards.html` | Admin UI with KPI cards, charts, property P&L, budget variance, and snapshots. |
| `docs/V3_1_3_FINANCE_DASHBOARDS.md` | Finance dashboard documentation. |

## New Sheets

| Sheet | Purpose |
| --- | --- |
| `FIN_DASHBOARD_SNAPSHOTS` | Stores periodic finance KPI snapshots. |
| `FIN_BUDGETS` | Stores property/category budget records and variance tracking. |

## Dashboard Areas

- Revenue
- Receivables
- Payables
- Expenses
- Vendor payments
- Net income
- Cash requirements
- AR aging
- AP aging
- Monthly revenue/expense/net trends
- Property profitability
- Budget variance

## Menu Access

`REOS → Open Finance Dashboards`

Admin access is required.

## Workflow

1. Use Finance Manager to create invoices, payments, and expenses.
2. Use Finance Enhancements for invoice line items and aging.
3. Open Finance Dashboards.
4. Review executive finance KPIs and charts.
5. Create budget records.
6. Recalculate budgets.
7. Create periodic finance snapshots.

## Acceptance Criteria

- `FIN_DASHBOARD_SNAPSHOTS` and `FIN_BUDGETS` are created automatically.
- Dashboard KPIs calculate from finance source sheets.
- AR/AP aging appears in dashboard data.
- Monthly finance trend data is generated.
- Property P&L ranks profitability.
- Budget variance can be created and recalculated.
- Dashboard snapshots can be persisted.

## Next Roadmap

Proceed to **v3.2 Portal Foundation**.
