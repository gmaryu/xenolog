/* Made-up colony for the public demo (docs/demo/). Dates are counted back from today, so the demo looks the same whenever it is opened.
 * Loaded after fakes.js and before Code.gs (ROSTER), and demoSeed() runs after setup(). No real animal, person or photo is in here. */
var DEMO_DAY = 86400000;
function demoAgo(days) { var d = new Date(Date.now() - days * DEMO_DAY); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

// Squeezed quantity, appearance, Ca; laid quantity, appearance, Ca
var DEMO_GRADES = {
  great: ['Many', 'Great', 'Looking good', 'Normal', 'Good', 'Looking good'],
  good: ['Normal', 'Good', 'Looking good', 'Normal', 'Good', ''],
  fair: ['Few', 'Not bad', 'Looking good', 'Few', 'Good', ''],
  poor: ['Few', 'Bad', 'Turned to white', 'None', 'None', ''],
  bad: ['None', 'None', '', 'Few', 'Bad', 'Turned to white']
};
var DEMO_PEOPLE = ['alex', 'sam', 'kim'];

/* 50 frogs in the colony, used about 4 a week, as a lab does: with a 3-month rest that many are needed.
   The past is simulated week by week from a fixed seed, so the colony is the same on every visit:
   [{ id, tank, arrived (days ago), removed: {days, reason} | null, cycles: [{days, grade}] oldest first (grade null: not used), open: 'use' | 'rec' | null }] */
var DEMO_FROGS = (function () {
  var rnd = demoRandom(2026), REST = 92, PER_WEEK = 4, frogs = [], id;
  // [first ID, last ID, arrived days ago]
  [[1, 18, 640], [19, 36, 420], [37, 47, 230], [48, 50, 110], [51, 53, 10]].forEach(function (b) {
    for (id = b[0]; id <= b[1]; id++) frogs.push({ id: id, arrived: b[2], removed: null, cycles: [], open: null, last: null });
  });
  var gone = { 4: [300, 'Died'], 12: [150, 'Euthanized'], 27: [60, 'Escaped'] };
  var poor = { 13: 1, 31: 1, 44: 1 }, firstBad = 49;                // replacement candidates
  frogs.forEach(function (f) {
    if (gone[f.id]) f.removed = { days: gone[f.id][0], reason: gone[f.id][1] };
    f.base = poor[f.id] ? 'poor' : (rnd() < 0.25 ? 'great' : rnd() < 0.8 ? 'good' : 'fair');
  });
  function grade(f) {
    if (f.id === firstBad && !f.cycles.length) return 'bad';
    if (rnd() < 0.05) return null;                                    // primed, but the eggs were not used
    var r = rnd(), order = ['bad', 'poor', 'fair', 'good', 'great'], k = order.indexOf(f.base);
    return order[Math.max(0, Math.min(4, k + (r < 0.15 ? -1 : r > 0.85 ? 1 : 0)))];
  }
  for (var day = 400; day >= 1; day -= 7) {                           // one priming day a week, the last one yesterday
    var ready = frogs.filter(function (f) {
      return f.arrived - 14 >= day && (!f.removed || f.removed.days < day) && (f.last === null || f.last - day >= REST);
    });
    ready.sort(function (a, b) { return (b.last === null ? 1e9 : b.last) - (a.last === null ? 1e9 : a.last) || a.id - b.id; });
    ready.slice(0, PER_WEEK).forEach(function (f, n) {
      // Yesterday's frogs are still out: two with an egg record, two waiting for one.
      var g = day === 1 ? (n < 2 ? grade(f) || 'good' : null) : grade(f);
      f.cycles.push({ days: day, grade: g });
      if (day === 1) f.open = n < 2 ? 'rec' : 'use';
      f.last = day;
    });
  }
  // Housing in ID order, 3 to a tank; a removed frog leaves its place empty until the next tank exchange.
  frogs.forEach(function (f, n) { f.tank = f.removed ? 0 : Math.floor(n / 3) + 1; });
  return frogs;
})();

var ROSTER = DEMO_FROGS.map(function (f) { return [f.id, !f.removed, f.tank || '', demoAgo(f.arrived).slice(0, 7), 'Example supplier', '']; });

function demoRandom(seed) {
  var s = seed * 2654435761 >>> 0;
  return function () { s = (s + 0x6D2B79F5) >>> 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function demoCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// The skin of one frog: olive with dark irregular blotches and fine speckles. Same ID, same skin.
var demoSkins = {};
function demoSkin(id) {
  if (demoSkins[id]) return demoSkins[id];
  var rnd = demoRandom(id), c = demoCanvas(400, 580), g = c.getContext('2d'), i, j, n;
  var bg = g.createRadialGradient(200, 240, 40, 200, 260, 330);
  bg.addColorStop(0, '#848057'); bg.addColorStop(1, '#55543a');
  g.fillStyle = bg; g.fillRect(0, 0, 400, 580);
  for (i = 0, n = 70 + Math.floor(rnd() * 40); i < n; i++) {        // blotches with ragged edges
    var x = rnd() * 400, y = rnd() * 580, r = 5 + rnd() * rnd() * 30, k = 7 + Math.floor(rnd() * 5);
    g.fillStyle = 'rgba(32,34,20,' + (0.55 + rnd() * 0.4) + ')';
    g.beginPath();
    for (j = 0; j < k; j++) { var t = j / k * 2 * Math.PI, rr = r * (0.55 + rnd() * 0.7); g.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr * (0.6 + rnd() * 0.5)); }
    g.fill();
  }
  for (i = 0; i < 4000; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(25,25,12,.3)' : 'rgba(200,195,150,.25)'; g.fillRect(rnd() * 400, rnd() * 580, 1 + rnd() * 3, 1 + rnd() * 3); }
  return (demoSkins[id] = c);
}

/* A photo of frog id on a pale tray, head up. v shifts, turns, scales and lights it, as two real photos of one frog differ.
   Drawn in 1200 x 900 units; k scales the canvas (registration photos use a smaller one, so 50 of them are quick to make). */
function demoPhoto(id, v, k) {
  k = k || 1;
  var W = Math.round(1200 * k), H = Math.round(900 * k), rnd = demoRandom(v.noise || 1);   // noise: seed of this photo's tray
  function layer() { var cv = demoCanvas(W, H); cv.getContext('2d').scale(k, k); return cv; }
  var c = layer(), g = c.getContext('2d');
  var tray = g.createLinearGradient(0, 0, 1200, 900);
  tray.addColorStop(0, '#ecebe6'); tray.addColorStop(1, '#d9d7cf');
  g.fillStyle = tray; g.fillRect(0, 0, 1200, 900);
  // Uneven light on the tray, different in every photo. A plain tray, or fine noise on it, gives the pattern check
  // points that line up between any two photos (it boosts contrast before looking), which real photos do not.
  var mott = demoCanvas(60, 45), mg = mott.getContext('2d');
  for (var m = 0; m < 400; m++) { mg.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,.1)' : 'rgba(255,255,255,.14)'; mg.fillRect(rnd() * 60, rnd() * 45, 2 + rnd() * 6, 2 + rnd() * 6); }
  g.drawImage(mott, 0, 0, 1200, 900);
  // Each frog has its own build and pose, so the crop differs a little from frog to frog.
  var b = demoRandom(id * 7 + 3), rx = 165 + b() * 30, ry = 175 + b() * 30, hx = 105 + b() * 25, hy = 70 + b() * 15, hc = -ry + 45 - b() * 15;
  var legs = [-1, 1].map(function (side) { return [side, b() * 0.6, b() * 0.6]; }), lw = 22 + b() * 8;
  function frog(f, inset, bodyOnly) {   // draws the frog on f; inset shrinks the body, bodyOnly leaves out the legs
    f.save();
    f.translate(600 + (v.dx || 0), 470 + (v.dy || 0)); f.rotate(v.angle || 0); f.scale(v.scale || 1, v.scale || 1);
    if (!inset && !bodyOnly) {
      f.strokeStyle = '#5d5b3e'; f.lineCap = 'round'; f.lineJoin = 'round'; f.lineWidth = lw;   // legs, thinner than the trunk so the crop leaves them out
      legs.forEach(function (l) {
        var side = l[0], a1 = l[1], a2 = l[2];
        f.beginPath(); f.moveTo(side * rx * 0.6, hc + 60); f.lineTo(side * (rx + 25 + a1 * 40), hc + 80 + a1 * 60); f.lineTo(side * (rx + 10), hc + 150 + a1 * 50); f.stroke();
        f.beginPath(); f.moveTo(side * rx * 0.6, ry * 0.7); f.lineTo(side * (rx + 70 + a2 * 50), ry * 0.5 + a2 * 60); f.lineTo(side * (rx + 140 + a2 * 40), ry + 60 + a2 * 70); f.lineTo(side * (rx + 90), ry + 150 + a2 * 40); f.stroke();
      });
    }
    f.beginPath(); f.ellipse(0, 40, rx - inset, ry - inset, 0, 0, 2 * Math.PI); f.ellipse(0, hc, hx - inset, hy - inset, 0, 0, 2 * Math.PI);
    f.clip(); f.drawImage(demoSkin(id), -200, -300);
    f.restore();
  }
  // A crisp, perfectly smooth outline would line up between any two frogs, which real skin edges do not.
  // So the frog is drawn soft, and its skin fades in to sharp away from the edge.
  function blurred(src) { var o = demoCanvas(W, H), sm = demoCanvas(150, 113); sm.getContext('2d').drawImage(src, 0, 0, 150, 113); o.getContext('2d').drawImage(sm, 0, 0, W, H); return o; }
  var whole = layer(), skin = layer(), mask = layer();
  frog(whole.getContext('2d'), 0); frog(skin.getContext('2d'), 0, true); frog(mask.getContext('2d'), 30);
  var sk = skin.getContext('2d');
  sk.globalCompositeOperation = 'destination-in'; sk.drawImage(blurred(mask), 0, 0, 1200, 900);
  g.drawImage(blurred(whole), 0, 0, 1200, 900); g.drawImage(skin, 0, 0, 1200, 900);
  g.fillStyle = v.light > 0 ? 'rgba(255,255,240,' + v.light + ')' : 'rgba(0,0,0,' + (-(v.light || 0)) + ')';
  g.fillRect(0, 0, 1200, 900);
  // Square around head and body, where the crop goes, in canvas pixels (for an unturned photo).
  var top = Math.min(hc - hy, 40 - ry), bottom = 40 + ry, s = (v.scale || 1) * k, side = Math.max(2 * rx, bottom - top) * 1.04 * s;
  c.square = { x: (600 + (v.dx || 0)) * k - side / 2, y: (470 + (v.dy || 0)) * k + (top + bottom) / 2 * s - side / 2, side: side };
  return c;
}
// A different photo of the same frog every time: what a new picture at the tank would look like.
function demoVariant() {
  var r = Math.random;
  return { angle: (r() - 0.5) * 0.5, scale: 0.85 + r() * 0.3, dx: (r() - 0.5) * 160, dy: (r() - 0.5) * 80, light: (r() - 0.5) * 0.24, noise: 1 + Math.floor(r() * 1e6) };
}

// The registration photo, cropped to the back as someone would in the crop screen. The square comes from the drawing:
// the app's automatic crop would find nearly the same one, but takes about 60 ms a photo.
function demoRegistration(id) {
  var c = demoPhoto(id, { noise: id }, 0.5), x = c.square.x, y = c.square.y, side = c.square.side;
  function cut(n, q) { var o = demoCanvas(n, n); o.getContext('2d').drawImage(c, x, y, side, side, 0, 0, n, n); return o.toDataURL('image/jpeg', q); }
  return { full: c.toDataURL('image/jpeg', 0.82), pattern: cut(256, 0.8), thumb: cut(128, 0.7), emb: '', crop: 'confirmed' };
}

/* Runs before the page's first call to the server (window.beforeServer in the bridge), when matcher.js has loaded. */
function demoSeed() {
  var recSheet = sheet_(SHEETS.RECORDS), photoSheet = sheet_(SHEETS.PHOTOS), frogSheet = sheet_(SHEETS.FROGS), stamp = now_(), k = 0;
  // Eggs are collected the day after the priming.
  function record(frog, days, grade, state, name) {
    var r = REC_COLS.map(function () { return ''; }), g = grade ? DEMO_GRADES[grade] : null;
    r[0] = 'D' + (++k); r[1] = frog; r[2] = demoAgo(days); r[4] = name; r[13] = state; r[14] = 'app'; r[16] = r[17] = stamp; r[18] = name;
    if (g) { r[3] = demoAgo(days - 1); r[5] = k % 3 ? 'MilliQ' : 'RO'; for (var i = 0; i < 6; i++) r[6 + i] = g[i]; r[19] = String(1 + (frog + k) % 5); }
    recSheet.appendRow(r);
  }
  DEMO_FROGS.forEach(function (f) {
    f.cycles.forEach(function (c, i) {
      var open = f.open && i === f.cycles.length - 1;
      record(f.id, c.days, c.grade, open ? (f.open === 'rec' ? 'Recorded' : 'In use') : (c.grade ? 'Returned' : 'Not used'), DEMO_PEOPLE[(c.days / 7 | 0) % DEMO_PEOPLE.length]);
    });
    if (f.removed) {
      var row = readFrogs_().filter(function (x) { return x.id === f.id; })[0].row;
      frogSheet.getRange(row, 7, 1, 4).setValues([[demoAgo(f.removed.days), stamp, 'demo', f.removed.reason]]);
      return;
    }
    savePhoto_(f.id, demoRegistration(f.id), 'registration', 'demo');
    photoSheet.getRange(photoSheet.getLastRow(), 3).setValue(demoAgo(f.arrived));
  });
  rebuildVet_();
}

/* "Photograph the frog" in the demo: take a real photo, or use a made-up photo of a frog in this tank or of one from another tank.
   The made-up photo goes through the file input like a camera picture, so cropping and the pattern check run as they would. */
function demoPicker(tank) {
  var st = getState(), here = st.frogs.filter(function (f) { return f.inColony && f.tank === tank && !f.open; });
  var other = st.frogs.filter(function (f) { return f.inColony && f.tank !== tank && f.tank; });
  other = other[Math.floor(Math.random() * other.length)];
  var box = document.getElementById('demo-picker');
  box.innerHTML = '<div class="crop-in"><header class="top"><h1>Photograph the frog</h1></header>' +
    '<p class="note">In the demo you can use a made-up photo instead of the camera. Each one is a new picture: turned, moved and lit a little differently from the frog\'s earlier photo.</p>' +
    '<h2>Made-up photo of a frog in Tank ' + tank + '</h2><div class="btnrow">' +
    here.map(function (f) { return '<button class="btn ghost" data-demo-frog="' + f.id + '">#' + f.id + '</button>'; }).join('') + '</div>' +
    (other ? '<h2>A frog that is not in this tank</h2><button class="btn ghost" data-demo-frog="' + other.id + '">#' + other.id + ' from Tank ' + other.tank + '</button>' : '') +
    '<h2>Or</h2><button class="btn ghost" data-demo-camera="1">Use the camera</button><button class="btn ghost" data-demo-close="1">Cancel</button></div>';
  box.hidden = false; box.scrollTop = 0;
}
document.addEventListener('click', function (e) {
  var cam = e.target.closest('label[for="file-cam"]');
  if (cam) { e.preventDefault(); demoPicker(Number(cam.dataset.id)); return; }      // the page's own handler still notes which tank this is for
  var box = document.getElementById('demo-picker');
  if (!e.target.closest('#demo-picker')) return;
  var b = e.target.closest('button');
  if (!b) return;
  box.hidden = true;
  if (b.dataset.demoCamera) document.getElementById('file-cam').click();
  else if (b.dataset.demoFrog) {
    demoPhoto(Number(b.dataset.demoFrog), demoVariant()).toBlob(function (blob) {
      var input = document.getElementById('file-cam'), dt = new DataTransfer();
      dt.items.add(new File([blob], 'demo.jpg', { type: 'image/jpeg' }));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, 'image/jpeg', 0.85);
  }
}, true);
