/* Made-up colony for the public demo (docs/demo/). Dates are counted back from today, so the demo looks the same whenever it is opened.
 * Loaded after fakes.js and before Code.gs (ROSTER), and demoSeed() runs after setup(). No real animal, person or photo is in here. */
var DEMO_DAY = 86400000;
function demoAgo(days) { var d = new Date(Date.now() - days * DEMO_DAY); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

// [Animal ID, tank (0 = removed), arrival, removal reason, cycles oldest to newest, days since the newest priming]
// Cycles are egg grades (DEMO_GRADES); a frog with none was never primed.
var DEMO_FROGS = [
  [1, 1, '2024-11', '', ['great', 'good', 'great'], 220],
  [2, 1, '2024-11', '', ['good', 'good'], 180],
  [3, 1, '2024-11', '', ['good', 'fair', 'good'], 160],
  [4, 0, '2024-11', 'Died', ['good'], 400],
  [5, 2, '2025-02', '', ['great', 'great'], 200],
  [6, 2, '2025-02', '', ['good', 'great', 'good'], 40],
  [7, 2, '2025-02', '', ['fair', 'good'], 150],
  [8, 3, '2025-02', '', ['good', 'good'], 190],
  [9, 3, '2025-05', '', ['great'], 170],
  [10, 3, '2025-05', '', ['good', 'good'], 25],
  [11, 4, '2025-05', '', ['good', 'great'], 70],
  [12, 0, '2025-05', 'Euthanized', ['poor', 'poor'], 260],
  [13, 4, '2025-05', '', ['poor', 'fair', 'poor'], 140],
  [14, 4, '2025-09', '', ['good'], 200],
  [15, 5, '2025-09', '', ['great', 'good'], 120],
  [16, 5, '2025-09', '', ['bad'], 135],
  [17, 5, '2025-09', '', ['good'], 100],
  [18, 6, demoAgo(60).slice(0, 7), '', [], 0],
  [19, 7, demoAgo(21).slice(0, 7), '', [], 0]
];
// Squeezed quantity, appearance, Ca; laid quantity, appearance, Ca
var DEMO_GRADES = {
  great: ['Many', 'Great', 'Looking good', 'Normal', 'Good', 'Looking good'],
  good: ['Normal', 'Good', 'Looking good', 'Normal', 'Good', ''],
  fair: ['Few', 'Not bad', 'Looking good', 'Few', 'Good', ''],
  poor: ['Few', 'Bad', 'Turned to white', 'None', 'None', ''],
  bad: ['None', 'None', '', 'Few', 'Bad', 'Turned to white']
};
var DEMO_PEOPLE = ['alex', 'sam', 'kim'];
var DEMO_CYCLE = 130;   // days between earlier primings of the same frog

var ROSTER = DEMO_FROGS.map(function (f) { return [f[0], f[1] > 0, f[1] || '', f[2], 'Example supplier', '']; });

// A mottled olive square standing in for the back of a frog. Same seed, same pattern.
function demoBack(seed, side) {
  var c = document.createElement('canvas'), g = c.getContext('2d'), s = seed * 2654435761 >>> 0;
  function rnd() { s = (s + 0x6D2B79F5) >>> 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  c.width = c.height = side;
  var bg = g.createRadialGradient(side * 0.5, side * 0.45, side * 0.1, side * 0.5, side * 0.5, side * 0.75);
  bg.addColorStop(0, '#7d7a55'); bg.addColorStop(1, '#4e4d33');
  g.fillStyle = bg; g.fillRect(0, 0, side, side);
  for (var i = 0, n = 35 + Math.floor(rnd() * 30); i < n; i++) {
    g.fillStyle = 'rgba(34,36,22,' + (0.45 + rnd() * 0.45) + ')';
    g.beginPath();
    g.ellipse(rnd() * side, rnd() * side, side * (0.01 + rnd() * 0.06), side * (0.01 + rnd() * 0.04), rnd() * Math.PI, 0, 2 * Math.PI);
    g.fill();
  }
  for (var j = 0; j < 220; j++) { g.fillStyle = rnd() < 0.5 ? 'rgba(20,20,10,.35)' : 'rgba(190,185,140,.25)'; g.fillRect(rnd() * side, rnd() * side, 2, 2); }
  return c.toDataURL('image/jpeg', 0.8);
}

function demoSeed() {
  var recSheet = sheet_(SHEETS.RECORDS), photoSheet = sheet_(SHEETS.PHOTOS), frogSheet = sheet_(SHEETS.FROGS), stamp = now_(), k = 0;
  // Eggs are collected the day after the priming.
  function record(frog, days, grade, state, name) {
    var r = REC_COLS.map(function () { return ''; }), g = grade ? DEMO_GRADES[grade] : null;
    r[0] = 'D' + (++k); r[1] = frog; r[2] = demoAgo(days); r[4] = name; r[13] = state; r[14] = 'app'; r[16] = r[17] = stamp; r[18] = name;
    if (g) { r[3] = demoAgo(days - 1); r[5] = k % 3 ? 'MilliQ' : 'RO'; for (var i = 0; i < 6; i++) r[6 + i] = g[i]; }
    recSheet.appendRow(r);
  }
  DEMO_FROGS.forEach(function (f, n) {
    var id = f[0], cycles = f[4];
    cycles.forEach(function (grade, i) {
      record(id, f[5] + (cycles.length - 1 - i) * DEMO_CYCLE, grade, 'Returned', DEMO_PEOPLE[(n + i) % DEMO_PEOPLE.length]);
    });
    if (!f[1]) {
      var row = readFrogs_().filter(function (x) { return x.id === id; })[0].row;
      frogSheet.getRange(row, 7, 1, 4).setValues([[demoAgo(f[5] - 30), stamp, 'demo', f[3]]]);
      return;
    }
    savePhoto_(id, { full: demoBack(id, 640), pattern: demoBack(id, 256), thumb: demoBack(id, 128), emb: '', crop: 'manual' }, 'registration', 'demo');
    photoSheet.getRange(photoSheet.getLastRow(), 3).setValue(f[2].length === 7 ? f[2] + '-15' : f[2]);
  });
  // Two frogs out of their tank today: one waiting for its egg record, one recorded and waiting to go back.
  record(8, 1, null, 'In use', 'sam');
  record(9, 1, 'great', 'Recorded', 'alex');
  rebuildUlam_();
}
