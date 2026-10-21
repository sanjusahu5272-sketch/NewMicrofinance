# V161 — Demo (Micro Muneem) dashboard UI match

- Sirf CSS change: `frontend/src/reference.css` ke end me "V161" block add kiya gaya.
- `frontend/index.html` me Poppins + Source Sans Pro Google Fonts link add kiya.
- Sidebar menu (`.rfSide`, `.rfNav`) aur top bar (`.rfTop`) ko touch NAHI kiya gaya.
- Dashboard content (ticker, Short Keys, Branch, clock card, balance boxes, stat tiles, Collection/Disbursement tables) ko demo ke measured styles se match kiya: rounded cards (10px), grey glow shadow, 80x60 short-key buttons, 90px balance icon block, colours (#0e8c0e, #ec1c22, #003c60, #a300ff), badge colours, Poppins font.
- Short Keys: icons ka squish (height 10px) fix, 22px white icons, Settlement ke liye demo wala archive icon (RF_FA me "archive" add, RF_SHORT_KEYS me ek icon-name change).
- JSX, API, permissions, calculations me koi change nahi.
- Dashboard ke neeche naye sections add: Profit-Loss, Settlement Record, Loan Record, Pending Records, Recent Members, Loan Records (doughnut), Overview (pie). Demo ka layout (3+3+6 / 6+6 / 6+6), mobile par single column.
- Sab data existing `/dashboard/` API se: `interest_income`+`penalty_collected` (Total Income), `expenses`, `settlement_due_amount`, `settlement_paid_amount`, `active_loans`, `complete_loans`, `settled_loans`, `principal_outstanding`, `pending_emi_today`, `pending_emi_amount_today`, `overdue_emi_count`, `periods.collection_pending.total`, `members`, `recent_members`. Backend me koi change nahi.
- Charts plain SVG (`RfPie`), koi nayi npm library nahi.
- NOTE: demo ka "Total Income" ka formula pata nahi; yahan Total Income = interest + penalty collected rakha hai. Alag formula chahiye to `Dashboard` me "Profit-Loss" panel me ek line badalni hai.
- Sidebar menu (screenshot ke hisaab se): order Dashboard, Master, Product Master, HRM, Members, Apply For Loan, Disbursement, Loan Summary, EMI Records, Approvals, Loan Case, CIBIL Format Download, Area Survey, Log Records, Loan History; headers ACCOUNTING (Voucher, Fund Transfer, ACGroup, Profit-Loss, Overview, Ledger, Branch Ledger), REPORTING, PERMISSION; coloured icons; user panel (naam + DEGN).
- Aapke extra modules (Accounts extras, Operations, Payments, Settings) "MORE" header ke neeche rakhe taaki koi page unreachable na ho.
- Product Master me abhi sirf "Product Loan" (baaki product pages project me nahi hain). "Loan History" -> Loans page, "Log Records" -> Audit Logs page. Group Loan abhi bhi nahi jodi.
- Sab menu permission-lock pehle jaisa; RF_NAV ke andar tab/label sirf regroup hue.
