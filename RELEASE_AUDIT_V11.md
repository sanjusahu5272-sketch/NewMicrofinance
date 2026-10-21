# NMFA V11 — Financial Posting Improvements

## Changes in this build
- Successful loan disbursement now posts a balanced internal journal pair: debit `Loans Receivable`, credit the selected cash/bank/clearing account.
- Successful loan collections allocate against installment dues and post balanced entries for the principal, interest and penalty portions actually allocated.
- Capital additions/withdrawals post balanced journal pairs.
- Expense creation posts a balanced expense/cash journal pair.
- Added regression tests for disbursement and collection journal posting.

## Important limits
- This is still a development foundation, not certified production financial software.
- Chart-of-accounts names and cash/bank treatment must be reviewed for the organisation's approved accounting policy; expense and capital endpoints currently assume Cash for their counterpart account.
- Refunds, payment reversals, chargebacks, bank reconciliation, idempotency keys, full role/branch isolation, external provider webhooks, and regulatory/accounting review are not complete.
- Django runtime tests and frontend production build must be run in an environment with dependencies installed. Python syntax compilation alone does not certify correctness.
- Before real money or real KYC documents are used, perform independent financial, security, and legal review and test backups/restores.
