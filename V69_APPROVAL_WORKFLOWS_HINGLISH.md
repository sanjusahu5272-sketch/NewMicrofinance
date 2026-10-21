# V69 — Approval Menu & Functional Workflows (Hinglish)

## Kya add/update hua
V68 source ko base rakha gaya hai. Existing UI CSS files `frontend/src/style.css` aur `frontend/src/reference.css` ko change nahi kiya; `frontend/src/main.jsx` me existing design system ke andar Approval group, routes aur approval queue pages add kiye.

Sidebar me **Approvals** menu ke neeche ye 6 submenus hain:
1. Loan
2. Salary
3. Collection
4. Product Loan
5. Settlement
6. Fund Transfer

Har page me pending queue, all-status register toggle, search, page-size/pagination, approve/reject buttons aur API se error feedback hai. New decision ke baad list refresh hoti hai. Group Loan workflow add nahi kiya.

## Har submenu ka logic

### 1. Approval — Loan
- Pending personal-loan applications list hoti hain.
- Approval se ek Loan record create hota hai; disbursement separate menu/workflow me rehta hai.
- Member active, plan active, duplicate pending application, verified identity/address KYC (setting on hone par), allowed approved amount aur product ke available income limit ko check kiya jata hai.
- Application creator apni application approve/reject nahi kar sakta. Decision transaction ke andar save hota hai; repeat approval existing loan return karta hai, duplicate loan create nahi karta.
- Rejection reason kam-se-kam 5 characters ka hona chahiye. Optional approval note audit log me store hota hai.
- Related safety correction: insufficient cash/bank balance par disbursement reject hone se pehle ab installments/loan status mutate nahi hote; regression assertion add ki gayi hai.

### 2. Approval — Salary
- Payroll create hone par **Draft** rehta hai.
- Dusra authorized user approve/reject karta hai; creator self-approve nahi kar sakta.
- Approval/rejection note, user/time aur audit log store hote hain; repeated decision reject hota hai.
- Approval salary payout nahi hai. Payout aur salary ledger posting ko jaan-boojhkar fabricate nahi kiya gaya, kyunki is source me complete audited salary-disbursement workflow available nahi tha.

### 3. Approval — Collection
- Collection ko pending approval ke roop me queue me bheja ja sakta hai.
- Approval se pehle installment allocation ya ledger posting nahi hoti.
- Approval par loan/installments lock kiye jate hain; sirf **Disbursed** loan ki current dues par amount allocate hota hai. Order: penalty → interest → principal. Outstanding se zyada amount reject hota hai.
- Collection ke accounting entries balanced debit/credit pairs hain; status decision, approval user/time/note aur audit entry persist hote hain. Double approval se dobara posting nahi hoti.
- Normal `StaffProfile` users API me `status=success` bhej kar queue bypass nahi kar sakte. `auto_approve_member_collection` setting enabled ho to configured auto-approval apply hota hai. Legacy Django staff/superuser accounts trusted administrator-level accounts ki tarah treat hote hain.
- EMI collection ke liye specific loan required hai. Extra/advance amount ko is flow me over-allocate nahi kiya jata.

### 4. Approval — Product Loan
- Product name, quantity, unit price, down payment, tenure aur purpose ke saath request submit hoti hai.
- Financed amount server-side `quantity × unit price − down payment` calculate karta hai. Negative/zero financed amount, invalid quantity/tenure, inactive member aur required KYC ki checks hoti hain.
- Maker-checker, decision note/time aur audit log included hain.
- **Important boundary:** approval only request approve karta hai; cash disbursement, interest, fees ya repayment schedule create nahi karta. Is source mein product financing ke liye authoritative pricing/repayment formula defined nahi thi, isliye koi formula guess nahi kiya.

### 5. Approval — Settlement
- Existing settlement proposal ka outstanding snapshot, proposed amount aur discount dikhaya jata hai.
- Only pending case approve/reject ho sakta hai; creator self-approve nahi kar sakta; rejection reason required hai; row lock/transaction double-decision ko rokta hai.
- Approval collection ya loan closure nahi karta. Actual settlement receipt record aur outstanding reconciliation alag step hai.

### 6. Approval — Fund Transfer
- From account, to account, date, amount, reference aur remarks ke saath request submit hoti hai.
- Source/destination same nahi ho sakte; reference duplicates aur insufficient source book balance block kiye jate hain.
- Approval par ek balanced debit/credit pair post hota hai; request status aur approver audit hote hain. Repeat approval/posting block hota hai.
- Source ledger ke opening/current entries sahi honi chahiye; account-name-based ledger structure ki wajah se initial account setup aur real bank reconciliation ki review zaroori hai.

## Database / files
- Migration: `backend/finance/migrations/0023_approval_workflows.py`
- API routes: `/api/applications/`, `/api/payroll/`, `/api/payments/`, `/api/product-loan-requests/`, `/api/settlements/`, `/api/fund-transfer-requests/` (approval actions use `/<id>/approve/` and `/<id>/reject/` where supported).
- New model records: `ProductLoanRequest`, `FundsTransferRequest`. Payment and payroll models now store approval identity/time/note; payment also tracks creator.
- Backend tests added for maker-checker, pending collection posting, product-loan approval boundary, fund-transfer accounting and salary approval.

## Verification status — sachchi report
- Python `compileall` / `py_compile`: **passed** (syntax compilation only).
- React JSX TypeScript transpile parse: **passed; 0 diagnostics**. This is a syntax parse, not a full Vite production build.
- Django API tests: **not run** because current environment does not have Django installed (`ModuleNotFoundError: No module named 'django'`).
- Vite build: **not run** because `frontend/node_modules` are not installed and Docker is unavailable in this environment.
- PostgreSQL migration/runtime, concurrent-approval behavior, browser rendering and full financial reconciliation therefore remain unverified here. This is a development increment, **not production certification**.

## Windows/Docker PC verification
1. Backup your existing project/database before copying code or running migrations.
2. In project root, run `docker compose up --build -d` if your local Docker environment is configured.
3. Run `docker compose exec backend python manage.py migrate`.
4. Run `docker compose exec backend python manage.py test finance.tests`.
5. Open frontend and test each submenu with separate creator/approver accounts. Specifically test maker cannot approve own record, reviewer can approve it, second approval adds no extra journal lines, and low-balance transfer is rejected.
6. Inspect the actual ledger and audit log before using any real-money workflow.

Do not use `docker compose down -v` on a database containing real data; that can delete the database volume. Use a backup and a staging copy before migrations.
