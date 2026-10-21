# NMFA V27 PC update guide (Hinglish)

## Existing PC setup (the case from this conversation)
1. Keep your existing working folder and database volume. Do not delete either.
2. Extract this ZIP into a separate folder first. Copy the **source files** from `nmfa_full_audit/src/NMFA_Production_v3` into the existing project folder and approve source-file replacement prompts. Keep the actual `.env` and `backend/.env` files from the existing working project.
3. Confirm both config files use the same `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` values. Don't paste passwords into screenshots.
4. In CMD inside the existing `NMFA_Production_v3` folder, run:
   ```cmd
   docker compose up --build -d
   docker compose ps
   docker compose logs --tail=80 backend
   ```
5. Refresh `http://localhost:5173` with `Ctrl+F5` and log in with your real superuser credentials.
6. For the approval error from the screenshot, open **Members / Customers → KYC Documents**, choose the same customer, and confirm one uploaded document type is specifically **Aadhaar Card**, **PAN Card**, **Other Identity Proof**, **Voter ID**, **Driving Licence**, or **Passport**; verify it. Also verify a separate **Address Proof** or **Utility Bill** row. Your screenshot listed verified Signature, Income, Photo and Address, but no verified identity row; those other types do not satisfy identity KYC.
7. Admin staff creation/permissions are under **Settings → Role & Permissions**. A staff login needs a password at least 12 characters long. Use a testing account first.
8. Loan foreclosure is available from a disbursed loan row via **Foreclose**. It collects the quote displayed by API: remaining scheduled principal + interest + unpaid penalty, with no future-interest discount. Test only with dummy records.

## Admin login creation (if not already created)
```cmd
docker compose exec backend python manage.py createsuperuser
```
At `Username (Leave blank to use 'root'):` type `admin` and press Enter. If you already pressed Enter with no username, it uses `root`. Password characters do not appear while typing; that is normal. Use a known password and confirm it at the second prompt.

## Safety
- Do not run `docker compose down -v`, remove `pgdata`, or delete volumes to troubleshoot; that deletes local database data.
- SMS/WhatsApp/payment-provider settings require provider-specific implementation and sandbox testing before they actually send/charge money.
- This is an updated test source. Django tests and production build have not been executed in this environment; run the tests from the bundled PC guide before relying on it.
