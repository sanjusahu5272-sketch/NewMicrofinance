# V86 — Financial Safety Fixes (Hinglish)

Base: V85 Collection Approval Lock Fix. Existing colourful navigation icons (V82) and approval queue UI stabilization (V84) are retained. No sidebar/layout redesign was made.

## Fixed in source

1. **Collection-create crash:** removed an undefined `auto_approve` variable from `PaymentViewSet.perform_create`. Audit action now depends on the effective status, including when the setting auto-approves a pending submission.
2. **PostgreSQL balance query:** removed `SELECT FOR UPDATE` from an aggregate query. Balance checks now acquire stable PostgreSQL transaction-scoped advisory locks per normalized account name, then compute the balance. Multiple account locks are acquired in deterministic order so concurrent withdrawals/transfers cannot both spend an empty/current balance under this code path.
3. **Receipt-specific reversals:** reversal journal rows are selected by external reference **and the unique receipt marker in the journal note**. This prevents a reused bank/gateway reference from reversing journal entries belonging to a different payment. Reversal rejects unbalanced original journals, journal category totals not equal to the payment amount, or a pre-existing reversal reference. It locks the loan and installments and rechecks later successful collections under that loan lock.
4. **Capital/disbursement reference collisions:** capital entries and new disbursements reject a reference already present in the journal, before changing balances/statuses.
5. **Journal-batch retry protection:** balanced journal batches require a reference and reject a previously used reference, preventing the same batch payload from posting twice. The existing single-line journal endpoint/UI remains a legacy limitation noted below.
6. **Regression tests added:** shared external reference does not cross-reverse another receipt; duplicate capital ledger reference is rejected; duplicate journal batch reference is rejected. Existing successful collection, disbursement, balance, and reversal tests remain in the suite.

## Scope and safety boundaries

- These are focused fixes for concrete code-path risks found during source review, **not a full certification of all finance logic**. The existing `/api/journal/` single-line create endpoint and its current UI can still post a standalone line; use the balanced `/api/journal/post-batch/` workflow for demo journal vouchers. Converting the legacy single-line UI to a balanced voucher form requires a deliberate UI change and is not silently included here.
- PostgreSQL concurrent transaction behavior, Django regression tests, migrations, frontend production build, and browser interaction could not be run in this environment (Django/npm dependencies are not installed and package retrieval was unavailable).
- Do not use with real-money transactions until the backend test suite and the demo workflow pass against the same PostgreSQL version used by deployment, followed by ledger-to-bank reconciliation and independent review.
- For a demo, use test-only members and simulated balances, not real customer funds/data.
