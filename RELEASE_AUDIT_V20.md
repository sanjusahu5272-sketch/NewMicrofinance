# NMFA V20 Release Audit

## Implemented
- Bank reconciliation match suggestions are read-only and require exact amount, correct debit/credit direction, the configured active bank asset account, and a statement date within +/- 3 days.
- Manual confirmation refuses a match when account, amount, direction, or date do not match; prevents a statement line already marked matched from being matched again and prevents reuse of an already reconciled reference for the same bank account.
- Added admin-only loan subledger reconciliation endpoint comparing disbursed loans, successful disbursement records, Loans Receivable journal debits, installment principal/interest/penalty allocations, and successful payment receipts.
- Added regression tests for bank matching suggestions and incorrect transaction direction.

## Endpoints
- `GET /api/bank-reconciliation-lines/{id}/match_suggestions/`
- `POST /api/bank-reconciliation-lines/{id}/mark_matched/` with `journal_reference` and optional `note`
- `GET /api/accounting/loan-subledger-reconciliation/` (admin only)

## Validation status
- Python syntax compilation and ZIP integrity are checked during packaging.
- Django runtime tests and frontend build must be run in an environment with dependencies installed; do not consider this release production-ready until they pass and accounting staff validate results against real statements.

## Known limits
- Suggestions are not automatic posting or automatic confirmation.
- Matching uses exact amounts, opposite bank-ledger direction, configured account name, and +/- 3 calendar days. Fees, grouped bank settlements, split transactions, reversals, and transactions using non-standard account names require manual investigation.
- Loan subledger reconciliation is diagnostic only. It does not post adjustment entries or replace per-payment allocation records and independent accounting review.
- Opening balances, full bank-statement import, production role/branch authorization, and deployment testing remain separate work.
