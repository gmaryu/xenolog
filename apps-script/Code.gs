/**
 * XenoLog - server side.
 * Google Apps Script bound to the lab spreadsheet. The web page (Index.html) calls the
 * public functions below through google.script.run. Functions ending in "_" are private.
 *
 * This script only writes to the sheets it creates (Frogs, Records, Photos, Match log,
 * Timing, Vet view, Import check). It reads "Form Responses 1" and "Shared with ULAM" during
 * the one-time import and never changes them.
 */

/* ------------------------------------------------------------------ lab settings
 * Each lab sets its own values in Settings.gs (const SETTINGS = { ... }), so pasting a newer Code.gs keeps them.
 * A key left out there takes the value below; options, quality and legacyWater are merged key by key. */
const DEFAULTS = {
  appName: 'XenoLog',            // browser tab title and the name of the spreadsheet menu
  faviconUrl: '',                // optional: public https link to a PNG shown in the browser tab
  restMonths: 3,                 // months a frog rests after a priming
  tankSize: 3,                   // frogs per housing tank
  primingBatch: 4,               // frogs usually primed together; the Priming tab suggests this many
  removalReasons: ['Died', 'Escaped', 'Euthanized', 'Other'],   // offered when a frog is removed from the colony
  recordTiming: true,            // false stops the Timing sheet: how long each step of a priming took, per person (see README)
  // Choices offered in the record form, least to most favourable.
  options: {
    water: ['MilliQ', 'RO'],
    quantity: ['None', 'Few', 'Normal', 'Many'],
    appearance: ['None', 'Bad', 'Not bad', 'Good', 'Great'],
    ca: ['Turned to white', 'Looking good']
  },
  // Egg quality score and replacement candidates. appearance and quantity give each choice above a value; 0 means no usable eggs.
  quality: {
    squeezedWeight: 0.7,     // squeezed eggs count this much, laid eggs the rest
    appearanceWeight: 0.7,   // within one egg type: appearance counts this much, quantity the rest
    cycles: 3,               // how many of the most recent cycles are averaged
    threshold: 45,           // candidate when the average of two or more cycles is below this (0-100)
    firstThreshold: 30,      // candidate when the only cycle so far scored this or less
    appearance: { 'Great': 4, 'Good': 3, 'Not bad': 2, 'Bad': 1, 'None': 0 },
    quantity: { 'Many': 3, 'Normal': 2, 'Few': 1, 'None': 0 }
  },
  // Old water-source spellings in the legacy form, lower case, and the choice each is read as.
  legacyWater: { 'milliq': 'MilliQ', 'milli-q': 'MilliQ', 'ro': 'RO', '-': '' }
};
// Read when needed, never at load time: Apps Script does not promise the order in which Settings.gs and Code.gs load.
function setting_(key) {
  const own = typeof SETTINGS === 'undefined' ? {} : SETTINGS, d = DEFAULTS[key];
  if (!(key in own)) return d;
  const v = own[key];
  return d && typeof d === 'object' && !Array.isArray(d) && v && typeof v === 'object' ? Object.assign({}, d, v) : v;
}

const PHOTOS_PER_FROG = 5;      // newest photos sent to the page for comparison
const CELL_LIMIT = 49000;       // Sheets refuses cells over 50,000 characters

const APP_VERSION = '1.2.0';   // written into the Timing sheet, so collected data can be tied to a release
const SHEETS = { FROGS: 'Frogs', RECORDS: 'Records', PHOTOS: 'Photos', MATCH: 'Match log', TIMING: 'Timing', VET: 'Vet view', CHECK: 'Import check' };
const LEGACY = { FORM: 'Form Responses 1', SHARED: 'Shared with ULAM' };

const FROG_COLS = ['Animal ID', 'Status', 'Tank', 'Arrival date', 'Source', 'Notes', 'Removed on', 'Updated at', 'Updated by', 'Removal reason'];
const REC_COLS = ['Record ID', 'Animal ID', 'Priming Date', 'Collection Date', 'Name', 'MMR H2O source',
  'Quantity (Squeezed Eggs)', 'Appearance (Squeezed Eggs)', 'After Ca activation (Squeezed Eggs)',
  'Quantity (Laid Eggs)', 'Appearance (Laid Eggs)', 'After Ca activation (Laid Eggs)', 'Comments',
  'State', 'Origin', 'Original values', 'Created at', 'Updated at', 'Updated by', 'Frog activity'];
const REC_TEXT = [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];   // Frog activity stays a number
const ACTIVITY = ['1', '2', '3', '4', '5'];   // how much the frog moved and resisted during collection, 1 calm to 5 struggled hard
const PHOTO_COLS = ['Photo ID', 'Animal ID', 'Date', 'Kind', 'Drive file ID', 'Thumb', 'Pattern', 'Embedding', 'Crop', 'Added by', 'Added at'];
const MATCH_COLS = ['Time', 'User', 'Tank', 'Chosen ID', 'Suggested ID', 'Agreed', 'Matching points'];
// One row per frog in a saved priming. The phone's clock time the frog's tank was opened, then seconds from there to each step
// (negative when the photo was taken while another tank was open). Counts and "Earlier tanks" cover every tank opened since the previous frog.
const TIMING_COLS = ['Time', 'User', 'Version', 'Animal ID', 'Tank', 'Tank opened', 'Photo (s)', 'Crop (s)', 'Match (s)', 'Picked (s)', 'Saved (s)',
  'Photos taken', 'Back found automatically', 'Crop adjusted', 'Compare opens', 'Tank opens', 'Resting frogs tried', 'Match ms', 'Photo size', 'Device', 'Matcher load ms',
  'Earlier tanks (s)'];
