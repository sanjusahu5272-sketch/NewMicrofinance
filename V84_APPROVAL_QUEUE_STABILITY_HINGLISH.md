# V84 — Approval Queue Stability Fix

## Video se mila issue
Collection Approval screen par queue/actions unstable lag rahe the aur buttons blink/re-render hote dikh rahe the.

## Root cause found in frontend
`ApprovalCenter` ka loading `useEffect` `[type, reload]` par depend tha, lekin parent `Shell` har render par naya `reload` function banata hai. Queue load hone se component render hota, parent callback identity badalti, aur effect dobara chalta — repeated requests/re-render loop.

## Fix
Effect ab `[type]` par depend karta hai. Type change par queue reload hoti hai; approval/rejection ke baad action handler explicit `load()` aur `reload()` karta hai. Existing UI/layout aur restrained approve/reject styles unchanged.

## Verification
- Source patch applied.
- ZIP integrity checked after packaging.
- Browser interaction test and full frontend build have not been run in this environment. Please test on local PC before production use.
