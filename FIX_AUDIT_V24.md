# NMFA V24 — fix audit (honest status)

Source baseline: V23 Full Source. Scope kept incremental; no project rewrite.

## Implemented in source
- Late penalty management command `assess_late_penalties`: fixed amount per overdue installment, after `grace_days`, once only (`penalty_due=0` idempotency marker), paired journal entries. This interprets `LoanProduct.late_penalty` as a fixed per-installment fee; it is not per-day.
- Loan approval checks active member, verified identity/address KYC, duplicate pending application for same member/product, and optional `max_income_multiple` setting. Disbursement checks verified identity/address KYC. Added migration `0008_security_and_underwriting.py`.
- Added loan/application maker-checker audit fields and basic creator/approver-vs-disburser restrictions. This is not a complete four-role RBAC/branch-scope implementation.
- Added anonymous DRF throttling and SimpleJWT refresh blacklist app/rotation configuration.
- Production settings fail fast for missing/placeholder secret and required database/host environment variables; removed unsafe DB password fallback. Docker no longer runs `seed_demo` on every start; demo seeding is disabled by default and refuses DEBUG=0.
- CSV export neutralizes untrusted strings beginning with spreadsheet formula characters.
- KYC upload validates file signatures (PDF/JPEG/PNG), in addition to extension/MIME/size.
- Pinned frontend package versions and added visible Schedule label.
- Added tests for penalty idempotency/grace period, KYC approval gate, CSV formula injection and fake PDF signature.

## Not fully fixed / cannot claim complete
- Full role model (Admin, Manager, Accountant, Field Officer) with branch-scoped querysets/permissions remains incomplete; current permission model still relies substantially on Django staff/admin. Do not expose to production staff accounts until completed.
- Foreclosure payment workflow and correct foreclosure-specific accounting entries are not implemented in this patch.
- Reconciliation tests do not yet cover every listed transaction class (penalty, capital in/out, expenses) end-to-end.
- npm lockfile could not be generated: npm registry unavailable/time out and package cache lacks metadata. Versions are pinned, but reproducible lockfile requirement remains open.
- KYC signatures are checked, but image decoding/PDF parser validation, malware scanning, and private object storage hardening remain deployment risks.
- Tests and frontend build could not be run in this environment: Django is not installed (`ModuleNotFoundError: No module named 'django'`); npm package-lock install timed out and offline install failed with ENOTCACHED.

## Commands to run in a provisioned environment
```bash
cd backend
python -m pip install -r requirements.txt
DEBUG=1 POSTGRES_DB=nmfa POSTGRES_USER=nmfa POSTGRES_PASSWORD=localtest POSTGRES_HOST=127.0.0.1 python manage.py migrate
DEBUG=1 POSTGRES_DB=nmfa POSTGRES_USER=nmfa POSTGRES_PASSWORD=localtest POSTGRES_HOST=127.0.0.1 python manage.py test finance
DEBUG=1 POSTGRES_DB=nmfa POSTGRES_USER=nmfa POSTGRES_PASSWORD=localtest POSTGRES_HOST=127.0.0.1 python manage.py assess_late_penalties
cd ../frontend
npm install
npm run build
```

**Do not use with real money until the remaining items above are fixed and all tests pass against PostgreSQL.**