const VET_COLS = ['Animal ID', 'System #', 'Arrival Date', 'Source', 'Collection Date', '# Collected (Laid)', 'Appearance (Laid)',
  'After Ca2+ (Laid)', '# Collected (Squeezed)', 'Appearance (Squeezed)', 'After Ca2+ (Squeezed)', 'MMR H2O source', 'Notes',
  'Fertilized', '% viable pre-injection', '% viable post-injection'];
const CHECK_COLS = ['Source sheet', 'Row', 'Animal ID', 'Issue', 'Detail'];

// How old spellings are read during the import. The original text is kept in "Original values".
// A value that is not listed here is imported unchanged and listed in "Import check".
const LEGACY_MAP = {
  quantity: { 'many': 'Many', 'normal': 'Normal', 'few': 'Few', 'none': 'None', 'ok': 'Normal', '-': '' },
  appearance: { 'great': 'Great', 'good': 'Good', 'not bad': 'Not bad', 'bad': 'Bad', 'none': 'None', 'ok': 'Not bad', '-': '' },
  ca: { 'looking good': 'Looking good', 'turned to white': 'Turned to white', 'good': 'Looking good', '-': '' }
};   // water: legacyWater in the settings

/* ------------------------------------------------------------------ entry points */

function doGet() {
  const page = HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(setting_('appName'))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
  if (setting_('faviconUrl')) page.setFaviconUrl(setting_('faviconUrl'));
  return page;
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu(setting_('appName'))
    .addItem('1. Set up sheets', 'setup')
    .addItem('2. Import legacy records', 'importLegacy')
    .addItem('Import photos from Drive folder', 'importPhotos')
    .addItem('Choose photo folder', 'choosePhotoFolder')
    .addItem('Rebuild Vet view', 'rebuildVetView')
    .addToUi();
}

/* ------------------------------------------------------------------ helpers */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function tz_() { return ss_().getSpreadsheetTimeZone(); }
function iso_(d) { return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd'); }
function today_() { return iso_(new Date()); }
function now_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm:ss'); }
function d_(v) { return v instanceof Date ? iso_(v) : String(v == null ? '' : v).trim(); }
function s_(v) { return String(v == null ? '' : v).trim(); }
function pad_(n) { return (n < 10 ? '0' : '') + n; }

function user_() {
  const email = Session.getActiveUser().getEmail();
  return email ? email.split('@')[0] : 'unknown';
}

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" is missing. Open the spreadsheet and run ' + setting_('appName') + ' > Set up sheets.');
  return sh;
}

function addMonths_(iso, n) {
  const p = iso.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1 + n, p[2]);
  return d.getFullYear() + '-' + pad_(d.getMonth() + 1) + '-' + pad_(d.getDate());
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function body_(sh, cols) {
  const n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, cols).getValues() : [];
}

function readFrogs_() {
  return body_(sheet_(SHEETS.FROGS), FROG_COLS.length).map(function (r, i) {
    return { row: i + 2, id: Number(r[0]), inColony: s_(r[1]) === 'In colony', tank: r[2] === '' ? '' : Number(r[2]),
      arrival: d_(r[3]), source: s_(r[4]), notes: s_(r[5]), removedOn: d_(r[6]), removalReason: s_(r[9]) };
  }).filter(function (f) { return f.id > 0; });
}

function readRecords_() {
  return body_(sheet_(SHEETS.RECORDS), REC_COLS.length).map(function (r, i) {
    return { row: i + 2, id: s_(r[0]), frog: Number(r[1]), priming: d_(r[2]), collection: d_(r[3]), name: s_(r[4]), water: s_(r[5]),
      sqQty: s_(r[6]), sqApp: s_(r[7]), sqCa: s_(r[8]), laidQty: s_(r[9]), laidApp: s_(r[10]), laidCa: s_(r[11]),
      comments: s_(r[12]), state: s_(r[13]), origin: s_(r[14]), activity: s_(r[19]) };
  }).filter(function (r) { return r.id !== ''; });
}

// One egg type in one cycle, 0 to 1. "None" for either answer means no usable eggs. null when nothing was recorded.
function typeScore_(appearance, quantity) {
  const Q = setting_('quality'), top = function (m) { return Math.max.apply(null, Object.keys(m).map(function (k) { return m[k]; })); };
  const a = Q.appearance[appearance], q = Q.quantity[quantity];
  if (a === undefined && q === undefined) return null;
  if (a === 0 || q === 0) return 0;
  if (a === undefined) return q / top(Q.quantity);
  if (q === undefined) return a / top(Q.appearance);
  return Q.appearanceWeight * a / top(Q.appearance) + (1 - Q.appearanceWeight) * q / top(Q.quantity);
}

