# V93 HRM Submenu Workflows

- Employee, Attendance and Salary/Payroll retain their existing screens.
- Employee Transfer now updates the selected employee's current branch through the existing employee API. The current schema has no transfer-history model, so historical transfer entries are not stored; the UI states this explicitly.
- Holiday now records `holiday` attendance for active employees on the selected date, optionally scoped to a branch, using the existing attendance API. The current schema has no standalone holiday calendar model; the UI states this explicitly.
- No database model or migration was added.

Verification: ZIP integrity checked. Frontend build and live API/database workflow tests were not run because frontend dependencies and a running application/database were unavailable in this environment. Test employee/branch/attendance API behavior in a backup or staging database before production use.
