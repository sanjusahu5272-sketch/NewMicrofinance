# NMFA V37 — 16 Improvements + UI Dialog Consolidation

V37 is based on the supplied V36 source. It retains the V35 16-point tracker and V36 professional UI and adds a real source-code improvement: generic master CRUD create/update and Active/Inactive actions now use the reference-style “Are you sure?” confirmation and Success/Error result dialog instead of browser alert boxes. Dialogs use the cyan/white/green/red styling and keyboard focus feedback.

## The 16 requested items (tracked)
1. Member branch selection.
2. Field Officer assignment.
3. Branch Manager assignment.
4. Customer passport-size photo upload/preview/removal.
5. Member register shows photo, branch, manager, officer and income.
6. Active/Inactive master status controls where the model exposes `active`.
7. Identity Proof, Relation, Purpose and Reason master UI — still needs full dedicated coverage verification; not represented as complete.
8. Company profile fields.
9. Company logo and branding.
10. SMS settings/event toggles and reminder days — provider delivery requires configuration/testing.
11. Reference-inspired sidebar font, colours, icons and expandable groups.
12. Cyan-header, white-body, two-column financial modal.
13. “Are you sure?” confirmation for disbursement, member status and generic master create/update/status actions.
14. Success/Error result dialogs for those flows; some legacy screens still use browser alerts.
15. Disbursement date and EMI start date.
16. Cash/Bank ledger choice and disbursement reference.

## Important verification notes
- Items 1–5 and 8–9 are represented in the existing V35/V36 source, and the disbursement modal is implemented in the loan portfolio action.
- This package does not claim all 16 are fully complete. Item 7 needs dedicated master CRUD/API coverage; item 10 needs real provider credentials and delivery tests; remaining flows need manual end-to-end validation.
- No database schema or migration changes were made in V37.
- Test on a local copy first. Keep the current working folder and database volume; do not run `docker compose down -v`.
- Production lending requires separate security, accounting, legal and operational review.
