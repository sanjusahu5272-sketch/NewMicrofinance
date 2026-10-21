# NMFA V3 Foundation — QA and release gate

This is an upgraded development foundation, not a claim of regulatory certification or fully production-ready banking software. Run the following before any customer demo or deployment.

## Automated checks
- `cd backend && python manage.py check`
- `cd backend && python manage.py test finance`
- `cd frontend && npm ci && npm run build`
- Run migrations on a clean database and on a copy of the intended existing database.

## Manual click-through
1. Sign in; sign out; confirm expired/invalid token behavior.
2. Branches: create, list, edit, deactivate; test duplicate branch code.
3. Members: create, list, edit; verify required branch, duplicate member number, phone and KYC data.
4. Loan products: configure rate, interest method, frequency and tenure.
5. Application: submit, approve once, reject once; ensure duplicate approval never creates duplicate loan.
6. Disbursement: approved principal only; ensure schedule is created once. Verify schedule amounts/dates against an accountant-approved sample.
7. Collection: partial payment, full payment, overpayment rejection, receipt uniqueness, installment allocation.
8. Capital: add and withdraw; check immutable transaction history and negative-capital policy.
9. Accounting: verify double-entry balancing, day book and cash/bank balances against source transactions.
10. Admin settings: save credentials, reload page, verify secrets are masked and not returned to non-admin users.
11. Test branch-to-branch access, user roles, KYC file access, audit log integrity, backups and restore.
12. Test mobile widths, validation messages, empty/loading/error states, pagination and search.

## Not yet certified / remaining before production
- Full double-entry ledger with atomic posting and reconciliation across every money movement.
- Server-enforced role and branch-level data scopes for every endpoint.
- KYC document model, private object storage, malware scanning, access logs and retention rules.
- Verified provider-specific live payment initiation/webhooks, signature validation, idempotency and reconciliation. Credential storage alone is not a payment integration.
- Robust reducing-balance schedule validation for each repayment frequency and rounding final-installment reconciliation.
- Complete attendance, field visits, cash handover, mandates, SMS/WhatsApp/email delivery, CSV/PDF exports, recovery workflows, restore drill and monitoring.
- Independent security review, financial-domain review, privacy/regulatory review and production secrets rotation.

Never use fabricated dashboard numbers for a live financial decision. No live credentials or real customer KYC data should be committed to source control.

## V4 regression focus
- [ ] CRUD forms create records through authenticated API.
- [ ] Edit button loads existing row into form and PATCHes record.
- [ ] Cancel Edit restores blank form.
- [ ] Activate/Deactivate updates active status through API; no hard-delete is exposed in generic master lists.
- [ ] Applications, capital, and expense forms submit through form submit handlers without page reload.
- [ ] Confirm backend API permissions and branch-level access before real customer data.
- [ ] Run `docker compose up --build` and exercise each workflow against a disposable database.

## V6 QA additions
- [ ] Authenticated CSV export downloads expected headers and records for each supported register.
- [ ] Unknown export type returns HTTP 400.
- [ ] CSV export creates an audit log record.
- [ ] KYC download requires authentication and returns a private attachment response.
- [ ] KYC upload rejects unsupported MIME types, unsupported extensions, and files over 5 MB.
- [ ] Reports match source registers and do not use hard-coded financial figures.
- [ ] Frontend Vite production build succeeds.

## V7 additions (source-level checks only)
- [ ] Run Django test suite in the Docker backend container.
- [ ] Verify GET /api/members/<id>/ledger/ with an authenticated user.
- [ ] Verify GET /api/receipts/<receipt_no>/ with an authenticated user.
- [ ] Verify payment API rejects a loan that belongs to a different customer.
- [ ] Verify journal API rejects negative amounts, both debit+credit on one line, and zero-value lines.
- [ ] Run frontend production build and end-to-end browser tests.
- [ ] Review branch-level access controls before using real customer data.

## V8 additions (source-level checks only; Django runtime tests not run in this environment)
- [ ] Flat schedule principal and interest sums exactly match stored loan principal/interest totals, including final-installment rounding adjustment.
- [ ] Reducing-balance schedule final principal and interest totals reconcile to the loan totals.
- [ ] Pending/failed payment records do not reduce installment dues.
- [ ] Successful loan collection is rejected unless the loan is disbursed.
- [ ] A fully paid installment schedule closes the loan; partial payment does not.
- [ ] Payment status only accepts success, pending, failed, or refunded.
- [ ] Run `python manage.py test finance` against PostgreSQL in Docker before accepting this release.
