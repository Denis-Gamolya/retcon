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

## October 26 lobby and gameplay expansion

- Production build and all 46 automated tests passed.
- Isolated Chrome desktop/mobile sessions completed three guided rounds:
  Sketch Guest won 2,400 to 1,900, with no page errors. Lobby drafts survived
  joins/polling, saved portraits synchronized, QR images loaded, guest settings
  stayed read-only, and mobile picker scroll locking and left-side shuffle
  placement passed. The test used 390×700/844 and 844×390 viewports; it is not
  physical iPhone verification.
- Host-only lobby settings are validated and cannot change after the game starts.
- Portrait vectors are limited to 60 strokes and 1,500 points. They persist
  through a game and rematch, without exposing authentication credentials.
- Recent-term avoidance and exact phrase uniqueness were tested, including
  300 generated prompts and Familiar-mode family coverage.
- Four simulated players completed three guided rounds with synchronized reveal
  steps, duplicate-step rejection, unchanged scoring, and a shared final win.
- Cold function requests preserve settings, portraits, and the current reveal.
- QR generation returns same-origin invitation SVGs and rejects invalid codes.
- A 4–6-person usability playtest is still needed. See the README checklist.

## Local verification

- Landscape places the prompt and shuffle below the canvas, with the timer,
  tools, and submission control in a separate right rail. At 844×390, the
  canvas measures approximately 521×325, versus 342×214 in 390×844 portrait;
  the right rail is 240 pixels wide. At 667×320, the canvas measures 374×234.
  Checks at 844×390, 667×320, and 568×320 keep the prompt, sliders, and Submit
  visible without page scrolling.
- At 874×346, the caption's left and right edges exactly match the canvas
  frame. Landscape's Room menu exposes the room code, Copy code, and the
  current player list; Copy invite and Leave game remain on the rail. Opening,
  copying, Escape dismissal, and restoring the portrait top panel were checked.
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
