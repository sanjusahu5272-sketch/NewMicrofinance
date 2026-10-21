# V31 UI / Navigation / Branding update

## Changes made in this source
- Sidebar sections are now expandable/collapsible (including MASTER and HRM), rather than showing every submenu permanently.
- Expanded/collapsed section state is remembered in the current browser.
- Sidebar collapsed mode hides labels while retaining menu icons.
- Added `Company Profile & Logo` page with editable company name, subtitle, contact, email, website, address and logo preview/upload.
- Logo upload is limited to image files up to 1.5 MB and is stored in this browser's localStorage.
- Top bar branding updates after saving the company profile.
- Printable Loan Application Form and EMI Card now read the local company name, subtitle, logo, address, phone and email for the print header.
- Added styles for reference-style expandable navigation, logo preview and print logo.

## Important limitations
- Company profile is currently browser-local, not a server-wide database setting. It does not automatically sync to other staff PCs.
- The new profile form does not replace the encrypted provider integration settings page.
- The 55 screenshot inventory and previously implemented print forms are included in this source package. Not every visible reference module has a complete backend workflow yet; see `SCREENSHOT_AUDIT_CAMERA55.md`, `MASTER_COMPLETION_ROADMAP.md`, and `IMPLEMENTATION_STATUS.md`.
- Aadhaar/PAN verification and OTP need an authorized provider; no fake verification is implemented.
- Frontend production build and Django/PostgreSQL tests were not run here. `npm install --offline` failed because dependencies were not cached and network access was unavailable. Do not treat this as production-certified.
