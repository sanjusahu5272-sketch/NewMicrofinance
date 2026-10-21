# V60 — Real Cash/Bank Balance Guards

## Implemented
- Loan disbursement checks the selected ledger source (`Bank: <account>` or `Cash`) before changing loan status or posting the disbursement.
- A disbursement is rejected when the recorded available balance is below the disbursement amount.
- Capital withdrawals are rejected when the chosen bank/cash account does not have enough recorded funds.
- Cash expenses are rejected when the recorded Cash balance is insufficient.
- Added regression tests for insufficient bank disbursement balance and over-limit capital withdrawal; updated happy-path disbursement fixtures to include opening balances.

## Accounting meaning and limitations
- Available balance is calculated as posted journal debits minus credits for that exact account name. Account naming must be consistent (`Cash`, `Bank: SBI Current A/C`).
- This is a ledger/book balance, not a live bank API balance. Opening balances must be entered through a reviewed journal/opening balance process; do not create fake investment entries just to pass the check.
- This guard does not replace bank reconciliation or accountant review. Existing legacy data without opening-balance journal rows may cause disbursements to be rejected until the true opening balances are recorded.
- Django tests could not be executed in this environment because Django is not installed. Python compilation and ZIP integrity are checked; full database/API test results are unverified.
