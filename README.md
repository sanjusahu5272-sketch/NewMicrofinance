# NMFA — Consolidated Personal Loan Management Source (V30 Screenshot Integration)

Django REST Framework + PostgreSQL + React/Vite + Nginx Docker source. Intended for local demo and PC testing, not as a declaration of production/regulatory readiness.

## New in V30
- Screenshot inventory for all 55 images: `SCREENSHOT_AUDIT_CAMERA55.md`.
- Printable A4 Loan Application Form with declaration and customer/officer/witness signature fields, launched from each application row.
- Printable A4 EMI Card sourced from the stored loan schedule, with due/principal/interest/penalty/received and staff-sign columns.
- Required member/product/requested amount validation and notes field on application submission.

## Existing modules
- Dashboard; members/customers; branches and areas/centres/groups for geography only (no group-loan lending workflow); loan products; loan application/approval; disbursement; repayment schedule; payments/collections; KYC; capital and expense; accounting foundation; integrations settings; staff users/permissions; reports and audit logs.
- KYC identity/address verification gates and idempotent penalty command are part of the existing source. Do not bypass verification to force loan approval.

## Windows PC test
1. Install/start Docker Desktop.
2. Extract this ZIP to a new folder (do not overwrite your working project immediately).
3. Review `.env` and `backend/.env`; keep PostgreSQL database/user/password consistent with the already initialized DB if reusing it.
4. From project root run `.[0m scripts\start-pc-test.ps1` (PowerShell command in a terminal: `./scripts/start-pc-test.ps1`).
5. Open `http://localhost:5173`; admin is at `http://localhost:5173/admin/`.
6. Create a superuser only if one does not already exist: `docker compose exec backend python manage.py createsuperuser`.
7. Run `./scripts/test-pc.ps1` for the project's test command.

Never use `docker compose down -v` to troubleshoot a project containing data; it deletes the database volume. Back up before migrating or testing with existing records.

## Print workflow
- Open **Loan Applications**, then click **Print Application / Sign** on a saved application.
- Open **Loans / Loan Summary**, then click **Print EMI Card** on a loan. The browser opens a print window; choose printer or Save as PDF.
- Pop-ups must be allowed for localhost.

## Known gaps / test status
- Frontend build not run in the packaging environment (no `node_modules` installed). Django/PostgreSQL tests not run here.
- Current `Member` and `Employee` models do not yet store all fields shown in the reference application and HR screenshots. See `SCREENSHOT_AUDIT_CAMERA55.md` for exact gaps.
- Payroll, attendance/leave, official Aadhaar/PAN verification, live OTP/SMS delivery, payment provider webhook/settlement/refund paths, complete accounting reconciliation and full branch-scoped RBAC require further implementation and tests.
- The printable application auto-fills only fields already available in NMFA. Verify missing details before printing and signing. Do not use the sample form as a substitute for approved sanction/KFS/loan agreement documents.
- This package is not production certified. Use no live money or real customer KYC until security, legal, accounting, operational and provider reviews are completed.


## V32 additions

See `V32_IMPLEMENTATION_NOTES_HINGLISH.md` for server-backed organization branding, initial attendance/payroll workflows, migration, tests, verification status, and explicit incomplete items. This version is development/PC-test only; do not treat it as production certified.

## V69 — Approval Workflows

The new approval update is documented in `V69_APPROVAL_WORKFLOWS_HINGLISH.md`. It adds Loan, Salary, Collection, Product Loan, Settlement and Fund Transfer approval pages and their backend workflows while preserving the existing CSS. Review the verification section carefully: Python/JSX syntax checks passed, but Django tests, PostgreSQL migrations and the Vite production build were not executable in the packaging environment. This is not production certified.
## V149 — Bank statement reconciliation safety
- Adds controlled bank statement CSV import, exact-file and referenced-row duplicate protection, opening/closing balance controls, audited match/ignore actions, and batch close validation.
- Adds the `0032_bank_statement_import_batches` migration and focused tests in `backend/finance/tests_v149_bank_reconciliation.py`.
- V66 Dashboard component remains byte-for-byte unchanged from V148; new controls are inside the existing Financial Controls screen.
- This source is not certified production-ready until staging Django tests, migration application, frontend build, reconciliation sample review and backup/restore tests pass.
