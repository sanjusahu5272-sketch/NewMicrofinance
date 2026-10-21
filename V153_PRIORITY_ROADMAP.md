# V153+ Priority Roadmap for Real-Money Lending

This is a researched priority list, not a claim that every item is already implemented.

## P0 — Must pass before live lending
1. Underwriting: bind verified household income/debt assessment to the exact application and calculate the proposed obligation from the final repayment schedule; prevent approval if capacity limit is breached.
2. Loan calculation test matrix: flat/reducing rates, all supported frequencies, month-end dates, leap years, rounding, partial/advance payment, prepayment/foreclosure, rescheduling, reversal, and delinquency/penalty.
3. Ledger invariants: every posted transaction balances; loan principal subledger equals general ledger control account; no editing/deleting posted transactions; correction only through linked reversals.
4. Idempotency and concurrency: disbursement, collection, provider webhooks, reversal, settlement, and transfer must remain single-post under retries/concurrent requests.
5. Branch/RBAC isolation: test list, retrieve, update, actions, exports, attachments and reports across every role and branch.
6. Reconciliation: bank statement versus cash/bank ledger; trial balance; portfolio schedule versus loan subledger; approved opening balances.
7. Security/operations: private KYC storage, download audit, throttling, MFA for privileged roles, secrets rotation, encrypted backups, restore drill, monitoring and incident runbook.
8. Independent accountant review of representative loans and reports; legal/compliance review of entity-specific RBI applicability.

## P1 — Borrower and operational service
- KFS/APR, sanction letter, signed loan agreement, repayment schedule, receipts, statements and closure certificate where applicable.
- Complaints/grievance tracking with deadlines and escalation.
- Collection conduct logs, field visit history, receipt controls and customer communication consent.
- PAR/DPD aging, roll rates, delinquency trajectory, collection efficiency and write-off/recovery reports tied to source records.
- Credit bureau data import/reporting workflow only through authorized providers and applicable consent/legal process.

## P2 — Integrations after core controls pass
- Provider-specific payment initiation, signed webhook verification, replay protection, refunds and settlement reconciliation.
- SMS/email delivery adapters with delivery logs, retry policy and consent/opt-out handling.
- eNACH/AutoPay mandate lifecycle, failure handling and cancellation verification.
- Business intelligence based on reconciled source data, not hard-coded/demo values.

## Release acceptance gates
Do not call production-ready until automated tests pass, the frontend builds, mobile and desktop acceptance tests pass, loan and bank reconciliation differences are zero or formally explained/approved, RBAC isolation tests pass, and a backup restore drill succeeds.
