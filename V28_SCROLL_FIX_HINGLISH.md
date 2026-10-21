NMFA V28 — SIDEBAR / PAGE SCROLL FIX

What changed:
- Desktop/tablet: sidebar stays visible while the main page scrolls, and its own long menu can scroll independently.
- Clicking a sidebar item resets the selected page view to the top, so the next page does not open at the previous page's scroll position.
- Mobile layout keeps the sidebar in normal flow so it does not cover the content.
- Existing modules, routes, backend and database are not intentionally changed by this UI-only patch.

Update steps:
1. Stop containers with: docker compose down (do NOT add -v).
2. Back up the project folder and preserve both .env files.
3. Copy the V28 source files over the project folder.
4. Run: docker compose up --build -d
5. Open http://localhost:5173 and hard-refresh with Ctrl+F5.
6. Scroll down a long page: sidebar should remain visible. Click a different sidebar item: its page should start at the top.

Validation note:
This patch changes frontend JSX/CSS only. Confirm in your local browser after rebuild. It does not certify backend/accounting integrations or production readiness.
