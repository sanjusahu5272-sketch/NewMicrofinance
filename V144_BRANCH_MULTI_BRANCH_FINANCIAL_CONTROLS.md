# V144 — Branch-aware financial controls

## Implemented in this update

- Added nullable `branch` attribution to journal entries and capital entries.
- Added source and destination branch references to fund-transfer requests.
- New operational journal pairs for loan disbursements, loan top-ups, collections, foreclosures, deposit collections, capital entries, expenses, and reversals now retain branch attribution.
- Dashboard `?branch=<id>` filtering now scopes operational metrics to the selected branch for organization-wide users.
- Branch cash/bank figures use only ledger rows explicitly tagged to that branch. Existing untagged historical entries are not silently assigned to a branch.
- Fund-transfer UI now creates and lists branch-aware requests, with maker-checker approval/rejection actions.
- Cross-branch transfers and allocation from the unallocated legacy ledger require an organization administrator to approve. Branch staff can only initiate same-branch transfers.
- Transfer approval checks the source account balance in the selected source branch/unallocated ledger and posts two balanced rows: debit to destination branch and credit to source branch.
- Added Customer Transfer screen, requiring a reason and using the existing audited customer reassignment endpoint.
- Added branch/fund-transfer permissions to the staff permission editor.
- Fixed permission evaluation so an unrelated `true` permission no longer grants access to unrelated APIs; explicit per-user `false` overrides a custom-role grant.
- Disabled generic single-line journal creation; internal financial workflows must create their own balanced postings.
- Added `scripts/backup_database.bat` for a PostgreSQL logical dump. It does not restore or overwrite any database.

## Migration

Migration: `finance.0027_branch_scoped_ledger_transfers`

It adds nullable fields only. It does **not** rewrite existing journal rows or assign them to branches. That is deliberate: branch attribution cannot be safely inferred from old ledger rows.

## Before production use

1. Take a full PostgreSQL backup and verify the dump completion marker.
2. Restore the backup into a separate test database and reconcile key balances.
3. Apply migration `0027` in a staging copy first.
4. Run `python manage.py check` and the complete Django test suite inside the project's Docker environment.
5. Reconcile legacy unallocated cash/bank balances before allocating any amount to branches. Use the branch/fund transfer workflow from `Organization / unallocated` to the target branch with the same source/destination account name; only allocate amounts supported by bank statements and physical cash count.
6. Run tests for concurrent transfer approvals, duplicate references, insufficient source balance, branch access restrictions, payment reversals, and balance-sheet/trial-balance equality.

## Verification performed in the build environment

- Python source syntax compilation: PASS.
- Frontend JSX parse/transpile check: PASS.
- ZIP integrity: to be checked after packaging.
- Django system checks and tests: NOT RUN here because Django is not installed in the build environment.
- Vite production build and live browser/database test: NOT RUN because frontend dependencies are not installed here.

This package is a targeted implementation update, not production certification. Do not deploy it to the live database until the checks above pass.
