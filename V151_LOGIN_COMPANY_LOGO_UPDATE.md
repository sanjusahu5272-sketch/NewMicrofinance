# V151 Login Company Logo Update

- Login branding now reads the saved company name and subtitle from organization profile values already stored by the application.
- If a company logo is configured in Company Profile & Logo, login displays that logo instead of a large rupee symbol.
- If no logo is configured in the browser yet, a neutral NMFA initials badge is shown; no logo from the reference screenshot is copied.
- Authentication request remains the existing username/password `/api/token/` flow. No new email/mobile authentication backend is claimed.
- Dashboard component and existing menu/module code are unchanged from V150; only login branding styles and Login component were edited, plus version notes.
- Validation performed: ZIP integrity and source checks. Full frontend build/browser testing and Django tests have not been run in this environment.
