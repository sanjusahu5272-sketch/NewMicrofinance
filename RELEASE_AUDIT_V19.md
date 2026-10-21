# NMFA V19 Release Audit — Bank Reconciliation Foundation

## Implemented
- Added `BankReconciliationLine` for manually entered/import-prepared statement lines: bank account, date, description, reference, debit/credit, optional statement balance, status and note.
- Added admin-only API `/api/bank-reconciliation-lines/` and summary `/api/accounting/bank-reconciliation-summary/`.
- Added explicit action to mark a statement line matched to an existing journal reference; requires the bank account to be configured as an Asset in Chart of Accounts.
- Added validation preventing zero-amount lines, negative values and simultaneous debit+credit on one line.
- Added migration 0007 and regression tests.

## Limitations / do not treat as completed bank reconciliation
- This is a tracking foundation, not automated bank statement import or transaction-level amount/date matching. The `mark_matched` action checks that a journal reference exists but does not prove statement and ledger amounts are equal. An accountant must verify amounts and dates.
- Opening balance workflow, loan-subledger reconciliation, runtime Django tests, production frontend build and independent accounting review remain outstanding.
- Do not use for live financial close until database migration and runtime tests pass and reconciliation controls are completed.
