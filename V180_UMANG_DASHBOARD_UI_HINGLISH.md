# V180 - UMANG Dashboard UI (same-to-same) + NMFA backend

Dashboard ab wahi UI use karta hai jo approved design me tha (header, sidebar, short keys, clock, balance cards,
Collection/Disbursement tables, Profit-Loss, Loan Record, Recent Members, pie charts) aur data seedha
`/api/dashboard/` se aata hai. Backend (Django) me **koi change nahi** kiya gaya.

## Kya badla
| File | Change |
|---|---|
| `frontend/public/umang-ui/` (NEW) | UI ki files: `umang-shell.js`, `umang-ui.css`, `fonts.css`, `fonts/` (Poppins + Font Awesome 4.7), `img/` |
| `frontend/index.html` | 1 line: `<script src="/umang-ui/umang-shell.js">` |
| `frontend/src/main.jsx` | `Shell()` me naya `<umang-shell>` (purana shell fallback ke liye jas ka tas); `window.__UMANG_NAV__` export |

## Kaise kaam karta hai
- UI ek `<umang-shell>` web-component hai jo **Shadow DOM** me chalta hai. Isliye iska CSS baaki React pages ko
  nahi bigadta, aur unka CSS isko nahi bigadta.
- Sidebar menu project ke apne `RF_NAV` se banta hai (wahi tabs, wahi permissions). Jis tab ki permission nahi hai
  wo halka dikhta hai + lock icon, aur click nahi hota.
- Dashboard tab par naya dashboard dikhta hai. Koi bhi menu / short key / More info click karne par existing
  `nmfa-open-tab` event se wahi React page khulta hai (Members, Loans, ...). Un pages ke andar ka design same rehta hai.
- Login, token refresh, logout: React ke existing `api()` se hi hote hain (alag se kuch nahi).
- Branch select -> `/api/dashboard/?branch=<id>`; list `/api/branches/` se.
- Data 60 sec me auto-refresh hota hai.
- Agar `umang-shell.js` load na ho paye to app purane shell par wapas chali jati hai (kuch toot'ta nahi).

## Run
Pehle jaisa hi: `docker compose up -d --build` (ya `cd frontend && npm install && npm run dev`).
Browser me **Ctrl+F5** (hard refresh) karein, taaki naya JS/CSS aaye.

## Dhyan dene wali baatein
- Dashboard API `sms_balance` nahi deti, isliye SMS Balance `0` dikhta hai (pehle bhi yahi tha).
- Ionicons ka font available nahi tha, isliye 6 jagah milte-julte Font Awesome icons hain (cash, bag, list, briefcase, chat, arrow).
- Header ke Session dropdown me abhi sirf current session dikhta hai (session badalne ka picker nahi). Session badalna `Session` master se hota hai.
- Charts (Loan Records / Overview) canvas se bane hain, Chart.js jaisa look.
- "₹NAN" ab nahi aayega: wo demo site ke snapshot ka bug tha; yahan backend ke numbers aate hain.
