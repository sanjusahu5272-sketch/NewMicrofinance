# V76 — Permission List workflow (Hinglish)

Base: V75. Existing V67 theme/CSS assets preserved; additive React-only UI changes.

## Included
- Permission List now has a Select Role / Staff Account dropdown.
- Selecting a staff account loads its existing permissions into the permission matrix.
- Permission List hides username, email, password and account status editing fields to avoid mixing account maintenance with permission assignment.
- Save Permission uses the existing staff-users PATCH endpoint, preserving the project's current server-side permission storage and audit hook.
- Role List continues to use the existing staff account/role management path. This does not introduce a new database-backed custom-role catalogue; current roles still come from StaffProfile role choices.

## Verification limits
- ZIP integrity and source assertions checked.
- Frontend build, Django checks/tests and browser screenshot comparison are not run here. Please run on PC before live use.
