# V149 — Bank Statement Import & Reconciliation Safety

## Dashboard constraint
The V66 Dashboard component must remain unchanged. This release adds bank reconciliation controls inside the existing Financial Controls screen; it does not redesign the dashboard.

## Added
- CSV bank statement import (max 5 MB / 5,000 transaction rows).
- Required date, debit and credit columns; optional description, reference/UTR and running statement balance.
- Import requires a bank account that matches an active Asset account in Chart of Accounts.
- SHA-256 exact-file duplicate detection.
- Duplicate row detection for rows with a reference, using bank account/date/reference/debit/credit; a database uniqueness constraint also protects concurrent imports.
- Atomic batch + line creation; invalid files do not leave partial batches.
- Statement period start/end, opening/closing balance and total debit/credit recorded on an import batch.
- Manual match suggestions only; suggestions never auto-match.
- Ambiguous journal references are rejected instead of guessed.
- Ignoring a statement line requires a reason and creates an audit event.
- A batch can be reconciled only when every row is matched (a note/ignore flag is not enough), opening balance + credits - debits equals the supplied closing balance, the pre-period ledger opening balance equals the statement opening balance, and every bank-account ledger entry in the statement period maps one-to-one to a confirmed statement line.
- Reconciliation is restricted to organization admin, accountant, and auditor profiles; branch staff cannot access organization-wide statement batches.

## Expected CSV columns
Required CSV columns: `statement_date` (or `date` / `transaction_date`), `debit`, `credit`. The form also requires the bank statement period start/end dates plus opening and closing balances.
Optional: `description`/`narration`, `reference`/`UTR`, `statement_balance`/`balance`.

Dates accepted: `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY`.
Amounts use decimal notation; thousands separators and INR/₹ prefixes are accepted. Do not include currency symbols in column headers.

## Important limitations
- This is CSV import and manual reconciliation, not a live bank feed.
- Bank fee, split/combined settlement, unidentified transactions and reversals still need an accountant-approved journal/adjustment workflow before reconciliation.
- Duplicate-row protection is strongest when the bank CSV provides a stable transaction reference/UTR. Rows without references can only be deduplicated at exact-file level.
- Do not treat an imported or reconciled statement as proof that a customer refund was actually paid; external bank movement still needs statement evidence.

## Verification status
Python syntax compilation and JSX parsing/ZIP integrity are local static checks only. Django tests, migration application against PostgreSQL, frontend production build, browser testing and real bank statement validation must still be run in staging before production use.
