# XenoLog

Phone web app for a *Xenopus laevis* colony: priming with a rest period, egg records, photos, replacement candidates. Google Apps Script bound to a spreadsheet; no server. See `README.md` for what users see.

This repository is public. **Never add lab data here**: real rosters, frog photos, names of people, spreadsheet or Drive IDs, deployment URLs. Those live in `../xenolog-lab/` (private, not a git repository).

## Layout

- `apps-script/Code.gs` – server. Public functions are the page's API; names ending in `_` are private. Lab-adjustable values have their defaults in `DEFAULTS` and are read through `setting_(key)`, never at load time (Apps Script does not promise the order in which files load).
- `apps-script/Settings.gs` – example settings (`const SETTINGS`), every key at its default; the test checks they match. A lab's own copy overrides `DEFAULTS` key by key.
- `apps-script/Roster.gs` – example roster only.
- `apps-script/Index.html` – **generated**. Edit `src/` and rebuild.
- `src/app.js` – page logic. `src/matcher.js` – photo crop and matching. `src/style.css`, `src/body.html`.
- `src/fakes.js` – in-memory stand-ins for SpreadsheetApp, DriveApp and friends.
- `src/demo.js` – made-up colony for the public demo. `docs/demo/index.html` is **generated** from it by `build.py`; commit it with the rebuild.
- `docs/` – GitHub Pages: forwarding page and icons.

## Commands

```bash
cd src && python3 build.py      # writes ../apps-script/Index.html, src/dev.html and ../docs/demo/index.html
cd src && node test-server.js   # server logic against in-memory sheets
```

Run both after any change to `Code.gs`, `Settings.gs` or `src/`. `dev.html` runs the whole app in a browser with fake data; serve the repository root over http (`.claude/launch.json` has a `xenolog` entry) and open `/src/dev.html`. Real photos for crop or matching checks are in `../xenolog-lab/Frogs_Picture/` and must be served separately, never copied in.

## Things that are easy to get wrong

- The sheets are read by column position. Adding a column means updating the `*_COLS` list, every `getRange(row, n, …)` that touches that sheet, and `setup()`'s text-format columns.
- Dates are stored as `yyyy-MM-dd` text. Keep those columns plain text.
- The page re-renders `#app` often. File inputs live outside `#app` on purpose; anything that must survive a re-render belongs outside it or in `S`.
- Cells hold at most 50,000 characters; thumbnails and patterns are sized to fit.
- The OpenCV.js module object has its own `.then`. Never `await` it or resolve a promise with it; the page hangs. `matcher.js` only uses the global `cv` after start-up.
- `Code.gs` runs on Apps Script (V8). `src/` runs in phone browsers. Neither is Node.

## Not verified

Nothing here has been run by an automated test against real Sheets or Drive. The pattern check (ORB points on the 256 px back image enlarged to 384 px, ratio test, one-to-one, RANSAC affine with sanity limits; `MATCH_MIN` points to call a match) was checked on about 60 lab photos on a desktop browser: different frogs 5 or fewer, same frog 15 to 100+. Very few same-frog pairs exist yet, and phone speed is unmeasured. Automatic cropping misses on some photos and is only the starting position of the crop screen.

## Releasing to the lab

The lab deployment uses this repository's `Code.gs` and `Index.html` with the private `Settings.gs` and `Roster.gs` (`../xenolog-lab/make-deploy.sh` collects the four). After a code change: rebuild, test, raise `APP_VERSION` in `Code.gs` and `version` in `CITATION.cff` together (the Timing sheet records the version so measurements can be tied to a release), tag the commit `v<version>` and make a GitHub release (Zenodo mints a DOI for each release), then paste into the Apps Script project and update the **existing** deployment to a new version (a new deployment would change the URL).

Changes to documentation or to `CITATION.cff` metadata alone need no new version or release; fix the metadata of an existing Zenodo record on Zenodo itself. Patch (1.0.1) for fixes, minor (1.1.0) for features that keep the sheets as they are, major (2.0.0) when existing sheets or `Settings.gs` need migrating. During data collection (from 2026-11-01) change the code only to fix faults.
