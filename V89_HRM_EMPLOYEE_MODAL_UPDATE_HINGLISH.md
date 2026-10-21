# V89 HRM Employee screen update

- HRM sidebar now shows Employee, Salary, Employee Transfer, Update Center Leader, Holiday, and Attendance.
- Employee opens the staff list with a green Add New button.
- Add New opens a scrollable modal form with the existing employee fields, a close control, and create/update actions.
- Employee list includes search, staff details, and edit/activate controls.
- Existing employee API endpoint and payload are retained; this is a UI/navigation update only.

Verification status:
- ZIP archive integrity is checked after packaging.
- Frontend build was attempted but could not run because Vite dependencies are not installed in this environment (`vite: not found`).
- No live database staff creation test was performed.