// One cycle, 0 to 100, or null when it cannot be scored (not collected, or old free-text values).
function cycleScore_(r) {
  if (!r.collection || r.state === 'Cancelled' || r.state === 'Not used') return null;
  const s = typeScore_(r.sqApp, r.sqQty), l = typeScore_(r.laidApp, r.laidQty);
  if (s === null && l === null) return null;
  const w = setting_('quality').squeezedWeight, v = s === null ? l : l === null ? s : w * s + (1 - w) * l;
  return Math.round(v * 100);
}

// scored: [{date, score}] for one frog. Returns the summary shown in the Frogs tab.
function quality_(scored) {
  scored.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  const Q = setting_('quality'), recent = scored.slice(0, Q.cycles).map(function (x) { return x.score; });
  if (!recent.length) return { score: null, recent: [], cycles: 0, candidate: false, reason: '' };
  const mean = Math.round(recent.reduce(function (t, x) { return t + x; }, 0) / recent.length);
  let reason = '';
  if (scored.length === 1 && mean <= Q.firstThreshold) reason = 'First cycle scored ' + mean;
  else if (scored.length > 1 && mean < Q.threshold) reason = 'Last ' + recent.length + ' cycles average ' + mean;
  return { score: mean, recent: recent, cycles: scored.length, candidate: reason !== '', reason: reason };
}

function isOpen_(r) { return r.state === 'In use' || r.state === 'Recorded'; }
function publicRecord_(r) { const o = {}; Object.keys(r).forEach(function (k) { if (k !== 'row') o[k] = r[k]; }); return o; }

// First four columns of every photo row; the image columns are read only when needed.
function photoIndex_() {
  return body_(sheet_(SHEETS.PHOTOS), 4).map(function (r, i) {
    return { row: i + 2, photoId: s_(r[0]), frog: Number(r[1]), date: d_(r[2]), kind: s_(r[3]) };
  }).filter(function (p) { return p.photoId !== '' && p.kind !== 'cancelled' && p.kind !== 'removed'; });
}

function photoCells_(row) {
  const v = sheet_(SHEETS.PHOTOS).getRange(row, 5, 1, 5).getValues()[0];
  return { fileId: s_(v[0]), thumb: s_(v[1]), pattern: s_(v[2]), emb: s_(v[3]), crop: s_(v[4]) };
}

function buildState_(withThumbs) {
  const today = today_();
  const last = {}, open = {}, scored = {};
  readRecords_().forEach(function (r) {
    if (r.state === 'Cancelled') return;                 // entered by mistake: does not count as a use
    const cs = cycleScore_(r);
    if (cs !== null) (scored[r.frog] = scored[r.frog] || []).push({ date: r.collection, score: cs });
    const used = r.priming || r.collection;
    if (used && used <= today && (!last[r.frog] || used > last[r.frog])) last[r.frog] = used;
    if (isOpen_(r)) open[r.frog] = publicRecord_(r);
  });
  const count = {}, newest = {};
  photoIndex_().forEach(function (p) { count[p.frog] = (count[p.frog] || 0) + 1; newest[p.frog] = p.row; });
  const frogs = readFrogs_().map(function (f) {
    const o = { id: f.id, inColony: f.inColony, tank: f.tank, arrival: f.arrival, source: f.source, notes: f.notes, removedOn: f.removedOn, removalReason: f.removalReason,
      lastPriming: last[f.id] || '', restUntil: last[f.id] ? addMonths_(last[f.id], setting_('restMonths')) : '', open: open[f.id] || null,
      photos: count[f.id] || 0, quality: quality_(scored[f.id] || []) };
    if (withThumbs && f.inColony && newest[f.id]) o.thumb = photoCells_(newest[f.id]).thumb;
    return o;
  });
  const Q = setting_('quality');
  return { user: user_(), today: today, recordTiming: setting_('recordTiming'), restMonths: setting_('restMonths'), tankSize: setting_('tankSize'), primingBatch: setting_('primingBatch'), appName: setting_('appName'),
    options: setting_('options'), removalReasons: setting_('removalReasons'), frogs: frogs,
    qualityRule: { squeezed: Math.round(Q.squeezedWeight * 100), cycles: Q.cycles, threshold: Q.threshold, firstThreshold: Q.firstThreshold } };
}

/* ------------------------------------------------------------------ photos */

function folder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PHOTO_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* folder was deleted: make a new one */ } }
  const folder = DriveApp.createFolder(setting_('appName') + ' photos');
  props.setProperty('PHOTO_FOLDER_ID', folder.getId());
  return folder;
}

function fit_(text) { text = s_(text); return text.length > CELL_LIMIT ? '' : text; }

function savePhoto_(frogId, photo, kind, user) {
  const photoId = 'P' + Utilities.getUuid().slice(0, 8);
  const today = today_();
  const bytes = Utilities.base64Decode(String(photo.full).split(',')[1]);
  const file = folder_().createFile(Utilities.newBlob(bytes, 'image/jpeg', 'frog-' + frogId + '_' + today + '_' + photoId + '.jpg'));
  sheet_(SHEETS.PHOTOS).appendRow([photoId, frogId, today, kind, file.getId(), fit_(photo.thumb), fit_(photo.pattern), fit_(photo.emb),
    s_(photo.crop), user, now_()]);
  return photoId;
}

