# V42 — Master Lists Active/Inactive

Added the Designation option to the existing Reference Masters page. The same add/edit and confirmation-based Active/Inactive workflow now applies to Identity Proof, Relation, Purpose, Reason, and Designation masters. Active status is stored in the existing ReferenceMaster table; the migration only expands allowed `kind` choices and does not delete or rewrite existing rows.

Also retained the Active/Inactive workflows already present in the app's standard CRUD lists (including members, employees, loan products, branches and location masters where those models expose an `active` field).

Verification performed: Python syntax compilation and ZIP integrity check. Full Django runtime/database tests and Vite production build were not run in this environment.
