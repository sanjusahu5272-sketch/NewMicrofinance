# NMFA V16 — Finance Dashboard Metrics

## Changes
- Dashboard shows total capital invested, total disbursements, principal outstanding, total successful collections, interest collected, overdue amount, cash balance, bank balance, expenses, and net capital.
- Added principal/interest/penalty allocation totals from installment records and overdue amount aggregation.
- Kept cash and bank balances derived from journal rows instead of incorrectly presenting capital or collections as account balances.
- Dashboard quick summary includes today's collection/disbursement and pending applications.
- Replaced earlier misleading cash/collection-derived card calculations with individually labeled metrics.

## Important limitations
- Figures are only as accurate as recorded source data and existing journal/account naming conventions.
- The current accounting foundation is not a complete general ledger; cash/bank figures should be reconciled before operational use.
- `profit_loss_proxy` is intentionally not presented as audited profit. Full P&L requires accrual rules, interest recognition policy, and chart-of-accounts validation.
- Django runtime tests and frontend production build were not executed in this environment. Python syntax compilation and ZIP integrity checks are the only checks performed here.
