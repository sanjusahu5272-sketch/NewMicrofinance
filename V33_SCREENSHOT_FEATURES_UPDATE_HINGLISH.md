# NMFA V33 — screenshot feature implementation update

This is a development/PC-test build based on V32. It does not claim complete feature parity with the reference software.

## Changes in this build
- Extended the Employee master with fields visible in the Camera55 employee form: alias, father name, DOB, email, alternate phone, designation, address/city/state/PIN, joining date, experience, bank/account holder/account number/IFSC, Aadhaar/PAN identifiers and status, login status, salary components and leave allocations.
- Added migration `0012_employee_hr_reference_fields.py`.
- Expanded the Employees form and list to edit/store these fields.
- Added server-side validation for Aadhaar/PAN format, allowed verification/login status values, non-negative salary/experience and leave allocation ranges.
- Added tests for employee HR field persistence and invalid Aadhaar/PAN format.
- Retained V32 expandable sidebar, company profile, attendance/payroll initial workflows, application print form and EMI card.
- Group Loan workflow remains excluded; geographical Group master remains only for existing centre/field organisation structure.

## Important limitations
- `aadhaar_status=verified` or `pan_status=verified` is an internal status field, not proof of external government/provider verification. Do not set it to verified unless an authorized reviewer has completed the required process.
- Aadhaar/PAN values are not encrypted at application level in this version. Restrict access, use private storage, and do not use real sensitive IDs until encryption/access review is complete.
- Payroll records are not yet connected to a bank transfer or balanced salary-expense ledger posting.
- Leave allocation fields are stored on employee records, but a full leave-request/approval/consumption ledger is not implemented yet.
- SMS/WhatsApp/OTP/payment integrations require provider setup and signed callbacks; configuration screens do not themselves deliver messages or transfer money.
- Some sidebar options still point to reserved/summary pages. Full parity with all 55 screenshots is not complete.

## Verification
- Python `compileall`: passed in the packaging environment.
- Django tests: not run (Django/PostgreSQL runtime not available here).
- Frontend build: not run (`frontend/node_modules` absent; no dependency install attempted).
- Apply migrations locally with `docker compose exec backend python manage.py migrate` after reviewing your local database backup. Do not delete Docker volumes.
