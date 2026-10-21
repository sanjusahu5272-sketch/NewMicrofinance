# V143 targeted audit fixes

Base: V142 (`NMFA_V142_V66_DASHBOARD_V119_FINANCIAL_AUDIT_FIX.zip`)

## Fixes applied

1. **Branch data isolation for financial actions**
   - Loan foreclosure now resolves the loan through the branch-scoped queryset before locking it.
   - Payment reversal now resolves the payment through the branch-scoped queryset before locking it.

2. **Custom-role permission enforcement**
   - Active custom-role permissions are merged with per-user permissions for API authorization checks.
   - Explicit per-user values override role defaults; inactive custom roles grant no permissions.

3. **Installment integrity**
   - Generic create/update/delete endpoints for installments are disabled. Schedule and paid amounts must be changed through authorized loan/payment workflows.
   - Schedule builder refuses to replace an existing installment schedule instead of deleting financial records.

4. **Posted source-record integrity**
   - Capital entries and expenses can no longer be edited or deleted through generic CRUD after posting, because those edits previously could leave the journal unchanged.

5. **Loan application approval amount**
   - Applicants cannot submit or edit `approved_amount` through the application serializer.
   - The approval action accepts an explicit approver-supplied amount, validates finite INR precision (maximum two decimals), and checks it is positive and no greater than requested before changing application state.

6. **Foreclosure payment accounting and idempotency**
   - Bank foreclosure requires a selected bank account and stores it on the receipt; journal debit goes to that named bank ledger account.
   - Reusing an idempotency key with a different foreclosure amount/method/account/date/reference returns conflict instead of false success.
   - Foreclosure amount rejects non-finite values and values with more than two decimal places.

## Regression tests added

`backend/finance/tests_v143_regressions.py` covers custom-role grants, inactive custom roles, cross-branch foreclosure/reversal denial, read-only installments and posted source records, approver-only loan amount, and bank foreclosure idempotency/account mapping.

## Verification limitations

- Python syntax compilation passed for the modified backend modules and regression test file.
- Full Django tests were **not run**: Django/DRF dependencies are not installed in this environment and package installation could not reach the package index.
- No production database was connected or modified. No migration was added because these changes do not alter the database schema.
- A real PostgreSQL test run and browser/API regression run remain required before production use.
