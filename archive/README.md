# archive/

Parking lot for files removed from the active tree during the cleanup
(see `../CLEANUP_PLAN.md`, Phase 0). Nothing here is referenced by the
running app or its `vite build`. Everything is reversible — `git mv` back
if a need surfaces.

## Loose root images (unreferenced)
`Email.png`, `dark.png`, `light.png`, `G-logo.png`,
`ChatGPT Image Mar 24, 2026, 06_34_56 PM - Edited.png`

Confirmed unreferenced across `src/`, `public/`, `index.html` (grep, 2026-06-18).
The only wired-in logos are `public/logo.png` and the three in `src/assets/`.

## legacy-monolith/
`grant-engine.monolith.jsx` — the original single-file version of the app
that runs in Claude artifacts. **Not imported by the app** (Vite never
bundled it), but it *is* the input to the standalone demo build, so it's
kept rather than deleted.

`build-standalone.js` — compiles the monolith into one self-contained
`dist/grant-engine.html` for sharing/demos. Moved here with the monolith so
the demo capability stays intact. Run from the project root:

```
node archive/legacy-monolith/build-standalone.js
```

(Its input path now resolves relative to its own location, so the move
didn't break it.)
