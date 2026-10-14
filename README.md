# XenoLog

A phone-friendly web app for a *Xenopus laevis* colony. It records which frog was primed and when, enforces a rest period between uses, collects the egg record on the day of the experiment, and keeps everything in a Google Spreadsheet you already own.

It runs as a Google Apps Script web app bound to a spreadsheet. There is no server to maintain.

## What it does

- **Priming.** Pick a housing tank, photograph the frog you took out, and confirm which of the frogs in that tank it is. Saving marks the frog as in use for everyone at once.
- **Rest period.** A frog cannot be primed again until the rest period (3 months by default) has passed. Tanks that mix resting and available frogs are listed first, because those are the ones where a mix-up matters.
- **Egg record.** Quantity, appearance and Ca-activation result for squeezed and laid eggs, plus comments. The Ca-activation result and comments stay editable afterwards.
- **Return.** The app shows which housing tank the frog goes back to.
- **Photos.** Each photo is cropped to the back in a crop screen and stored in Google Drive. Earlier photos of each frog can be compared side by side with the new one.
- **Colony upkeep.** Add and remove frogs, redo the tank layout in ID order, and see replacement candidates based on recent egg quality.

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
| ULAM view | A flat export of the collected records, rebuilt after each change |
| Import check | Problems found by the optional legacy import |

You can edit Frogs and Records by hand. Keep the header row and column order, and leave `Record ID` and `State` alone.

### Settings

`Settings.gs` holds the values that differ between labs. Updating `Code.gs` never touches it. Any setting you delete from it takes the default in `DEFAULTS` at the top of `Code.gs`, so a `Settings.gs` from an older version keeps working when new settings are added.

- `appName`, `faviconUrl`
- `restMonths` – rest period after a priming
- `tankSize` – frogs per housing tank
- `removalReasons` – the reasons offered when a frog is removed
- `recordTiming` – on by default; see below
- `options` – the choices in the record form. You can rename or add choices; the questions themselves are fixed
- `quality` – weights and thresholds for the egg-quality score, and the value of each appearance and quantity choice. If you rename a choice in `options`, give it a value here too
- `legacyWater` – only for the legacy import: old water-source spellings and the choice each is read as

`options`, `quality` and `legacyWater` are merged with the defaults key by key: `options: { water: ['Tap', 'RO'] }` changes only the water choices.

### Timing records

With `recordTiming: true` (the default), each saved priming adds one row per frog to the Timing sheet: who saved it, the time the tank was opened, the seconds from there to the photo, the crop, the pattern check, the choice and the save, how many photos and comparisons were needed, which resting frogs were tried, how long matching took, the photo size, the phone's browser and screen, and the app version. It exists to measure how the app works in daily use. It shows how long each person took, so tell the people who use the app before you collect it. Set `recordTiming: false` to stop: the page then sends nothing and no Timing sheet is created; rows already written stay until you delete them.

### Home-screen icon (optional)

An Apps Script web app cannot set its own home-screen icon on iPhone. The `docs/` folder is a small page that carries the icon and forwards to an app. The app is named in the link, so no lab's URL is stored in the repository.

1. Enable GitHub Pages for the repository with the `docs/` folder of the main branch as the source.
2. Open the published page, paste your web app URL, and copy the link it gives you.
3. Have people open that link once on their phone. It shows a page with the icon and the steps for adding it to the home screen; they add that page, not the app itself. Afterwards the home-screen icon opens the app directly.
4. Optionally set `faviconUrl` in `Settings.gs` to the published `favicon-32.png` for the browser tab.

You can also use the page published from the original repository instead of your own copy. The link contains your deployment ID, so treat it like the app URL itself; the app still requires sign-in if you limited access in step 8. If you redeploy as a new deployment, the ID changes and people must add the new link. This page has not been tested on every phone.

### Existing photos (optional)

Put image files named after the frog (`125.jpg`, `125 back.png`) into the `import` folder inside "XenoLog photos", then run **Import photos from Drive folder**. Open each frog once in the app and use **Adjust crop** to check the crop. If a photo turns out to show a different frog, use **Remove** under it; it stops being shown or compared, and the file stays in Drive. If you want to keep photos in a folder you made yourself, run **Choose photo folder** first.

### Legacy records (optional)

`importLegacy` in `Code.gs` reads two sheets from the original lab's spreadsheet ("Form Responses 1" from a Google Form, and "Shared with ULAM"). It is specific to those column layouts. Skip it for a new colony, or adapt it to your own history.

## Privacy and data

- Records stay in your spreadsheet and photos in your Drive.
- Photos are cropped and compared on the phone. OpenCV.js is downloaded from jsDelivr the first time; no photo is sent anywhere except your own Drive.
- With "Execute as: Me", the app acts with the deploying account's access, and files it creates belong to that account. Deploy from an account that will outlive individual lab members.

## Development

Sources are in `src/`. `apps-script/Index.html` is generated; do not edit it by hand.

```bash
cd src
python3 build.py          # writes ../apps-script/Index.html and a local test page, dev.html
node test-server.js       # runs Code.gs against in-memory sheets
```

`dev.html` runs the whole app in a normal browser with in-memory data, which is the quickest way to try a change. Serve the folder over http (for example `python3 -m http.server`) because the photo code needs it.

## Related work

- XIBBIT (Tomanin et al., bioRxiv 2026) identifies *Xenopus laevis* by dorsal pattern with a classifier trained per facility and includes colony management. If you can photograph each frog many times and want colony-wide identification, look there first.

## Licence

MIT, see `LICENSE`. OpenCV.js is loaded at run time under its own licence (Apache 2.0).

The app icon was generated with OpenAI's ChatGPT and refined for use in this project.
