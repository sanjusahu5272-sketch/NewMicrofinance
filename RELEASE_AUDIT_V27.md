# Release audit — V27 consolidated PC-test source

## Current source inventory
- Django + DRF + SimpleJWT + PostgreSQL API and Docker Compose/Nginx/React/Vite frontend.
- Personal loan products, applications, KYC gate, schedule/disbursement/collection/receipts, penalty command, foreclosure, accounting foundation, reports/export, audit log.
- KYC uploads include the previously requested document types. Fresh uploads are always unverified and the upload endpoint requires the `upload_kyc` grant for managed staff; metadata cannot be altered through verification PATCH.
- Staff account management UI under Settings → Role & Permissions, protected for Django superusers, with role, branch, active state, password and explicit permission grants.
- Current PC configuration helper and Hinglish guide preserve existing env files/database volume.

## Validation results in this build environment
- `python -m compileall -q backend`: PASS.
- Frontend JSX parse diagnostics: 0.
- `frontend/package.json` JSON parse: PASS.
- `docker-compose.yml` YAML parse: PASS.
- Django/PostgreSQL tests: NOT RUN (Django runtime and database test service not available here).
- Docker image build / Vite production build / browser E2E: NOT RUN here.
- Release ZIP integrity: checked after ZIP creation.

## Important limits not to conceal
- Branch isolation is incomplete for some custom endpoints and accounting rows that do not carry branch identifiers. Branch-level organization-wide ledger statements are blocked rather than reported as if safe.
- Live Razorpay/Cashfree charges, signed webhook processing, refunds/reversals, settlement reconciliation, and real SMS/WhatsApp/email sends and delivery retries are not verified provider integrations. Integration setting storage is not the same thing as live integration.
- Foreclosure currently charges remaining scheduled principal + scheduled interest + unpaid penalties without discounting future interest. This rule requires management/legal/accounting approval before any real loans use it.
- Full financial close controls, opening balances, full chart-of-account mapping, complete reversal paths, malware scanning for uploaded files, secret rotation procedures and third-party security review remain incomplete.
- This release is a consolidated test source, not production certification. Use dummy data only until all checks and policy/security reviews pass.
