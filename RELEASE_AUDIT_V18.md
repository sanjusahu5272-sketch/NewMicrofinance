# NMFA V18 Release Audit — Chart of Accounts & Statement Foundations

## Implemented
- Added Chart of Accounts model with unique code/name and account types: asset, liability, equity, income, expense.
- Added migration `0006_chart_of_account.py`.
- Added authenticated read and admin-only write API at `/api/chart-of-accounts/`.
- Added management P&L endpoint `/api/reports/profit-and-loss/`.
- Added management Balance Sheet endpoint `/api/reports/balance-sheet/`.
- Reports classify journal rows only by exact case-insensitive account-name mapping and explicitly list unclassified journal account names.
- Reports expose completeness/warning fields; they are not claimed to be statutory-ready.

## Important limitations
- JournalEntry still stores account names as text; chart mapping is name-based rather than a foreign key, so account renaming requires care.
- No opening-balance import workflow or bank-statement reconciliation is implemented in this release.
- Existing ledger postings and operational subledgers still require reconciliation before statements can be relied upon.
- Django runtime tests and frontend production build were not run in this environment. Python syntax and archive integrity are the checks planned for this package.
