// Roster check logic (rostercheck.js) with made-up scores in place of the pattern check.
const fs = require('fs'), assert = require('assert');
const R = require('./rostercheck.js');

// The threshold is the app's.
assert.equal(R.MATCH_MIN, Number(fs.readFileSync('app.js', 'utf8').match(/var MATCH_MIN = (\d+);/)[1]));

// CSV as Google Sheets writes it: quoted fields with commas (data URLs), quotes and line breaks, CRLF line ends.
const rows = R.parseCsv('﻿Photo ID,Animal ID,Date,Kind,Drive file ID,Thumb,Pattern,Embedding,Crop,Added by,Added at\r\n' +
  'P1,12,2026-10-20,priming,f1,"data:image/jpeg;base64,AA",' + '"data:image/jpeg;base64,BB",,confirmed,a,t\r\n' +
  'P2,12,2026-10-20,removed,f2,,,,,a,t\r\n' +
  'P3,13,,registration,f3,,,,,import,"say ""hi""\nthere"\r\n' +
  ',,,,,,,,,,\r\n');
assert.equal(rows.length, 5);
assert.equal(rows[1][6], 'data:image/jpeg;base64,BB');
assert.equal(rows[3][10], 'say "hi"\nthere');
assert.equal(R.kindOfCsv(rows), 'photos');
const ph = R.photosFromRows(rows);
assert.deepEqual(ph.map(p => p.photoId), ['P1', 'P3']);        // removed and empty rows left out
assert.deepEqual(ph[0], { photoId: 'P1', frog: 12, date: '2026-10-20', kind: 'priming', pattern: 'data:image/jpeg;base64,BB', crop: 'confirmed' });
const frogRows = R.parseCsv('Animal ID,Status,Tank\n1,In colony,1\n2,In colony,1\n3,In colony,2\n4,In colony,2\n5,In colony,3\n6,Removed,\n7,In colony,3\n');
assert.equal(R.kindOfCsv(frogRows), 'frogs');
const frogs = R.frogsFromRows(frogRows);
assert.deepEqual(frogs[5], { id: 6, inColony: false, tank: null });

assert.equal(R.idFromName('frog-125_2026-10-14_P1a2b3c4d.jpg'), 125);
assert.equal(R.idFromName('125.jpg'), 125);
assert.equal(R.idFromName('#88 back.png'), 88);
assert.equal(R.idFromName('IMG_0001.jpg'), null);

// A made-up colony: #1 two photos that match; #2 three photos, one of them really #3; #3 one photo;
// #4 one photo that looks a little like #1; #5 a photo with no pattern; #6 not in the colony; #7 no photo.
const photos = [
  { photoId: 'a', frog: 1, date: '2026-10-01' }, { photoId: 'b', frog: 1, date: '2026-10-20' },
  { photoId: 'c', frog: 2, date: '2026-10-01' }, { photoId: 'd', frog: 2, date: '2026-10-20' }, { photoId: 'e', frog: 2, date: '2026-10-20' },
  { photoId: 'f', frog: 3, date: '2026-10-01' }, { photoId: 'g', frog: 4, date: '2026-10-01' },
  { photoId: 'h', frog: 5, date: '2026-10-01' }, { photoId: 'i', frog: 6, date: '2026-10-01' }];
const feats = photos.map((p, i) => (i === 7 ? null : { n: 100, key: p.photoId }));
const truth = { 'a|b': 60, 'c|d': 40, 'e|f': 35, 'a|g': 7, 'b|i': 80 };
const count = (x, y) => truth[x.key + '|' + y.key] || truth[y.key + '|' + x.key] || 2;
let ticks = 0;
R.scoreAll(photos, feats, count, () => ticks++).then(pairs => {
  assert.equal(pairs.length, 8 * 7 / 2);                            // photo h has no description
  assert.ok(ticks >= 1);
  const F = R.findings(photos, feats, pairs, frogs);
  assert.deepEqual(F.split.map(s => s.frog), [2]);
  assert.deepEqual(F.split[0].groups.map(g => g.map(i => photos[i].photoId).sort()).sort(), [['c', 'd'], ['e']]);
  const bestE = F.split[0].best.find(b => photos[b.photo].photoId === 'e').match;
  assert.equal(photos[bestE.photo].photoId, 'f'); assert.equal(bestE.score, 35);
  assert.deepEqual(F.merged.map(p => [photos[p.a].photoId, photos[p.b].photoId, p.score]), [['e', 'f', 35]]);
  assert.deepEqual(F.near.map(p => [photos[p.a].photoId, photos[p.b].photoId]), [['a', 'g']]);
  assert.deepEqual(F.lone, [3, 4]);
  assert.deepEqual(F.missing, [5, 7]);                              // #5's only photo could not be read
  assert.deepEqual(F.unreadable.map(i => photos[i].photoId), ['h']);
  assert.deepEqual(F.outside.map(i => photos[i].photoId), ['i']);   // #6 is not in the colony, so its match with b is not reported
  assert.equal(F.tankOf[3], 2);
  // same ID: a-b (60, different days), c-d (40) and c-e (2) on different days, d-e (2) the same day
  assert.deepEqual(F.bins.sameDays, [0, 1, 0, 0, 1, 1]);
  assert.deepEqual(F.bins.sameDay, [0, 1, 0, 0, 0, 0]);
  assert.equal(F.bins.other.reduce((s, n) => s + n, 0), 21 - 4);

  // Without the Frogs sheet every photo counts and nothing is missing.
  const G = R.findings(photos, feats, pairs, null);
  assert.equal(G.outside.length, 0); assert.deepEqual(G.missing, []);
  assert.ok(G.merged.some(p => photos[p.a].photoId === 'b' && photos[p.b].photoId === 'i'));

  const csv = R.pairsCsv(photos, pairs).trim().split('\n');
  assert.equal(csv.length, pairs.length + 1);
  assert.equal(csv[1], 'a,1,2026-10-01,b,1,2026-10-20,yes,60');
  // Stopped: resolves to null instead of the pairs.
  return R.scoreAll(photos, feats, count, null, () => true);
}).then(stopped => {
  assert.equal(stopped, null);
  console.log('ALL CHECK TESTS PASSED');
}).catch(e => { console.error(e); process.exit(1); });
