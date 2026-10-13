# XenoLog

Phone web app for a *Xenopus laevis* colony: priming with a rest period, egg records, photos, replacement candidates. Google Apps Script bound to a spreadsheet; no server. See `README.md` for what users see.

This repository is public. **Never add lab data here**: real rosters, frog photos, names of people, spreadsheet or Drive IDs, deployment URLs. Those live in `../xenolog-lab/` (private, not a git repository).

## Layout

- `apps-script/Code.gs` – server. Public functions are the page's API; names ending in `_` are private. Lab-adjustable values are in the settings block at the top (`APP_NAME`, `REST_MONTHS`, `TANK_SIZE`, `OPTIONS`, `QUALITY`).
- `apps-script/Roster.gs` – example roster only.
- `apps-script/Index.html` – **generated**. Edit `src/` and rebuild.
- `src/app.js` – page logic. `src/matcher.js` – photo crop and matching. `src/style.css`, `src/body.html`.
- `src/fakes.js` – in-memory stand-ins for SpreadsheetApp, DriveApp and friends.
- `docs/` – GitHub Pages: forwarding page and icons.

## Commands

```bash
cd src && python3 build.py      # writes ../apps-script/Index.html and src/dev.html
cd src && node test-server.js   # server logic against in-memory sheets
```

Run both after any change to `Code.gs` or `src/`. `dev.html` runs the whole app in a browser with fake data; serve the repository root over http (`.claude/launch.json` has a `xenolog` entry) and open `/src/dev.html`. Real photos for crop or matching checks are in `../xenolog-lab/Frogs_Picture/` and must be served separately, never copied in.

## Things that are easy to get wrong

- The sheets are read by column position. Adding a column means updating the `*_COLS` list, every `getRange(row, n, …)` that touches that sheet, and `setup()`'s text-format columns.
- Dates are stored as `yyyy-MM-dd` text. Keep those columns plain text.
- The page re-renders `#app` often. File inputs live outside `#app` on purpose; anything that must survive a re-render belongs outside it or in `S`.
- Cells hold at most 50,000 characters; thumbnails and patterns are sized to fit.
- `Code.gs` runs on Apps Script (V8). `src/` runs in phone browsers. Neither is Node.

## Not verified

Nothing here has been run by an automated test against real Sheets or Drive. Automatic matching (DINOv2 embeddings, cosine similarity within one tank) is experimental: two of two correct on real different-day photos, which proves little. Automatic cropping misses on some photos and is only the starting position of the crop screen.

## Releasing to the lab

The lab deployment uses this repository's `Code.gs` and `Index.html` with the private `Roster.gs`. After changes: rebuild, test, then paste into the Apps Script project and update the **existing** deployment to a new version (a new deployment would change the URL).
