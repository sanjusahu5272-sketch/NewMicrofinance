# V146 Operational Safety Additions

## Dashboard freeze
The `Dashboard` component body in `frontend/src/main.jsx` is byte-for-byte unchanged from V145. This release adds only operational menu entries and pages; no dashboard cards, charts, metrics, layout, or styling were intentionally changed.

## Added in V146
- Household income and existing monthly debt assessment with Decimal fields, non-negative database constraints, repayment ratio display, and separate verification action. Assessment creator cannot verify their own assessment.
- Customer complaint/grievance register with branch/member/employee matching, received/due dates, status, resolution note, and audit events. A resolved/rejected complaint cannot be reopened through this workflow.
- Field visit log with member/loan consistency checks and immutable records; logging a visit or promise does not create a payment.
- Cash custody handover request with positive Decimal amount, idempotency key, branch and employee validation, maker-checker approval, decision note, and audit log. Approval intentionally does not post a journal entry or change accounting balances.
- New permission keys for the added APIs and menu entries.
- Additive migration `0029_v146_operational_safety.py`; it creates new tables and constraints and does not rewrite existing loan/payment/journal rows.

## Not claimed complete
This is a staged operational-safety release, **not** the completion of every item in `MASTER_COMPLETION_ROADMAP.md`. Remaining high-priority work includes: full double-entry posting for every financial workflow, conversion from free-text journal account to controlled account mapping, mandatory financial-period lock enforcement, bank CSV import/duplicate detection and reconciliation, tested refund/reversal/chargeback accounting, provider-specific signed payment webhooks and settlement reconciliation, complete KFS/APR/sanction/closure documents, private KYC object storage and malware scanning, production backup/restore drill, and full role/branch access review across every API/export.

## Verification status
- Python syntax compilation: pass.
- Frontend JSX parse diagnostics: zero.
- Dashboard component body compared against V145: unchanged.
- ZIP integrity: checked when packaged.
- Django migrations/tests, PostgreSQL concurrency behavior, frontend production build, browser/mobile tests, and live provider integration: not run in this authoring environment. Do not apply to the live real-money database until the migration and test suite pass in staging.
