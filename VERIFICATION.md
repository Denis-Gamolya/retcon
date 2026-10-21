# Netlify edition verification

Verified locally on October 20, 2026. No Netlify project was created or deployed.

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
conditional updates directly. Live cloud concurrency and upload/build behavior
remain unverified until the extracted project is deployed to a Netlify account.

Publishing requires the logged-in source-project build upload flow. Static-only
Drop cannot deploy this backend. Netlify's documentation instructs users with a
ZIP to extract it first. See README.md for browser-only publishing instructions.
