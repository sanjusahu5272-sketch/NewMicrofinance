V40 UPDATE — Settings confirmation/result dialogs and buttons

- Company Profile & Logo form now uses green SAVE PROFILE and red CANCEL buttons styled to match the provided reference.
- Saving opens an “Are you sure?” confirmation dialog with “Yes, confirm it” and “Cancel”.
- On confirmed server save, a green-check “Success!” dialog appears. API errors show an error dialog instead of a success message.
- Cancel asks before discarding edits and reloads saved profile values after confirmation.
- The shared dialog styling already exists and remains used by other implemented modules.

Verification: source edits inspected; ZIP integrity and JavaScript syntax/build still need environment verification. Vite dependencies are not bundled, so this note does not claim a production frontend build.
