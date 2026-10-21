# V81 — Settlement approval safety

- Settlement approval now locks the linked loan row and rechecks current scheduled outstanding.
- It refuses approval if the member is inactive, the loan is not active/disbursed (or restructured), no balance remains, the outstanding changed after the request, or the proposed amount is invalid.
- A stale settlement returns HTTP 409 and asks staff to recreate it against the current balance rather than silently approving a stale discount.
- This does not collect settlement funds, forgive discounted balances in accounting, or close the loan. Those operations need an explicitly configured settlement write-off/account mapping and payment workflow.
- Python AST syntax checks passed. Django tests and frontend build were not run.
