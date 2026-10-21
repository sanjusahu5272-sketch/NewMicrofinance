# V68 Master Menu Functional Update — Hinglish

## Base aur UI
- Base source: `NMFA_V67_FULL_FEATURE_INTEGRATION.zip`.
- Original `frontend/src/style.css` ko modify/replace nahi kiya; new functional master styles `frontend/src/reference.css` mein additive rakhe gaye.
- Group Loan workflow add nahi kiya. V67 ka current sidebar/theme assets preserve kiye.

## Master menu ke 18 pages
1. Loan Plan
2. Penalty Scheme
3. Branches
4. Staff Branch
5. Branch Center
6. Loan Purpose
7. State
8. Bank
9. Leave
10. Designation
11. Relationship Master
12. Document Type
13. Collection Mode
14. Miscellaneous
15. Software Timing
16. Session
17. Setting
18. SMS Testing

## Is increment mein backend/frontend changes
- Master sidebar ke tamam 18 entries aur page mapping.
- Loan Plan CRUD/status, financial terms validation, linked-plan contractual-term guard, Decimal server-side preview, penalty scheme assignment.
- Penalty Scheme CRUD/status, one-time/fixed-or-percentage/daily-recurring policy, minimum due/grace validation, non-posting preview, posted assessment history.
- Daily management command `python manage.py assess_late_penalties`: legacy per-installment penalty compatibility, configured scheme support, unique assessment keys/idempotency, installment penalty balance update and balanced penalty receivable/income journal pair.
- Branch create/update validation for required name and unique uppercase code.
- State/Bank/Leave/Document Type/Collection Mode master catalog with uniqueness and status controls. Custom collection modes must map to an allowed ledger before use; document types can carry identity/address/other classification.
- Miscellaneous contains separate Identity Proof, Relation, Purpose and Reason master cards; duplicate/ambiguous identity-proof slugs are guarded. KYC documents accept active configured document types; existing verified history is not silently invalidated by deactivation.
- Staff Branch assignment and Branch Center master pages.
- Software Timing time-window, IANA timezone, working-day and auto-logout bounds; single-profile guard and frontend inactivity logout hook.
- Session date-range validation prevents overlapping active periods.
- Setting screen for company/registered office, amount format, KYC/age rules, loan/disbursement switches, SMS reminder/events and email/close-date settings; server validates types/ranges and merges partial settings without deleting unrelated values.
- SMS Testing only submits to configured HTTPS gateway with enabled API key and sender ID; a successful gateway response is not represented as confirmed handset delivery.
- Admin/audit/permission protections applied using the existing security foundation. KYC age/mandatory flags apply server-side.
- Migrations added: `0021_master_menu_configuration.py`, `0022_penalty_scheme_link_and_assessments.py`.

## Verification performed
- Python `compileall` across backend: passed.
- React JSX syntax transpilation diagnostics: zero.
- ZIP integrity check for original V67 base: passed; final ZIP integrity is checked at packaging.
- `python manage.py check` / Django test suite could not run in this environment because Django/DRF project dependencies are not installed.
- Vite production build could not run because `frontend/node_modules` is absent. No claim is made that runtime or end-to-end tests passed.

## Before deployment
1. Install the pinned backend/frontend dependencies in the deployment environment.
2. Back up the database.
3. Run `python manage.py migrate` (includes migrations 0021 and 0022).
4. Run `python manage.py check` and the Django test suite, then `npm run build` and a smoke test of every Master page.
5. Schedule `python manage.py assess_late_penalties` daily only after the configured penalty rules, sample calculations, accounting mappings and regulatory/legal policy have been reviewed. The command is idempotent by assessment key, but actual penalty policy must be approved for the business.

This archive is the Master-menu implementation phase, not a claim that the later requested Reporting, Approval, Loan Case, Role/Permission and complete production workflows have all been integrated or runtime-tested.
