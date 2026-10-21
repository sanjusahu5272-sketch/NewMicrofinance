# V148 — Financial Period Lock & Controlled Payment Reversal

## Scope
- Adds maker-checker financial period lock requests. A requester cannot approve their own lock.
- Approved date ranges block new automated journal-pair postings and manual journal batches dated inside the locked range.
- Adds maker-checker payment reversal requests. The old `POST /api/payments/{id}/reverse/` action now submits a request; it no longer immediately reverses the collection.
- Approval performs existing receipt-specific safety checks, refuses reversal if a later successful collection exists, reverses installment allocations newest-first, posts a uniquely referenced journal reversal, and audits both request and decision.
- Reversal journal lines preserve the original branch and Chart of Accounts mapping.
- A ledger reversal is explicitly **not** proof that cash/bank funds were actually returned. The actual external refund must be separately reconciled.
- Adds a Financial Controls page under Accounts. The V66 Dashboard component was not edited; V66 dashboard code is byte-for-byte identical to V147.

## API
- `GET/POST /api/financial-period-locks/`
- `POST /api/financial-period-locks/{id}/approve/`
- `POST /api/financial-period-locks/{id}/reject/`
- `GET /api/payment-reversal-requests/`
- `POST /api/payment-reversal-requests/request/` with `{payment, reason, idempotency_key?}`
- `POST /api/payment-reversal-requests/{id}/approve/`
- `POST /api/payment-reversal-requests/{id}/reject/`
- `POST /api/payments/{id}/reverse/` submits a reversal request for compatibility; approval is separate.

## Permissions
Grant only to trusted staff: `manage_financial_locks`, `approve_financial_locks`, `manage_payment_reversals`, `approve_payment_reversals`. Use separate users for maker and checker.

## Important limitations
- The lock guards the project's central `_post_pair` posting helper, the manual journal batch endpoint, and this reversal workflow. It is not a substitute for a database-level accounting-period constraint; every future posting path must use these guarded paths.
- Reversal still intentionally rejects payments when later successful collections exist because this schema lacks persisted per-payment/per-installment allocation rows.
- No real external cash/bank refund is initiated by this workflow.
- Django tests, migrations, PostgreSQL transaction/concurrency behavior, frontend production build, and browser UI were not executed in the build environment. Validate in staging before production.
