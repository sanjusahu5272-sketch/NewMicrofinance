# NMFA V17 Release Audit

## Changes
- Added authenticated `GET /api/reports/trial-balance/` endpoint with optional `from_date` and `to_date` filters. It aggregates journal debits and credits by account and reports whether the selected period balances.
- Added authenticated `GET /api/accounting/summary/` endpoint with account-wise journal totals and a balance check.
- Existing loan, payment, capital, expense, and dashboard workflows are otherwise unchanged.

## Verification
- Python syntax compilation and ZIP integrity checked for this package.
- Django runtime tests and HTTP endpoint tests have not been run in this environment; frontend build and live deployment have not been verified.

## Limitations
- These reports aggregate existing `JournalEntry` rows. They do not yet provide a controlled Chart of Accounts, opening balances, bank statement import/matching, period close, or accountant-reviewed Balance Sheet / Profit & Loss classification.
- Existing journal posting code uses account names as text. Standardize account names and validate account mappings before relying on the report for live finance operations.
- Do not use this release as proof of regulatory compliance or production readiness.
