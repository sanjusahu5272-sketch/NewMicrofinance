# V28 release note — navigation scrolling

- Added sticky desktop sidebar constrained to viewport height; menu scrolls independently.
- Reset document/content scroll to top when selecting a sidebar page.
- Kept mobile sidebar in normal document flow to avoid covering page content.
- No database migrations or backend behavior changed in this UI-only patch.
- Manual browser verification is still required after `docker compose up --build -d` and Ctrl+F5.
