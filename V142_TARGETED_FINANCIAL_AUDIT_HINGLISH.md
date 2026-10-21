# V142 — Targeted Financial Audit Fixes

## Scope
This update continues the V141 audit. It preserves the V66 dashboard component and V119 menu configuration. No database models were changed, so this update adds no migration.

## Fixes added
1. Loan disbursement now requires `approved` status. `pending` loans can no longer be disbursed directly.
2. Disbursement re-checks member and product active status at the point of payment.
3. Disbursement refuses to delete/replace an existing installment schedule.
4. Disbursement amount parsing rejects malformed, NaN, or infinite values with HTTP 400 rather than an unhandled exception.
5. Disbursement and EMI dates are validated as `YYYY-MM-DD`; first EMI date cannot precede disbursement date.
6. An explicitly selected EMI start date is treated as the first installment due date. If the EMI date is omitted from the API, the conventional next-period schedule remains in effect.
7. Loan state/financial fields cannot be patched directly; loan creation through the generic endpoint is disabled in favor of the application approval workflow.
8. Application status and approval identity cannot be changed through generic PATCH; approved/rejected applications cannot have their core terms silently edited.
9. Added regression tests for these guards and date/amount cases.
10. The disbursement form defaults the EMI start date to the next expected period instead of the same day as disbursement.

## Verification status
- Python source compilation: PASS (`compileall`)
- Pure Decimal schedule helper checks: PASS for flat and reducing examples (principal and interest rows sum exactly to stored totals)
- EMI date helper check: PASS for monthly end-of-month and weekly next-date examples
- ZIP integrity: PASS (verify after packaging)
- Django test suite: NOT RUN — Django is not installed in the audit environment (`ModuleNotFoundError: django`).
- Frontend production build: NOT RUN — npm dependency installation timed out and `node_modules` was unavailable.
- Live database integration / browser tests: NOT RUN.

## Important limitations
This is a targeted fix, not a claim that the entire application is production-ready. Continue auditing payment allocation/reversal, fee treatment, foreclosure policy, ledger reconciliation, access control, migrations against the target database, backup/restore, and all menu workflows before live lending.
