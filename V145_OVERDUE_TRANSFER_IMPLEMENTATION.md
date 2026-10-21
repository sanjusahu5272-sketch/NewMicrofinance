# V145 — Overdue Transfer Workflow

## What this adds
- Adds an `Overdue Transfer` page under EMI Records, preserving the V66 dashboard and the existing V119 menu structure.
- Adds API endpoints through `/api/overdue-transfers/` and `/api/overdue-transfers/queue/`.
- Supports recovery responsibility transfers between field officers within the same branch and between branches.
- Requires a reason, unique idempotency key, an active destination branch and an active employee assigned to that branch.
- Captures overdue principal, interest and penalty remaining on overdue installments as a request-time snapshot; recalculates at approval and refuses approval if the overdue is cleared.
- Enforces one pending request per loan, row locking, maker-checker, required approval/rejection note, branch-scoped visibility and audit log entries.
- Cross-branch initiation and decision require organization-admin access. Branch staff may request only cases currently assigned to their branch and the branch-scoped branch list limits destination options.

## Financial/accounting behavior
This workflow transfers **collection responsibility only**. It does not move the loan or member's accounting ownership, change member branch, change the EMI schedule, or create journal entries. This is intentional: moving cash or rebooking a loan between branch ledgers is a separate accounting workflow and must not be silently implied by assigning a recovery case to another officer. The tests assert that journal rows remain unchanged.

## Migration
`finance/migrations/0028_overdue_transfer_workflow.py` adds the request history and current recovery-assignment tables. It does not rewrite existing loan, member, installment, payment, or journal rows. Existing cases without a recovery assignment continue to use the member's current branch and field officer as the effective assignment until a transfer is approved.

## Permissions
New staff permission keys:
- `view_overdue_transfers`
- `manage_overdue_transfers`
- `approve_overdue_transfers`

Admin must explicitly grant these permissions to staff roles/users as needed. The menu is not an authorization boundary; the API enforces permissions and branch scope.

## Verification status
- Python syntax compilation: PASS.
- Frontend JSX syntax parse: PASS using TypeScript's parser/transpiler.
- Django regression tests added in `finance/tests_v145_overdue_transfer.py` but not executed in this build environment because Django dependencies were unavailable.
- Full Docker build, migration execution, PostgreSQL concurrency tests, and browser interaction tests remain unverified. Do not deploy against the live database until these pass in a staging copy and a verified backup exists.
