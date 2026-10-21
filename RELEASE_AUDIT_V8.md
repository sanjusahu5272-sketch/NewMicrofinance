# NMFA V8 source audit — 2026-10-09

## Summary
This is a development foundation, not a complete banking/microfinance product and not production-certified. Source-level checks are not a substitute for runtime integration tests, security review, accounting validation, and a provider sandbox/live certification.

## Checks actually performed in this environment
- ZIP extraction: PASS.
- Python syntax compilation: PASS for included `.py` sources.
- Django runtime checks/tests: NOT RUN — Django is not installed in this execution environment and dependency installation is unavailable here.
- PostgreSQL migrations/integration: NOT RUN.
- React/Vite production build: NOT RUN — frontend dependencies are not installed; `vite` is unavailable locally.
- Docker compose runtime: NOT RUN.

## Present in source (not all runtime-verified)
- Django REST Framework/JWT auth scaffolding.
- Models for branches, areas, centres, groups, employees, members, loan products, loan applications, loans, installments, disbursements, payments, capital entries, expenses, journal entries, audit logs, integration settings and KYC documents.
- API routes/viewsets for those models; dashboard/report endpoints; CSV export; customer ledger and receipt detail endpoints.
- Loan approval/disbursement schedule generation and collection allocation logic.
- KYC file upload/download endpoints and serializer-level extension/content-type/size checks.
- Admin integration-credential storage encrypted using a key derived from Django SECRET_KEY.
- React dashboard/navigation and some operational forms.
- Some regression tests in `backend/finance/tests.py`.

## Important incomplete items / blockers before a real customer demo or production
1. Frontend navigation includes placeholder modules (for example Attendance, Backup/Restore and some accounting/payment flows). Not every visible menu item is a completed workflow.
2. Frontend login form contains a prefilled demo username/password (`admin` / `Admin@12345`). Remove the defaults and create a fresh strong admin password before any demo deployment; do not reuse demo credentials.
3. Dashboard cards calculate some figures from simple combinations of totals, not a reconciled general ledger. Do not use those card figures as audited balances.
4. The current journal model is single-line debit/credit rows and does not enforce a balanced multi-line journal transaction atomically. Full double-entry accounting and reconciliation are incomplete.
5. Server-side branch scoping and granular role-based permissions are not implemented comprehensively across every endpoint. `IsAuthenticated` alone is not enough for production.
6. KYC upload validation checks reported content type and extension but does not perform malware scanning or robust file-signature inspection. Private storage and per-branch/document authorization need review.
7. Loan interest formulas, daily/weekly/fortnightly/monthly date conventions, reducing-balance calculations, penalties, rescheduling and foreclosure require finance-domain test cases signed off by an accountant.
8. Payments are not a complete live Razorpay/Cashfree/UPI AutoPay/eNACH integration. Provider-specific initiation, signed webhook verification, idempotency, reconciliation, refunds and retry flows remain.
9. SMS/WhatsApp/email delivery, field attendance/visits/cash settlement, full PDF reporting, backup restore drill, monitoring and alerting remain incomplete.
10. Production requires fresh secrets, DEBUG=0, restrictive ALLOWED_HOSTS/CORS, HTTPS termination verification, database backup/restore test, privacy/regulatory review, and independent security review.

## Run these checks on a machine with Docker/dependencies available
```powershell
# From project root
Copy-Item backend/.env.example backend/.env
# Edit backend/.env: use a new random DJANGO_SECRET_KEY, strong PostgreSQL password,
# DEBUG=0 for production, exact ALLOWED_HOSTS and CORS_ALLOWED_ORIGINS.
docker compose config
docker compose up --build -d
docker compose exec backend python manage.py check
docker compose exec backend python manage.py makemigrations --check --dry-run
docker compose exec backend python manage.py test finance
cd frontend
npm ci
npm run build
```

Do not claim a test passed unless it was executed and its exit status was zero. Use synthetic test data only until access control, accounting and KYC storage have been reviewed.
