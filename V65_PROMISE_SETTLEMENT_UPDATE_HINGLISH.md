# V65 update — V63 UI + NMFA features

## UI preservation
- V63 `frontend/src/main.jsx`, `style.css`, and `reference.css` visual system is preserved.
- No global theme/font/color/sidebar/topbar redesign was introduced for this update.
- Group Loan was not added to navigation.

## Implemented in this update
- Promise To Pay: record member + active loan, promise date, amount, follow-up note; list records; mark promise kept/broken/cancelled; changes are audit logged.
- Settlement proposals: server calculates a snapshot from installment principal/interest/penalty due minus paid amounts; proposed amount must be positive and cannot exceed the snapshot; discount is computed with Decimal-backed model fields; proposal needs staff-admin approval/rejection and writes audit log.
- Added `PromiseToPay` and `SettlementCase` models and migration `0020_promise_to_pay_settlement.py`.
- Added API endpoints `/api/promises-to-pay/` and `/api/settlements/` plus approval/outcome actions.
- Added frontend screens using existing panel/form/table/button styles.
- Added regression tests for promise outcomes, settlement approval, and offers exceeding outstanding.

## Important safety boundary
- Settlement approval records an approved offer only. It does NOT automatically collect money, write ledger entries, or close the loan. Actual receipt must be recorded through the existing payment flow and then reconciled; automatic closure requires a separately reviewed accounting workflow.
- Outstanding snapshot uses the existing installment schedule; if a loan has no installments, settlement creation is refused. The figure should be reconciled with current live outstanding before approval.
- Existing database is not included and must not be reset.

## Verification status
- Python syntax compilation passed for changed backend modules.
- Django `manage.py check` and tests could not run in this authoring environment because Django is not installed.
- Frontend build could not be run here because `npm install` timed out. Run the build and backend tests in the user's environment before using real transactions.
- Remaining video/screenshot page-by-page visual matching and full end-to-end workflow testing are not yet verified.
