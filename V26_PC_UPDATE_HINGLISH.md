# NMFA V26 update on the existing PC project (Hinglish)

This update targets the existing folder `D:\NMFA_New\nmfa_full_audit\src\NMFA_Production_v3`.

1. Keep the existing root `.env` and `backend\.env` files. The ZIP intentionally does not contain those live config files.
2. Extract this ZIP into `D:\NMFA_New` and approve overwrite/merge prompts for matching project source files. Do not delete the project folder or any Docker volume.
3. Open CMD and run:

   `cd /d D:\NMFA_New\nmfa_full_audit\src\NMFA_Production_v3`

   `docker compose up --build -d`

   `docker compose logs --tail=80 backend`

4. Check that migrations include `finance.0009_expand_kyc_document_types` and `finance.0010_staff_profile`, and that Gunicorn is listening without a database error.
5. Refresh `http://localhost:5173` with Ctrl+F5, then sign in with the real username/password. A failed `/api/token/` request still means the login credentials were rejected.
6. In KYC Documents, ensure the selected member has a verified row whose type is Aadhaar Card, PAN Card, Other Identity Proof, Voter ID, Driving Licence, or Passport, plus a separately verified Address Proof or Utility Bill. Signature/photo/income alone do not satisfy identity KYC.
7. Try loan application approval once and read the exact API alert if it fails. Do not repeatedly click Approve; check the reason before retrying.

Never run `docker compose down -v` or remove the `pgdata` volume to solve this issue; that can delete your database.

This is a local demo/test update, not a production-readiness certificate.
