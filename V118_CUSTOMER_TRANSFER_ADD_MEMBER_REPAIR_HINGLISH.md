# NMFA V118 — Customer Transfer & Add Member Repair

## Included
- Added `New Member` as a direct navigation item so the registration form is reachable.
- Field Officer selection now falls back to employees assigned to the selected branch when role labels do not match the expected naming pattern; this prevents a valid branch from showing an empty agent list.
- Added `Overdue Customer Transfer`: identifies members with installments whose due date is before today and status is not paid; allows selecting one or multiple customers and reassigning them to a target branch/agent.
- Added `Customer Transfer`: same audited transfer flow for selected customers generally.
- Added backend `POST /api/members/transfer/` action. It validates selected customers are visible to the user, target branch is active, target agent belongs to that branch, and only Main Admin can make cross-branch transfers. The operation is atomic and writes an AuditLog entry per member.
- Existing loans and installments remain linked to their member; branch views follow the member's new branch. No model schema changes or migrations are required.
- Added transfer workflow tests in `backend/finance/tests.py`.

## Important
- Existing database volume/data must be preserved. Do not reset the database or delete Docker volumes.
- Python syntax compilation passed for the changed backend files.
- Full Django tests and frontend production build could not be run in this environment (Django isn't installed here; npm dependency installation timed out). Test in a separate copy/staging environment before deploying to real-money production.
