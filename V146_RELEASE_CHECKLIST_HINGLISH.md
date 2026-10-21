# V146 Release Checklist (Hinglish)

1. Dashboard V66 component ko freeze rakha gaya hai; uske component code mein V145 se koi difference nahi hai.
2. V146 migration sirf nayi operational tables banati hai; existing loan/payment/journal rows update nahi karti.
3. Pehle staging database backup lo aur restore verify karo.
4. Staging par `python manage.py check`, `python manage.py showmigrations finance`, `python manage.py migrate --plan`, `python manage.py migrate`, `python manage.py test finance` chalao.
5. Frontend mein `npm ci` aur `npm run build` chalao.
6. New permissions admin se assign karo: household assessment view/manage/verify; complaints view/manage/resolve (currently view/manage keys); field visits view/manage; cash handovers view/manage/approve.
7. Cross-branch and branch-isolation tests, maker-checker tests, complaint resolution note tests, and cash-handover duplicate tests staging mein verify karo.
8. V146 ko live customer funds ke liye production-ready/certified na maano jab tak remaining P0 accounting, reconciliation, security, backup/restore and external review gates pass na ho.
