# V140 — Loan Top-up, Deposit Accounts/Collection, Holiday Calendar

## V66 UI / V119 menu compatibility
- V66 Dashboard component is retained from the V139 package; the new changes add workflow pages and navigation entries only.
- Added submenu entries: `Loan Top-up`, `Deposit Accounts`, `Deposit Collection`.
- `Holiday` now opens the Holiday Calendar page instead of the generic “Module ready” placeholder.

## Implemented backend workflows

### Loan Top-up
- A request is allowed only against an active member's active, disbursed loan and active loan product.
- One pending top-up request per original loan is enforced in the database.
- The total of approved/disbursed top-ups is capped at the original loan principal in this release.
- Maker-checker: requester cannot approve; requester and approver cannot disburse.
- KYC is rechecked at approval and disbursement when KYC enforcement is enabled.
- Approval does not change the original loan balance. Disbursement creates a separate linked loan record, generates its schedule using the existing loan-product calculation, checks available Cash/Bank ledger balance, records the disbursement and posts a balanced journal pair. The original loan is not rewritten.

### Deposit Accounts and Deposit Collection
- One deposit account per member is supported in this version. Account numbers are generated uniquely.
- Account balance is read-only to the API; it changes only when a pending collection is approved.
- Maker-checker: the collection creator cannot approve or reject their own collection.
- Approval is atomic and one-time: the member deposit balance is increased and a balanced Cash/Bank/UPI-clearing debit against `Member Deposits Liability` is posted with a unique journal reference.
- Repeated approval is rejected; it cannot credit the balance twice.
- Deposit withdrawals, premature fixed-deposit closure, deposit interest accrual and maturity payout are not included. A positive-balance account cannot be closed via this API.

### Holiday Calendar
- Organization-wide or branch-specific holiday records can be created and listed.
- Holiday records are informational only. Existing EMI due dates are not automatically moved by this feature.

### Approval queue
- `Approval - Collection` now uses the existing payment approval API and filters to pending collections.
- Existing Loan, Salary, Product Loan, Settlement and Fund Transfer approval APIs remain in place; their maker-checker and permission checks are preserved.

## Migration
- New migration: `finance.0026_topup_deposits_holidays`.
- It creates new tables and a conditional unique constraint for one pending top-up per loan. It does not drop or rewrite existing customer, loan, installment, payment or journal tables.
- Apply it only after a verified PostgreSQL backup and after confirming Docker Compose is mounting the intended existing production data volume. Do not reset or remove PostgreSQL volumes.

## Verification status
- Python source compilation: passed (`py_compile`).
- JSX syntax parse: passed using the installed TypeScript parser.
- Added Django tests: `finance/tests_v140_workflows.py` covering holiday creation, deposit maker-checker/one-time ledger posting, and top-up approval/disbursement/idempotency.
- Django tests, `manage.py check`, migration execution against PostgreSQL, and full Vite production build were **not run in this packaging environment** because Django and frontend dependencies are not installed here. Run them in the project Docker environment only after confirming the correct database volume and backup.

## New API endpoints
- `GET/POST /api/holidays/`
- `GET/POST /api/loan-topups/`
- `POST /api/loan-topups/{id}/approve/`
- `POST /api/loan-topups/{id}/reject/`
- `POST /api/loan-topups/{id}/disburse/`
- `GET/POST /api/deposit-accounts/`
- `GET/POST /api/deposit-collections/`
- `POST /api/deposit-collections/{id}/approve/`
- `POST /api/deposit-collections/{id}/reject/`
