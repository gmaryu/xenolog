const fs = require('fs'), vm = require('vm'), assert = require('assert');
vm.runInThisContext(fs.readFileSync('fakes.js', 'utf8'));
// A small made-up colony: #1 was removed, the rest live three to a tank (the last tank has two).
const tanks = [[10, 11, 15], [17, 20, 21], [22, 23, 24], [60, 61, 76], [88, 119, 130], [136, 137]];
globalThis.ROSTER = [[1, false, '', '', '', 'Died']].concat(...tanks.map((ids, t) => ids.map(id => [id, true, t + 1, '2025', 'Example supplier', ''])));
const dir = fs.existsSync('../apps-script/Code.gs') ? '../apps-script/' : '../';
vm.runInThisContext(fs.readFileSync(dir + 'Settings.gs', 'utf8'));
vm.runInThisContext(fs.readFileSync(dir + 'Code.gs', 'utf8'));
FAKE.setToday('2026-10-13');
const FH = ['Timestamp','Animal ID','Name','Collection Date','MMR H2O source','Quantity (Squeezed Eggs)','Appearance (Squeezed Eggs)','After Ca activation (Squeezed Eggs)','Quantity (Laid Eggs)','Appearance (Laid Eggs)','After Ca activation (Laid Eggs)','Comments','Priming Date'];
FAKE.addSheet('Form Responses 1', [FH,
  ['t','15','AB','10/9/2026','MilliQ','Many','Great','','Normal','Good','','','10/2/2026'],
  ['t','10','CD','3/30/2026','MilliQ','Normal','Good','Looking good','Few','Good','','note','3/24/2026'],
  ['t','60','EF','01/23/2025','MilliQ','Few','Not bad','','Good','Great','','','1/18/25'],
  ['t','61','EF','5/5/2058','MilliQ','Many','Great','','Ok','Ok','','',''],
  ['t','','x','1/1/2025','','','','','','','','',''],
  ['t','119','GH','7/15/2026','RO','Few','Bad','Good','None','None','','',''],
  ['','','','','','','','','','','','','']]);
FAKE.addSheet('Shared with ULAM', [VET_COLS,
  ['15','','','','10/9/2026','Normal','Good','','Many','Great','','MilliQ','','','',''],
  ['76','','','','9/8/2023','good','bad','','few','ok','','Milli-Q','','','',''],
  ['88','','','','9/13/2023','none','-','','few','bad','','Milli-Q','-','','',''],
  ['130','','','','9/26/2026','Normal','Good','','Normal','Good','','RO','late','','','']]);
