# NMFA V35 — 16-point improvement tracker (Hinglish)

Ye tracker screenshot discussion ko consolidate karta hai. Requirement note hona aur production-ready verify hona alag baat hai; neeche har point ka current state clearly diya gaya hai.

1. Member record mein branch selection — existing branch field ko proper dropdown banaya.
2. Member-to-Field-Officer assignment — dropdown branch ke hisaab se filter hota hai; backend same-branch/role validation add ki.
3. Member-to-Branch-Manager assignment — branch-wise dropdown aur backend role/branch validation.
4. Member passport-size photo upload — JPG/PNG/WebP, max 1.5 MB, preview/remove option; backend image signature validation already present.
5. Member list mein photo, branch, manager aur field officer visible — added.
6. Master entries ke Active/Inactive controls — existing generic CRUD status controls; check each master API/UI in local testing.
7. Identity Proof, Relation, Purpose aur Reason master lists — screenshot se required; current build ka full dedicated editable master UI/API coverage verify karna baaki hai.
8. Company profile form — company name, logo/profile fields/settings existing sections; screenshot-level field parity verify karna baaki hai.
9. Favicon/logo upload and branding — existing brand settings; file upload/storage behaviour verify karna baaki hai.
10. SMS service/event toggles and reminder-day settings — integration settings exist; provider delivery/credentials configure aur test karna zaroori hai.
11. Screenshot-inspired sidebar typography, colours, icons and expandable groups — existing sidebar styles/navigation; exact pixel match claim nahi kiya ja raha.
12. Professional cyan-header modal layout, white body, two-column form — disbursement modal existing and retained.
13. Save/create/important-action confirmation popup — disbursement modal confirmation and member active/inactive confirmation.
14. Success/error popup after action — disbursement and member actions use modal result boxes; baaki forms mein kuch legacy alerts abhi ho sakte hain.
15. Loan disbursement date and EMI start date — existing disbursement modal fields.
16. Cash/Bank ledger selection, reference and duplicate-safe disbursement flow — existing backend disbursement workflow; UI selection is Cash/Bank A/C. Verify actual accounting entries and idempotency against local DB before real-money use.

## V35 code changes
- Replaced the generic member form with a purpose-built member form.
- Branch, branch manager and field officer are dropdowns; staff choices filter by selected branch.
- Added visible customer photo preview and member register columns for branch/manager/officer.
- Added server-side assignment validation and a regression test for cross-branch/wrong-role assignments.
- Retained the cyan/white disbursement modal and confirmation/success/error modal already present in V34.

## Verification status
- Source edits are included in this ZIP.
- Django test suite and Vite production build were not run in this environment; do not treat this ZIP as production-certified.
- Before live lending, verify staff roles/branch isolation, ledger entries, duplicate requests, backups/restore, and applicable regulatory/legal requirements with a qualified reviewer.
