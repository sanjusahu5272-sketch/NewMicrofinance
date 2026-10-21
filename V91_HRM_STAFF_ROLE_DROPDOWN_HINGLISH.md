# V91 — HRM Staff Role Dropdown

- Employee / Add New Employee form now includes a Staff Role dropdown matching the supplied reference screenshot.
- Options: Admin, Agent, Accountant, Manager, Promotional Agent.
- Role remains stored in the existing Employee `role` field; no database migration required because that field is already a text field.
- Existing UI and the V90 no-centre menu changes are preserved.
- Verification: source-level check performed; frontend build and database-backed employee creation were not run in this environment.
