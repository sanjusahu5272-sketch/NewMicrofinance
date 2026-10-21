# V138 Master Menu Fix Notes

Base: V137 (V66 dashboard + V119 sidebar structure)

## Changes
- Kept the V66 `Dashboard` component byte-for-byte unchanged.
- Connected all 19 V119 Master submenu entries to their corresponding existing frontend workflows: Loan Plan, Penalty Scheme, Branches, Branch Login, Staff Branch, New Staff, Loan Purpose, State, Bank, Leave, Designation, Relationship Master, Document Type, Collection Mode, Miscellaneous, Software Timing, Session, Setting, and SMS Testing.
- Restored the V119 master workflow components that were missing from V137's page routing.
- Added the V119 master-only styles additively; dashboard styles were not replaced.
- Menu entries are now visible even when a user lacks permission; unauthorized entries are disabled and marked with a lock. Navigation permission checks remain in place.
- Static checks: JSX parse passed; 14 top-level menu entries and 91 submenu entries found; all 19 Master submenu routes mapped.

## Not claimed as verified
- A full Vite production build/browser click-through was not run in this environment.
- Non-Master menu entries that were already placeholders in V137 are not all implemented by this focused Master-menu patch.
- No backend files, database volumes, credentials, or migrations were changed.
