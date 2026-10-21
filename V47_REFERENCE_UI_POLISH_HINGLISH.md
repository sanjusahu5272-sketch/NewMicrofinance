# V47 — Reference UI polish (11 Oct 2026)

## Applied in this iteration
- Changed the per-loan `Task` dropdown from white/grey to green with white bold text, hover/focus states and readable dropdown options, matching the supplied reference recording more closely.
- Preserved the V46 source and its `finance` migration 0016; no database volumes or records were touched.

## Existing workflows retained (not newly certified by this change)
- Loan register with branch/status filters and row Task actions (eligible disbursement, schedule view, EMI-card print and eligible foreclosure).
- Application and EMI-card print actions documented in the source audit.

## Still requires implementation and verification
- The full reference application is not yet complete. Camera audit gaps include expanded Member/customer fields, full employee/payroll/leave/attendance fields, staff identity verification workflow, server-enforced branch-level granular permissions, production accounting reconciliation/reversals, and real SMS/payment-provider integrations.
- Frontend production build and Django/PostgreSQL tests have not been run in this packaging environment. Do not use with real customer funds until end-to-end financial, security, migration and backup/restore tests pass.

## PC verification
1. Back up the local database before replacing source files.
2. Replace the project source with this archive only after stopping containers normally (do not use `down -v`).
3. Rebuild: `docker compose up -d --build`.
4. Open the loan register and confirm the `Task` control is green; verify keyboard focus and dropdown options.
5. Continue the non-production test plan in `V45_REFERENCE_FLOW_AND_MODULE_TEST_PLAN_HINGLISH.md`.
