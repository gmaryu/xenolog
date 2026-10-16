# XenoLog

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23404587.svg)](https://doi.org/10.5281/zenodo.23404587)

A phone-friendly web app for a *Xenopus laevis* colony. It records which frog was primed and when, enforces a rest period between uses, collects the egg record on the day of the experiment, and keeps everything in a Google Spreadsheet you already own.

It runs as a Google Apps Script web app bound to a spreadsheet. There is no server to maintain.

**Try it:** the [demo](https://gmaryu.github.io/xenolog/demo/) runs the whole app in your browser with a made-up colony of 50 frogs, used 4 a week for the past year: with a 3-month rest, most of them are resting at any time. Nothing is saved; reloading starts over. "Photograph the frog" there offers made-up photos of the frogs in the tank (or of a frog from another tank), each turned, moved and lit differently, so the crop screen and the pattern check can be tried without a frog. The camera works too; its photos are not kept.

## What it does

- **Priming.** Pick a housing tank, photograph the frog you took out, and confirm which of the frogs in that tank it is. Saving marks the frog as in use for everyone at once.
- **Rest period.** A frog cannot be primed again until the rest period (3 months by default) has passed. The tanks of the next frogs to use (`primingBatch` of them, 4 by default) are listed first. Frogs are used in rounds of tank order, going back to Tank 1 after the last tank; within a tank any available frog will do. The round continues at the tank used last, read from the priming dates so that a frog used out of turn does not move it, and frogs left in that tank come first. A frog resting when its tank's turn comes waits for the next round, so a colony whose order has drifted is back in tank order after one round. A frog in a tank the round has already passed (a round runs from Tank 1 to the last tank) that was available when its tank was last used but was skipped comes first. The other tanks follow in tank order, with tanks that have no available frog last. Tanks that mix resting and available frogs are marked, because those are the ones where a mix-up matters.
- **Egg record.** Quantity, appearance and Ca-activation result for squeezed and laid eggs, how active the frog was during collection (1 calm to 5 struggled hard), plus comments. The Ca-activation result and comments stay editable afterwards.
- **Return.** The app shows which housing tank the frog goes back to.
- **Photos.** Each photo is cropped to the back in a crop screen and stored in Google Drive. Earlier photos of each frog can be compared side by side with the new one.
- **Colony upkeep.** Add and remove frogs, redo the tank layout in ID order one tank at a time (the list shows where each frog is now and where it goes), and see replacement candidates based on recent egg quality.

## Status and limits

Read this before relying on it.

- The app was developed for one lab and has been tested mostly against in-memory stand-ins for Sheets and Drive (`src/test-server.js`) and in a desktop browser. Real-phone testing has been limited.
- **The pattern check is a suggestion.** After a photo is cropped, the app counts points of the back pattern that line up with earlier photos of the frogs in the same tank (ORB features with geometric verification, run in the browser with OpenCV.js). In tests on about 60 registration photos, different frogs gave 5 points or fewer and the same frog gave 15 to over 100, across photos taken on different days and backgrounds. Only a handful of same-frog pairs were available, and nothing has been measured on a phone, so a person always confirms the identity. A blurred photo, a reflection across the back, or a crop that misses the back gives no match.
- **Automatic cropping is a starting position only.** It finds the back in most photos on a plain background and misses in others. The crop screen lets you drag and resize the square.
- The egg-quality score and the replacement threshold are simple, adjustable rules, not validated measures.
- The record form (water source, quantity, appearance, Ca activation) follows the original lab's form. The choices can be changed in `Settings.gs`; changing the questions themselves means editing `Code.gs` and `src/app.js`.

## How identification works

Frogs are housed a few to a tank and each tank's occupants are known, so identifying a frog is a choice among the frogs of one tank rather than the whole colony. The app shows those frogs' photos and status; you pick one. Photos taken at each priming keep the references current as the animals grow.

## Set up

You need a Google account that can create Apps Script projects. For lab use, a Google Workspace domain lets you limit the app to your institution and records who did what.

1. Create a Google Spreadsheet (or open the one that holds your existing records).
2. Open **Extensions > Apps Script**.
3. Replace the contents of `Code.gs` with `apps-script/Code.gs`.
4. Add a script file named `Settings` and paste `apps-script/Settings.gs`. Change what differs in your lab (see [Settings](#settings)).
5. Add a script file named `Roster` and paste `apps-script/Roster.gs`. **Edit it first** so it lists your own frogs: ID, whether it is in the colony, tank, arrival date, source, note.
6. Add an HTML file named `Index` and paste `apps-script/Index.html`.
7. Give the project a name, save, and reload the spreadsheet. A menu named **XenoLog** appears.
8. Run **XenoLog > 1. Set up sheets** and approve the permissions. This creates the sheets below and a Drive folder named "XenoLog photos".
9. In Apps Script choose **Deploy > New deployment**, type **Web app**, execute as **Me**, and give access to people in your organisation.
10. Open the web app URL on a phone.

To update the code later, replace `Code.gs` and `Index.html` only; your `Settings` and `Roster` stay as they are. Then use **Deploy > Manage deployments**, edit the existing deployment, and choose **New version**. That keeps the same URL. "New deployment" creates a second URL and leaves the old one running old code.

### Sheets the app creates

| Sheet | Contents |
|---|---|
| Frogs | One row per frog: ID, status, tank, arrival, source |
| Records | One row per priming, filled in at collection and at return |
| Photos | One row per photo, with a thumbnail and the cropped back (the "Embedding" column is no longer used) |
| Match log | What the automatic ranking suggested and what the person chose |
| Timing | One row per frog in a saved priming: seconds from opening the tank to each step, retakes, crop corrections, resting frogs tried, matching time, photo size, device and app version. Kept for measuring the app in use |
| Vet view | A flat export of the collected records for the veterinary staff, rebuilt after each change. Its columns come from `vetColumns` in `Settings.gs` |
| Import check | Problems found by the optional legacy import |

You can edit Frogs and Records by hand. Keep the header row and column order, and leave `Record ID` and `State` alone.

### Settings

`Settings.gs` holds the values that differ between labs. Updating `Code.gs` never touches it. Any setting you delete from it takes the default in `DEFAULTS` at the top of `Code.gs`, so a `Settings.gs` from an older version keeps working when new settings are added.

- `appName`, `faviconUrl`
- `restMonths` – rest period after a priming
- `tankSize` – frogs per housing tank
- `primingBatch` – how many frogs are usually primed together; the Priming tab suggests that many
- `removalReasons` – the reasons offered when a frog is removed
- `recordTiming` – on by default; see below
- `options` – the choices in the record form. You can rename or add choices; the questions themselves are fixed
- `quality` – weights and thresholds for the egg-quality score, and the value of each appearance and quantity choice. If you rename a choice in `options`, give it a value here too
- `systems` – optional: housing systems as runs of tanks, e.g. `[{ name: 'A', tanks: [1, 12] }, { name: 'B', tanks: [13, 24] }]`. The Vet view's `system` field shows the system's name, or the tank number when no system lists the tank
- `vetColumns` – the Vet view's columns, left to right, as `[heading, field]`. Rename, reorder, drop or add columns; `Settings.gs` lists the fields. A column with field `''` stays empty, and anything typed into the Vet view is cleared at the next rebuild. A changed list shows after the next record change or **Rebuild Vet view**
- `legacyWater` – only for the legacy import: old water-source spellings and the choice each is read as

`options`, `quality` and `legacyWater` are merged with the defaults key by key: `options: { water: ['Tap', 'RO'] }` changes only the water choices.

### Timing records

With `recordTiming: true` (the default), each saved priming adds one row per frog to the Timing sheet: who saved it, the time the frog's tank was opened, the seconds from there to the photo, the crop, the pattern check, the choice and the save (a photo taken while another tank was open shows as negative seconds), the seconds spent in tanks opened before it, how many photos and comparisons were needed, which resting frogs were tried, how long matching took, the photo size, the phone's browser and screen, and the app version. It exists to measure how the app works in daily use. It shows how long each person took, so tell the people who use the app before you collect it. Set `recordTiming: false` to stop: the page then sends nothing and no Timing sheet is created; rows already written stay until you delete them.

### Home-screen icon (optional)

An Apps Script web app cannot set its own home-screen icon on iPhone. The `docs/` folder is a small page that carries the icon and forwards to an app. The app is named in the link, so no lab's URL is stored in the repository.

1. Enable GitHub Pages for the repository with the `docs/` folder of the main branch as the source.
2. Open the published page, paste your web app URL, and copy the link it gives you.
3. Have people open that link once on their phone. It shows a page with the icon and the steps for adding it to the home screen; they add that page, not the app itself. Afterwards the home-screen icon opens the app directly.
4. Optionally set `faviconUrl` in `Settings.gs` to the published `favicon-32.png` for the browser tab.

You can also use the page published from the original repository instead of your own copy. The link contains your deployment ID, so treat it like the app URL itself; the app still requires sign-in if you limited access in step 8. If you redeploy as a new deployment, the ID changes and people must add the new link. This page has not been tested on every phone.

### Existing photos (optional)

Put image files named after the frog (`125.jpg`, `125 back.png`) into the `import` folder inside "XenoLog photos", then run **Import photos from Drive folder**. Open each frog once in the app and use **Adjust crop** to check the crop. If a photo turns out to show a different frog, use **Remove** under it; it stops being shown or compared, and the file stays in Drive. If you want to keep photos in a folder you made yourself, run **Choose photo folder** first.

### Checking photos against IDs (optional)

Once most frogs have a photo, **Frogs > Roster check** compares every photo of the frogs in the colony with every other one and lists where the photos and the IDs disagree:

- **IDs whose photos do not match each other.** One of the photos may show another frog; under each photo is the other ID it matches best. A blurred photo or a crop that misses the back also lands here.
- **Photos of different IDs that match.** The same frog filed under two IDs; within one tank, often two frogs swapped when they were photographed.
- **Close to the threshold**, frogs in the colony with no photo, and frogs with only one photo, which have nothing of their own to be checked against.
- **Automatic crops**: IDs with a photo whose crop was never checked by hand.

Tapping a photo or an ID opens the frog, where **Adjust crop** and **Remove** are; **Back** returns to the result, which stays until the page is reloaded and says when photos have changed since. On a screen wider than a phone (open XenoLog on a computer), a grid below the lists shows every pair at once: each photo is a row and a column, in tank order, and each cell is shaded by its score. One ID's photos with each other form outlined squares on the diagonal that should be strongly coloured, with faint or empty cells everywhere else, so a strong cell away from the diagonal or a faint one inside a square stands out. Clicking a cell shows the two photos.

The same check runs outside the app on the [roster check page](https://gmaryu.github.io/xenolog/check/), which can also download every pair's score as CSV. Export the **Photos** sheet (and, optionally, the **Frogs** sheet) with File > Download > Comma-separated values and choose the files on the page; the backs are compared as they were cropped in the app. Image files named by frog ID work too, with automatic cropping. The files are read in the browser and not sent anywhere. The page also opens from `docs/check/index.html` in a copy of this repository.

It changes nothing. Fix what it finds (**Remove** under a photo, or **Adjust crop**) and run it again. It finds photos that disagree, not a mix-up repeated in every photo of a frog: a frog photographed only under the wrong ID looks correct. Comparing takes about 50 ms a pair on a recent laptop, so 140 photos (about 10,000 pairs) take around 8 minutes. A phone is slower; the check can be stopped. On the 65 registration photos of the original lab, all 2,080 pairs of different frogs gave 5 points or fewer.

### Legacy records (optional)

`importLegacy` in `Code.gs` reads two sheets from the original lab's spreadsheet ("Form Responses 1" from a Google Form, and "Shared with ULAM", the sheet the veterinary staff read). It is specific to those column layouts. Skip it for a new colony, or adapt it to your own history.

## Privacy and data

- Records stay in your spreadsheet and photos in your Drive.
- Photos are cropped and compared on the phone. OpenCV.js is downloaded from jsDelivr the first time; no photo is sent anywhere except your own Drive.
- With "Execute as: Me", the app acts with the deploying account's access, and files it creates belong to that account. Deploy from an account that will outlive individual lab members.

## Development

Sources are in `src/`. `apps-script/Index.html` is generated; do not edit it by hand.

```bash
cd src
python3 build.py          # writes ../apps-script/Index.html, a local test page (dev.html), the demo (../docs/demo/) and the roster check (../docs/check/)
node test-server.js       # runs Code.gs against in-memory sheets
node test-check.js        # runs the roster check's logic (rostercheck.js) on made-up scores
```

`dev.html` runs the whole app in a normal browser with in-memory data, which is the quickest way to try a change. Serve the folder over http (for example `python3 -m http.server`) because the photo code needs it.

`docs/demo/index.html` is the same page with the made-up colony in `src/demo.js` (a year of weekly primings simulated from a fixed seed, dates counted back from today, drawn frogs with generated back patterns). Each frog has two photos, one from registration and one from its last priming, posed and lit differently, so the roster check has pairs of one frog to find. One is filed wrongly on purpose: the photo saved at #23's last priming shows its tank-mate #22, as when two frogs taken from one tank are mixed up. It is published with the forwarding page, so rebuild and commit it with every change to `src/` or `Code.gs`. The drawn photos are made so that the pattern check behaves as on real photos: with all 50 frogs, no pair of different frogs reached 8 points (2,450 pairs), and the same frog gave 108 or more. The roster check on the demo's 100 photos finds that mix-up (#23 split in two, its priming photo matching both photos of #22 at about 300 points); every other frog's two photos give 50 points or more, and different frogs at most 7 (about 65 s on a laptop). A plain or finely speckled background broke this (different frogs reached 20 to 50 points, because the check boosts contrast before looking), so keep the uneven tray if the drawing is changed, and measure again.

`docs/check/index.html` is the roster check page, built from `src/check-body.html`, `src/check.js` and the files it shares with the app: `rostercheck.js` (the comparison and findings), `rosterview.js` (the result and the grid), `matcher.js` and `style.css`. Rebuild and commit it with every change to those files. `check.js` and `check-body.html` are not part of the Apps Script deployment; the shared files are, so changing them is an app change.

## Related work

- XIBBIT (Tomanin et al., bioRxiv 2026) identifies *Xenopus laevis* by dorsal pattern with a classifier trained per facility and includes colony management. If you can photograph each frog many times and want colony-wide identification, look there first.

## Citation

Each release is archived on Zenodo. To cite XenoLog in general, use [10.5281/zenodo.23404587](https://doi.org/10.5281/zenodo.23404587), which always resolves to the latest version. To name the version you used, cite that release's own DOI, listed on the same Zenodo page; the Timing sheet records which version took each measurement. `CITATION.cff` has the details, and GitHub's "Cite this repository" uses it.

## Licence

MIT, see `LICENSE`. OpenCV.js is loaded at run time under its own licence (Apache 2.0).

The app icon was generated with OpenAI's ChatGPT and refined for use in this project.
