# V80 — Loan lifecycle and accounting reconciliation hardening

## Added in this increment
- Loan approval is now limited to pending loans, locks the loan row, checks active member/product and active linked penalty scheme, applies configured KYC requirement, and writes an audit record.
- Loan disbursement locks the loan row before checking status and creating disbursement/schedule to reduce concurrent duplicate-disbursement risk.
- Journal API adds `GET /api/journal/trial-balance/` with optional `start_date` and `end_date`, account-wise debit/credit/net totals, grand totals, difference and balanced flag.
- Trial-balance endpoint validates date format and date order.
- Bank statement `mark_matched` now locks the statement line and rejects zero-value or simultaneous debit/credit lines before matching.
- Added tests for trial-balance balancing and invalid date input.

## Still incomplete / must not be treated as production ready
- Full approval end-to-end testing for loan, salary, collections, product-loan requests, settlement and fund transfers remains pending.
- Settlement approval still does not collect the settlement payment or close the loan; this needs a defined payment/allocation workflow.
- Product-loan approval intentionally does not create a loan/disbursement without a configured pricing/repayment conversion rule.
- Trial balance aggregates journal rows; fiscal-year opening balances, full P&L classification, branch/fiscal-year policy and complete bank reconciliation remain to be verified.
- Django tests/migrations and frontend build/browser testing were not run in this environment.
