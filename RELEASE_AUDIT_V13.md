# NMFA V13 — Financial Controls Hardening

## Implemented in this release
- Sensitive financial write actions are staff/admin-only: loan application approve/reject, loan approve/disburse/close, payment creation, capital/expense/journal mutations and balanced journal posting.
- Audit log listing is admin-only.
- A loan product's financial terms (rate, method, frequency, tenure, fees, grace period and code/name) cannot be edited once linked loans exist. Deactivate the old plan and create a new plan version instead.
- Added regression tests for the permission boundaries and used-plan immutability.

## Verification
- Python source compilation and ZIP integrity checks are run at packaging time.
- Django runtime tests require installing the backend dependencies and configuring a test database; they are not claimed as passed if unavailable in this environment.

## Known limitations — not production-ready
- `is_staff` is a temporary coarse admin gate, not a full organization RBAC/branch-scoping system. Production needs named roles, branch data scoping, dual control and approval limits.
- Payment reversals/refunds, payment-provider webhook verification/idempotency, proper chart of accounts, bank reconciliation, household eligibility, full accounting statements and external gateway live integration remain unfinished.
- Interest/repayment schedule needs independent financial regression tests and legal/product review before real lending.
