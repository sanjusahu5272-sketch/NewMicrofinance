# V50 — Loan approval safety fixes

## Is release mein kya badla
- Application approval ab sirf `pending` application par chalega. Existing approved application se linked loan ho to duplicate loan create nahi hoga; rejected/non-pending application ko dobara approve nahi kar sakte.
- Inactive loan product ya inactive member par naya approval block hota hai.
- Approval ke dauran member row lock karke duplicate pending application check serialize kiya gaya hai, taaki concurrent approval requests same member/product ke duplicate pending check ko ek saath bypass na kar saken.
- Approved amount ko application save karne se **pehle** validate kiya jata hai. Invalid amount par application `pending` hi rahegi aur loan create nahi hoga.
- In changes ke liye automated regression tests add kiye gaye.

## Verification status (honest)
- `python -m compileall -q backend`: passed (syntax compilation only).
- Django tests: **not run**; Django is not installed in this authoring runtime and package download failed because network/DNS was unavailable. Run `docker compose exec backend python manage.py test finance` on the user's Docker setup.
- Frontend production build, PostgreSQL concurrency tests, browser acceptance, payment provider webhooks, and production security review: not run / not certified.
- No model changes were made, so this patch adds no migration.

## Important
This is a safety patch on the existing V49 source, not a declaration that every item in `MASTER_COMPLETION_ROADMAP.md` is finished. The roadmap still lists unfinished accounting, refunds/reversals, bank import/reconciliation, full role/branch isolation review, external provider verification, and deployment acceptance work. Do not use real customer funds until the full test and independent accounting/security gates pass.
