# V70 Permission List Update — Hinglish

## Is ZIP mein kiya gaya change
- Existing `frontend/src/main.jsx` ke Staff Permission List ko table layout mein badla:
  `Sr No | Permission | For | Description | Action`.
- Permission catalogue ko expand kiya: Dashboard, Members, KYC, Loans, Disbursement, Collection, Penalty, PTP, Settlement, Master Menu, Branches & Staff, Reporting, Accounting, Vouchers, Fund Transfer, HRM/Payroll, Product Master, Role/Permission Management, Settings, SMS Testing, Audit Logs aur Approvals.
- Permission keys ko existing `StaffProfile.permissions` JSON field mein save karne ki serializer allow-list expand ki.
- Existing dashboard/sidebar/theme CSS files ko modify nahi kiya.

## Important limitations / verification
- Ye existing per-staff permission JSON architecture use karta hai. Ye abhi database-backed custom Role model ya shared role-to-permission matrix nahi hai; users with same role can still have different permissions.
- Existing backend authorization checks enforce only the feature keys wired into their viewsets/endpoints. Newly added granular keys are accepted and persisted, but each new key is NOT automatically enforced on every endpoint. Do not treat this as complete production-grade authorization until endpoint-by-endpoint enforcement and tests are completed.
- Django test suite and Vite production build were not run in this environment. Review and test in staging before using with real money.
- Existing UI layout outside the inner Permission List page was preserved.
