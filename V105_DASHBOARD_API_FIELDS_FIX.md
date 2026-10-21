# V105 Dashboard API fields fix

- Added recent_members (latest five branch-scoped members).
- Added completed and settled loan counts, pending EMI count/amount for today, overdue EMI count, and settlement due/paid totals.
- Existing dashboard querysets remain branch-scoped; no model schema changes or migrations were introduced.
- Verification performed: Python syntax compilation and ZIP integrity. Django tests, database integration, Docker build and browser testing were not run in this environment.
- Important: “Profit-Loss” is not represented as certified accounting profit; it still requires ledger classification/reconciliation review.