function getFullPhoto(photoId) {
  const hit = photoIndex_().filter(function (p) { return p.photoId === photoId; })[0];
  if (!hit) throw new Error('Photo not found.');
  const blob = DriveApp.getFileById(photoCells_(hit.row).fileId).getBlob();
  return 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

function photosOf_(index, frogId, limit, withEmb) {
  const mine = index.filter(function (p) { return p.frog === frogId; });
  return mine.slice(Math.max(0, mine.length - limit)).map(function (p) {
    const c = photoCells_(p.row);
    const o = { photoId: p.photoId, date: p.date, kind: p.kind, pattern: c.pattern, thumb: c.thumb, crop: c.crop, hasEmb: c.emb !== '' };
    if (withEmb) o.emb = c.emb;
    return o;
  });
}

/** Newest photos of each listed frog, for the comparison screen and the pattern check. */
function getTankPhotos(ids) {
  const index = photoIndex_(), out = {};
  (ids || []).forEach(function (id) { out[id] = photosOf_(index, Number(id), PHOTOS_PER_FROG, true); });
  return out;
}

/** Thumbnail and back pattern that the page worked out for a photo that had none. (emb is unused now and stored empty.) */
function savePhotoDerived(list) {
  return withLock_(function () {
    const index = photoIndex_(), sh = sheet_(SHEETS.PHOTOS);
    (list || []).forEach(function (d) {
      const hit = index.filter(function (p) { return p.photoId === d.photoId; })[0];
      if (hit) sh.getRange(hit.row, 6, 1, 4).setValues([[fit_(d.thumb), fit_(d.pattern), fit_(d.emb), s_(d.crop)]]);
    });
    return true;
  });
}

/**
 * Takes a photo out of the app, for example one that turned out to show a different frog.
 * The row and the Drive file stay; Kind becomes "removed", so it is no longer shown or compared.
 */
function removePhoto(frogId, photoId) {
  return withLock_(function () {
    const hit = photoIndex_().filter(function (p) { return p.photoId === photoId && p.frog === Number(frogId); })[0];
    if (!hit) throw new Error('Photo not found. Reload the page and try again.');
    sheet_(SHEETS.PHOTOS).getRange(hit.row, 4).setValue('removed');
    return getFrogDetail(frogId);
  });
}

function addPhoto(frogId, photo) {
  return withLock_(function () {
    savePhoto_(Number(frogId), photo, 'added', user_());
    return getFrogDetail(frogId);
  });
}

/* ------------------------------------------------------------------ page API */

function getState() { return buildState_(false); }

/** Newest thumbnail of each frog in the colony, read in one go. The page asks for this after it is on screen. */
function getThumbs() {
  const index = photoIndex_(), out = {};
  if (!index.length) return out;
  const sh = sheet_(SHEETS.PHOTOS), col = sh.getRange(2, 6, sh.getLastRow() - 1, 1).getValues();
  const inColony = {};
  readFrogs_().forEach(function (f) { if (f.inColony) inColony[f.id] = true; });
  index.forEach(function (p) { const t = s_(col[p.row - 2][0]); if (t && inColony[p.frog]) out[p.frog] = t; });
  return out;
}

function getFrogDetail(frogId) {
  frogId = Number(frogId);
  const records = readRecords_().filter(function (r) { return r.frog === frogId && r.state !== 'Cancelled'; })
    .map(function (r) { const o = publicRecord_(r); o.score = cycleScore_(r); return o; });
  records.sort(function (a, b) { return (b.priming || b.collection) < (a.priming || a.collection) ? -1 : 1; });
  return { id: frogId, records: records, photos: photosOf_(photoIndex_(), frogId, 50, false) };
}

/** payload.items: [{ id, photo: {full, thumb, pattern, emb, crop} | null, match: {tank, best, scores} | null }] */
function savePriming(payload) {
  return withLock_(function () {
    const user = user_(), today = today_(), stamp = now_();
    const byId = {};
    buildState_(false).frogs.forEach(function (f) { byId[f.id] = f; });
    const items = (payload && payload.items) || [];
    if (!items.length) throw new Error('No frogs were selected.');
    const seen = {};
    items.forEach(function (it) {
      const f = byId[it.id];
      if (!f || !f.inColony) throw new Error('#' + it.id + ' is not in the colony.');
      if (seen[it.id]) throw new Error('#' + it.id + ' was selected twice.');
      seen[it.id] = true;
      if (f.open) throw new Error('#' + it.id + ' is already in use (primed ' + f.open.priming + ' by ' + f.open.name + ').');
      if (f.restUntil > today) throw new Error('#' + it.id + ' is resting until ' + f.restUntil + '.');
    });
    const rows = items.map(function (it, i) {
      const r = REC_COLS.map(function () { return ''; });
      r[0] = 'R' + Date.now() + '-' + Utilities.getUuid().slice(0, 6) + i;   /* unique even within one millisecond */ r[1] = it.id; r[2] = today; r[4] = user; r[13] = 'In use'; r[14] = 'app';
      r[16] = stamp; r[17] = stamp; r[18] = user;
      return r;
    });
    const sh = sheet_(SHEETS.RECORDS);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, REC_COLS.length).setValues(rows);
    items.forEach(function (it) {
      if (it.photo && it.photo.full) savePhoto_(it.id, it.photo, 'priming', user);
      if (it.match) {
        sheet_(SHEETS.MATCH).appendRow([stamp, user, it.match.tank, it.id, it.match.best, it.match.best ? (Number(it.match.best) === Number(it.id) ? 'yes' : 'no') : 'no suggestion',
          JSON.stringify(it.match.scores || {})]);
      }
    });
    saveTiming_(items, byId, payload.client || {}, stamp, user);
    return buildState_(false);
  });
}

