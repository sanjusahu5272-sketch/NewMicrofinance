# V41 — SMS Settings

Added a dedicated SMS Settings page matching the supplied reference: two-column Active/Inactive selectors, EMI reminder days (1–90), green SAVE PROFILE and red CANCEL buttons, confirmation dialog before save/discard, success and error dialogs.

Backend endpoint: `GET/POST /api/settings/sms/`. Values are persisted using the existing IntegrationSetting model and writes are audit-logged. SMS provider credentials remain configured separately under General Settings → SMS Gateway.

Verification performed: Python syntax compilation and ZIP integrity. Frontend production build and full Django runtime/API tests were not run in this environment. SMS delivery itself still depends on valid gateway credentials and an actual event-sending workflow.
