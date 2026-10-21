# Netlify edition verification

Verified locally and on the existing Netlify project on October 20, 2026.

## Hosted deployment

- Private source repository: https://github.com/Denis-Gamolya/sketchy-alibis
- Public game: https://candid-crisp-9ad27c.netlify.app/
- Production branch: `main`; automatic publishing is enabled.
- Initial Git build `e1201f5` published successfully with one deployed function.
- The production page returned HTTP 200 without authentication.
- Two browser sessions created and joined one room, then both entered the
  drawing phase with separate prompts and synchronized player lists.
- Both test players left afterward. This hosted smoke check does not replace
  the complete local games below or establish cloud concurrency limits.

## Local verification

- Mobile layout regression check: 844×390 and 667×320 landscape keep the
  prompt, canvas, tools, both sliders, and submission control inside the viewport.
- At 390×700, the modal picker scrolls its own family list while the background
  stays fixed. Choosing a searched replacement closes it, restores the previous
  page scroll position, and removes the scroll lock. Rotation to landscape also
  keeps the dialog within the viewport. These are browser viewport checks;
  physical iOS browser and on-screen keyboard behavior still need device testing.

- Production frontend build and official Netlify function packaging passed.
- All 41 automated tests passed.
- Three-round two-player integration game: host 2,400, guest 900; host wins.
- The actual extracted function ZIP completed the normal five-round game:
  host 4,000, guest 1,500; host wins.
- Eight concurrent joins, drawings, claims, and votes were checked against an
  atomic conditional-write model. No lost scores or duplicate score awards.
- Strong reads and conditional writes are asserted. Production fails closed
  if a read does not return an ETag.
- Timeouts were advanced after simulated cold starts; scoring happened once.
- Two independent browser sessions completed all three test rounds through
  the direct function endpoint, including replacement selection and voting.
  Winner screen: Netlify Host 2,400; Netlify Guest 900. No browser console errors.
- The test-only browser preview used longer phase timers to allow inspection;
  production retains the original 60/30/60-second timing and five rounds.
- Final archive entries are checked for required source/config/build files
  and for exclusion of node_modules, caches, logs, and local runtime state.

The official file-backed Blobs emulator omits ETags on GET and does not fully
serialize conditional writes. The local preview/test bridge obtains ETags
from its listing endpoint and serializes calls. That bridge is not part of
the deployed function. Production uses Netlify's strong value/ETag reads and
conditional updates directly. Live cloud concurrency limits remain unverified;
the Git-based cloud build and basic multiplayer flow were checked above.

Publishing requires the logged-in source-project build upload flow. Static-only
Drop cannot deploy this backend. Netlify's documentation instructs users with a
ZIP to extract it first. See README.md for browser-only publishing instructions.
