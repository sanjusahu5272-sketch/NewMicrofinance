# V59 — Bank-wise Investment and Disbursement Tracking

## Added
- Added `bank_account` to capital/investment entries and loan disbursement records.
- Capital contribution/withdrawal posts against `Bank: <account name>` when a bank account is supplied; blank account remains cash for backward compatibility.
- Bank disbursement now requires a bank account name before any loan status/schedule changes are made. Cash disbursement remains available.
- Capital / Investment page shows balances calculated from journal entries grouped by bank account, an investment ledger with account names, and a disbursement-source register.
- Disbursement form captures the account from which the loan is paid.

## Migration
Run the normal migration after backing up the database:
`python manage.py migrate`

Migration `0018_bank_account_tracking.py` adds nullable-in-practice blank string fields with empty defaults; existing records remain valid. Existing disbursements without a recorded bank account display `Legacy / not recorded` and are not guessed.

## Limitations / verification
- These are ledger-derived balances, not a live connection to a bank account or a bank statement feed.
- Existing legacy entries posted to generic `Bank` cannot be assigned to a specific bank account automatically.
- The application records account names, not account numbers or credentials. Prefer safe labels such as `SBI Current A/C ••••1234`; never store banking passwords, PINs, or OTPs.
- Python/JS syntax and ZIP integrity checks are performed where tooling is available; Django database tests and browser production build must still be run in the user's Docker environment before real-money use.
