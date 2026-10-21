# V124 Admin Branch Balance & Shortcut 3D

- Dashboard ka purana ALL BRANCH FINANCIAL SUMMARY table hata diya.
- Organization-admin ke liye alag Branch Cash & Bank Position panel add kiya; branch filter bhi admin-only render hota hai.
- Existing dashboard shortcut icons/targets preserve kiye; buttons ko bolder raised 3D treatment diya aur red `#ec1c22` preserve kiya.
- Important financial limitation: current JournalEntry model mein branch foreign key nahi hai. Isliye per-branch cash/bank amounts ko fabricate nahi kiya; panel `Not allocated` dikhata hai jab tak ledger branch-tagging aur reconciliation implement na ho. Overall company cash/bank total existing accounting calculation se hi aata hai.
- No database model or migration changes in this UI-only update.
