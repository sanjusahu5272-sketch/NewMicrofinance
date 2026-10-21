# V147 Financial Safety — Controlled Journal Account Mapping

## Dashboard freeze
The V66 Dashboard component must remain unchanged. This release does not edit the `Dashboard` component or dashboard styling; it adds a backend accounting field, migration, validation, and a read-only audit command.

## Implemented
- Added nullable `JournalEntry.account_ref` foreign key to Chart of Accounts using `PROTECT`.
- Added migration `0030_journal_chart_account_mapping.py`.
- Migration backfills only when exactly one active Chart of Accounts entry matches the old text account name case-insensitively. Unmatched or ambiguous legacy lines remain unassigned; no fuzzy guesses and no existing financial values are rewritten.
- Manual balanced journal batches now require each account to map to exactly one active Chart of Accounts entry. Unknown or ambiguous accounts are rejected before any journal rows are written.
- Automated legacy posting helper links account references only on a unique active exact-name match. Existing legacy posting is not silently redirected; unmatched automated rows remain visible as unmapped until configured.
- Journal API includes `account_ref_code` and `account_ref_name` read-only fields while retaining the legacy `account` string for compatibility.
- Added read-only command: `python manage.py audit_unmapped_journal_accounts` (optional `--limit 500`).
- Added test assertions for mapped manual journal rows and rejection of unmapped manual accounts.

## Important limitation
This is a controlled mapping foundation, not complete accounting certification. Legacy automated flows can still produce unassigned rows when a corresponding Chart of Accounts entry is absent or ambiguous. Configure and reconcile Chart of Accounts names before relying on reports. The next financial-safety phase must add accounting-period locks and fully verified reversal/refund/chargeback workflows, then bank import/reconciliation and gateway-specific signed webhooks.

## Verification status
- Python syntax compilation: intended to be checked in this authoring pass.
- ZIP integrity: intended to be checked after packaging.
- Django tests, migration application, PostgreSQL concurrency, frontend production build, and browser/mobile tests require the project's Docker/staging environment and have not been represented as passed unless explicitly reported separately.
- Do not apply to a live real-money database before a verified backup and staging migration/test run.
