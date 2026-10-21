# NMFA V38 — 16 Improvements Consolidated

Base: V37 source supplied by the user. Existing features retained; added the missing dedicated editable reference master screen for Identity Proof, Relation, Purpose and Reason.

## Change in this update
- Added ReferenceMaster model and migration `0014_reference_master.py`.
- Added authenticated API `/api/reference-masters/` with kind filter, create/edit and Active/Inactive actions.
- Added a dedicated “Identity / Relation / Purpose / Reason Masters” page under MASTER.
- Added duplicate-name validation per master type and audit logging through SecureModelViewSet.
- API writes require `manage_customers` for staff profiles; admin retains access.

## Existing 16-point tracker
The other items remain as described in `V37_16_IMPROVEMENTS_UPDATE_HINGLISH.md`; this update does not claim external SMS delivery is configured or all production compliance checks are complete.

## Apply
Run normal compose build from `NMFA_Production_v3`: `docker compose up -d --build`. Apply the new migration if the backend entrypoint does not run migrations automatically: `docker compose exec backend python manage.py migrate`. Do not run `docker compose down -v`; it can delete the database volume.

## Verification
Source edits and ZIP integrity checked. Full Django runtime tests and Vite build were not run here; user plans to test locally. This package is not production-certified.
