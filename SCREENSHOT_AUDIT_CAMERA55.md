# Camera.zip — 55 screenshot audit (NMFA reference)

Date reviewed: 2026-10-11. Source: the 55 JPG images in `Camera.zip`. The images are camera photos of another software's screens; some are tilted, low-resolution, or partly obscured by the video ticker. Therefore this is a visual workflow inventory, not a claim that every field label is perfectly legible.

## Screenshot-by-screenshot inventory

| # | Image | What is visible / likely workflow | NMFA action |
|---:|---|---|---|
| 1 | IMG_20261010_192536.jpg | Dashboard with many colored metric tiles and shortcut buttons | Compare NMFA dashboard cards and shortcuts; retain finance-specific metrics |
| 2 | IMG_20261010_192609.jpg | Settings/details form, multi-section values | Inspect settings fields and data persistence |
| 3 | IMG_20261010_192615.jpg | Settings / organisation configuration detail | Map applicable organisation settings |
| 4 | IMG_20261010_192618.jpg | Settings / organisation configuration detail | Map applicable organisation settings |
| 5 | IMG_20261010_192648.jpg | Branch / registration style configuration form | NMFA branch and company settings |
| 6 | IMG_20261010_192720.jpg | General configuration form | Map fields that apply to NMFA |
| 7 | IMG_20261010_192728.jpg | SMS settings form | SMS provider credentials, sender, templates, consent and delivery status need implementation/credentials |
| 8 | IMG_20261010_192740.jpg | SMS settings form with multiple fields | As above; secrets must be masked and encrypted |
| 9 | IMG_20261010_192801.jpg | SMS settings with confirmation dialog | Save confirmation and validation behavior |
| 10 | IMG_20261010_192803.jpg | SMS settings page | SMS settings and test-send flow |
| 11 | IMG_20261010_192819.jpg | Confirmation/result modal | Display clear save/test status |
| 12 | IMG_20261010_192830.jpg | Settings/details table | Settings register and actions |
| 13 | IMG_20261010_192843.jpg | Rotated menu/configuration view | Need inspect original orientation for exact labels |
| 14 | IMG_20261010_192851.jpg | Permission/settings screen | Role/permission matrix |
| 15 | IMG_20261010_193128.jpg | Rotated list/table screen | Review row actions and navigation after rotation |
| 16 | IMG_20261010_193253.jpg | Permission/role matrix with grouped options | NMFA granular feature permissions |
| 17 | IMG_20261010_193256.jpg | Permission matrix continued | Map each visible permission to a server-side permission check |
| 18 | IMG_20261010_193304.jpg | Permission matrix continued | Same; UI-only hiding is not security enforcement |
| 19 | IMG_20261010_193316.jpg | Permission matrix continued | Same |
| 20 | IMG_20261010_193330.jpg | Purpose/details and permission selections | Role-based action permissions |
| 21 | IMG_20261010_193333.jpg | Purpose/details and permission selections | Role-based action permissions |
| 22 | IMG_20261010_193445.jpg | Designation list/selection | Staff designation configuration |
| 23 | IMG_20261010_193521.jpg | Rotated data table/list | Need upright original for exact columns |
| 24 | IMG_20261010_193553.jpg | Permission table | Staff permissions and role mapping |
| 25 | IMG_20261010_193555.jpg | Permission table continued | Staff permissions and role mapping |
| 26 | IMG_20261010_193605.jpg | Permission/role listing | Searchable table and row actions |
| 27 | IMG_20261010_193609.jpg | Employee/staff listing | Staff directory with searchable rows |
| 28 | IMG_20261010_193612.jpg | Employee/staff listing and action area | Add/edit/view/enable actions |
| 29 | IMG_20261010_193622.jpg | Employee/staff listing | Table pagination/search behavior |
| 30 | IMG_20261010_193625.jpg | Employee/staff listing | Table pagination/search behavior |
| 31 | IMG_20261010_193643.jpg | Rotated table/detail screen | Need original orientation for precise field extraction |
| 32 | IMG_20261010_193733.jpg | Rotated form/list | Need original orientation for precise field extraction |
| 33 | IMG_20261010_193808.jpg | Rotated form/list | Need original orientation for precise field extraction |
| 34 | IMG_20261010_193857.jpg | Dashboard screenshot | Dashboard totals and quick actions reference |
| 35 | IMG_20261010_193938.jpg | Form for number/tenure/plan details | Loan plan/repayment terms; validate numeric values |
| 36 | IMG_20261010_193943.jpg | Installment/EMI schedule table | EMI due date, interest, principal, amount and balance columns |
| 37 | IMG_20261010_194043.jpg | Rotated form/table | Review original for exact fields |
| 38 | IMG_20261010_194349.jpg | Add/edit modal for a record | Modal validation and save/cancel behavior |
| 39 | IMG_20261010_194417.jpg | Printable Loan Application Form | A4 printable customer application with photo area, customer/address/bank/income/loan details and signature areas |
| 40 | IMG_20261010_194418.jpg | Printable application form continued/alternate view | Page-break/layout and signature-space reference |
| 41 | IMG_20261010_194422.jpg | Printable form continuation | Check all sections remain legible when printed |
| 42 | IMG_20261010_194423.jpg | Printable form continuation | Check all sections remain legible when printed |
| 43 | IMG_20261010_194440.jpg | Loan/record list | Table columns, filters and actions |
| 44 | IMG_20261010_194443.jpg | Confirmation dialog | Confirm irreversible/important actions clearly |
| 45 | IMG_20261010_194505.jpg | Confirmation/record modal | Form validation and save/cancel behavior |
| 46 | IMG_20261010_194526.jpg | Printable Loan Application Form | Explicit priority: generate from saved application and leave customer signature/thumb impression space |
| 47 | IMG_20261010_194530.jpg | Printable Loan EMI Card | Schedule printout with due date, interest, principal, amount, remaining amount, received date/amount and staff sign |
| 48 | IMG_20261010_194557.jpg | Rotated menu/form | Need original orientation for exact labels |
| 49 | IMG_20261010_194638.jpg | Employee/staff list | Employee directory and action buttons |
| 50 | IMG_20261010_194645.jpg | Employee form: DOB, joining date, bank details, earnings and deductions | Employee master data and payroll fields |
| 51 | IMG_20261010_194653.jpg | Employee form continued | Bank, salary and deduction fields |
| 52 | IMG_20261010_194709.jpg | Employee form continued | Salary, deductions and annual leave fields |
| 53 | IMG_20261010_194711.jpg | Employee form continued | Same employee/payroll workflow |
| 54 | IMG_20261010_194717.jpg | Employee form continued | Same employee/payroll workflow |
| 55 | IMG_20261010_194743.jpg | Employee verification modal: Aadhaar/PAN status, login status, staff mobile OTP and update/cancel | Verification state machine; do not mark verified without an actual authorized verification result |

