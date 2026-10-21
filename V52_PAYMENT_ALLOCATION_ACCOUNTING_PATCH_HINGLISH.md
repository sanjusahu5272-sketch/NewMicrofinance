# V52 — Payment Allocation & Ledger Safety Patch

## Is update mein
- Successful collection ke waqt installment rows ko loan ke installment number ke hisaab se lock kiya jata hai.
- Outstanding amount ka hisaab `status` label ke bajay actual principal/interest/penalty balances se hota hai.
- `overdue` ya stale `paid` status wali row mein agar actual balance bacha hai to collection allocation us balance ko process kar sakta hai.
- Zero outstanding balance wali row ko `paid` status mein normalize kiya jata hai.
- Penalty → interest → principal allocation order ko preserve kiya gaya hai.
- Overdue-status allocation aur stale-paid-status recovery ke regression tests add kiye gaye hain; tests source mein add hain, run hone ka daawa nahi hai.

## Verification status
- Python `compileall` syntax check: PASS.
- ZIP integrity: verify kiya jana hai release ke waqt.
- Django/database test suite: is environment mein Django installed nahi hai, isliye run nahi hua.
- Production / real-money certification: nahi ki gayi. Deployment par database-backed tests aur accounting reconciliation chalana zaroori hai.

## Safe testing reminder
Real customer data par apply karne se pehle database backup lo. `docker compose down -v` mat chalana; woh database volume delete kar sakta hai.
