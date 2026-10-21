# NMFA Master Completion Roadmap (V21 Consolidated)

## What this package is
This is the consolidated working source from the latest supplied foundation (V20), organized as one project. Do **not** unzip V3, V10, V15, V19 and V20 on top of each other: they are successive snapshots and can overwrite newer code/migrations. Use this V21 package as the single source of truth going forward. Earlier ZIPs should be retained only as historical checkpoints.

## Development history represented in the source
- V3–V10: base Django/DRF + React/Vite app, core members/branches/groups, loan lifecycle, EMI schedule and collection, capital/expenses, reports, audit logs, KYC and integrations foundation; later releases added workflow guards and schedule/accounting fixes.
- V11: journal posting for disbursement, payment allocation, capital and expenses.
- V12: configurable loan plans and daily/weekly/fortnightly/monthly frequency; flat/reducing rate configuration and validations.
- V13: staff-gated financial writes and immutability for plans already used by loans.
- V14: payment idempotency key and duplicate-request handling.
- V15: dashboard UI refresh.
- V16: additional dashboard finance metrics.
- V17: trial balance and accounting summary endpoints.
- V18: chart of accounts and management P&L / balance-sheet foundations.
- V19: bank reconciliation statement-line model and API foundation.
- V20: bank match suggestions and loan-subledger reconciliation diagnostics.
- V21: this consolidated package, corrected version metadata, and ordered implementation/QA gates.

## Ordered completion plan

### Phase 0 — Preserve and establish a repeatable environment
1. Keep a copy of the database and the current ZIP before applying changes.
2. Use this V21 folder as the only active source tree.
3. Create a private `.env` from the provided examples; never commit real secrets or customer KYC data.
4. Run with Docker Compose first so PostgreSQL, backend and frontend use the same configuration.
5. Do not seed demo data into production.

### Phase 1 — Run baseline checks before adding features
1. `docker compose config`
2. `docker compose up --build -d`
3. `docker compose exec backend python manage.py check`
4. `docker compose exec backend python manage.py showmigrations finance`
5. On a disposable database only: `docker compose exec backend python manage.py migrate`
6. `docker compose exec backend python manage.py test finance`
7. `docker compose exec frontend npm run build` (or build the frontend image).
8. Record failures and fix them before proceeding. The authoring environment did not have Django installed, so these runtime checks have **not** been marked passed here.

### Phase 2 — Financial correctness (P0)
1. Make every money-moving workflow atomic: payment, disbursement, capital, expense, journal rows and installment allocation must commit or roll back together.
2. Make idempotency mandatory for retriable digital/provider collection requests; handle concurrent unique-key conflicts safely.
3. Add explicit refund/reversal/chargeback entries; never edit or delete posted financial rows to correct them.
4. Replace free-text journal account names with a foreign key to Chart of Accounts, with controlled account mapping and migration of existing rows.
5. Add opening-balance import with source, date, approver and balanced journal posting.
6. Reconcile each loan's principal balance to its installment subledger and general ledger.
7. Test flat and reducing-balance schedules for every frequency, leap years, 28/29/30/31-day months, rounding, partial/advance payments, missed dues, foreclosure and rescheduling.
8. Have an accountant independently verify sample loans and reports before real transactions.

### Phase 3 — Accounting close and reconciliation (P0)
1. Complete bank statement CSV import and duplicate-file/duplicate-row detection.
2. Match on bank account, amount, direction, date, and reference; require manual resolution for split/combined settlement, bank fees, reversals and uncertain matches.
3. Ensure statement and ledger closing balances reconcile; store who reconciled and when.
4. Add accounting-period locks and controlled adjustment journals.
5. Validate Trial Balance, P&L and Balance Sheet against opening balances and the same journal ledger.
6. Define interest recognition policy and how unearned/accrued interest is represented before showing accounting profit as final.

### Phase 4 — Authorization and data protection (P0)
1. Replace coarse `is_staff` checks with explicit roles: Super Admin, Branch Manager, Accountant, Cashier, Loan Officer, Field Officer and Auditor.
2. Enforce branch-level object scoping in every list/detail/action/export endpoint.
3. Add dual approval/limits for high-value disbursements, refunds and journal adjustments.
4. Keep KYC files private; add object-storage access controls, download audit trail, retention/deletion rules and malware scanning.
5. Add login throttling, password policy, secure secret rotation, least-privilege DB account, backups and restore drills.

### Phase 5 — Lending operations (P1)
1. Complete household income and existing-debt assessment and configurable repayment-capacity rules.
2. Snapshot the approved product terms on each sanctioned loan.
3. Add sanction letter, repayment schedule disclosure/KFS where applicable, receipts, statement and closure certificate.
4. Complete field officer assignments, visit records, cash handover, cashier settlement and shortage/excess approvals.
5. Add overdue aging and portfolio-at-risk reports; test reports against source registers.

### Phase 6 — External integrations (P1/P2)
1. Implement provider-specific payment initiation and signed webhook verification; settings alone are not integration.
2. Test retries, duplicate webhooks, pending/failure, refunds, settlement files and reconciliation in provider sandbox.
3. Add SMS/WhatsApp/email delivery adapters, delivery logs, retry policy and opt-out/consent controls.
4. Configure AutoPay/eNACH only after provider approval and mandate lifecycle tests.

### Phase 7 — UI and deployment (P1)
1. Run frontend build and browser test at desktop and mobile widths.
2. Verify every visible button, form, loading/error state, pagination and permission error against a real API.
3. Replace sample/demo values with live API data only; do not fabricate historical chart points.
4. Set production secrets, `DEBUG=0`, exact `ALLOWED_HOSTS`, CORS/CSRF origins, HTTPS and database backups.
5. Run dependency/security scans, external security review and a restore drill.
6. Deploy to staging first; run acceptance tests and sign-off before production.

## Current honest status
- Source-level code and migration files are included through V20.
- Python syntax compilation and ZIP integrity can be checked locally without Django.
- Django runtime tests, frontend production build, live gateway webhooks, actual bank reconciliation, security review and production deployment are **not certified by this package**.
- The dashboard and accounting reports are only as reliable as source transactions and account mappings. Do not use them for live lending decisions until reconciliation and independent review pass.

## Suggested acceptance gates
A phase is complete only when: automated tests pass; manual test evidence is saved; no unclassified journal accounts remain for the period; trial balance balances; bank reconciliation difference is zero or explained and approved; loan subledger differences are zero or explained and approved; role/branch isolation tests pass; and restore test succeeds.
