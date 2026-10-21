# V119 — Master > Series

Added an admin-only Series Master page with configurable prefixes, next-number counters, branch-code inclusion and financial-year inclusion for member, employee/agent, loan/application, branch, collection-center, branch-center and application-form series.

## Apply
- This release adds a Django migration `0025_series_configuration.py`.
- Back up PostgreSQL first.
- Apply with `docker compose exec backend python manage.py migrate`.
- Log in as a Django staff/admin account, open Master > Series, click **Create Missing Default Series**, review values, then Save.

## Safety / limitations
- Existing identifiers are not rewritten.
- These are persisted settings only; automatic ID generation has not been changed to consume these counters in this release. Do not assume updating the counter changes the next member/loan number until generator integration and concurrency/uniqueness tests are completed.
- Django tests and frontend production build have not been run in this environment.
