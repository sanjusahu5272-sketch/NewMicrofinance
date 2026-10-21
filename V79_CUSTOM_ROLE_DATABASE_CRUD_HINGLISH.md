# V79 — Custom Role database CRUD

## Added
- `CustomRole` database model with unique name/code, description, active flag, JSON feature grants and creator.
- Migration `0024_custom_roles.py`; `StaffProfile.custom_role` is an optional FK to a saved custom role.
- Authenticated API routes under `/api/custom-roles/`; CRUD is superuser-only.
- Validates role name/code uniqueness and permission keys/types.
- AuditLog entries on role create/update/delete; deletion is blocked for system roles and roles assigned to staff.
- Staff account form can assign a saved custom role; role permissions participate in backend feature authorization.
- Role List UI supports create, edit, active/inactive, search, feature permission checkboxes and delete.
- Added Django tests for create/update/delete, invalid permission keys and non-superuser access.

## Not completed in this increment
- Django tests/migrations were not executed in this environment, so migration/runtime behavior remains unverified.
- Role assignment UI uses the existing fixed base role plus an optional custom role. Existing approval and accounting workflows still require separate end-to-end reconciliation and tests.
- This is not a production-ready sign-off.
