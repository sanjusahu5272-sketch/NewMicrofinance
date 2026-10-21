# V61 — Collection to Cash/Bank Ledger

## Change included
- Added `Payment.bank_account` with migration `0019_payment_bank_account.py`.
- Collection form asks for company bank account when method is `bank`.
- Successful collection accounting debits `Bank: <account>` for bank receipts, or `Cash` for cash receipts; counterpart credits remain split between Loans Receivable, Interest Income, and Penalty Income based on the actual FIFO allocation.
- Collection register now shows bank account used.
- Collection audit details record the ledger account and allocation totals.
- Idempotency comparison includes bank account, preventing a retry key from silently changing the deposit account.
- Regression test added for a bank collection posting to the selected bank ledger.

## Accounting behavior
For a successful ₹50 collection allocated to principal, the balanced journal is Debit `Bank: SBI Current A/C` ₹50 and Credit `Loans Receivable` ₹50. If the payment contains interest/penalty due, the credit is split into the relevant income accounts while total debits still equal total credits. The ledger/book balance rises by the amount collected in that exact Cash or Bank account.

## Limitations and verification
- Generic `Bank` ledger remains a backward-compatible fallback for legacy/API bank collections with no bank account selected; new UI offers a bank account field but it is not mandatory at API level to avoid breaking old clients.
- This is an internal book ledger, not a live bank connection or bank-statement reconciliation.
- Python compilation and ZIP integrity are checked. Django database tests and frontend production build were not run in this environment.