setup(); setup();
let frogs = FAKE.book.sheets['Frogs'].data;
assert.equal(frogs.length, 19); assert.deepEqual(frogs[1].slice(0, 3), [1, 'Removed', '']);
importLegacy();
const recs = FAKE.book.sheets['Records'].data;
console.log('records imported:', recs.length - 1, '| issues:', FAKE.book.sheets['Import check'].data.length - 1);
FAKE.book.sheets['Import check'].data.slice(1).forEach(r => console.log('  ', r.join(' | ')));
assert.throws(() => importLegacy(), /already imported/);
let st = getState();
const F = id => st.frogs.find(f => f.id === id);
assert.equal(st.user, 'tester'); assert.equal(st.frogs.filter(f => f.inColony).length, 17);
assert.equal(F(15).restUntil, '2027-01-02'); assert.equal(F(10).lastPriming, '2026-03-24'); assert.equal(F(10).restUntil, '2026-06-24');
assert.equal(F(119).restUntil, '2026-10-15'); assert.equal(F(130).restUntil, '2026-12-26'); assert.equal(F(61).lastPriming, '');
console.log('Vet view rows:', FAKE.book.sheets['Vet view'].data.length - 1, FAKE.book.sheets['Vet view'].data[1].join(','));
// priming
assert.throws(() => savePriming({ items: [{ id: 15 }] }), /resting until 2027-01-02/);
assert.throws(() => savePriming({ items: [{ id: 1 }] }), /not in the colony/);
assert.throws(() => savePriming({ items: [{ id: 10 }, { id: 10 }] }), /twice/);
const photo = { full: 'data:image/jpeg;base64,AAAA', thumb: 'data:t', pattern: 'data:p', emb: 'ZW1i', crop: 'auto' };
st = savePriming({ items: [{ id: 10, photo, match: { tank: 1, best: 11, scores: { 10: 0.7, 11: 0.8 } } }, { id: 11, photo: null, match: null }] });
assert.equal(F(10).open.state, 'In use'); assert.equal(F(10).open.priming, '2026-10-13'); assert.equal(F(10).photos, 1); assert.equal(F(10).restUntil, '2027-01-13');
assert.throws(() => savePriming({ items: [{ id: 10 }] }), /already in use/);
assert.equal(FAKE.book.sheets['Match log'].data[1][5], 'no');
savePriming({ items: [{ id: 22, photo: null, match: { tank: 3, best: '', scores: { 22: 3 } } }, { id: 23, photo: null, match: { tank: 3, best: 23, scores: { 23: 40 } } }] });
assert.deepEqual(FAKE.book.sheets['Match log'].data.slice(2).map(r => r[5]), ['no suggestion', 'yes']); returnFrog(getState().frogs.find(f => f.id === 22).open.id); returnFrog(getState().frogs.find(f => f.id === 23).open.id);
// timing: one row per frog that carries it, nothing for the rest
const TS = FAKE.book.sheets['Timing'];
assert.deepEqual(TS.data[0], TIMING_COLS); assert.equal(TS.data.length, 1);
const tm = { opened: '2026-10-13 09:15:02.120', photo: 4.2, crop: 11.5, match: 13.1, picked: 20.4, saved: 95, photos: 2, found: true, moved: false, compares: 1, opens: 2, resting: '24', matchMs: 850, size: '4032x3024', earlier: 7.5 };
savePriming({ items: [{ id: 60, photo: null, match: null, timing: tm }, { id: 61, photo: null, match: null }], client: { device: 'Phone 390x844@3', matcherLoadMs: 3100 } });
assert.equal(TS.data.length, 2);
assert.deepEqual(TS.data[1].slice(1), ['tester', APP_VERSION, 60, 4, '2026-10-13 09:15:02.120', 4.2, 11.5, 13.1, 20.4, 95, 2, 'yes', 'no', 1, 2, '24', 850, '4032x3024', 'Phone 390x844@3', 3100, 7.5]);
savePriming({ items: [{ id: 76, photo: null, match: null, timing: { opened: '', photo: '', crop: '', match: '', picked: '', saved: 'x', photos: 0, found: null, moved: null, compares: 0, opens: 1, resting: '', matchMs: '', size: '' } }] });
assert.deepEqual(TS.data[2].slice(5, 22), ['', '', '', '', '', '', 0, '', '', 0, 1, '', '', '', '', '', '']);
TS.data[0].pop(); savePriming({ items: [{ id: 136, photo: null, match: null, timing: tm }] }); assert.equal(TS.data[0][21], 'Earlier tanks (s)');   // heading added to an older sheet
delete FAKE.book.sheets['Timing']; savePriming({ items: [{ id: 88, photo: null, match: null, timing: tm }] });   // a sheet from an older version is added on the spot
assert.equal(FAKE.book.sheets['Timing'].data.length, 2);
[60, 61, 76, 88, 136].forEach(id => { st = getState(); cancelPriming(st.frogs.find(f => f.id === id).open.id); });
assert.equal(getState().recordTiming, true);
// Code.gs run with other settings in a fresh copy of the fake services. Settings.gs is optional; what it leaves out comes from DEFAULTS.
function withSettings(settings) {
  const ctx = vm.createContext({ ROSTER: globalThis.ROSTER, console });
  vm.runInContext(fs.readFileSync('fakes.js', 'utf8'), ctx);
  if (settings) vm.runInContext('const SETTINGS = ' + JSON.stringify(settings) + ';', ctx);
  vm.runInContext(fs.readFileSync(dir + 'Code.gs', 'utf8'), ctx);
  vm.runInContext("FAKE.setToday('2026-10-13'); setup();", ctx);
  return code => vm.runInContext(code, ctx);
}
assert.deepEqual(SETTINGS, DEFAULTS);   // the example Settings.gs lists every setting with its default
{ // recordTiming false: nothing is created or written, even when the page sends timing
  const run = withSettings({ recordTiming: false });
  run("savePriming({ items: [{ id: 10, photo: null, match: null, timing: { opened: 'x' } }], client: {} });");
  assert.equal(run("FAKE.book.sheets['Timing']"), undefined); assert.equal(run('getState().recordTiming'), false);
  assert.equal(run("FAKE.book.sheets['Records'].data.length"), 2);
}
{ // a partial Settings.gs: the rest comes from the defaults, objects are merged key by key
  const run = withSettings({ tankSize: 4, restMonths: 2, options: { water: ['Tap'] }, quality: { threshold: 60 } });
  const g = run('getState()');
  assert.equal(g.tankSize, 4); assert.equal(g.restMonths, 2); assert.deepEqual(g.options.water, ['Tap']); assert.deepEqual(g.options.quantity, DEFAULTS.options.quantity);
  assert.equal(g.qualityRule.threshold, 60); assert.equal(g.qualityRule.cycles, 3); assert.equal(g.recordTiming, true);
  run("addFrog({ tank: 1, arrival: '', source: '', notes: '' });"); assert.equal(run('getState().frogs.filter(f => f.tank === 1).length'), 4);
  run("savePriming({ items: [{ id: 10 }] });"); assert.equal(run('getState().frogs.find(f => f.id === 10).restUntil'), '2026-12-13');
  const rid = run('getState().frogs.find(f => f.id === 10).open.id');
  run(`saveRecord('${rid}', { collection: '2026-10-14', water: 'Tap', sqQty: 'Many' })`); assert.equal(run('getState().frogs.find(f => f.id === 10).open.water'), 'Tap');
}
{ // no Settings.gs at all (a deployment that only replaced Code.gs): the defaults
  const run = withSettings(null);
  assert.equal(run('getState().tankSize'), 3); assert.equal(run('getState().sameCycleDays'), 14); assert.deepEqual(run('getState().options'), DEFAULTS.options);
}
{ // renamed choices with their own values: the score uses the highest value given, not a fixed 4 and 3
  const run = withSettings({ quality: { appearance: { 'Top': 10, 'Low': 5, 'None': 0 }, quantity: { 'Lots': 2, 'Some': 1, 'None': 0 } } });
  assert.equal(run("typeScore_('Top', 'Lots')"), 1); assert.equal(run("typeScore_('Low', 'Some')"), 0.5);
}
const tp = getTankPhotos([10, 11]); assert.equal(tp[10].length, 1); assert.equal(tp[10][0].emb, 'ZW1i'); assert.equal(tp[11].length, 0);
assert.equal(getFullPhoto(tp[10][0].photoId), 'data:image/jpeg;base64,AAAA');
savePhotoDerived([{ photoId: tp[10][0].photoId, thumb: 'T2', pattern: 'P2', emb: 'E2', crop: 'centre' }]);
assert.equal(getTankPhotos([10])[10][0].pattern, 'P2'); assert.equal(getThumbs()[10], 'T2'); assert.equal(getState().frogs[0].thumb, undefined);
// record
const rid = F(10).open.id;
assert.throws(() => saveRecord(rid, { collection: '' }), /collection date/);
st = saveRecord(rid, { collection: '2026-10-15', water: 'RO', sqQty: 'Many', sqApp: 'Great', sqCa: '', laidQty: 'Few', laidApp: 'bogus', laidCa: '', comments: 'c1' });
assert.equal(F(10).open.state, 'Recorded'); assert.equal(F(10).open.laidApp, ''); assert.equal(F(10).open.sqQty, 'Many'); assert.equal(F(10).open.name, 'tester');
st = updateRecord(rid, { sqCa: 'Looking good', laidCa: 'Turned to white', comments: 'c2' });
assert.equal(F(10).open.sqCa, 'Looking good'); assert.equal(F(10).open.laidCa, 'Turned to white'); assert.equal(F(10).open.comments, 'c2'); assert.equal(F(10).open.sqApp, 'Great');
st = returnFrog(rid); assert.equal(F(10).open, null); assert.throws(() => returnFrog(rid), /already been returned/);
st = updateRecord(rid, { sqCa: 'Looking good', laidCa: '', comments: 'after return' });
let det = getFrogDetail(10); assert.equal(det.records[0].comments, 'after return'); assert.equal(det.records[0].state, 'Returned'); assert.equal(det.records.length, 2); assert.equal(det.photos.length, 1);
st = returnFrog(F(11).open.id); det = getFrogDetail(11); assert.equal(det.records[0].state, 'Not used'); assert.equal(F(11).restUntil, '2027-01-13');
const ul = FAKE.book.sheets['Vet view'].data; assert.ok(ul.some(r => r[0] === 10 && r[4] === '2026-10-15' && r[1] === 1 && r[12] === 'after return'));
// remove a photo that shows the wrong frog
const p10 = getFrogDetail(10).photos.length; addPhoto(10, photo); let d10 = getFrogDetail(10); assert.equal(d10.photos.length, p10 + 1);
const wrong = d10.photos[d10.photos.length - 1].photoId; d10 = removePhoto(10, wrong); assert.equal(d10.photos.length, p10);
assert.ok(!getTankPhotos([10])[10].some(p => p.photoId === wrong)); assert.throws(() => removePhoto(10, wrong), /not found/); assert.throws(() => removePhoto(11, d10.photos[0].photoId), /not found/);
assert.equal(FAKE.book.sheets['Photos'].data.find(r => r[0] === wrong)[3], 'removed');
// cancel a priming entered by mistake
st = savePriming({ items: [{ id: 20, photo, match: null }, { id: 21, photo: null, match: null }] });
assert.equal(F(20).photos, 1); assert.equal(F(20).restUntil, '2027-01-13');
st = cancelPriming(F(20).open.id); assert.equal(F(20).open, null); assert.equal(F(20).restUntil, ''); assert.equal(F(20).photos, 0); assert.equal(getThumbs()[20], undefined);
assert.equal(getFrogDetail(20).records.length, 0); assert.equal(getFrogDetail(20).photos.length, 0);
st = savePriming({ items: [{ id: 20, photo: null, match: null }] }); assert.equal(F(20).open.state, 'In use'); st = returnFrog(F(20).open.id);
const r21 = F(21).open.id; saveRecord(r21, { collection: '2026-10-14' }); assert.throws(() => cancelPriming(r21), /Only a priming without an egg record/); st = returnFrog(r21);
// egg quality
assert.equal(typeScore_('Great', 'Many'), 1); assert.equal(typeScore_('None', 'Many'), 0); assert.equal(typeScore_('', ''), null); assert.equal(typeScore_('good', 'Few'), 1 / 3);
assert.equal(cycleScore_({ collection: '2026-01-01', state: 'Returned', sqApp: 'Good', sqQty: 'Normal', laidApp: 'Good', laidQty: 'Normal' }), 73);
assert.equal(cycleScore_({ collection: '2026-01-01', state: 'Returned', sqApp: 'None', sqQty: 'None', laidApp: 'Great', laidQty: 'Many' }), 30);
assert.equal(cycleScore_({ collection: '', state: 'Not used', sqApp: '', sqQty: '', laidApp: '', laidQty: '' }), null);
assert.deepEqual(quality_([{ date: '2026-01-01', score: 20 }]), { score: 20, recent: [20], cycles: 1, candidate: true, reason: 'First cycle scored 20' });
assert.equal(quality_([{ date: '2026-01-01', score: 40 }]).candidate, false);
let q4 = quality_([{ date: '2025-01-01', score: 100 }, { date: '2025-06-01', score: 40 }, { date: '2026-01-01', score: 30 }, { date: '2026-06-01', score: 50 }]);
assert.deepEqual(q4.recent, [50, 30, 40]); assert.equal(q4.score, 40); assert.equal(q4.candidate, true); assert.equal(q4.reason, 'Last 3 cycles average 40');
assert.equal(quality_([]).score, null); console.log('quality #119', JSON.stringify(F(119).quality), '#15', JSON.stringify(F(15).quality), '#10', JSON.stringify(getFrogDetail(10).records.map(r => r.score)));
// frogs
assert.throws(() => addFrog({ tank: 1 }), /is full/);
st = addFrog({ tank: 6, arrival: 'Oct 2026', source: 'X', notes: '', photo }); assert.equal(st.newId, 138); assert.equal(F(138).tank, 6); assert.equal(F(138).photos, 1);
assert.throws(() => removeFrog(17), /Choose why/); assert.throws(() => removeFrog(17, 'Bored'), /Choose why/);
st = removeFrog(17, 'Escaped', 'found the lid open'); assert.equal(F(17).inColony, false); assert.equal(F(17).removalReason, 'Escaped'); assert.equal(F(17).removedOn, '2026-10-13'); assert.equal(F(17).notes, 'found the lid open');
assert.deepEqual(st.removalReasons, ['Died', 'Escaped', 'Euthanized', 'Other']); assert.equal(FAKE.book.sheets['Frogs'].data[0][9], 'Removal reason');
FAKE.book.sheets['Frogs'].data[0].pop(); setup(); assert.equal(FAKE.book.sheets['Frogs'].data[0][9], 'Removal reason');   // heading is restored on an older sheet
st = applyExchange(); assert.equal(F(20).tank, 2); assert.equal(F(21).tank, 2); assert.equal(F(22).tank, 2); assert.equal(F(23).tank, 3); assert.equal(F(138).tank, 6);
assert.equal(st.frogs.filter(f => f.inColony).length, 17);
console.log('ALL SERVER TESTS PASSED');
