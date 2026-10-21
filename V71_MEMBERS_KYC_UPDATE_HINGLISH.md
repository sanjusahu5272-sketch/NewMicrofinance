# V71 Members & KYC Update (Hinglish)

Base: NMFA V70 Role & Permission Enforcement. Existing dashboard/sidebar/theme CSS were not intentionally redesigned.

Changes:
- Member API now supports search/q across member name, member number, phone, email, and address.
- Member API supports active/inactive status filter, branch filter, and field_officer filter.
- KYC document API supports filtering by member, document type, status (pending/verified/rejected), and search.
- Added explicit POST actions `/api/kyc-documents/<id>/verify/` and `/api/kyc-documents/<id>/reject/`.
- KYC review actions require staff/admin or an active staff profile with `verify_kyc`/`kyc_verify` permission; reject requires a reason of at least five characters.
- KYC review actions write audit log entries. Rejected status is represented using the existing schema (`verified=False`, `verification_note` prefixed `REJECTED:`), so no model migration was needed.
- Frontend KYC verification handler was updated to call the explicit review endpoint when its matching handler was found.
- Existing KYC private download endpoint remains authenticated; public file URLs are not exposed.

Verification:
- ZIP integrity check is performed after creation.
- Django tests and frontend production build were not run in this environment. Treat as an integration candidate, not production-certified.
- Test on a staging database and confirm `customer_kyc_mandatory` blocks disbursement until both identity and address documents are verified.
