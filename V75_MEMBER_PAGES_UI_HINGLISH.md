# V75 — Member pages separation and UI continuity (Hinglish)

Base: V74 Dynamic Bank eNACH ZIP. Existing V67 visual theme and original style.css are preserved; only the Members sidebar/page routing and conditional display are changed.

## Included
- Members sidebar now has separate **Member List**, **New Member**, and **KYC Documents** pages.
- Member List shows the existing search, branch/status filters, table, pagination, status controls, and Edit actions without placing the full registration form above it.
- New Member shows the registration/edit form without duplicating the table underneath.
- Editing a member from the list navigates to New Member with the selected record; Cancel Edit returns to Member List.
- KYC stays on its own existing page. Individual personal lending only; no Group Loan navigation was added.

## Verification limits
- ZIP integrity and source-level assertions are checked by packaging script.
- This environment has no installed Vite executable or Django dependency from V74 test results; production build, migrations, API tests, and browser screenshot comparison still need to be run on the target PC. This package does not claim those suites passed.

- Loan Case search criteria expanded with Designation, Staff Type and Select Type filters while retaining Branch, Staff, City, date and Payment Status filters.
- Loan Case table now includes ADV EMI, Dues, Advance and Prev Status columns. These use fields returned by the API where present and safe zero/status fallbacks where optional data is absent; validate backend field semantics against your live data.
- Existing Print and CSV download actions retained.
