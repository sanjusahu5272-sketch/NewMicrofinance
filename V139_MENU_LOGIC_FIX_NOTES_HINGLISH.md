# V139 — Menu Routing and Workflow Logic Fixes

- V66 dashboard component was preserved; changes are focused on menu-to-page routing and workflow entry points.
- Every distinct tab target declared in `RF_NAV` now has an explicit route in `Page` (checked by source scan: no unrouted target tabs).
- Master menus route to their existing master screens/API endpoints where those APIs exist.
- Member List / New Member route to the real member workflow; KYC Documents opens the existing secure KYC upload/verification workflow.
- Disbursement and Disbursed Loans route to the existing disbursement register; EMI views use existing installment API filters.
- Product Loan and Fund Transfer menus use their existing backend request endpoints; approval buttons call backend `approve`/`reject` actions with a required note. Backend maker-checker and permissions remain authoritative.
- Salary approval routes to the payroll API and exposes actions only for draft records; backend maker-checker/permission checks remain authoritative.
- Reports use existing report endpoints; accounting menus use existing journal/chart-of-accounts endpoints.
- Backup / Restore is explicitly a CSV-export utility only, not a PostgreSQL backup/restore. It does not claim to restore the database.
- Modules that have no dedicated backend model/workflow in this source (Holiday calendar, Loan Top-up, Deposit Accounts/Collection, and certain approval/other-payment workflows) show a clear backend-requirement notice instead of the misleading “Module ready” placeholder. No fake financial posting logic was added.

## Checks
- TypeScript compiler JSX transpile/syntax diagnostics: 0.
- RF_NAV distinct submenu target scan: 87 non-dashboard target tabs; 0 unrouted targets.
- ZIP integrity: checked after packaging.
- Full Vite production build and browser integration test: not run because node dependencies/Docker are unavailable in this workspace.
