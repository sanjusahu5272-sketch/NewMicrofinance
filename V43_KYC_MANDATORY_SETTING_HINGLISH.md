# V43 — KYC Mandatory Active/Inactive Setting

- Added administrator-only KYC Settings page and API (`/api/settings/kyc/`).
- Active (default): verified identity and address documents are required before loan application approval and loan disbursement. Uploading a document alone does not mark it verified.
- Inactive: approval/disbursement no longer block on missing or unverified KYC. Uploaded files remain in the private KYC document store.
- The setting is persisted in the existing IntegrationSetting table; no schema migration is required.
- Changes are audit-logged.

Verification limits: Python syntax and ZIP integrity checks can be run locally. Frontend production build and full Django database/API tests must be run in the project Docker environment before live-money use. Disabling KYC does not waive applicable law, lender policy, or other due diligence obligations.
