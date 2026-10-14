const fs = require('fs'), vm = require('vm'), assert = require('assert');
vm.runInThisContext(fs.readFileSync('fakes.js', 'utf8'));
// A small made-up colony: #1 was removed, the rest live three to a tank (the last tank has two).
const tanks = [[10, 11, 15], [17, 20, 21], [22, 23, 24], [60, 61, 76], [88, 119, 130], [136, 137]];
globalThis.ROSTER = [[1, false, '', '', '', 'Died']].concat(...tanks.map((ids, t) => ids.map(id => [id, true, t + 1, '2025', 'Example supplier', ''])));
const dir = fs.existsSync('../apps-script/Code.gs') ? '../apps-script/' : '../';
vm.runInThisContext(fs.readFileSync(dir + 'Code.gs', 'utf8'));
FAKE.setToday('2026-10-13');
const FH = ['Timestamp','Animal ID','Name','Collection Date','MMR H2O source','Quantity (Squeezed Eggs)','Appearance (Squeezed Eggs)','After Ca activation (Squeezed Eggs)','Quantity (Laid Eggs)','Appearance (Laid Eggs)','After Ca activation (Laid Eggs)','Comments','Priming Date'];
FAKE.addSheet('Form Responses 1', [FH,
  ['t','15','AB','10/9/2026','Chemistry MilliQ','Many','Great','','Normal','Good','','','10/2/2026'],
  ['t','10','CD','3/30/2026','Chemistry MilliQ','Normal','Good','Looking good','Few','Good','','note','3/24/2026'],
  ['t','60','EF','01/23/2025','Chemistry MilliQ','Few','Not bad','','Good','Great','','','1/18/25'],
  ['t','61','EF','5/5/2058','Chemistry MilliQ','Many','Great','','Ok','Ok','','',''],
  ['t','','x','1/1/2025','','','','','','','','',''],
  ['t','119','GH','7/15/2026','BSB RO','Few','Bad','Good','None','None','','',''],
  ['','','','','','','','','','','','','']]);
FAKE.addSheet('Shared with ULAM', [ULAM_COLS,
  ['15','','','','10/9/2026','Normal','Good','','Many','Great','','Chemistry MilliQ','','','',''],
  ['76','','','','9/8/2023','good','bad','','few','ok','','Chemistry','','','',''],
  ['88','','','','9/13/2023','none','-','','few','bad','','Chemistry','-','','',''],
  ['130','','','','9/26/2026','Normal','Good','','Normal','Good','','BSB RO','late','','','']]);
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
console.log('ULAM view rows:', FAKE.book.sheets['ULAM view'].data.length - 1, FAKE.book.sheets['ULAM view'].data[1].join(','));
// priming
assert.throws(() => savePriming({ items: [{ id: 15 }] }), /resting until 2027-01-02/);
assert.throws(() => savePriming({ items: [{ id: 1 }] }), /not in the colony/);
assert.throws(() => savePriming({ items: [{ id: 10 }, { id: 10 }] }), /twice/);
const photo = { full: 'data:image/jpeg;base64,AAAA', thumb: 'data:t', pattern: 'data:p', emb: 'ZW1i', crop: 'auto' };
st = savePriming({ items: [{ id: 10, photo, match: { tank: 1, best: 11, scores: { 10: 0.7, 11: 0.8 } } }, { id: 11, photo: null, match: null }] });
assert.equal(F(10).open.state, 'In use'); assert.equal(F(10).open.priming, '2026-10-13'); assert.equal(F(10).photos, 1); assert.equal(F(10).restUntil, '2027-01-13');
assert.throws(() => savePriming({ items: [{ id: 10 }] }), /already in use/);
assert.equal(FAKE.book.sheets['Match log'].data[1][5], 'no');
const tp = getTankPhotos([10, 11]); assert.equal(tp[10].length, 1); assert.equal(tp[10][0].emb, 'ZW1i'); assert.equal(tp[11].length, 0);
assert.equal(getFullPhoto(tp[10][0].photoId), 'data:image/jpeg;base64,AAAA');
savePhotoDerived([{ photoId: tp[10][0].photoId, thumb: 'T2', pattern: 'P2', emb: 'E2', crop: 'centre' }]);
assert.equal(getTankPhotos([10])[10][0].pattern, 'P2'); assert.equal(getThumbs()[10], 'T2'); assert.equal(getState().frogs[0].thumb, undefined);
// record
const rid = F(10).open.id;
assert.throws(() => saveRecord(rid, { collection: '' }), /collection date/);
st = saveRecord(rid, { collection: '2026-10-15', water: 'BSB RO', sqQty: 'Many', sqApp: 'Great', sqCa: '', laidQty: 'Few', laidApp: 'bogus', laidCa: '', comments: 'c1' });
assert.equal(F(10).open.state, 'Recorded'); assert.equal(F(10).open.laidApp, ''); assert.equal(F(10).open.sqQty, 'Many'); assert.equal(F(10).open.name, 'tester');
st = updateRecord(rid, { sqCa: 'Looking good', laidCa: 'Turned to white', comments: 'c2' });
assert.equal(F(10).open.sqCa, 'Looking good'); assert.equal(F(10).open.laidCa, 'Turned to white'); assert.equal(F(10).open.comments, 'c2'); assert.equal(F(10).open.sqApp, 'Great');
st = returnFrog(rid); assert.equal(F(10).open, null); assert.throws(() => returnFrog(rid), /already been returned/);
st = updateRecord(rid, { sqCa: 'Looking good', laidCa: '', comments: 'after return' });
let det = getFrogDetail(10); assert.equal(det.records[0].comments, 'after return'); assert.equal(det.records[0].state, 'Returned'); assert.equal(det.records.length, 2); assert.equal(det.photos.length, 1);
st = returnFrog(F(11).open.id); det = getFrogDetail(11); assert.equal(det.records[0].state, 'Not used'); assert.equal(F(11).restUntil, '2027-01-13');
const ul = FAKE.book.sheets['ULAM view'].data; assert.ok(ul.some(r => r[0] === 10 && r[4] === '2026-10-15' && r[1] === 1 && r[12] === 'after return'));
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
