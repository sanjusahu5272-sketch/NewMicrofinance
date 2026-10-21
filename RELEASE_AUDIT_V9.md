# NMFA V9 Release Audit

## Changes in this build
- Payment records are read-only through the API after creation. PATCH/PUT/DELETE are disabled to reduce financial-history tampering; a future reversal/refund workflow must be implemented for corrections.
- Disbursement records are read-only through their register endpoint; disbursement remains a loan action.
- Loan close action now rejects non-disbursed loans and loans with unpaid installments, and writes an audit log on successful closure.
- Added regression tests for loan-close safeguards and payment immutability.

## Checks actually performed in this environment
- Python `compileall`: PASS.
- ZIP archive integrity: will be checked after packaging.
- Django test suite: NOT RUN; Django/DRF are not installed and dependency download failed because network/DNS is unavailable.
- Database migrations / PostgreSQL integration: NOT RUN.
- Frontend production build: NOT RUN.
- Browser click-through and real payment provider tests: NOT RUN.

## Not certified for production
This is a development build, not a certified banking or regulated lending system. The following remain release blockers:
- Execute Django tests against PostgreSQL and fix all failures.
- Execute frontend dependency install/build and browser-level workflows.
- Implement server-enforced branch/role scoping (current authentication is not equivalent to full RBAC).
- Replace single-line journal entries with balanced, transactional double-entry journal batches and reconcile disbursements/collections/expenses against ledger entries.
- Implement controlled payment reversals/refunds, idempotency keys and gateway webhook signature verification.
- Audit KYC upload MIME/content validation, private storage and branch/user access controls.
- Validate flat/reducing interest calculations and due-date conventions with the business owner/accountant.
- Harden production settings, secrets, backups, monitoring, HTTPS and disaster recovery.

## Run tests locally
From the extracted project folder, with Docker Desktop running:

```powershell
docker compose up -d --build
docker compose exec backend python manage.py check
docker compose exec backend python manage.py makemigrations --check --dry-run
docker compose exec backend python manage.py test finance
```

Do not use real customer KYC or money until all release blockers are resolved and independently reviewed.
