# V26 KYC & Authentication Fix Audit

## Fixes in this revision

1. **KYC identity type mapping:** Loan approval and disbursement now treat verified `identity`, `aadhaar`, `pan`, `voter_id`, `driving_license`, and `passport` records as identity evidence. Address still requires a separately verified `address` or `utility_bill` record. A document must have `verified=True`; this does not bypass document verification.
2. **Clearer KYC errors:** API response identifies which verified category is missing and which identity types are accepted.
3. **JWT refresh rotation:** The frontend now stores replacement refresh tokens returned by SimpleJWT. The first 401 on an authenticated API request can refresh and retry once; concurrent 401s share one refresh attempt. If refresh fails, local auth is cleared.
4. **Signed-in label:** Header shows the username used at login rather than a hard-coded `admin · Administrator` label.
5. **Migration graph:** KYC choice migration is `0009_expand_kyc_document_types`; staff profile model migration has been sequenced as `0010_staff_profile` and depends on 0009, removing the duplicate 0009 migration number in the earlier staff-role bundle.
6. **Regression tests:** Added tests proving that verified Aadhaar and PAN can satisfy the identity requirement; existing tests still require verified identity plus address.

## Important interpretation of the supplied screenshot

The screenshot's visible KYC table showed verified `Signature`, `Income`, `Photo`, and `Address` records, but no row with an identity document type. This revision supports Aadhaar/PAN and the other named identity document types when verified. After deploying this source, make sure the customer's KYC table actually contains a verified `Aadhaar Card`, `PAN Card`, or `Other Identity Proof` row. A photo/signature/income record does not count as identity proof.

## Verification limits

- Python source compilation and ZIP integrity can be checked in the packaging environment.
- Django test execution requires Django and the project's PostgreSQL test environment. This packaging environment does not have Django installed, so application tests were not executed here.
- Frontend production build and browser/API integration must be verified on the PC through Docker.
- `/api/token/` 401 log lines mean a login attempt was rejected; correct username/password is still required. The refresh change applies to already-authenticated API calls with an expired access token and a valid refresh token.
- Do not use real customer KYC or real-money operations until all tests, permissions, accounting, backups, and recovery flows have been verified.
