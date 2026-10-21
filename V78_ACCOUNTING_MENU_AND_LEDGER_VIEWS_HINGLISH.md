# V78 — Accounting menu and basic ledger views

Base: V77. Keeps the existing V67 UI stylesheet and overall shell.

## Included
- Adds the remaining requested Accounts menu entries: Trial Balance, FY Trial Balance, FY Voucher Statement, FY Opening Balance, Fund Transfer, Branch Ledger, Ledger, ACGroup, Profit-Loss and Overview.
- Trial Balance / FY Trial Balance screens aggregate the journal lines currently loaded by the app into debit, credit, net debit and net credit totals per account.
- FY Voucher Statement and several other new entries show the existing journal register.
- Fund Transfer directs staff to the existing maker-checker approval workflow.
- FY Opening Balance explicitly remains review-only; no opening-balance posting is invented.

## Important limitations
- These are initial UI/data views, not a complete accounting module. Fiscal-year date filtering, branch-scoped ledger aggregation, editable opening balances, ACGroup hierarchy and full profit/loss calculation remain unfinished.
- ZIP integrity/source checks only; frontend build, Django tests and screenshot comparison were not run.
