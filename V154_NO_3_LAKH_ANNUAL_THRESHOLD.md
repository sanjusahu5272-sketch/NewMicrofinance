# V154 — Remove ₹3 lakh annual-income threshold

- Removed the annual household income ₹300,000 condition from the approval-time 50% repayment-obligation check.
- The check now blocks approval whenever recorded existing plus proposed monthly household loan obligations exceed 50% of recorded monthly household income.
- Dashboard, Short Keys, menus, loan records, and database schema are not intentionally changed by this patch.
- Important: verify whether this rule should apply to every product offered by the lender with its compliance officer before production. The proposed monthly obligation is still taken from the assessment; it is not yet independently recalculated from the final approved loan schedule.
- Validation available here: Python syntax compilation and ZIP integrity only. Django tests, migrations/runtime, PostgreSQL and browser tests were not run.
