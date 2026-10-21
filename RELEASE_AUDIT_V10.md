# NMFA V10 change and release status

## Added in this build
- Atomic `POST /api/journal/post-batch/` endpoint for balanced multi-line journal entries.
- Validates at least two lines, account names, positive one-sided debit/credit values, and equal debit/credit totals.
- Writes all lines in a single transaction; invalid batches create no rows.
- Journal rows are read-only through ordinary API update/delete; corrections should be posted as reversing entries.
- Regression tests cover balanced posting, unbalanced rejection, and immutability.

## Not certified yet
This package is still a development build. Runtime Django tests, PostgreSQL migrations, React production build, Docker runtime, role/branch-level authorization, accounting reconciliation across all transaction types, provider webhooks, and end-to-end customer-to-receipt tests must be run before production use.

## Test command
From the project root, with dependencies and PostgreSQL running:
`docker compose exec backend python manage.py test finance`

## Important accounting limitation
This adds balanced journal batch posting but does not automatically journal every loan disbursement, payment, expense, capital transaction, refund, or reversal. Full accounting integration and independent finance review remain required.
