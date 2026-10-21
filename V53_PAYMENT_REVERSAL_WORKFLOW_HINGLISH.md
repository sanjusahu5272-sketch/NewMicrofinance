# V53 — Payment Reversal Workflow (Hinglish)

## Added
- `POST /api/payments/{id}/reverse/` for an audited reversal of a successful, loan-linked collection.
- Requires a reason of at least 5 characters.
- Prevents a second reversal and refuses reversal when a later successful payment exists for the same loan. This is a deliberate safety limit because the current schema does not store a separate per-payment/per-installment allocation ledger.
- Restores the installment principal/interest/penalty paid balances based on the original accounting posting; reopens a loan if its status had been `closed`.
- Creates opposite debit/credit journal lines under `REV-{receipt_no}` while retaining original journal rows.
- Marks the original payment `refunded`, records who/when/reason, and writes an AuditLog entry.
- Adds migration `0017_payment_reversal_fields.py` and regression tests.

## Important limitations
- This is an internal ledger reversal, **not a payment-provider refund**. It does not send money back through Razorpay/Cashfree/bank/UPI; that refund must be performed and reconciled separately.
- Only loan-linked successful collections are supported. Non-loan payments are refused.
- Later successful collections must be reversed first. Do not bypass this guard.
- Django/database tests were not run in this environment if Django is unavailable. Python syntax and ZIP integrity checks do not certify the accounting workflow for production.
- Back up the database before applying migrations. Never use `docker compose down -v` on a database containing real data.
