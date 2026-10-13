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
- **Automatic matching is experimental.** The app ranks the frogs in a tank by similarity to the new photo, using a general-purpose image model (DINOv2 small) run in the browser. It has not been validated beyond a handful of photos. A person always confirms the identity; treat the ranking as a hint.
- **Automatic cropping is a starting position only.** It finds the back in most photos on a plain background and misses in others. The crop screen lets you drag and resize the square.
- The egg-quality score and the replacement threshold are simple, adjustable rules, not validated measures.
- The record form (water source, quantity, appearance, Ca activation) follows the original lab's form. Changing the questions means editing `Code.gs` and `src/app.js`.

## How identification works

Frogs are housed a few to a tank and each tank's occupants are known, so identifying a frog is a choice among the frogs of one tank rather than the whole colony. The app shows those frogs' photos and status; you pick one. Photos taken at each priming keep the references current as the animals grow.

## Set up

You need a Google account that can create Apps Script projects. For lab use, a Google Workspace domain lets you limit the app to your institution and records who did what.

1. Create a Google Spreadsheet (or open the one that holds your existing records).
2. Open **Extensions > Apps Script**.
3. Replace the contents of `Code.gs` with `apps-script/Code.gs`.
4. Add a script file named `Roster` and paste `apps-script/Roster.gs`. **Edit it first** so it lists your own frogs: ID, whether it is in the colony, tank, arrival date, source, note.
5. Add an HTML file named `Index` and paste `apps-script/Index.html`.
6. Give the project a name, save, and reload the spreadsheet. A menu named **XenoLog** appears.
7. Run **XenoLog > 1. Set up sheets** and approve the permissions. This creates the sheets below and a Drive folder named "XenoLog photos".
8. In Apps Script choose **Deploy > New deployment**, type **Web app**, execute as **Me**, and give access to people in your organisation.
9. Open the web app URL on a phone.

To update the code later, use **Deploy > Manage deployments**, edit the existing deployment, and choose **New version**. That keeps the same URL. "New deployment" creates a second URL and leaves the old one running old code.

### Sheets the app creates

| Sheet | Contents |
|---|---|
| Frogs | One row per frog: ID, status, tank, arrival, source |
| Records | One row per priming, filled in at collection and at return |
| Photos | One row per photo, with a thumbnail, the cropped back and the match vector |
| Match log | What the automatic ranking suggested and what the person chose |
| ULAM view | A flat export of the collected records, rebuilt after each change |
| Import check | Problems found by the optional legacy import |

You can edit Frogs and Records by hand. Keep the header row and column order, and leave `Record ID` and `State` alone.

### Settings

The top of `Code.gs` has the values most labs will want to change:

- `APP_NAME`, `FAVICON_URL`
- `REST_MONTHS` – rest period after a priming
- `TANK_SIZE` – frogs per housing tank
- `OPTIONS` – the choices in the record form
- `QUALITY` – weights and thresholds for the egg-quality score

### Home-screen icon (optional)

An Apps Script web app cannot set its own home-screen icon on iPhone. The `docs/` folder is a small page that carries the icon and forwards to the app.

1. Enable GitHub Pages for this repository with `docs/` as the source.
2. Put your web app URL in `APP_URL` in `docs/index.html`.
3. Have people add the GitHub Pages URL, not the Apps Script URL, to their home screen.
4. Optionally set `FAVICON_URL` in `Code.gs` to the published `favicon-32.png`.

The page is public, so the app URL becomes public too. The app itself still requires sign-in if you limited access in step 8. This forwarding page has not been tested on every phone.

### Existing photos (optional)

Put image files named after the frog (`125.jpg`, `125 back.png`) into the `import` folder inside "XenoLog photos", then run **Import photos from Drive folder**. Open each frog once in the app and use **Adjust crop** to check the crop. If you want to keep photos in a folder you made yourself, run **Choose photo folder** first.

### Legacy records (optional)

`importLegacy` in `Code.gs` reads two sheets from the original lab's spreadsheet ("Form Responses 1" from a Google Form, and "Shared with ULAM"). It is specific to those column layouts. Skip it for a new colony, or adapt it to your own history.

## Privacy and data

- Records stay in your spreadsheet and photos in your Drive.
- Photos are cropped and compared on the phone. The matching model and its runtime are downloaded from jsDelivr and Hugging Face the first time; no photo is sent to them.
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

MIT, see `LICENSE`. The matching model (DINOv2) and Transformers.js are loaded at run time under their own licences (Apache 2.0).

The app icon was generated with OpenAI's ChatGPT and refined for use in this project.
