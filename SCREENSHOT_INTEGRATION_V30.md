# V30 — Screenshot review and printable loan forms

This update adds two print actions to the existing UI:

1. **Loan Applications → Print Application / Sign**: opens an A4 print-friendly form populated from the saved application plus available member and loan-product API data. It includes a declaration and applicant signature/thumb impression, loan officer, witness (if applicable), and authorized-officer signature lines.
2. **Loans → Print EMI Card**: retrieves the saved loan schedule, member and product, then opens an A4 print-friendly EMI card with installment due, principal, interest, penalty, total, received amount, and signature/receipt blanks.

Also made member/product/amount required for a new application and added an application notes field.

## Known limitations
- This is a first integration pass based on the 55 camera-photo screenshots, not an exact clone of the reference software.
- The current data model does not yet contain every reference form field (notably detailed bank data, spouse/family details, photo/signature, and the full HR/payroll data set). The print form cannot auto-fill data that NMFA does not store. Add these through reviewed model changes + migrations + tests in a subsequent step.
- No claim is made that Aadhaar/PAN verification or SMS OTP is live. Those require an authorized provider and credentials.
- `npm run build` was not run because dependencies are not installed in this environment. Django/PostgreSQL tests were not run here either.
- Review printout wording and terms with the organization's approved forms/legal counsel before using with real borrowers. Application form is not itself a sanction letter or signed loan agreement.

See `SCREENSHOT_AUDIT_CAMERA55.md` for the screenshot-by-screenshot visual inventory and remaining gaps.
