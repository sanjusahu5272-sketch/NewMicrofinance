# NMFA V25 — Staff accounts and permissions

## Added in this source update
- `StaffProfile` model with roles: Administrator, Branch Manager, Loan Officer, Accountant, Field Officer/Collector, Auditor.
- Optional branch assignment and explicit boolean feature grants.
- Migration `0009_staff_profile.py`.
- Admin-only API at `/api/staff-users/` to list/create/update staff accounts, set passwords, role, branch, active status and permissions.
- Staff user changes are audit-logged.
- `StaffFeaturePermission` checks feature grants on the main customer, KYC, loan, payment and accounting viewsets for users with a StaffProfile.
- Test cases for admin creation, non-admin denial, password hashing and feature permission denial.

## Permission keys
`view_customers`, `manage_customers`, `view_kyc`, `verify_kyc`, `view_loans`, `create_loan_applications`, `approve_loans`, `disburse_loans`, `collect_payments`, `view_accounting`, `manage_accounting`, `view_reports`, `manage_staff`.

## API example
Use a superuser/staff-admin JWT token to POST `/api/staff-users/`:

```json
{
  "username": "accountant1",
  "email": "accountant@example.test",
  "password": "Use-A-Unique-Password-12!",
  "role": "accountant",
  "branch": 1,
  "permissions": {
    "view_accounting": true,
    "manage_accounting": false,
    "view_reports": true
  },
  "active": true
}
```

Use `PATCH /api/staff-users/{id}/` to change role/branch/permissions or set `active:false` to disable access. Staff management endpoint is admin-only.

## Verification limits
Python source compilation passed. Django tests/migrations and frontend build were not run in this environment because Django runtime dependencies are not available here. Branch is stored on the staff profile, but complete branch-scoped filtering across every queryset and all report endpoints remains a separate hardening item. This is not a production-readiness certification. Test with demo data before real use.
