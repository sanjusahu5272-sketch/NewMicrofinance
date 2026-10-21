# V117 — Multi-Branch Financial Summary

## Added
- Main Admin dashboard now receives and displays a summary for every active branch.
- Per-branch figures include active customers, active/disbursed loans, total disbursed principal, successful non-reversed collections (total and today), installment-based outstanding, overdue count/amount, and recorded expenses.
- The existing dashboard branch selector filters the branch summary table; blank selection shows the organization-wide branch table.
- Branch-bound accounts continue to use the existing backend branch scoping and do not receive the organization-wide `branch_summaries` payload.
- No model changes or migrations were made, and no database records are altered by this feature.

## Important financial limitation
`JournalEntry` does not currently contain a branch foreign key. Therefore V117 deliberately does **not** claim branch-specific cash/bank balances or branch profit/loss. Those values must not be inferred from untagged organization-wide journal entries. Implementing reconciled per-branch cash/bank reporting requires a reviewed branch-tagging and migration plan for ledger rows, including legacy transaction attribution.

## Verification status
- Python syntax compilation and archive integrity checks are run when packaging.
- Full Django tests, frontend production build, and real database smoke tests must be run in the target Docker environment before production use.