// Measurements for the study of the app in use. A missing sheet is created here, so a priming never fails for want of it.
function saveTiming_(items, byId, client, stamp, user) {
  const timed = items.filter(function (it) { return it.timing; });
  if (!setting_('recordTiming') || !timed.length) return;
  const sh = ensureSheet_(SHEETS.TIMING, TIMING_COLS, [1, 2, 3, 6, 13, 14, 17, 19, 20]);   // also adds headings of columns added since
  const num = function (v) { return v === '' || v == null || isNaN(Number(v)) ? '' : Number(v); };
  const yes = function (v) { return v == null ? '' : (v ? 'yes' : 'no'); };
  const rows = timed.map(function (it) {
    const t = it.timing;
    return [stamp, user, APP_VERSION, it.id, byId[it.id].tank, s_(t.opened).slice(0, 30), num(t.photo), num(t.crop), num(t.match), num(t.picked), num(t.saved),
      num(t.photos), yes(t.found), yes(t.moved), num(t.compares), num(t.opens), s_(t.resting).slice(0, 200), num(t.matchMs), s_(t.size).slice(0, 20),
      s_(client.device).slice(0, 300), num(client.matcherLoadMs), num(t.earlier)];
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, TIMING_COLS.length).setValues(rows);
}

function findRecord_(recordId) {
  const rec = readRecords_().filter(function (r) { return r.id === recordId; })[0];
  if (!rec) throw new Error('Record not found. Reload the page and try again.');
  return rec;
}

function pick_(value, allowed) { value = s_(value); return allowed.indexOf(value) >= 0 ? value : ''; }

function touch_(row) { sheet_(SHEETS.RECORDS).getRange(row, 18, 1, 2).setValues([[now_(), user_()]]); }

function saveRecord(recordId, f) {
  return withLock_(function () {
    const rec = findRecord_(recordId);
    if (!isOpen_(rec)) throw new Error('This frog has already been returned. Edit the record from its history instead.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s_(f.collection))) throw new Error('Enter the collection date.');
    const O = setting_('options');
    sheet_(SHEETS.RECORDS).getRange(rec.row, 4, 1, 11).setValues([[f.collection, user_(), pick_(f.water, O.water),
      pick_(f.sqQty, O.quantity), pick_(f.sqApp, O.appearance), pick_(f.sqCa, O.ca),
      pick_(f.laidQty, O.quantity), pick_(f.laidApp, O.appearance), pick_(f.laidCa, O.ca),
      s_(f.comments), 'Recorded']]);
    ensureSheet_(SHEETS.RECORDS, REC_COLS, REC_TEXT);   // adds the Frog activity heading to a sheet made before 1.2.0
    sheet_(SHEETS.RECORDS).getRange(rec.row, 20).setValue(pick_(f.activity, ACTIVITY));
    touch_(rec.row);
    rebuildVet_();
    return buildState_(false);
  });
}

/** After Ca activation and comments stay editable, also after the frog went back to its tank. */
function updateRecord(recordId, f) {
  return withLock_(function () {
    const rec = findRecord_(recordId), sh = sheet_(SHEETS.RECORDS);
    const ca = setting_('options').ca;
    sh.getRange(rec.row, 9).setValue(pick_(f.sqCa, ca));
    sh.getRange(rec.row, 12, 1, 2).setValues([[pick_(f.laidCa, ca), s_(f.comments)]]);
    touch_(rec.row);
    rebuildVet_();
    return buildState_(false);
  });
}

function returnFrog(recordId) {
  return withLock_(function () {
    const rec = findRecord_(recordId);
    if (!isOpen_(rec)) throw new Error('This frog has already been returned.');
    sheet_(SHEETS.RECORDS).getRange(rec.row, 14).setValue(rec.state === 'Recorded' ? 'Returned' : 'Not used');
    touch_(rec.row);
    return buildState_(false);
  });
}

/**
 * Undo for a priming saved by mistake (wrong frog, or the frog was not injected after all).
 * Only before an egg record exists. The row stays in Records as "Cancelled" so there is a trace;
 * the photo taken with that priming is hidden, because it may show a different frog.
 */
function cancelPriming(recordId) {
  return withLock_(function () {
    const rec = findRecord_(recordId);
    if (rec.state !== 'In use') throw new Error('Only a priming without an egg record can be cancelled. Edit the Records sheet for anything else.');
    sheet_(SHEETS.RECORDS).getRange(rec.row, 14).setValue('Cancelled');
    touch_(rec.row);
    const photos = sheet_(SHEETS.PHOTOS);
    photoIndex_().forEach(function (p) {
      if (p.frog === rec.frog && p.kind === 'priming' && p.date === rec.priming) photos.getRange(p.row, 4).setValue('cancelled');
    });
    return buildState_(false);
  });
}

function addFrog(f) {
  return withLock_(function () {
    const frogs = readFrogs_();
    const id = frogs.reduce(function (m, x) { return Math.max(m, x.id); }, 0) + 1;
    const tank = Number(f.tank);
    if (!(tank > 0)) throw new Error('Choose a tank.');
    if (frogs.filter(function (x) { return x.inColony && x.tank === tank; }).length >= setting_('tankSize')) throw new Error('Tank ' + tank + ' is full.');
    sheet_(SHEETS.FROGS).appendRow([id, 'In colony', tank, s_(f.arrival), s_(f.source), s_(f.notes), '', now_(), user_()]);
    if (f.photo && f.photo.full) savePhoto_(id, f.photo, 'registration', user_());
    const state = buildState_(false);
    state.newId = id;
    return state;
  });
}

/** reason: one of the removalReasons setting. note: optional free text, added to the frog's Notes. */
function removeFrog(frogId, reason, note) {
  return withLock_(function () {
    frogId = Number(frogId);
    reason = pick_(reason, setting_('removalReasons'));
    if (!reason) throw new Error('Choose why the frog is being removed.');
    const f = readFrogs_().filter(function (x) { return x.id === frogId; })[0];
    if (!f) throw new Error('Frog not found.');
    if (readRecords_().some(function (r) { return r.frog === frogId && isOpen_(r); })) throw new Error('#' + frogId + ' is in use. Return it first.');
    const sh = sheet_(SHEETS.FROGS);
    sh.getRange(f.row, 2, 1, 2).setValues([['Removed', '']]);
    if (s_(note)) sh.getRange(f.row, 6).setValue(f.notes ? f.notes + '; ' + s_(note) : s_(note));
    sh.getRange(f.row, 7, 1, 4).setValues([[today_(), now_(), user_(), reason]]);
    return buildState_(false);
  });
}

/** Tank exchange: frogs in the colony, in ID order, tankSize (setting) per tank starting at Tank 1. */
function applyExchange() {
  return withLock_(function () {
    const sh = sheet_(SHEETS.FROGS), stamp = now_(), user = user_();
    readFrogs_().filter(function (f) { return f.inColony; }).sort(function (a, b) { return a.id - b.id; }).forEach(function (f, i) {
      const tank = Math.floor(i / setting_('tankSize')) + 1;
      if (tank !== f.tank) { sh.getRange(f.row, 3).setValue(tank); sh.getRange(f.row, 8, 1, 2).setValues([[stamp, user]]); }
    });
    rebuildVet_();
    return buildState_(false);
  });
}

/* ------------------------------------------------------------------ Vet view */

function rebuildVetView() { rebuildVet_(); }

// For the veterinary staff. Same columns as the legacy "Shared with ULAM" sheet, rebuilt from Records whenever a record changes.
function rebuildVet_() {
  const frogs = {};
  readFrogs_().forEach(function (f) { frogs[f.id] = f; });
  const rows = readRecords_().filter(function (r) { return r.collection; }).sort(function (a, b) {
    return a.collection < b.collection ? -1 : a.collection > b.collection ? 1 : a.frog - b.frog;
  }).map(function (r) {
    const f = frogs[r.frog] || {};
    return [r.frog, f.tank || '', f.arrival || '', f.source || '', r.collection, r.laidQty, r.laidApp, r.laidCa, r.sqQty, r.sqApp, r.sqCa,
      r.water, r.comments, '', '', ''];
  });
  const sh = sheet_(SHEETS.VET);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, VET_COLS.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, VET_COLS.length).setValues(rows);
}

/* ------------------------------------------------------------------ setup and import (run from the spreadsheet menu) */

function ensureSheet_(name, cols, textCols) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    sh.setFrozenRows(1);
    // Plain text keeps dates as yyyy-mm-dd and stops Sheets from reinterpreting IDs and image data.
    (textCols || []).forEach(function (c) { sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@'); });
  } else {
    // A sheet made by an earlier version: add the headings of columns that were introduced since.
    const have = sh.getRange(1, 1, 1, cols.length).getValues()[0];
    cols.forEach(function (c, i) { if (s_(have[i]) === '') sh.getRange(1, i + 1).setValue(c); });
  }
  return sh;
}

function setup() {
  const frogs = ensureSheet_(SHEETS.FROGS, FROG_COLS, [4, 5, 6, 7, 8, 9, 10]);
  ensureSheet_(SHEETS.RECORDS, REC_COLS, REC_TEXT);
  ensureSheet_(SHEETS.PHOTOS, PHOTO_COLS, [1, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  ensureSheet_(SHEETS.MATCH, MATCH_COLS, [1, 2, 7]);
  if (setting_('recordTiming')) ensureSheet_(SHEETS.TIMING, TIMING_COLS, [1, 2, 3, 6, 13, 14, 17, 19, 20]);
  ensureSheet_(SHEETS.VET, VET_COLS, [3, 4, 5, 13]);
  ensureSheet_(SHEETS.CHECK, CHECK_COLS, [5]);
  if (frogs.getLastRow() === 1 && typeof ROSTER !== 'undefined') {
    const stamp = now_();
    const rows = ROSTER.map(function (r) { return [r[0], r[1] ? 'In colony' : 'Removed', r[1] ? r[2] : '', r[3], r[4], r[5], '', stamp, 'setup', '']; });
    frogs.getRange(2, 1, rows.length, FROG_COLS.length).setValues(rows);
  }
  folder_();
}

function legacyDate_(text) {
  const m = s_(text).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return '';
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  const iso = y + '-' + pad_(Number(m[1])) + '-' + pad_(Number(m[2]));
  return (y < 2015 || iso > today_()) ? '' : iso;
}

function legacyValue_(kind, raw, note) {
  raw = s_(raw);
  if (raw === '') return '';
  const key = raw.toLowerCase(), map = kind === 'water' ? setting_('legacyWater') : LEGACY_MAP[kind];
  if (!(key in map)) { note('Value not in the current choices, kept as written', kind + ': "' + raw + '"'); return raw; }
  // Reinterpretations are listed for review; completing a short water-source name or dropping a "-" placeholder is not one.
  if (kind !== 'water' && map[key] !== '' && map[key].toLowerCase() !== key) note('Old spelling read as a current choice', kind + ': "' + raw + '" -> "' + map[key] + '"');
  return map[key];
}

/**
 * One-time import of "Form Responses 1" and of the rows in "Shared with ULAM" that the form
 * does not have. Refuses to run twice. Problems are listed in "Import check".
 */
function importLegacy() {
  const ss = ss_(), out = sheet_(SHEETS.RECORDS);
  if (readRecords_().some(function (r) { return r.origin === 'form' || r.origin === 'ulam'; })) {
    throw new Error('Legacy records were already imported. Delete the rows with Origin "form" or "ulam" in Records to import again.');
  }
  const issues = [], rows = [], keys = {}, stamp = now_();

  function add(source, rowNo, id, f, raw, origin) {
    const note = function (issue, detail) { issues.push([source, rowNo, id, issue, detail]); };
    const collection = legacyDate_(f.collection), priming = legacyDate_(f.priming);
    if (!/^\d+$/.test(id)) { note('No Animal ID, row skipped', ''); return; }
    if (s_(f.collection) && !collection) note('Collection date unreadable or in the future, left blank', s_(f.collection));
    if (s_(f.priming) && !priming) note('Priming date unreadable or in the future, left blank', s_(f.priming));
    if (priming && collection && (collection < priming || collection > addMonths_(priming, 1))) note('Priming and collection dates are far apart', priming + ' / ' + collection);
    const key = id + '|' + collection;
    if (keys[key]) note('Same frog and collection date as another row', key);
    keys[key] = true;
    const r = REC_COLS.map(function () { return ''; });
    r[0] = 'L' + ('000' + (rows.length + 1)).slice(-4); r[1] = Number(id); r[2] = priming; r[3] = collection; r[4] = s_(f.name);
    r[5] = legacyValue_('water', f.water, note);
    r[6] = legacyValue_('quantity', f.sqQty, note); r[7] = legacyValue_('appearance', f.sqApp, note); r[8] = legacyValue_('ca', f.sqCa, note);
    r[9] = legacyValue_('quantity', f.laidQty, note); r[10] = legacyValue_('appearance', f.laidApp, note); r[11] = legacyValue_('ca', f.laidCa, note);
    r[12] = s_(f.comments); r[13] = 'Legacy'; r[14] = origin; r[15] = JSON.stringify(raw); r[16] = stamp; r[17] = stamp; r[18] = 'import';
    rows.push(r);
  }

  const form = ss.getSheetByName(LEGACY.FORM);
  if (!form) throw new Error('Sheet "' + LEGACY.FORM + '" was not found.');
  const fv = form.getDataRange().getDisplayValues(), head = fv[0].map(s_);
  const col = function (name) { const i = head.indexOf(name); if (i < 0) throw new Error('Column "' + name + '" was not found in ' + LEGACY.FORM + '.'); return i; };
  const c = { id: col('Animal ID'), name: col('Name'), collection: col('Collection Date'), priming: col('Priming Date'), water: col('MMR H2O source'),
    sqQty: col('Quantity (Squeezed Eggs)'), sqApp: col('Appearance (Squeezed Eggs)'), sqCa: col('After Ca activation (Squeezed Eggs)'),
    laidQty: col('Quantity (Laid Eggs)'), laidApp: col('Appearance (Laid Eggs)'), laidCa: col('After Ca activation (Laid Eggs)'), comments: col('Comments') };
  for (let i = 1; i < fv.length; i++) {
    const v = fv[i];
    if (!v.some(function (x) { return s_(x) !== ''; })) continue;
    const f = {};
    Object.keys(c).forEach(function (k) { f[k] = v[c[k]]; });
    add(LEGACY.FORM, i + 1, s_(f.id), f, f, 'form');
  }

  const shared = ss.getSheetByName(LEGACY.SHARED);
  if (shared) {
    const uv = shared.getDataRange().getDisplayValues();
    for (let i = 1; i < uv.length; i++) {
      const v = uv[i], id = s_(v[0]);
      if (!id) continue;
      const collection = legacyDate_(v[4]);
      if (collection && keys[id + '|' + collection]) continue;      // the form already has this record
      const f = { collection: v[4], priming: '', name: '', laidQty: v[5], laidApp: v[6], laidCa: v[7], sqQty: v[8], sqApp: v[9], sqCa: v[10], water: v[11], comments: v[12] };
      if (collection >= '2025-01-01') issues.push([LEGACY.SHARED, i + 1, id, 'Not in Form Responses although the form was in use (possible date typo)', collection]);
      add(LEGACY.SHARED, i + 1, id, f, f, 'ulam');
    }
  }

  rows.sort(function (a, b) { return a[3] < b[3] ? -1 : a[3] > b[3] ? 1 : a[1] - b[1]; });
  if (rows.length) out.getRange(out.getLastRow() + 1, 1, rows.length, REC_COLS.length).setValues(rows);
  const check = sheet_(SHEETS.CHECK);
  if (check.getLastRow() > 1) check.getRange(2, 1, check.getLastRow() - 1, CHECK_COLS.length).clearContent();
  if (issues.length) check.getRange(2, 1, issues.length, CHECK_COLS.length).setValues(issues);
  rebuildVet_();
}

/**
 * Registers existing photos. Put image files named after the frog ("125.jpg", "125 back.png")
 * in the "import" folder inside "XenoLog photos", then run this from the menu.
 * The page crops them and works out the thumbnail the first time each one is shown.
 */
function importPhotos() {
  const folder = folder_();
  const sub = folder.getFoldersByName('import');
  const src = sub.hasNext() ? sub.next() : folder.createFolder('import');
  const known = {};
  body_(sheet_(SHEETS.PHOTOS), 5).forEach(function (r) { known[s_(r[4])] = true; });
  const frogIds = {};
  readFrogs_().forEach(function (f) { frogIds[f.id] = true; });
  const rows = [], stamp = now_();
  const n = { seen: 0, already: 0, noId: [], notImage: [] };
  (function walk(dir) {                       // also looks inside folders placed in "import"
    const files = dir.getFiles();
    while (files.hasNext()) {
      const file = files.next(), name = file.getName(), m = name.match(/^\s*#?(\d+)/);
      n.seen++;
      if (known[file.getId()]) { n.already++; continue; }
      if (file.getMimeType().indexOf('image/') !== 0) { n.notImage.push(name); continue; }
      if (!m || !frogIds[Number(m[1])]) { n.noId.push(name); continue; }
      rows.push(['P' + Utilities.getUuid().slice(0, 8), Number(m[1]), iso_(file.getDateCreated()), 'registration', file.getId(), '', '', '', '', 'import', stamp]);
    }
    const dirs = dir.getFolders();
    while (dirs.hasNext()) walk(dirs.next());
  })(src);
  rows.sort(function (a, b) { return a[1] - b[1]; });
  const sh = sheet_(SHEETS.PHOTOS);
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, PHOTO_COLS.length).setValues(rows);
  const few = function (list) { return list.slice(0, 8).join(', ') + (list.length > 8 ? ', ...' : ''); };
  say_('Import photos',
    'Folder searched:\n' + src.getUrl() + '\n\n' +
    'Files found: ' + n.seen + '\nNewly registered: ' + rows.length + '\nAlready registered: ' + n.already +
    (n.noId.length ? '\nName does not start with an ID in the Frogs sheet: ' + n.noId.length + ' (' + few(n.noId) + ')' : '') +
    (n.notImage.length ? '\nNot an image: ' + n.notImage.length + ' (' + few(n.notImage) + ')' : '') +
    (n.seen === 0 ? '\n\nThe folder above is empty. If your photos are in another folder, move them into this one, or run "Choose photo folder" and paste the link of the folder that contains your "import" folder.' : ''));
}

/** Points the app at a photo folder you made yourself (the one that contains "import"). */
function choosePhotoFolder() {
  const ui = SpreadsheetApp.getUi();
  const current = folder_();
  const res = ui.prompt('Choose photo folder', 'Current folder:\n' + current.getUrl() + '\n\nTo use another folder, paste its Google Drive link here. Leave empty to keep the current one.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK || !s_(res.getResponseText())) return;
  const m = s_(res.getResponseText()).match(/[-\w]{25,}/);
  if (!m) { ui.alert('That does not look like a Google Drive folder link.'); return; }
  let picked;
  try { picked = DriveApp.getFolderById(m[0]); } catch (e) { ui.alert('That folder could not be opened. Check that it is a folder link and that you have access.'); return; }
  PropertiesService.getScriptProperties().setProperty('PHOTO_FOLDER_ID', picked.getId());
  ui.alert('New photos will be saved in "' + picked.getName() + '". Photos already registered stay where they are.');
}

function say_(title, text) {
  try { SpreadsheetApp.getUi().alert(title, text, SpreadsheetApp.getUi().ButtonSet.OK); }
  catch (e) { ss_().toast(text, title, 10); }
}
