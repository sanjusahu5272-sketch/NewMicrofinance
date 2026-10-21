# NMFA V34 — UI and Member Assignment Update

## Is release mein kiye gaye code changes

1. **Disbursement popup**: screenshot-inspired cyan header, two-column fields, disbursement date, EMI start date, ledger selection (Bank A/C or Cash), optional reference, green Disbursement button, red Cancel button.
2. **Confirmation and result dialog**: disbursement se pehle confirmation; successful operation par success box; API error par error box. Yeh dialogs disbursement workflow par implemented hain, abhi har app action par globally nahi.
3. **Separate EMI start date**: backend disbursement endpoint ab `emi_start_date` accept karta hai. Installment schedule isi date se start hota hai; disbursement accounting date alag record hoti hai.
4. **Member assignment fields**: Member model mein optional Branch Manager employee relation aur passport-size photo field add kiye gaye. Field Officer relation pehle se tha. Migration `0013_member_assignment_photo.py` included.
5. **Passport-size photo input**: member form mein JPG/PNG/WebP upload aur preview; client size limit 1.5 MB. API serializer also validates data URL, file signature and size.
6. **Master active/inactive controls** and screenshot-style sidebar/settings from V33 are retained.

## Update / run

- ZIP ko nayi folder mein extract karein; existing working folder ka backup rakhein.
- Docker Compose project folder mein:
  `docker compose up -d --build`
  `docker compose exec backend python manage.py migrate`
- Existing PostgreSQL volume delete/reset **na karein**; migration member ke optional fields add karti hai.
- Frontend container build dependency install karta hai. Agar direct local run kar rahe hain to `frontend` folder mein `npm install` phir `npm run build`.

## Verification status

- Python syntax compilation for changed backend files: passed.
- Added Django test for selected EMI start date and cash ledger; **Django test suite was not executed here** because this environment did not have the frontend dependencies installed and a configured project database/runtime was not available.
- `npm run build` attempted, but could not run because `vite` is not installed in this environment.
- No claim is made that all screenshot features, all staff permissions, or production payment/SMS integrations are fully implemented or production-certified. The requested changes are incremental; verify in your Docker PC environment before using live-money data.
