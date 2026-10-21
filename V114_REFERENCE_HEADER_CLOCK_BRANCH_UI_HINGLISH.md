# V114 – Reference-inspired dashboard header and clock/branch boxes

- Preserved the existing NMFA sidebar, pages, dashboard metrics, shortcut labels, targets, and semantic status colours.
- Added a compact financial-session badge in the top header.
- Styled the existing Day Book, Cash Book, and Voucher Entries header links as raised compact buttons with icons.
- Kept the existing live clock and placed it in a bordered premium card beside a Branch selector populated from `/branches/`.
- The branch selector remembers its UI selection in localStorage; it is a display/navigation control only and does not claim to filter or change financial data scope.
- Existing red, green, navy, and purple elements retain their assigned semantic colours; added subtle borders, rounded corners, and shadows.

Verification: source edits completed. Frontend production build was not verified in this environment because `npm install` timed out. Run the Docker build on the user's machine and inspect browser behavior before treating this as production-ready.
