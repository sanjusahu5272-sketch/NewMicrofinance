# NMFA V39 — 16 Improvements Consolidation

Base: V38 source. This version adds a current-user permission endpoint and permission-filtered sidebar navigation/page selection. It retains the member assignment/photo form, reference masters, company profile, integration settings, loan/disbursement modal, and confirmation/result dialogs already present in the base source.

## New source change
- `GET /api/me/permissions/` returns only the logged-in user's role, branch and permission keys.
- Staff sidebar groups/items are filtered against the granted feature permission. Empty groups are hidden.
- A staff account without `view_dashboard` is sent to the first allowed feature instead of showing Dashboard.
- Dashboard API now requires `view_dashboard` for non-admin staff. Add the `View dashboard` checkbox when editing a staff account if dashboard access is wanted.
- Admin/superuser retains full menu access.

## Requirements retained from prior versions
1-5 member branch/manager/officer mapping, photo preview and register columns; 6-7 editable reference masters; 8-9 company profile/logo branding; 10 SMS/provider integration settings; 11 sidebar styling; 12 modal layout; 13 confirmation; 14 success/error dialogs; 15 disbursement and EMI start dates; 16 cash/bank choice/reference.

## Verification status
- Python syntax compilation: check separately in user's Docker environment.
- Frontend production build and Django tests were not executed in this environment.
- This is not a production certification. Verify every permission/API path locally before using real customer or lending data.
