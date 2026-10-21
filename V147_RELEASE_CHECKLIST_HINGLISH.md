# V147 Financial Safety Release Checklist (Hinglish)

1. V66 Dashboard component freeze hai; dashboard component code V145 se byte-for-byte same verify hua.
2. Migration `0030_journal_chart_account_mapping.py` `JournalEntry.account_ref` ko nullable `ChartOfAccount` FK ke roop mein add karti hai. Existing text account aur financial amounts preserve rehte hain.
3. Backfill sirf unique active exact case-insensitive account-name match par hota hai. Unmapped/ambiguous rows NULL rehte hain; fuzzy auto-mapping nahi hoti.
4. Manual balanced journal batch ab har line ke liye exactly one active Chart of Accounts mapping maangta hai. Unknown/ambiguous account par request reject hoti hai aur journal rows create nahi hote.
5. Legacy automated posting mein exact unique mapping milne par `account_ref` set hota hai. Missing mapping ko silently guess nahi kiya jata; unassigned lines ko audit command se review karo.
6. Read-only audit command: `python manage.py audit_unmapped_journal_accounts --limit 500`.
7. Staging backup lo, restore verify karo, phir `python manage.py check`, `python manage.py showmigrations finance`, `python manage.py migrate --plan`, `python manage.py migrate`, aur `python manage.py test finance` run karo.
8. Frontend build: `npm ci` aur `npm run build`. Dashboard desktop/mobile browser regression test karo.
9. Authoring environment mein Django installed nahi tha; isliye Django tests/migration apply nahi hue. Production readiness certify nahi hai.
10. Live real-money database par deploy tab tak mat karo jab tak staging tests, account mapping reconciliation, branch permission tests, bank reconciliation aur backup/restore drill pass na hon.
