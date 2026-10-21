# V63 - MicroMuneem reference dashboard (Group Loan nahi)

## Kya badla
- Naya sidebar: logo, ADMIN + role, Dashboard / Master / HRM / Members / Create Loan / Disbursement / Loan Summary / EMI Records (Paid EMIs, Due EMIs, Promise To Pay, Member Collection).
- Naya top bar: Day Book, Voucher Entries, Payment, Receipt, Contra, Journal, ADMIN, laal logout button.
- Naya dashboard: Short Keys (8 buttons, Group Loan hata diya), analog clock, 4 balance cards, 4 rang-birange stat cards, 4 tables (Today/Weekly/Monthly/Total).
- Backend `/api/dashboard/` me `periods` jodha (collection approved/pending, disbursement approved/pending).
- `/api/installments/?state=paid` aur `?state=due` filter jodha.
- Naya file: `frontend/src/reference.css` (sirf `rf*` classes, purane pages ko nahi chhedta).

## Abhi baaki (Phase 2)
- Promise To Pay aur Settlement: abhi sirf placeholder page, asli function banana baaki hai.
- Baaki pages (Members, Loan form, Disbursement, Day Book, Voucher...) ko reference screenshots se match karna baaki hai.

## Test (PC)
1. `docker compose up --build -d`
2. `docker compose exec backend python manage.py test finance`
3. `http://localhost:5173` kholo, login karke Dashboard dekho.
Note: yeh version authoring environment me npm build / Django tests ke bina bana hai (network band tha). JSX syntax check aur static preview render kiya gaya hai.
