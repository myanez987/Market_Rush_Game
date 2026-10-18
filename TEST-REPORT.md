# Netlify release verification

Verified locally on Windows / Node 24.16.0 on 2026-10-17. No public Netlify deployment was made.

## Completed checks

- Production frontend build and TypeScript checks pass. The Living District, sound, financial statements, valuation scoring, bots, and existing timing presets remain in the application. Classic six-week matches remain the default; hosts can also choose three weeks.
- The release ZIP was extracted into a clean folder, dependencies were installed from its lockfile, and both the production build and exact packaged-function full-match check passed there. No files from the historical server were needed.
- The local preview returned HTTP 200 for the frontend and successfully created/restored a guest and created a room through `/.netlify/functions/game`.
- 66 tests across seven suites pass, covering existing economics and renderer/layout calculations plus the new durable multiplayer service.
- A full three-round match with two authenticated guest profiles runs through forecast, decisions, operations, results, final valuation rankings, persistent rewards, and a same-room rematch. Each week's result is compared independently against the shared economics calculation; fabricated cash/profit input is ignored.
- That full match also runs through the official Blobs SDK against Netlify's local Blobs emulator, including real ETag conditional writes.
- Concurrent requests are tested with a conflict-injecting CAS store: no lost room seats, eight active players maximum, extra spectators, and no duplicate bot additions or duplicate room creation on retry.
- Readiness, host-only actions, private incidents, spectator restrictions, stale-week decisions, disconnected-host transfer, deadline catch-up across all six classic weeks, and two-hour room expiration are tested.
- The official Netlify packager emits one API-v2 function named `game`. The exact `game.zip` is extracted into an isolated temporary folder and its bundled default handler is executed, without importing application source. It completes another two-player, three-round match, verifies the final winner and 50/20 token awards after profile restoration, and returns to the same lobby for a rematch.
- One recorded packaged-function match: Second Player won with a $60,997 company valuation and $492 cumulative profit; Package Test finished at $48,638 valuation and $186 profit. Match seeds vary, so subsequent tests have different valid results.
- Production dependency audit reported zero vulnerabilities. Development-only packaging/test dependencies have outstanding upstream advisories; they are not shipped to browser users or required by the running function.
- Archive construction validates root `netlify.toml`, `package.json`, lockfile, frontend source/build, and `netlify/functions/game.ts`. Helpers remain outside `netlify/functions`. Old Express/Socket.IO/SQLite server files, databases, node_modules, caches, environment files, and logs are excluded.

## Important scope notes

- Tests advance an internal test clock to exercise every phase promptly. The public endpoint has no clock override, speed cheat, or client-submitted scoring capability.
- Netlify Blobs emulator 11.1.4 omits ETags from its GET responses. A local-only compatibility shim adds the emulator's own ETag calculation; production never imports that shim. Production refuses an update if a strong read returns no ETag.
- The production build retains the existing large Three.js chunk warning. No new browser graphics/FPS or multi-browser visual certification is claimed in this migration.
- A source ZIP upload needs a logged-in Netlify account so Netlify runs the configured build and deploys the function. An anonymous static drop is not a multiplayer deployment.
- Runtime room and profile storage is automatically provisioned by Netlify Blobs. Live provider deployment, account quotas, and internet latency can only be checked after upload.
