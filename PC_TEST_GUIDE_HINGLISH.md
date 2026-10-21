# NMFA PC Test Guide (Windows, Hinglish)

## Fresh test setup
1. Install/start Docker Desktop with Linux containers enabled.
2. Extract the ZIP into a simple folder, for example `D:\NMFA_Test`; open the directory that contains `docker-compose.yml`, `backend`, `frontend`, and `scripts`.
3. Open PowerShell in that folder.
4. Run:
   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass
   .\scripts\start-pc-test.ps1
   ```
   The script creates local `.env` files from examples only if they are missing, checks DB settings match, and starts the stack.
5. Create an administrator only if you do not already have an account:
   ```powershell
   docker compose exec backend python manage.py createsuperuser
   ```
   Type a username (do not press Enter blank unless you want username `root`), email, and password. Password ke characters terminal mein nahi dikhte—ye normal hai.
6. Open `http://localhost:5173`, log in with that username/password. Django admin: `http://localhost:5173/admin/`.

## Update your existing NMFA demo safely
- First extract the new ZIP into a separate directory.
- Copy only the code/source files from its `nmfa_full_audit/src/NMFA_Production_v3` project into your existing `NMFA_Production_v3` directory and allow source replacements.
- Keep your current root `.env`, `backend/.env`, and existing Docker `pgdata` volume. Never replace env files blindly; both must match the database that was already initialized. Your existing demo setup in this conversation uses database/user `nmfa_db` / `nmfa_user`; check your actual files before editing.
- Do not run `docker compose down -v`, delete Docker volumes, or delete the old project while diagnosing a startup error.
- From the existing project root:
  ```cmd
  docker compose up --build -d
  docker compose ps
  docker compose logs --tail=80 backend
  ```
- Refresh the site with `Ctrl+F5`.

## Test customer, KYC and loan approval
1. Add/select a dummy customer in **Members / Customers**.
2. In **KYC Documents**, choose that same customer ID/member and upload documents with the correct type.
3. Mark identity proof **Verified** (Aadhaar, PAN, Other Identity Proof, Voter ID, Driving Licence or Passport) and separately mark Address Proof/Utility Bill **Verified**. Photo, signature and income documents do not satisfy identity KYC.
4. Return to **Loan Applications** and attempt approval. If it fails, copy the on-screen `detail` message and run `docker compose logs --tail=80 backend`; do not upload the same files over and over or bypass KYC checks.
5. Test application → approval → disbursement → schedule → payments/receipt only on dummy records.
6. Test **Settings → Role & Permissions** by creating a temporary staff user with narrowly scoped permissions, then verify both allowed and denied actions.
7. Test foreclosure only on a dummy disbursed loan. It uses remaining scheduled principal + interest + penalty and currently gives no future-interest discount.

## Run backend tests
```powershell
.\scripts\test-pc.ps1
```
Or manually:
```powershell
docker compose exec backend python manage.py check
docker compose exec backend python manage.py makemigrations --check --dry-run
docker compose exec backend python manage.py test finance
```

## Limitations
- This is a test package, not proven production-ready. Run all tests above on the PC and keep the result/error output.
- Live Razorpay/Cashfree, SMS/WhatsApp and email delivery are not enabled just by entering credentials; provider APIs, webhooks, permissions, templates and sandbox tests remain to be completed.
- Complete branch-by-branch accounting/report data isolation and comprehensive reversal/reconciliation flows still need work.
- No real customer Aadhaar/PAN/bank data or live-money transactions until the software receives appropriate security, operational, accounting and legal review.
