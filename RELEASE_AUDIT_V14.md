# NMFA V14 Release Audit

## Change in this build
- Added optional unique `Payment.idempotency_key` with migration `0005_payment_idempotency_key.py`.
- Added retry-safe API behavior: repeating the same payment request with the same key and same payment attributes returns the original payment/receipt rather than posting allocation and journal entries again.
- Reusing an idempotency key for a different payment payload returns HTTP 409.
- Added regression tests for duplicate retries and key reuse with a different amount.

## Checks performed
- Python syntax compilation: run during packaging.
- ZIP archive integrity: run during packaging.
- Django runtime tests: not confirmed in this environment; do not treat the new tests as passing until run with project dependencies and database configured.
- Frontend build and deployment: not verified.

## Important limitations
- Idempotency key is optional for backwards compatibility; clients/payment providers should always send a stable key for retries.
- Concurrent duplicate requests can still race at application level; the database unique constraint protects duplicate keys, but a production-grade handler should catch/reload on `IntegrityError` and return the original response.
- This is not a substitute for verified gateway webhooks, provider signature checks, refund/reversal workflows, bank reconciliation, chart-of-accounts setup, or legal/compliance review.
- V14 is a development foundation, not certified or production-ready lending software.
