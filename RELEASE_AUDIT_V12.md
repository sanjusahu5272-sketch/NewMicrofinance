# NMFA V12 — Configurable Loan Plans

## Implemented
- Loan Products screen supports create/edit/deactivate for loan plans with name/code, annual interest %, flat/reducing calculation, daily/weekly/fortnightly/monthly frequency, installment count, processing fee, late penalty and grace days.
- Loan-plan writes are restricted to authenticated staff/admin users; signed-in users can read plans to submit applications.
- API validation rejects invalid/negative interest, fees and penalties, duplicate plan codes, unsupported frequencies/methods and out-of-range installment counts.
- Loan schedule calculation documents annual interest-rate interpretation and uses calendar-month due dates for monthly plans (e.g. Jan 31 -> Feb 28 -> Mar 31).
- Added tests for daily plan creation, invalid interest rejection and monthly calendar dates.

## Verification status
- Python syntax compilation and ZIP integrity are checked at packaging time.
- Django runtime tests and frontend production build require dependencies; do not treat this package as production-certified until they run successfully in the deployment environment.
- Rate is interpreted as an annual percentage. Have the lender/compliance owner verify product pricing, borrower disclosures, fees, and applicable regulatory requirements before live lending.
- Public internet access requires deployment with HTTPS/domain, environment secrets, database and production server configuration; this source code alone does not publish the application.
