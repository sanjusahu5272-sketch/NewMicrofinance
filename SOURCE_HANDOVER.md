# NMFA Personal Loan Management Software — Source Handover

This archive contains the current complete project source tree for PC testing: backend, frontend, migrations, scripts, Docker configuration, sample environment files, and project/QA notes.

## Start on Windows PC
1. Extract this ZIP to a normal folder (avoid running from inside the ZIP).
2. Read `PC_TEST_GUIDE_HINGLISH.md` first.
3. Copy `backend/.env.example` to `backend/.env` and set strong local development values as described in the guide.
4. Ensure Docker Desktop is installed and running if using the Docker path.
5. Follow the exact commands in `scripts/start-pc-test.ps1` / `scripts/test-pc.ps1` and the PC guide.

## Important
- This is a source-code handover for local testing, not a claim of production certification.
- Do not connect real customers, real funds, or production credentials until the app has been installed and its tests and workflows have been verified on your PC.
- Provider-specific SMS/WhatsApp/payment gateway credentials must be configured separately; sample environment files do not contain live secrets.
- Check `FIX_AUDIT_V24.md` and `MASTER_COMPLETION_ROADMAP.md` for known gaps and limitations.