## Consolidated functional requirements extracted

### A. Organisation and settings
- Branch/company details and related configuration.
- SMS gateway configuration with credentials, sender ID, template/message options, save confirmation and test result.
- Keep secrets encrypted/masked; real delivery requires a provider, credentials, consent, retry handling and delivery logs.

### B. Permissions and staff
- Staff directory with search/pagination and view/edit/status actions.
- Role and designation configuration, granular permission matrix and branch assignment.
- Server-side authorization must match displayed permissions; hiding a button is not sufficient.
- Employee profile fields visible across the employee form: branch, name, alias, father name, DOB, email, primary/alternate contact, designation, staff role, address, city/state/PIN, last experience, joining date, bank account, IFSC, account holder, bank branch/name, Aadhaar/PAN, annual basic salary, fixed allowance, monthly fixed deduction, monthly income tax, deduction/tax months, and annual leave types (sick, privilege, mandatory, casual, paternity, maternity, extraordinary).
- Employee verification screen includes Aadhaar/PAN statuses, login status, staff login status, staff mobile OTP send/verify, reason and update/cancel.
- Payroll/disbursement, attendance, holiday and leave workflows need database/API support before they can be treated as complete.

### C. Loan application and printable paperwork
- Apply for a loan and retain a durable application ID/status.
- Printable A4 application form: organisation/branch, date, application/loan identifiers, applicant photo area, member/customer identity, contact, DOB/gender/family and address, bank details, income details, requested/approved loan plan, amount, fees and terms, declaration/consent, customer signature/thumb impression, witness/guarantor where applicable, officer signature and decision.
- Print must be sourced from saved data, with page-break-safe tables and no application controls on the printout.
- EMI card: customer/branch/product/loan amount/tenure, installment number/date, principal, interest, total due, remaining balance, received date/amount and collection staff signature.
- Printed application is not a sanction letter or executed loan agreement; approved terms and applicable legal documents must be separately provided and signed.

### D. Existing NMFA code comparison and changes in this package
- Existing NMFA source already has a React/Vite + Django REST Framework + PostgreSQL foundation, loan products, applications, loans, schedules, payments, KYC, accounting foundations, integrations settings and a staff-user permission screen.
- Added a print-friendly application form action to each application row, pulling available member/product information from the existing lists and providing declaration/signature fields.
- Added a print-friendly EMI card action to loan rows, retrieving the loan schedule and member/product records from the API.
- Added required validation to application member/product/amount inputs and a notes field.
- Printouts include an explicit caveat that the application is a request only and final sanction/agreement terms must be confirmed before disbursement.

## Important gaps that remain (not inferred as complete)
- The current `Member` model does not store all fields visible in the reference application form (e.g. spouse name, full bank account/IFSC/branch, detailed household/income/bank evidence and photo/signature fields). The print form can only auto-populate fields available in the current API and leaves some information absent/blank; adding these fields properly needs model migrations, KYC/document linkage, validation, privacy controls and tests.
- The current `Employee` model is much smaller than the reference HR/payroll form. Salary, attendance, annual leave, bank details, identity verification status and OTP workflows are not yet a complete HR module. Do not treat these as implemented merely because a sidebar label exists.
- Aadhaar/PAN OTP or official verification must use an authorized provider and cannot be simulated by changing a status dropdown.
- Several images are rotated/blurred, and the screen ticker obscures some labels. Exact field labels on those images need a clearer/original screenshot before implementation.
- Full branch-scoped RBAC, production accounting reconciliation, live SMS/payment gateway integrations and production hardening remain separate work items documented in the project roadmap.

## Verification performed for this package
- `Camera.zip` archive integrity and its 55 JPG entries checked; extracted successfully.
- Visual contact sheets generated for all 55 images and inspected in three batches.
- Frontend production build was **not run** because `frontend/node_modules` is absent and dependency installation was not performed in this environment.
- Django/PostgreSQL tests were **not run** in this environment.
