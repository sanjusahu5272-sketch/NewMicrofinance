V96 UPDATE — REPORTING MENU

Base: NMFA V95_SUBMENU_FONT_MATCH

UI note: Existing CSS/layout/sidebar styling has not been redesigned. Added the following entries under the existing Reports sidebar group: Reporting, Loan Report, Due EMI Report, Collection Reporting, Disbursement Reporting, Settlement Reporting, Other Payment, Other Receipt. They use the existing permission system and existing Reports component.

Important verification note: This is a navigation/report landing-page wiring update, not a claim that each newly named report has its own distinct backend query/export. The accounting menu already present in V95 includes Fund Transfer, Branch Ledger, Ledger, ACGroup, Profit-Loss and Overview; these are still routed through the existing accounting register view and must be individually implemented/validated before real-money production use. Do not treat this ZIP as fully production-certified.

Verification: Static inspection only. Vite build and backend tests were not run in this environment.
