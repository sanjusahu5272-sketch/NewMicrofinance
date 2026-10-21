# V70 — Role & Permission Update (Hinglish)

## Is version mein
- Settings ke andar existing overall sidebar/theme/layout ko redesign kiye bina `Role List` aur `Permission List` submenu entries add ki gayi hain.
- Dono entries existing staff account/permission management screen ko open karti hain, heading aur helper text selected submenu ke hisaab se badalte hain.
- Existing staff role choices, branch assignment, active/inactive status, per-feature checkboxes, API save/update flow aur current backend permission enforcement ko preserve kiya gaya hai.
- Group Loan add nahi kiya gaya.

## Important limitation
Ye V70 abhi dedicated database-backed custom Role CRUD aur separate Role-to-Permission matrix implement nahi karta. Roles abhi existing `StaffProfile` fixed role choices hain; permissions staff account ke `permissions` JSON field mein stored hain. Existing backend code mein superuser-only staff management aur feature permission checks maujood hain, lekin full endpoint-by-endpoint security audit/branch isolation verify nahi hua.

## Verification
- ZIP integrity checked after packaging.
- JSX/build, Django tests, migrations aur API integration tests is pass mein run nahi kiye gaye. Isliye production-ready claim nahi hai.
