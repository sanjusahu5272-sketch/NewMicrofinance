# V155 — Remove 50% approval block

- Removed only the rule that blocked loan approval when existing + proposed monthly household obligations exceeded 50% of monthly household income.
- Kept household assessment existence, independent verification, 90-day freshness, and positive-income checks unchanged.
- Kept the configured product max-income-multiple check unchanged.
- No model or database schema change; no migration required.
- V66 dashboard and Short Keys were not modified by this change.

Validation: Python syntax compilation and ZIP integrity should be run before staging. Django workflow tests/database tests were not run in the build environment.
