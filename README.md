# Market Rush

Market Rush is a multiplayer business tycoon party game for 2–8 players (or one human with bots). Everyone joins a private room from their own browser, runs three or six compressed business weeks, and learns why their choices changed EBITDA, cash flow, company value, customer trust, and employee morale.

Each week moves through a forecast, a paused decision window, a Living District simulation, and a synchronized results reveal. Hosts choose quick, standard, or relaxed pacing. The authoritative function sends a seeded world directive so customer routes, queues, resignations, inventory piles, weather, and business traffic stay consistent across devices and reconnects without trusting the client with financial outcomes.

Competition is systemic rather than card-driven: customer cohorts compare visible price, wait, trust, marketing, and capacity signals, then move between plots with an explainable reason. Saved plans remain editable until the deadline and current-week opponent decisions stay private. Players manage inventory, capacity assets, and voluntary debt under a seeded weekly rate environment. Low morale can cause a visible resignation and recruitment expense. The winner is the solvent company with the highest quality-adjusted EBITDA valuation, not simply the most cash.

## Publish without commands

1. Sign in to your Netlify account and open https://app.netlify.com/drop.
2. Drop **netlify-ready-game.zip**, the complete source project, onto the upload area.
3. Wait for Netlify to install, build, and publish it. Open the resulting HTTPS URL, create a room, and share its code or invitation link.

No GitHub, terminal commands, API keys, environment-variable entry, database creation, or paid-account provisioning is required. Netlify supplies the function's Blobs credentials automatically. The root `netlify.toml` contains all build settings. Use the **logged-in source-project upload**, not an anonymous static-file drop or an upload of only `apps/web/dist`.

Netlify account usage limits still apply. This package has been tested locally, not deployed to a live Netlify account. See `TEST-REPORT.md` for the verification scope. Netlify's current source upload behavior is documented at https://docs.netlify.com/deploy/create-deploys/ and https://app.netlify.com/drop.

## Storage and multiplayer

- The only production backend is `netlify/functions/game.ts`. Helper modules live in `serverless/`, outside the functions directory.
- Every frontend request goes directly to `/.netlify/functions/game`. No custom function route, API redirect, WebSocket server, SQLite database, or continuously running process is used in production.
- Site-wide Netlify Blobs storage uses strong reads, `onlyIfNew` creation, and ETag-based `onlyIfMatch` updates with retries. Each room is an atomic document; concurrent updates cannot silently replace one another.
- The client polls approximately once per second after the previous response. Persistent deadlines determine phase transitions, including after function cold starts or temporary disconnections. Polling can add roughly one poll interval plus network latency to a visible update. No client clock or financial outcome is trusted.
- Room-command identifiers prevent duplicate actions on transport retries. A durable rewards outbox and atomic per-profile award receipts prevent duplicate payouts, including across rematches.
- Presence expires after 25 seconds without a poll; hosting transfers to a connected active human. Returning players reclaim their seats. New mid-match arrivals spectate. Rooms become inaccessible after two inactive hours; expired room codes can be reused. Blob records are not automatically purged from storage.
- Existing local SQLite profiles are not migrated. Published guest progress begins on the new site and remains tied to that browser's opaque credential. Clearing browser storage loses access.

## Optional developer workflow

Requirements: Node.js 24+ and npm 11+.

```bash
npm install
npm run dev
```

Open `http://localhost:3001`. The local Vite preview embeds the same function handler and Netlify's Blobs emulator without credentials. The local-only ETag compatibility shim repairs a missing GET response header in Netlify Blobs emulator 11.1.4; production does not import it. Historical `apps/server` files, if present in the working folder, are not part of this deployment or its active workspace.

## Checks

```bash
npm test
npm run typecheck
npm run build
npm run verify:function
npm run package:netlify
```

Guest progress is tied to an opaque browser credential. There are no accounts, purchases, or cross-device recovery in this release.

## Living District renderer

The district uses Three.js r180's node renderer with its WebGL2 backend (`forceWebGL`) so TSL materials work without requiring WebGPU. Unsupported devices retain the accessible business controls and financial UI.

- Small, single-color board-game pegs replace humanoids. Twelve shared AnimationMixers make them bounce while walking, rock while waiting, and tilt during a frustrated departure across two instanced peg draw batches, capped at 80 people. Two more instanced batches attach miniature bicycles or glowing hoverboards to selected pegs; riders cover pedestrian paths twice as quickly. Employees wear their business color. Authoritative queue pressure, customer abandonment, and resignation directives select the states.
- Modular storefronts upgrade at company valuations of $25,000 and $55,000: brick startup, two-story commercial growth, and three-story glass/neon market leader. Floor assemblies change, not the building scale or collision footprint. Instanced inventory crates use actual stock-to-sales pressure.
- Forecast sunrise, decision-window daylight, operations midday, and results sunset follow server phase deadlines. TSL drives a 3D rain volume and procedural wet pavement; low-resolution planar reflections show buildings and neon in puddles. Mobile uses fewer props/rain particles and disables shadows.
- A two-lane road wraps the outside of the plaza, with four striped crosswalks aligned to the pedestrian gates. Ambient cars and marketing buses follow separate closed Catmull-Rom splines. A $150 marketing push brings a bus to the nearest gate and reveals a small group of that business's already-counted customer cohort—visual movement never changes server-calculated demand or sales. Thought bubbles distinguish premium-price defections, queue waits and abandonment, completed purchases, and the customer's service reaction. Every departing peg also gets a tiny green, amber, or coral badge for satisfied, mixed, or disappointed service. Reactions are a deterministic visualization of the authoritative weekly satisfaction and conversion scores; they do not change those scores. Arrival paths use the crosswalks, perimeter promenade, paved gaps between lots, and central pedestrian ring. Defections pass through the square. Store picking and keyboard-accessible business tabs share the same camera selection.

For graphics QA, append `?graphicsQA=1` to the game URL and start a solo room. The optional Render test menu can run 80-person Tier 3 clear/storm fixtures without changing match finances. Its visible diagnostics report average FPS, p95 frame time, sampled frames, draw calls, active animation states, and building collision samples. Measurements exclude a two-second warmup and keep the most recent 1,800 frames; they are device-specific averages, not a guaranteed minimum frame rate. Return to Live match to check real server-driven events. Reduced-motion preferences freeze locomotion, skeletal animation, and rain movement.
