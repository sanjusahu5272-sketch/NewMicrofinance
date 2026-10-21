# NMFA V67 — Feature Integration Patch (Hinglish)

## Changes in this package
- Preserves the existing V63 reference UI assets and current NMFA frontend/backend source.
- Registers the existing `PromiseToPayViewSet` and `SettlementCaseViewSet` in Django REST Framework router so the frontend `/promises-to-pay/` and `/settlements/` calls have API routes.
- Adds Settlement to the reference sidebar and keeps KYC Documents accessible from Members.
- Adds Loans and EMI Records to the Loan Summary navigation group.
- Adds a Backup / Restore screen with authenticated operational JSON export and backup-file format/count preview.
- Adds permission mapping for KYC Documents and Backup / Restore.
- Keeps Group Loan / Group EMI Collection excluded.

## Important boundaries
- Backup screen exports operational records only. It does NOT restore/import into the live database, and it does not include passwords, secret keys, file attachment bytes or database schema.
- No real payment gateway credentials are added; integration settings still require configuration.
- No database reset or destructive migration is included.
- Run full frontend build, Django tests, migrations check, and end-to-end tests on the target PC before using real money. This environment had no Django installation and frontend dependencies were not installed, so those suites were not run here.
