# NMFA Personal Loan Software — Source & Verification Status

## Business scope
- Intended lending workflow: individual personal loans only.
- Group-loan product/workflow is not part of the UI. Member grouping/area/centre records remain available as administrative/field-operations structures and are not group lending.
- Existing loan products, applications, approvals, disbursement, installments, collections, capital, expenses, journal, trial balance/reporting, bank reconciliation and integration-settings code is retained.
- Dashboard style uses the provided screenshot as a visual reference (red/white, compact navigation, quick actions, cards, finance panels). Exact pixel parity is not claimed.

## Changes in this source bundle
- Kept the screenshot-inspired UI skin and responsive breakpoints.
- Replaced emoji-heavy sidebar icons with simple monochrome glyphs for a closer admin-dashboard appearance.
- Removed prefilled demo username/password from the login form so credentials are not suggested as a production default.
- Kept existing API/backend files instead of replacing the project with a mockup.
- Excluded Python bytecode/cache and local environment files from the distributable ZIP.

## Verification performed
- Python syntax compilation is run at packaging time.
- ZIP integrity is checked at packaging time.
- Frontend production build could not be run in this environment because npm dependencies (Vite) are not installed; install frontend dependencies with `npm install` and run `npm run build` before deployment.
- Django runtime tests have not been confirmed as passing in this environment. Run `python manage.py test finance` after installing `backend/requirements.txt` and configuring a test database.

## Not represented as complete
- SMS/WhatsApp credentials alone do not send messages. Provider-specific send logic, webhook verification, consent/template setup and end-to-end delivery testing must be configured and verified before claiming automatic notifications work.
- Payment gateway credentials alone do not constitute a complete live payment integration; verified provider webhooks and reconciliation are required.
- Do not use with real customer funds until runtime tests, calculation tests, access-control checks, deployment hardening, backups and recovery are completed.

## V50 patch (2026-10-11)
- Approval now rejects non-pending applications (while preserving idempotent response for an already-linked loan), inactive loan products, and invalid approved amounts before state mutation.
- Application and member row locks are used around the duplicate-pending check to reduce concurrent approval races on PostgreSQL.
- Added regression tests for invalid approved amount rollback behavior, inactive product rejection, and rejected-application reapproval.
- Python syntax compilation passed. Django tests could not run because Django is not installed in the authoring environment and package installation failed due to unavailable network/DNS.
- This is not a full completion claim; see `MASTER_COMPLETION_ROADMAP.md` for remaining financial, reconciliation, authorization, integrations, and deployment acceptance gates.


## V66 UI feature integration pass
- Added direct sidebar access to KYC Documents, Promise To Pay and Settlement.
- Replaced payment/accounting register placeholder routing with screens backed by existing API endpoints for Payment History, Receipt Register, Day Book, Cashbook, Voucher Entries, Contra and Journal.
- This pass does not certify every requested module end-to-end; Backup/Restore remains incomplete and multi-line atomic vouchers are not implemented.
