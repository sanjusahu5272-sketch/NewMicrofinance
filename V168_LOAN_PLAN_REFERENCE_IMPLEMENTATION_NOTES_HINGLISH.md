# V168 Loan Plan reference-video implementation notes

Base: `NMFA_V168_FINAL_ALL_PAGES_STYLE_FIX.zip`

## Implemented in this update
- Loan Plan list columns reduced to Sr. No., Plan Name, Status, Action to match the visible reference list.
- `Task` menu actions: Update Plan, View Plan, Calculate EMI, Activate/Deactivate.
- Add/Update modal reorganized into two columns with the visible reference labels and teal header styling.
- Added persistent LoanProduct fields and migration `0033_loanproduct_reference_plan_fields.py` for Plan Amount, Paid Amount, Recovery Type, Holiday Exclude, GST Charge Include, File Charge Include/Amount, Processing Fee Include/Percentage, Insurance Fee Include/Type/Amount, and Advance Installment.
- Added a Calculate EMI modal that uses the existing server-side Decimal preview endpoint; it does not create a loan or ledger entry.
- Added serializer validation against negative amounts and made Paid Amount read-only for existing plans.
- Protected the new plan-term fields from silent edits after the plan has linked loans.

## Important financial boundary
The newly added fee toggles and fee fields are persisted as plan metadata. Their effect on the actual repayment schedule, disbursement deductions, GST posting, and accounting ledger has **not** been wired in this update because the video does not establish the required rate/accounting rules. Existing calculation logic is intentionally preserved instead of guessing at real-money behavior. `Paid Amount` is read-only but currently defaults to zero; it is not yet aggregated from customer payment records.

## Verification status
- Python source compilation: passed (`compileall`).
- ZIP archive integrity: passed (`unzip -t`).
- Django tests/migrations: not run; Django is not installed in this working environment.
- Frontend production build: not run; Vite dependencies are not installed and npm install timed out.
- Browser click-through / pixel comparison: not run.

Do not use the new fee fields as active financial rules until their calculation and ledger treatment are explicitly confirmed and tested.
