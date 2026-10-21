# V125 — V66 UI restored on V124 backend

- Frontend UI source files `frontend/src/main.jsx`, `frontend/src/style.css`, and `frontend/src/reference.css` are taken from `NMFA_MicroMuneem_Reference_Clone_V66.zip`.
- Backend code, API, models, migrations, Docker Compose, deployment scripts, environment examples, and other V124 files are retained from V124.
- This is a frontend swap, not a backend rewrite. Since V66's UI is older, some newer V124 screens or shortcuts may not be visible in the UI even though V124 backend code remains present.
- Verification performed: ZIP integrity, frontend file equality against V66, and backend file equality against V124. A full Vite build and live browser/API test were not run in this environment because dependencies are not installed.
- For local testing, extract into a NEW folder and keep the existing V124 folder/database untouched until verified.
