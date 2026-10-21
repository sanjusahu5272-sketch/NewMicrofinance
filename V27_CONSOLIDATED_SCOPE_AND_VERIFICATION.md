# NMFA V27 Consolidated Source — Scope & Verification

## Consolidated in one source tree
- Screenshot-inspired New Microfinance Service Association dashboard and existing personal-loan UI/workflows.
- Members/customers, KYC document upload (photo, Aadhaar, PAN, other identity, address/utility, passbook, bank statement, income, signature, cheque, voter ID, driving licence, passport, loan agreement, nominee/guarantor and other evidence).
- KYC private storage through authenticated API download; PDF/JPG/PNG extension/MIME/signature checks and 5 MB limit. New uploads cannot mark themselves verified, and KYC document member/type/file metadata cannot be rewritten through the verification update action.
- Verified identity aliases: `identity`, `aadhaar`, `pan`, `voter_id`, `driving_license`, `passport`. Verified address proof remains a separate requirement. Uploading a file is not verification; it must be explicitly reviewed.
- Loan product configuration and daily/weekly/fortnightly/monthly plans; flat/reducing interest schedule code; applications, approval/rejection, disbursement, instalments, collections, payment idempotency, overdue/penalty command and reports.
- Capital, expenses, journal pairs, trial balance/report endpoints, bank reconciliation foundation, audit events and integration credential settings.
- Staff Users UI under **Settings → Role & Permissions**. Admin can create/disable staff logins, assign role, branch and feature grants, and update permissions. Passwords use Django's password hashing. A staff password must be at least 12 characters.
- Feature permission enforcement on the protected viewsets and branch filtering for common branch-owned lists/actions. Models without branch ownership are hidden from branch-only staff by the current queryset policy.
- Foreclosure quote/payment action: `GET /api/loans/{id}/foreclose/` returns remaining scheduled principal + remaining scheduled interest + unpaid penalty; `POST` records a payment, marks remaining installments paid, posts balanced journal pairs and closes the loan. Request requires exact quoted amount and an idempotency key.
- JWT refresh token rotation handling and PC setup scripts that check root/backend database settings match.

## Important behavior and policy notes
- The foreclosure formula intentionally follows the requested formula and does **not** discount future scheduled interest. Confirm the approved contract/compliance policy before any real lending use.
- A loan is not approved just because documents are uploaded. The same member must have at least one verified identity document of an accepted type and a separately verified address proof.
- Payment gateway/SMS/WhatsApp/email settings screen stores provider credentials; provider-specific live payment initiation, signed gateway webhooks, real message sending/delivery logs/retries/consent and production sandbox tests are not complete merely because those settings are visible.
- Full branch isolation is not yet guaranteed for every dashboard/report/export/custom endpoint. Global accounting models still lack consistent branch ownership. Do not treat branch scoping as production certified.
- Full reversal/refund workflows, accounting-period locking, comprehensive reconciliation across every transaction type, media malware scanning/content decoding, production secrets management, and third-party security review remain outstanding.

## Checks performed in this packaging environment
- Python `compileall` syntax compilation: pass.
- Frontend JSX parser: pass (zero parse diagnostics).
- `frontend/package.json` JSON and `docker-compose.yml` YAML parsing: pass.
- Release ZIP integrity: checked after packaging.
- Django test execution: not run here because Django and a PostgreSQL test environment are unavailable in the packaging environment.
- Frontend Docker/Vite production build and browser integration: not run in this environment; must be checked on the PC.

## PC testing order
1. Back up/keep the current folder and database volume. Never use `docker compose down -v` as a routine fix.
2. Preserve existing `.env` and `backend/.env` files when updating an existing demo. They must have matching `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` values and must match the database initialized in the existing volume.
3. Run `docker compose up --build -d`, then `docker compose ps`, then `docker compose logs --tail=80 backend`.
4. Login using the superuser username/password created by `createsuperuser`. A blank username at that prompt means `root`; password entry is invisible by design.
5. Verify a KYC record shows a verified identity row plus verified address row for the correct member; then approve a test application.
6. Under Settings → Role & Permissions, create a test staff account with limited permissions. Test both allowed and denied API actions.
7. Test disbursement, schedule, payment receipt, accounting entries, and foreclosure on test records; compare journal debit/credit and loan balances after each action.
8. From the project root, run `.\scripts\test-pc.ps1` in PowerShell.

This source is a consolidated test build, not a warranty that every feature is production-ready. Do not use live funds or real customer KYC until all tests and policy/security reviews pass.
