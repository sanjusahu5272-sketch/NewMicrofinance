# V77 — Role List search, status filter and pagination

Base: V76. Preserves existing V67 styles and UI theme; adds controls using existing shared classes.

- Role/staff list now supports search across username, email, first/last name and role label.
- Active/Inactive status filter added.
- Client-side pagination shows 10 records per page with previous/next controls.
- Permission List selector still uses all staff accounts, so selecting an account is not limited by the visible table page.
- Important: this improves the requested Role List table but does not create custom roles in the database. Role options remain the existing fixed StaffProfile choices.
- ZIP integrity/source assertions checked; frontend build, Django tests and browser screenshot comparison not run.
