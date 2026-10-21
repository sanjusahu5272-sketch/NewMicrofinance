# V109 — Branch Login Feature

- Added **Master → Branch Login** for administrators.
- Admin can create a separate login tied to one active branch, with username, name, email and an initial password (minimum 12 characters plus Django password validation).
- Branch login is created as a non-superuser branch manager with a limited set of operational permissions; it does not receive organization-wide accounting, approval or staff-management permissions.
- Added a register listing usernames, assigned branch, role and active state. Passwords are never returned by the API.
- Added authenticated `GET/POST /api/branch-logins/` endpoint, administrator guard, transaction and audit log.
- No database schema change; no migration required.

## Verification status
- Python syntax compilation passed for modified backend modules.
- Added an API test for branch-bound login creation and password hashing.
- Django test execution could not be run in this environment because Django is not installed. Frontend browser flow and Docker build have not been verified. Do not treat this change as production-certified until tests pass in the project environment.
