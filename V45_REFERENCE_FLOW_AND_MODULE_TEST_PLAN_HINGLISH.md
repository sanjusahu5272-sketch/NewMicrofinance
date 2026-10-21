# V45 — Reference UI and consolidated module test plan

This release is based on the supplied V44 source. The reference screenshots/video guide the visual layout and flow; this is not a claim that a third-party product's proprietary source code was copied.

## Consolidated modules in the current source
- Dashboard metrics: disbursement, collections, outstanding, overdue, capital, cash/bank and expenses.
- Members/customers and KYC, including verification and active/inactive handling.
- Loan products, applications, approvals, loans and installment schedule.
- Disbursement register and per-loan task menu (disburse approved loan, view schedule, print EMI card, eligible foreclosure).
- Collections/payments and overdue/recovery.
- HRM: employees/field officers, attendance and payroll.
- Accounts: Day Book, vouchers, payments/receipts, contra, journal, cashbook and expenses.
- Payment integrations and mandates configuration.
- MIS, financial and portfolio reports; audit logs.
- Capital/investment, company profile/logo, SMS, KYC/general settings, staff roles/permissions, backup/restore entry.

## Reference-style loan register
The loan register has columns for plan, EMI/frequency, loan amount, disbursed amount, fees, member, staff, branch, branch centre, payment mode, description, date, status and task actions, with branch/status filters and horizontally scrollable table layout.

## Required verification before real-money use
1. Frontend production build (`cd frontend && npm ci && npm run build`).
2. Backend tests (`cd backend && python manage.py test finance`).
3. Manual test in Docker using a non-production database: create member/KYC, product, application, approval, disbursement, schedule, partial/full collection, receipt, overdue, reports, role permissions and settings.
4. Reconcile every money movement to journal/cash/bank ledger; test duplicate submissions and webhook idempotency.
5. Confirm provider credentials before expecting live SMS/payment delivery. Do not use real customer data in test runs.

Build dependencies were not installed during this packaging pass because the package install command timed out in the current environment. The complete Docker/runtime workflow has not been executed here; do not treat this archive as production-certified.
