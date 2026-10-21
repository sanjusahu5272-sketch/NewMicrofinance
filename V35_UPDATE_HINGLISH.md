# NMFA V35 Update

Is update ka focus 16-point screenshot tracker ko source ke saath consolidate karna aur Member form ke practical gaps fix karna hai.

- Member form mein Branch, Branch Manager aur Field Officer dropdowns.
- Selected branch ke employees hi assignment dropdowns mein dikhte hain.
- Customer passport-size photo upload, preview aur remove.
- Member register mein assigned branch, manager, field officer aur status visible.
- Backend assignment validation: manager/field officer ko selected branch ka hi hona chahiye; role designation bhi match hona chahiye.
- Regression test add kiya for cross-branch / wrong-role assignment.
- Disbursement popup, Cash/Bank selection, confirmation and result popup V34 se retained.

`V35_16_IMPROVEMENTS_TRACKER_HINGLISH.md` mein saare 16 consolidated points aur unki verification status hai. Django tests aur Vite build is environment mein run nahi kiye gaye.
