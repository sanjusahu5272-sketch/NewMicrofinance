# V29 — Consolidated source and navigation scroll adjustment

This archive is based on the prior V28 consolidated PC-test source. It preserves the existing backend, migrations, KYC, staff-role UI, personal-loan workflow, and documentation.

## UI change in V29
- Desktop sidebar is sticky beneath the top bar and has an independent vertical scroll area.
- Selecting a sidebar item scrolls the main document to the top. In-page navigation receives the same navigation function.
- On small screens, sidebar returns to normal document flow to avoid covering the page.

## Important: this is not a production certification
This is a development/test source. Django/PostgreSQL tests, browser end-to-end tests, production frontend build, live payment-provider webhooks/settlements, and SMS/WhatsApp delivery have not been verified in this environment. Branch-level isolation, accounting close/reversal coverage, malware scanning, and the foreclosure calculation policy still need review as stated in RELEASE_AUDIT_V27.md. Use dummy data until those are verified.

## Safe update
Back up the project first. Preserve `.env`, `backend/.env`, and the database volume. Do not run `docker compose down -v`.
