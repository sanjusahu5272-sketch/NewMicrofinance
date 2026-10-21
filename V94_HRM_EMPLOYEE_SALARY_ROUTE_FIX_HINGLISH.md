# V94 HRM Employee and Salary Route Fix

- Fixed sidebar route key mismatch: HRM's `Employee` item now opens the existing employee list page.
- Fixed sidebar route key mismatch: HRM's `Salary` item now opens the existing Salary / Payroll page.
- Added the `Salary` permission alias so staff permission checks do not fall back to `view_dashboard`.
- Existing screens, API endpoints, database models, and UI styling are unchanged.

Verification: source-level route/permission assertions and ZIP integrity checked. Frontend build and live API/database workflows were not run here.
