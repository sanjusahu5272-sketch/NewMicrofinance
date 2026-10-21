# V46 — Migration drift fix and verification status

## Change made
- Added finance migration `0016_alter_installment_options_alter_capitalentry_date_and_more.py` to represent the model changes that V45's `makemigrations --dry-run --check` reported.
- The migration adjusts Installment ordering metadata and adds `timezone.localdate` defaults to CapitalEntry.date, Disbursement.date, Expense.date, JournalEntry.date and Payment.paid_on.
- The migration does not intentionally remove or rewrite existing transaction rows. Back up the database before applying any migration to a database with real records.

## Do not mistake this for full production completion
This update addresses the specific migration drift seen during the user's PC test. It does not certify every requested UI field, financial workflow, branch permission, payment gateway webhook, SMS delivery, accounting reconciliation or production security control.

## Verification required on the user's Docker environment
From `NMFA_Production_v3`:

1. Back up the database using the configured database username/name, and confirm the backup file is non-empty.
2. `docker compose exec backend python manage.py check`
3. `docker compose exec backend python manage.py makemigrations finance --dry-run --check`
4. Review `docker compose exec backend python manage.py sqlmigrate finance 0016` before applying.
5. Only after reviewing the SQL and confirming a restorable backup: `docker compose exec backend python manage.py migrate`
6. `docker compose exec backend python manage.py test finance`
7. `docker compose exec frontend npm run build`

Do not run `docker compose down -v`; it can delete database volumes. Do not test using real customer data or live-money integrations.

## Packaging verification
- Python source files can be syntax-compiled without a database.
- Django runtime tests and frontend build must be run in the Docker environment; they are not claimed as passed by this source bundle.
