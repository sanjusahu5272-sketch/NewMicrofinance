# NMFA V32 – implementation notes (Hinglish)

## Is version mein actual source changes

- Organization/company profile ab PostgreSQL model/API mein save hota hai (`/api/organization-profile/`). Fields: name, subtitle, address, phone, email, website, registration number aur small logo data URL.
- Organization profile creation/edit superuser/Django staff-admin only hai. Profile ek organization record ke roop mein intended hai; duplicate profile creation reject hota hai.
- Shell load par server profile fetch karke logo/name/subtitle ko header aur existing print helpers ke browser storage cache mein sync karta hai.
- HRM submenu mein Attendance aur Salary/Payroll pages add kiye gaye.
- Attendance API (`/api/attendance/`) employee/day duplicate ko block karti hai aur checkout-before-checkin reject karti hai.
- Payroll API (`/api/payroll/`) server-side Decimal arithmetic se net salary calculate karti hai, negative amounts, duplicate employee/month aur non-first-of-month payroll period reject karti hai.
- Payroll ko API se `paid` mark karna reject hota hai, kyunki bank/cash salary disbursement + ledger posting workflow abhi implement nahi hai. Isse UI se false paid status nahi banega.
- Branch-scoped users ke liye attendance/payroll list employee ke assigned branch tak filter hoti hai. `manage_hr` feature permission key add ki gayi.
- Migration `0011_organization_hrm.py` aur API tests add kiye gaye.

## Run on PC

Existing local `.env` aur PostgreSQL volume ko preserve karein. `docker compose up --build` backend container startup par migrations apply karega. **`docker compose down -v` na chalayein** kyunki usse local database volume delete ho sakta hai.

## Verification status

- Python `compileall`: PASS (syntax only).
- ZIP integrity: verified when packaging.
- Django tests: NOT RUN; Django dependencies are not installed in this environment.
- Frontend production build: NOT RUN; npm install timed out and Vite executable was unavailable.
- Live PostgreSQL migrations/API: NOT RUN.

## Still incomplete / not production-certified

This is not a claim that every one of the 55 reference screenshots has been fully reproduced. Remaining work includes full HR employee profile fields (bank/KYC/contact/address), attendance edit/approval and monthly summaries, payroll approval/disbursement and double-entry salary posting, full company branding on every print/receipt and tenant/branch-specific organization settings, SMS/WhatsApp delivery, actual Aadhaar/PAN/OTP provider verification, webhook/payment reconciliation, full maker-checker and audit coverage, full reference-screen parity, security review and live integration tests. Do not use payroll records as proof of salary payment. Do not enable real-money production use without a qualified financial/accounting and security review.
