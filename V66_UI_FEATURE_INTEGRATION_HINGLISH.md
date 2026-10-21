# V66 UI integration pass

- Preserved the V63 `main.jsx`, `style.css`, and `reference.css` design system; no global font, color, sidebar, or topbar redesign.
- Added visible navigation for KYC Documents, Promise To Pay, and Settlement so these existing workflows are reachable without relying on shortcuts.
- Connected Payment History, Receipt Register, Day Book, Cashbook, Voucher Entries, Contra, and Journal to their available existing APIs.
- Added journal-line entry forms with validation for non-negative amounts and mutually exclusive debit/credit fields.
- Kept Group Loan excluded from the lending workflow. Areas/Centres/Groups remain only as administrative/field-operations structure.
- No database reset, destructive migration, or real payment integration was added.

## Not yet certified
- Backup/Restore remains a placeholder because safe database/media backup and restore require deployment-specific storage/authorization handling.
- Journal line entry is not a transactional multi-line voucher. A reference must be used to pair debit/credit lines and totals must be reconciled before posting.
- Receipt and customer payment creation remains through Collection / EMI so the existing loan payment allocation path is used.
- SMS, WhatsApp, gateway/eNACH, branch isolation, and end-to-end production tests still need deployment-specific verification.
- Django tests and production frontend build were not run in this packaging environment; do not use for live customer funds until they pass.
