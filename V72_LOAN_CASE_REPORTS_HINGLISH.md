# NMFA V72 — Loan Case / Due EMI Report

Added a Loan Case page to the existing Loan Summary submenu without changing the global UI.
- Filters: branch, staff/field officer, due/overdue/paid status, city/address, member/loan search, due-date range.
- Member Due EMIs table with loan/member/contact/branch/staff/installment/due date/EMI total/payable/status.
- CSV export, print view and 10-row pagination.
- Reads existing `/installments/`, `/loans/`, `/members/`, `/employees/`, and `/branches/` APIs. No new database models/migrations.
- Due calculation is based on installment fields exposed by the current API. Verify field names and reconcile with the backend ledger before operational use.
- ZIP integrity checked. Frontend production build and Django test suite have not been run in this environment. This is not production-certified.
