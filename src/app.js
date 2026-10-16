/* XenoLog - page logic. Talks to Code.gs through google.script.run. */
(function () {
  var DAY = 86400000;
  var MATCH_MIN = 10;      // matching points needed before a frog is called a match; different frogs gave 5 or fewer in tests
  var S = { data: null, thumbs: {}, basket: [], tab: 'priming', view: { name: 'tanks' }, shot: null, warn: null, confirm: null,
    big: false, error: '', tankPhotos: {}, feat: {}, detail: null, full: {}, addPhoto: null, busy: 0,
    trial: null, since: fresh(),     // timing of the frog being identified, written to the Timing sheet
    check: null };                   // the roster check: kept until the page is reloaded
  // Counts since the last frog was chosen; they carry over when the person goes back and opens another tank.
  function fresh() { return { first: null, opens: 0, photos: 0, compares: 0, resting: [] }; }

  /* ---------- server ---------- */
  function call(name, args, quiet) {
    return new Promise(function (ok, fail) {
      if (!quiet) busy(1);
      var runner = google.script.run
        .withSuccessHandler(function (r) { if (!quiet) busy(-1); ok(r); })
        .withFailureHandler(function (e) { if (!quiet) busy(-1); fail(e); });
      runner[name].apply(runner, args || []);
    });
  }
  function busy(d) { S.busy = Math.max(0, S.busy + d); document.getElementById('busy').hidden = S.busy === 0; }
  function fail(e) { S.error = (e && e.message ? e.message : String(e)).replace(/^Error:\s*/, ''); render(); window.scrollTo(0, 0); }
  function applyState(st) {
    st.frogs.forEach(function (f) { if (f.thumb) S.thumbs[f.id] = f.thumb; });
    S.data = st;
  }

  /* ---------- small helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toDate(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function daysBetween(a, b) { return Math.round((toDate(b) - toDate(a)) / DAY); }
  function frog(id) { for (var i = 0; i < S.data.frogs.length; i++) if (S.data.frogs[i].id === id) return S.data.frogs[i]; }
  function inBasket(id) { return S.basket.some(function (b) { return b.id === id; }); }
  function status(f) {
    if (!f.inColony) return { k: 'off', label: 'Removed' };
    if (f.open) return { k: 'use', label: 'In use' };
    if (inBasket(f.id)) return { k: 'use', label: 'Selected' };
    if (f.restUntil > S.data.today) return { k: 'rest', label: 'Resting, ' + daysBetween(S.data.today, f.restUntil) + ' d left', until: f.restUntil };
    return { k: 'ok', label: 'Available' };
  }
  function colony() { return S.data.frogs.filter(function (f) { return f.inColony; }); }
  function tankNos() { var m = {}; colony().forEach(function (f) { if (f.tank) m[f.tank] = 1; }); return Object.keys(m).map(Number).sort(function (a, b) { return a - b; }); }
  function inTank(t) { return colony().filter(function (f) { return f.tank === t; }); }
  function present(t) { return inTank(t).filter(function (f) { return !f.open && !inBasket(f.id); }); }
  function tankInfo(t) {
    var p = present(t), ok = p.filter(function (f) { return status(f).k === 'ok'; }).length;
    return { t: t, all: inTank(t), present: p, ok: ok, kind: ok === 0 ? 2 : (ok < p.length ? 0 : 1) };
  }
  // Frogs are used in rounds of tank order, wrapping from the last tank to Tank 1; within a tank any available frog
  // will do. A frog resting when its tank's turn comes waits for the next round; the rest period is the only fixed rule.
  // The tank the round is at is read from the saved priming dates: read round from the right place, they rise from the
  // oldest to the tank used last. That is the tank after which they rise most consistently (fewest pairs of frogs in
  // different tanks out of date order; on a tie, the most recent), so a frog used out of turn does not move it. The
  // round restarts at that tank, so frogs left in it come first. Frogs never primed take no part in finding the
  // place and are used when the round reaches them. Frogs in today's priming are skipped, not counted as used.
  function round() {
    var tanks = tankNos(), T = tanks.length, best = null, bestInv = Infinity;
    var list = colony().filter(function (f) { return f.tank; }).sort(function (a, b) { return a.tank - b.tank || a.id - b.id; });
    var dated = list.filter(function (f) { return f.lastPriming; }).map(function (f) { return { t: tanks.indexOf(f.tank), d: f.lastPriming }; });
    var latest = {};
    dated.forEach(function (o) { if (!latest[o.t] || o.d > latest[o.t]) latest[o.t] = o.d; });
    Object.keys(latest).map(Number).forEach(function (t) {
      var seq = dated.slice().sort(function (a, b) { return (a.t - t - 1 + T) % T - (b.t - t - 1 + T) % T; }), inv = 0;
      for (var j = 0; j < seq.length && inv <= bestInv; j++) for (var k = j + 1; k < seq.length; k++) if (seq[j].t !== seq[k].t && seq[j].d > seq[k].d) inv++;
      if (inv < bestInv || (inv === bestInv && latest[t] > latest[best])) { bestInv = inv; best = t; }
    });
    var at = best === null ? null : tanks[best];
    return { list: list, start: at === null ? 0 : list.map(function (f) { return f.tank; }).indexOf(at), at: at };
  }
  // A frog skipped when its tank's turn came in this round: its tank comes before the tank the round is at (a round
  // runs from Tank 1 to the last tank), and it was already available (rest over, or there before) on the latest
  // priming of a tank-mate, yet was not used. It goes before the round; a frog that was resting then waits. Frogs in
  // the tank the round is at, or in tanks still to come, are left to the round.
  function skipped(f, at) {
    if (at === null || f.tank >= at) return false;
    var last = '';
    inTank(f.tank).forEach(function (g) { if (g !== f && g.lastPriming > last) last = g.lastPriming; });
    return last !== '' && (f.lastPriming ? f.restUntil : f.arrival) <= last;
  }
  // The next primingBatch frogs, less those already in today's priming (at least one): skipped frogs first, in tank
  // order, then the round.
  function nextFrogs() {
    var r = round(), n = Math.max(1, S.data.primingBatch - S.basket.length);
    var ok = function (f) { return status(f).k === 'ok'; };
    var late = r.list.filter(function (f) { return ok(f) && skipped(f, r.at); }), picks = late.slice(0, n);
    for (var k = 0; k < r.list.length && picks.length < n; k++) { var f = r.list[(r.start + k) % r.list.length]; if (ok(f) && picks.indexOf(f) < 0) picks.push(f); }
    return { frogs: picks, late: late.filter(function (f) { return picks.indexOf(f) >= 0; }), at: r.at };
  }
  function refs(t, id) { return (S.tankPhotos[t] && S.tankPhotos[t][id]) || []; }
  function ranked(t) {
    if (S.shot && S.shot.tank === t && S.shot.ranks) return S.shot.ranks.map(function (r) { return { f: frog(r.id), score: r.score }; }).filter(function (o) { return o.f && !inBasket(o.f.id); });
    return present(t).map(function (f) { return { f: f, score: null }; });
  }
  function pill(st) { return '<span class="pill ' + st.k + '">' + st.label + '</span>'; }
  function ph(src, px, id, zoom) {
    var size = 'style="width:' + px + 'px;height:' + px + 'px"';
    if (!src) return '<div class="ph none" ' + size + '>No photo</div>';
    return '<img class="ph" ' + size + ' src="' + src + '" alt="Back of #' + id + '"' + (zoom ? ' data-zoom="' + id + '"' : '') + '>';
  }
  function bigPh(src, alt, empty) { return src ? '<img class="ph fill" src="' + src + '" alt="' + esc(alt) + '">' : '<div class="ph fill none">' + esc(empty) + '</div>'; }
  function head(title, back) { return '<header class="top">' + (back ? '<button class="back" data-act="back" id="btn-back">Back</button>' : '') + '<h1>' + title + '</h1></header>' + (S.error ? '<div class="alert danger" role="alert">' + esc(S.error) + ' <button class="link" data-act="dismiss" id="btn-dismiss">Dismiss</button></div>' : ''); }
  function who() { return '<div class="who"><span>Signed in as ' + esc(S.data.user) + '</span><button class="link" data-act="reload" id="btn-reload">Refresh</button></div>'; }
  function segs(name, opts, sel) { return '<div class="segs">' + opts.map(function (o, i) { return '<label class="seg"><input type="radio" name="' + name + '" id="' + name + '-' + i + '" value="' + esc(o) + '"' + (o === sel ? ' checked' : '') + '>' + esc(o) + '</label>'; }).join('') + '</div>'; }
  function checked(name) { var el = document.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : ''; }
  function egg(r, k) { return (r[k + 'Qty'] || '-') + ' / ' + (r[k + 'App'] || '-') + ' / ' + (r[k + 'Ca'] || '-'); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  var toastT;
  function toast(msg) { var el = document.getElementById('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, 2800); }

  /* ---------- photos ---------- */
  function loadTank(t) {
    var ids = inTank(t).map(function (f) { return f.id; });
    return call('getTankPhotos', [ids], true).then(function (r) {
      S.tankPhotos[t] = r;
      ids.forEach(function (id) { var l = r[id] || []; if (l.length) l[l.length - 1].last = true; });
      if (S.view.name === 'tank' || S.view.name === 'compare') render();
      if (S.shot && S.shot.tank === t) rank().then(function () { if (S.view.name === 'tank' || S.view.name === 'compare') render(); });
      return derive([].concat.apply([], ids.map(function (id) { return (r[id] || []).map(function (p) { p.frog = id; return p; }); })));
    }).catch(function (e) { console.warn(e); });
  }
  // Photos registered without a crop (imported files) get one here, once.
  var deriving = Promise.resolve();
  function derive(list) {
    deriving = deriving.then(async function () {
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (p.pattern) continue;
        try {
          var r = await Matcher.process(await call('getFullPhoto', [p.photoId], true));
          p.thumb = r.thumb; p.pattern = r.pattern; p.crop = r.crop;
          if (p.frog && p.last) S.thumbs[p.frog] = r.thumb;
          await call('savePhotoDerived', [[{ photoId: p.photoId, thumb: r.thumb, pattern: r.pattern, crop: r.crop, emb: '' }]], true);
          await rank();
          if (['tanks', 'tank', 'compare', 'frog', 'frogs', 'inuse'].indexOf(S.view.name) >= 0) render();
        } catch (e) { console.warn('Could not prepare photo ' + p.photoId, e); }
      }
    });
    return deriving;
  }
  // Pattern points of a stored photo, worked out once per session from its back image.
  function featuresOf(p) {
    var key = p.photoId + '|' + p.pattern.length;      // a re-crop changes the image, and with it the key
    if (!S.feat[key]) S.feat[key] = Matcher.describe(p.pattern);
    return S.feat[key];
  }
  // Counts matching points between the new photo and every earlier photo of each frog still in the tank.
  async function rank() {
    var s = S.shot;
    if (!s || !s.feat) return;
    var tank = s.tank, frogs = present(tank), out = [], started = Date.now();
    for (var i = 0; i < frogs.length; i++) {
      var list = refs(tank, frogs[i].id).filter(function (p) { return p.pattern; }), best = null;
      for (var j = 0; j < list.length; j++) {
        var f = await featuresOf(list[j]);
        if (!f) continue;
        var n = Matcher.count(s.feat, f);
        if (best == null || n > best) best = n;
        await new Promise(function (r) { setTimeout(r, 0); });      // let the page breathe between comparisons
      }
      out.push({ id: frogs[i].id, score: best });
    }
    if (S.shot !== s || s.tank !== tank) return;     // the photo was taken on to another tank meanwhile
    out.sort(function (a, b) { return (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score); });
    s.ranks = out.every(function (r) { return r.score == null; }) ? null : out;
    s.ranked = true; s.doneAt = Date.now(); s.rankMs = s.doneAt - started;   // the last run counts: it is the one whose result is on screen
  }
  /* Crop screen: the photo with a square the person drags over the back. done() gets { full, pattern, thumb, crop }. */
  function cropEdit(r, done) {
    var box = document.getElementById('cropper'), st = { full: r.full, sq: r.sq, w: r.width, h: r.height, crop: r.crop, moved: false };
    function close() { box.hidden = true; box.innerHTML = ''; }
    function place() {
      var f = document.getElementById('crop-frame'), sl = document.getElementById('crop-size'), q = st.sq;
      f.style.left = (q.x / st.w * 100) + '%'; f.style.top = (q.y / st.h * 100) + '%';
      f.style.width = (q.side / st.w * 100) + '%'; f.style.height = (q.side / st.h * 100) + '%';
      sl.value = Math.round(q.side);
    }
    function clamp() {
      var q = st.sq; q.side = Math.max(40, Math.min(q.side, st.w, st.h));
      q.x = Math.max(0, Math.min(q.x, st.w - q.side)); q.y = Math.max(0, Math.min(q.y, st.h - q.side));
    }
    function draw() {
      box.innerHTML = '<div class="crop-in"><header class="top"><h1>Crop to the back</h1></header>' +
        '<p class="note">Drag the square over the back, with the head at the top. Rotate the photo if the frog lies sideways.</p>' +
        '<div class="crop-stage"><img id="crop-img" src="' + st.full + '" alt="The photo you took" draggable="false"><div id="crop-frame"></div></div>' +
        '<label class="field"><span>Size of the square</span><input type="range" id="crop-size" min="' + Math.round(Math.min(st.w, st.h) * 0.15) + '" max="' + Math.min(st.w, st.h) + '"></label>' +
        '<button class="btn" id="crop-ok">Use this crop</button>' +
        '<div class="btnrow"><button class="btn ghost" id="crop-rotate">Rotate 90\u00b0</button><button class="btn ghost" id="crop-cancel">Cancel</button></div></div>';
      box.hidden = false; box.scrollTop = 0; clamp(); place();
      var frame = document.getElementById('crop-frame'), img = document.getElementById('crop-img'), drag = null;
      frame.addEventListener('pointerdown', function (e) { drag = { px: e.clientX, py: e.clientY, x: st.sq.x, y: st.sq.y }; frame.setPointerCapture(e.pointerId); e.preventDefault(); });
      frame.addEventListener('pointermove', function (e) {
        if (!drag) return;
        var k = st.w / img.clientWidth;
        st.sq.x = drag.x + (e.clientX - drag.px) * k; st.sq.y = drag.y + (e.clientY - drag.py) * k; st.moved = true; clamp(); place();
      });
      var end = function () { drag = null; };
      frame.addEventListener('pointerup', end); frame.addEventListener('pointercancel', end);
      document.getElementById('crop-size').addEventListener('input', function (e) {
        var q = st.sq, cx = q.x + q.side / 2, cy = q.y + q.side / 2;
        q.side = +e.target.value; q.x = cx - q.side / 2; q.y = cy - q.side / 2; st.moved = true; clamp(); place();
      });
      document.getElementById('crop-cancel').addEventListener('click', close);
      document.getElementById('crop-rotate').addEventListener('click', function () {
        busy(1);
        Matcher.rotate(st.full).then(Matcher.process).then(function (n) { busy(-1); st.full = n.full; st.sq = n.sq; st.w = n.width; st.h = n.height; st.crop = n.crop; st.moved = true; draw(); })
          .catch(function (e) { busy(-1); close(); fail(e); });
      });
      document.getElementById('crop-ok').addEventListener('click', function () {
        busy(1);
        Matcher.cropAt(st.full, st.sq).then(function (c) { busy(-1); close(); done({ full: st.full, pattern: c.pattern, thumb: c.thumb, crop: st.moved ? 'manual' : 'confirmed', found: st.crop === 'auto', size: r.size }); })
          .catch(function (e) { busy(-1); close(); fail(e); });
      });
    }
    draw();
  }
  function shoot(file, done) {
    busy(1);
    Matcher.process(file).then(function (r) { busy(-1); cropEdit(r, done); }).catch(function (e) { busy(-1); fail(e); });
  }
  function takeShot(file, t) {
    var at = Date.now();
    S.since.photos++;
    shoot(file, async function (p) {
      var shot = S.shot = { tank: t, takenIn: t, full: p.full, pattern: p.pattern, thumb: p.thumb, crop: p.crop, feat: null, ranks: null, ranked: false,
        photoAt: at, cropAt: Date.now(), found: p.found, size: p.size };
      S.warn = null; render();
      var started = Date.now();
      shot.feat = await Matcher.describe(shot.pattern);
      shot.describeMs = Date.now() - started;
      if (S.shot !== shot) return;
      await rank();
      if (S.shot === shot) render();
    });
  }
  function matchNote(t) {
    var st = Matcher.status(), s = S.shot;
    if (st === 'loading') return 'Pattern check: loading. This takes a moment the first time.';
    if (st === 'unavailable') return 'The pattern check is unavailable on this device. Compare the photos by eye.';
    if (!s || s.tank !== t) return '';
    if (!s.ranked) return 'Pattern check: comparing...';
    if (!s.ranks) return 'Pattern check: these frogs have no earlier photos to compare with yet.';
    if (s.ranks[0].score >= MATCH_MIN) return 'The pattern check counts points of the back pattern that line up with an earlier photo. It is a suggestion; confirm by eye.';
    return 'No match found: no earlier photo lines up with this one. A blurred photo, a reflection on the back, or a crop that misses the back can cause this. Compare by eye, or retake the photo.';
  }

  /* ---------- screens ---------- */
  function tankRow(i, picks) {
    var sub = i.kind === 0 ? 'Resting frogs here: check the photo' : i.kind === 2 ? 'No available frog' : '';
    return '<button class="row' + (picks ? ' next' : '') + (i.kind === 2 ? ' none-ok' : '') + '" data-act="openTank" data-id="' + i.t + '" id="tank-' + i.t + '"><div class="grow"><div class="ttl">Tank ' + i.t + '</div><div class="chips">' +
      i.all.map(function (f) { return '<span class="chip ' + status(f).k + (picks && picks.indexOf(f) >= 0 ? ' next' : '') + '">#' + f.id + '</span>'; }).join('') + '</div>' +
      (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div><div class="count" title="available / in tank">' + i.ok + '/' + i.present.length + '</div></button>';
  }
  function vTanks() {
    var infos = tankNos().map(tankInfo), nx = nextFrogs(), next = nx.frogs;
    var h = head('Priming') + who();
    h += '<div class="basket"><div><strong>Today\'s priming</strong> <span class="count">' + plural(S.basket.length, 'frog') + '</span></div>';
    if (S.basket.length) {
      h += '<div class="stack">' + S.basket.map(function (b) { return '<div class="row static">' + ph(b.photo ? b.photo.thumb : S.thumbs[b.id], 40, b.id) + '<div class="grow"><span class="id">#' + b.id + '</span> <span class="sub">Tank ' + b.tank + (b.photo ? ' · new photo' : ' · no new photo') + '</span></div><button class="link" data-act="unpick" data-id="' + b.id + '" id="unpick-' + b.id + '">Remove</button></div>'; }).join('') + '</div>';
      h += '<button class="btn" data-act="savePriming" id="btn-save-priming">Save priming</button>';
    } else h += '<p class="note">Take a frog out, then choose its tank below.</p>';
    h += '</div>';
    if (S.shot) h += '<div class="row static">' + ph(S.shot.thumb, 40, 'new') + '<div class="grow"><div class="ttl">Photo not used yet</div><div class="sub">Taken while Tank ' + S.shot.takenIn + ' was open. Open the tank this frog came from to compare it there.</div></div><button class="link" data-act="dropShot" id="btn-drop-shot">Discard</button></div>';
    if (next.length) {
      var nt = [];
      next.forEach(function (f) { if (nt.indexOf(f.tank) < 0) nt.push(f.tank); });
      h += '<h2>Next ' + next.length + ': ' + nt.map(function (t) { var c = next.filter(function (f) { return f.tank === t; }).length; return c + ' from Tank ' + t; }).join(', ') + '</h2><div class="stack">' +
        nt.map(function (t) { return tankRow(infos.filter(function (i) { return i.t === t; })[0], next); }).join('') + '</div>';
      h += '<p class="note">' + (nx.late.length ? nx.late.map(function (f) { return '#' + f.id; }).join(', ') + (nx.late.length > 1 ? ' were' : ' was') + ' skipped when ' + (nx.late.length > 1 ? 'their tanks were' : 'its tank was') + ' last used, so ' + (nx.late.length > 1 ? 'they come' : 'it comes') + ' first. ' : '') + 'Tank order' + (nx.at ? ', continuing the round at Tank ' + nx.at : ', from Tank 1') + '. Within a tank, any available frog will do; the marked ones are only a suggestion. A frog resting when its tank\'s turn comes waits for the next round.</p>';
      infos = infos.filter(function (i) { return nt.indexOf(i.t) < 0; });
      if (infos.length) h += '<h2>Other tanks</h2>';
    } else h += '<p class="note">No frog is available right now.</p><h2>Tanks</h2>';
    infos.sort(function (a, b) { return (a.kind === 2) - (b.kind === 2) || a.t - b.t; });   // tank order; tanks with no available frog last
    h += '<div class="stack">' + infos.map(function (i) { return tankRow(i, null); }).join('') + '</div>';
    return h;
  }

  function vTank(t) {
    var i = tankInfo(t), h = head('Tank ' + t, true), has = S.shot && S.shot.tank === t;
    if (i.kind === 0) h += '<div class="alert rest">This tank has resting frogs. Check the frog you took against the photos.</div>';
    var away = i.all.filter(function (f) { return i.present.indexOf(f) < 0; });
    if (has) h += '<div class="shot">' + ph(S.shot.pattern, 96, 'new') + '<div class="grow"><div class="ttl">New photo</div><p class="note">' + (S.shot.takenIn !== t ? 'Taken while Tank ' + S.shot.takenIn + ' was open. ' : '') + 'Retake the photo if the pattern is not clear.</p></div></div>';
    h += '<label class="btn' + (has ? ' ghost' : '') + '" for="file-cam" data-act="fileCtx" data-kind="shot" data-id="' + t + '" id="btn-cam">' + (has ? 'Retake photo' : 'Photograph the frog') + '</label>';
    var note = matchNote(t);
    if (note) h += '<p class="note">' + note + '</p>';
    var order = ranked(t), scored = order.length && order[0].score != null;
    var hits = order.filter(function (o) { return o.score != null && o.score >= MATCH_MIN; }).length;
    if (hits > 1) h += '<div class="alert rest">More than one frog matches. One of the earlier photos may show the wrong frog. Compare carefully.</div>';
    h += '<h2>' + (scored ? 'Pattern check' : 'Frogs in this tank') + '</h2><div class="stack">';
    if (!order.length) h += '<p class="note">No frog can be taken from this tank right now.</p>';
    order.forEach(function (o, n) {
      var f = o.f, st = status(f), r = refs(t, f.id), latest = r.length ? r[r.length - 1] : null;
      h += '<div class="cand" id="cand-' + f.id + '"><div class="line">' + ph((latest && latest.pattern) || S.thumbs[f.id], 96, f.id) + '<div class="grow"><div class="ttl"><span class="id">#' + f.id + '</span> ' + (o.score != null && o.score >= MATCH_MIN ? '<span class="pill ok">Match</span>' : '') + '</div><div>' + pill(st) + '</div><div class="sub">Last priming ' + (f.lastPriming || 'never') + ' · ' + plural(f.photos, 'photo') + '</div>' +
        (o.score != null ? '<div class="sim">' + plural(o.score, 'matching point') + '</div><div class="bar"><i style="width:' + Math.min(100, Math.round(o.score / (MATCH_MIN * 4) * 100)) + '%"></i></div>' : (scored ? '<div class="sim">no earlier photo</div>' : '')) + '</div></div>';
      if (S.warn === f.id) h += '<div class="alert danger">#' + f.id + ' is resting until ' + st.until + '. Put it back and take another frog.</div>';
      h += '<div class="btnrow"><button class="btn ghost" data-act="compare" data-id="' + f.id + '" id="btn-cmp-' + f.id + '">Compare photos</button><button class="btn" data-act="pick" data-id="' + f.id + '" id="btn-pick-' + f.id + '">This is #' + f.id + '</button></div></div>';
    });
    h += '</div>';
    if (away.length) h += '<p class="note">Not in the tank: ' + away.map(function (f) { return '#' + f.id + ' (' + status(f).label.toLowerCase() + ')'; }).join(', ') + '</p>';
    return h;
  }

  function vCompare(v) {
    var t = v.tank, id = v.id, f = frog(id), st = status(f), has = S.shot && S.shot.tank === t, order = ranked(t), list = refs(t, id);
    var idx = Math.min(v.idx, list.length - 1), p = list[idx], h = head('Compare photos', true);
    h += '<div class="switch" role="group" aria-label="Candidate">' + order.map(function (o) {
      return '<button data-act="compare" data-id="' + o.f.id + '" id="sw-' + o.f.id + '"' + (o.f.id === id ? ' aria-current="true"' : '') + '><span class="id">#' + o.f.id + '</span>' + (o.score != null ? ' ' + o.score : '') + '</button>';
    }).join('') + '</div>';
    var left = has ? (v.whole ? S.shot.full : S.shot.pattern) : '', right = p ? (v.whole ? (S.full[p.photoId] || p.pattern) : p.pattern) : '';
    h += '<div class="cmp' + (S.big ? ' big' : '') + '"><figure>' + bigPh(left, 'New photo', 'No new photo yet. Go back and photograph the frog.') + '<figcaption><strong>New photo</strong>' + (has ? ' · today' : '') + '</figcaption></figure>' +
      '<figure>' + bigPh(right, 'Photo of #' + id, p ? 'Preparing this photo...' : 'No photo of #' + id + ' yet.') + '<figcaption><strong>#' + id + '</strong>' + (p ? ' · ' + p.date + ' · ' + esc(p.kind) : '') + '</figcaption></figure></div>';
    h += '<div class="btnrow"><button class="link" data-act="big" id="btn-big">' + (S.big ? 'Show side by side' : 'Show larger (stacked)') + '</button><button class="link" data-act="whole" id="btn-whole">' + (v.whole ? 'Show the back only' : 'Show the whole photo') + '</button></div>';
    if (list.length > 1) h += '<h2>Photos of #' + id + '</h2><div class="thumbs">' + list.map(function (q, n) {
      return '<button class="thumb" data-act="photo" data-id="' + n + '" id="thumb-' + n + '"' + (n === idx ? ' aria-current="true"' : '') + '>' + ph(q.thumb || q.pattern, 64, id) + '<span>' + q.date + '</span></button>';
    }).join('') + '</div>';
    h += '<div>' + pill(st) + ' <span class="sub">Last priming ' + (f.lastPriming || 'never') + '</span></div>';
    if (S.warn === id) h += '<div class="alert danger">#' + id + ' is resting until ' + st.until + '. Put it back and take another frog.</div>';
    h += '<div class="btnrow"><button class="btn" data-act="pick" data-id="' + id + '" id="btn-cmp-pick">This is #' + id + '</button><button class="btn ghost" data-act="back" id="btn-cmp-back">Not sure, go back</button></div>';
    return h;
  }

  function vTape(ids) {
    var h = head('Priming saved') + '<div class="alert ok">' + plural(ids.length, 'frog') + (ids.length === 1 ? ' is' : ' are') + ' now in use. Priming date: ' + S.data.today + '.</div><h2>Write on the tape</h2><div class="stack">';
    ids.forEach(function (id) { h += '<div class="tape"><span>Tank ' + frog(id).tank + '</span><span>#' + id + '</span></div>'; });
    return h + '</div><button class="btn" data-act="tab" data-id="inuse" id="btn-to-inuse">Go to In use</button>';
  }

  function inUse() { return colony().filter(function (f) { return f.open; }); }
  function vInuse() {
    var list = inUse(), h = head('In use') + who();
    if (!list.length) return h + '<p class="note">No frogs are in use. They appear here after you save a priming.</p>';
    h += '<p class="note">Tap a photo to enlarge it.</p><div class="stack">';
    list.forEach(function (f) {
      h += '<button class="row" data-act="openUse" data-id="' + f.id + '" id="use-' + f.id + '">' + ph(S.thumbs[f.id], 64, f.id, true) + '<div class="grow"><div class="ttl"><span class="id">#' + f.id + '</span></div><div class="sub">Primed ' + f.open.priming + ' by ' + esc(f.open.name) + ' · returns to Tank ' + f.tank + '</div></div>' +
        (f.open.state === 'Recorded' ? '<span class="pill ok">Recorded</span>' : '<span class="pill rest">No record yet</span>') + '</button>';
    });
    return h + '</div>';
  }

  function editForm(fid, recordId, r) {
    var o = S.data.options;
    return '<h2>Can still be edited</h2><form class="rec" id="' + fid + '" data-rec="' + esc(recordId) + '">' +
      '<fieldset><legend>After Ca activation (squeezed eggs)</legend>' + segs('sqCa', o.ca, r.sqCa) + '</fieldset>' +
      '<fieldset><legend>After Ca activation (laid eggs)</legend>' + segs('laidCa', o.ca, r.laidCa) + '</fieldset>' +
      '<label class="field"><span>Comments</span><textarea id="edit-memo" rows="3">' + esc(r.comments) + '</textarea></label>' +
      '<button class="btn ghost" type="submit" id="btn-save-edit">Save changes</button></form>';
  }
  function summary(r) {
    return '<dl class="kv"><dt>Priming date</dt><dd>' + (r.priming || '-') + '</dd><dt>Collection date</dt><dd>' + (r.collection || '-') + '</dd><dt>Recorded by</dt><dd>' + (esc(r.name) || '-') + '</dd><dt>MMR H2O source</dt><dd>' + (esc(r.water) || '-') + '</dd><dt>Squeezed eggs</dt><dd>' + esc((r.sqQty || '-') + ' / ' + (r.sqApp || '-')) + '</dd><dt>Laid eggs</dt><dd>' + esc((r.laidQty || '-') + ' / ' + (r.laidApp || '-')) + '</dd><dt>Frog activity</dt><dd>' + (r.activity ? esc(r.activity) + ' of 5' : '-') + '</dd></dl><p class="note">Egg values are quantity / appearance.</p>';
  }
  function vUse(id) {
    var f = frog(id), r = f.open, o = S.data.options, h = head('Record for #' + id, true);
    if (!r) return h + '<p class="note">#' + id + ' is no longer in use.</p>';
    h += '<div class="row static">' + ph(S.thumbs[id], 88, id, true) + '<dl class="kv grow"><dt>Priming date</dt><dd>' + r.priming + '</dd><dt>Primed by</dt><dd>' + esc(r.name) + '</dd><dt>Returns to</dt><dd>Tank ' + f.tank + '</dd></dl></div>';
    if (r.state === 'Recorded') {
      return h + '<div class="alert ok">Egg record saved.</div>' + summary(r) + editForm('edit-form', r.id, r) +
        '<button class="btn" data-act="ret" data-id="' + id + '" id="btn-ret">Returned to Tank ' + f.tank + '</button>';
    }
    h += '<form class="rec" id="rec-form" data-rec="' + esc(r.id) + '">' +
      '<label class="field"><span>Collection date</span><input type="date" id="rec-date" value="' + S.data.today + '"></label>' +
      '<fieldset><legend>MMR H2O source</legend>' + segs('water', o.water) + '</fieldset>' +
      '<fieldset><legend>Quantity (squeezed eggs)</legend>' + segs('sqQty', o.quantity) + '</fieldset>' +
      '<fieldset><legend>Appearance (squeezed eggs)</legend>' + segs('sqApp', o.appearance) + '</fieldset>' +
      '<fieldset><legend>After Ca activation (squeezed eggs)</legend>' + segs('sqCa', o.ca) + '</fieldset>' +
      '<fieldset><legend>Quantity (laid eggs)</legend>' + segs('laidQty', o.quantity) + '</fieldset>' +
      '<fieldset><legend>Appearance (laid eggs)</legend>' + segs('laidApp', o.appearance) + '</fieldset>' +
      '<fieldset><legend>After Ca activation (laid eggs)</legend>' + segs('laidCa', o.ca) + '</fieldset>' +
      '<fieldset><legend>Frog activity during collection</legend>' + segs('activity', ['1', '2', '3', '4', '5']) + '<p class="note">1 calm, barely moved · 5 struggled hard throughout</p></fieldset>' +
      '<label class="field"><span>Comments</span><textarea id="rec-memo" rows="2"></textarea></label>' +
      '<button class="btn" type="submit" id="btn-save-rec">Save record</button></form>' +
      '<button class="btn ghost" data-act="ret" data-id="' + id + '" id="btn-ret-unused">Not used, returned to Tank ' + f.tank + '</button>' +
      '<p class="note">"Not used" still counts as a priming: the frog rests for ' + S.data.restMonths + ' months.</p>';
    if (S.confirm === 'cancel' + id) h += '<div class="alert danger">Cancel the priming of #' + id + '? Do this only if this frog was not injected. It becomes available again, and the photo taken with this entry is removed from its photos.</div><div class="btnrow"><button class="btn danger" data-act="cancelPriming" data-id="' + id + '" id="btn-cancel-yes">Cancel this priming</button><button class="btn ghost" data-act="cancel" id="btn-cancel-no">Keep it</button></div>';
    else h += '<button class="link" data-act="askCancel" data-id="' + id + '" id="btn-cancel-priming">Entered by mistake? Cancel this priming</button>';
    return h;
  }

  function vFrogs() {
    var h = head('Frogs') + who() + '<div class="btnrow"><button class="btn" data-act="go" data-id="add" id="btn-add">Add a frog</button><button class="btn ghost" data-act="go" data-id="exchange" id="btn-exchange">Tank exchange</button><button class="btn ghost" data-act="go" data-id="check" id="btn-check">Roster check</button></div>' +
      candidates() +
      '<h2>All frogs</h2><label class="field"><span>Find by ID</span><input type="text" inputmode="numeric" id="frog-search" placeholder="e.g. 27"></label><div class="stack" id="frog-list">';
    S.data.frogs.slice().sort(function (a, b) { return (b.inColony - a.inColony) || (a.id - b.id); }).forEach(function (f) {
      h += '<button class="row" data-act="openFrog" data-id="' + f.id + '" data-key="' + f.id + '" id="frog-' + f.id + '">' + ph(S.thumbs[f.id], 44, f.id) + '<div class="grow"><div class="ttl"><span class="id">#' + f.id + '</span></div><div class="sub">' + (f.inColony ? 'Tank ' + f.tank : 'Removed' + (f.removalReason ? ' (' + esc(f.removalReason.toLowerCase()) + ')' : '')) + ' · last priming ' + (f.lastPriming || 'never') + (f.quality.score != null ? ' · quality ' + f.quality.score : '') + '</div></div>' + pill(status(f)) + '</button>';
    });
    return h + '</div>';
  }
  function candidates() {
    var q = S.data.qualityRule, list = colony().filter(function (f) { return f.quality.candidate; }).sort(function (a, b) { return a.quality.score - b.quality.score; });
    var h = '<h2>Replacement candidates</h2>';
    if (!list.length) h += '<p class="note">No frog is below the line right now.</p>';
    else h += '<div class="stack">' + list.map(function (f) {
      return '<button class="row" data-act="openFrog" data-id="' + f.id + '" id="cand-frog-' + f.id + '">' + ph(S.thumbs[f.id], 44, f.id) + '<div class="grow"><div class="ttl"><span class="id">#' + f.id + '</span> <span class="sub">Tank ' + f.tank + '</span></div><div class="sub">' + esc(f.quality.reason) + ' (' + f.quality.recent.join(', ') + ')</div></div><span class="pill rest">' + f.quality.score + '</span></button>';
    }).join('') + '</div>';
    return h + '<p class="note">Each cycle is scored 0 to 100 from the egg record: squeezed eggs count ' + q.squeezed + '%, laid eggs the rest, and appearance counts more than quantity. A frog is listed when the average of its last ' + q.cycles + ' cycles is below ' + q.threshold + ', or when its only cycle scored ' + q.firstThreshold + ' or less. This is a suggestion, not a decision.</p>';
  }

  function vFrog(id) {
    var f = frog(id), d = S.detail && S.detail.id === id ? S.detail : null, h = head('#' + id, true);
    h += '<div class="row static"><div class="grow">' + pill(status(f)) + '<dl class="kv" style="margin-top:8px"><dt>Tank</dt><dd>' + (f.inColony ? 'Tank ' + f.tank : 'Removed' + (f.removedOn ? ' on ' + f.removedOn : '') + (f.removalReason ? ' (' + esc(f.removalReason.toLowerCase()) + ')' : '')) + '</dd><dt>Arrived</dt><dd>' + (esc(f.arrival) || '-') + '</dd><dt>Source</dt><dd>' + (esc(f.source) || '-') + '</dd><dt>Last priming</dt><dd>' + (f.lastPriming || 'never') + '</dd><dt>Egg quality</dt><dd>' + (f.quality.score == null ? 'no scored cycle yet' : f.quality.score + ' of 100, from ' + plural(f.quality.recent.length, 'cycle') + ' (' + f.quality.recent.join(', ') + ')') + '</dd>' + (f.notes ? '<dt>Notes</dt><dd>' + esc(f.notes) + '</dd>' : '') + '</dl></div></div>';
    if (f.inColony && f.quality.candidate) h += '<div class="alert rest">Replacement candidate: ' + esc(f.quality.reason.charAt(0).toLowerCase() + f.quality.reason.slice(1)) + '.</div>';
    h += '<h2>Photos</h2>';
    if (!d) h += '<p class="note">Loading...</p>';
    else if (!d.photos.length) h += '<p class="note">No photos yet.</p>';
    else h += '<div class="cmp">' + d.photos.map(function (p, n) { return '<figure>' + bigPh(p.pattern, 'Photo of #' + id, 'Preparing this photo...') + '<figcaption>' + p.date + ' · ' + esc(p.kind) + (p.crop === 'auto' || p.crop === 'centre' ? ' · automatic crop, not checked' : '') + (p.pattern ? ' <button class="link" data-act="recrop" data-id="' + n + '" id="recrop-' + n + '">Adjust crop</button>' : '') + ' <button class="link" data-act="askRemovePhoto" data-id="' + n + '" id="rmphoto-' + n + '">Remove</button>' + '</figcaption>' + (S.confirm === 'photo' + p.photoId ? '<div class="alert danger">Remove this photo from #' + id + '? It is no longer shown or used by the pattern check. The file stays in Drive.</div><div class="btnrow"><button class="btn danger" data-act="removePhoto" data-id="' + n + '" id="rmphoto-yes">Remove photo</button><button class="btn ghost" data-act="cancel" id="rmphoto-no">Keep it</button></div>' : '') + '</figure>'; }).join('') + '</div>';
    if (f.inColony) h += '<label class="btn ghost" for="file-lib" data-act="fileCtx" data-kind="addPhoto" data-id="' + id + '" id="btn-add-photo">Add a photo</label>';
    h += '<h2>Use history</h2>';
    if (!d) h += '<p class="note">Loading...</p>';
    else if (!d.records.length) h += '<p class="note">No records yet.</p>';
    else h += '<div class="scroll"><table><thead><tr><th></th><th>Primed</th><th>Collected</th><th>Score</th><th>Squeezed</th><th>Laid</th><th>Activity</th><th>Comments</th><th>By</th></tr></thead><tbody>' +
      d.records.map(function (r, n) { return '<tr><td><button class="link" data-act="editHist" data-id="' + n + '" id="hist-' + n + '">Edit</button></td><td>' + (r.priming || '-') + '</td><td>' + (r.collection || (r.state === 'Not used' ? 'not used' : '-')) + '</td><td>' + (r.score == null ? '-' : r.score) + '</td><td>' + esc(egg(r, 'sq')) + '</td><td>' + esc(egg(r, 'laid')) + '</td><td>' + (esc(r.activity) || '-') + '</td><td>' + esc(r.comments) + '</td><td>' + esc(r.name) + '</td></tr>'; }).join('') + '</tbody></table></div><p class="note">Egg values are quantity / appearance / after Ca activation.</p>';
    if (f.inColony && !f.open) {
      if (S.confirm === id) h += '<form class="rec" id="remove-form" data-id="' + id + '"><div class="alert danger">Remove #' + id + ' from the colony? Its records are kept and it is listed as removed.</div>' +
        '<fieldset><legend>Reason</legend>' + segs('removeReason', S.data.removalReasons) + '</fieldset>' +
        '<label class="field"><span>Note (optional)</span><input type="text" id="remove-note"></label>' +
        '<div class="btnrow"><button class="btn danger" type="submit" id="btn-remove-yes">Remove</button><button class="btn ghost" type="button" data-act="cancel" id="btn-remove-no">Cancel</button></div></form>';
      else h += '<button class="btn danger" data-act="askRemove" data-id="' + id + '" id="btn-remove">Remove this frog</button>';
    }
    return h;
  }

  // The grid of every pair needs a wide screen; on a phone the page says where to see it.
  function wide() { return window.innerWidth >= 720; }
  function vCheck() {
    var c = S.check, r = c && c.result, h = head('Roster check', true);
    h += '<p class="note">Compares every photo of the frogs in the colony with every other one and lists where the photos and the IDs disagree: photos filed under one ID that do not match each other, and photos filed under different IDs that do. It uses the pattern check, so it is a suggestion; look at the photos before changing anything. Nothing is saved.</p>';
    if (c && c.running) return h + '<p class="note" id="check-msg" role="status">' + esc(c.msg) + '</p><button class="btn ghost" data-act="stopCheck" id="btn-check-stop">Stop</button>' + (r ? '<p class="note">The last result is shown again if you stop.</p>' : '');
    if (c && c.error) h += '<div class="alert danger">' + esc(c.error) + '</div>';
    if (r && c.stale) h += '<div class="alert rest">Photos have changed since this check. Check again to include the changes.</div>';
    var n = colony().reduce(function (t, f) { return t + f.photos; }, 0);
    h += '<button class="btn' + (r ? ' ghost' : '') + '" data-act="runCheck" id="btn-check-run">' + (r ? 'Check again' : 'Check every photo') + '</button>';
    if (!r) return h + '<p class="note">' + plural(n, 'photo') + ', ' + plural(n * (n - 1) / 2, 'pair') + '. On a phone this can take a few minutes; keep the screen on. It can be stopped.</p>';
    var link = function (id, inner) { return '<button class="open" data-act="checkFrog" data-id="' + id + '" aria-label="Open #' + id + '">' + inner + '</button>'; };
    return h + '<p class="note">Checked at ' + r.at + '. Tap a photo or an ID to open the frog, for example to adjust a crop.</p>' +
      RosterView.html(r.photos, r.pairs, r.F, r.secs, { link: link, grid: wide(),
        gridNote: 'On a computer this page also shows every pair as a grid, which makes a mix-up easy to spot. Open XenoLog there, go to Frogs and choose Roster check.' });
  }

  function vHist(id, n) {
    var r = S.detail.records[n];
    return head('Record for #' + id, true) + summary(r) + editForm('hist-form', r.id, r);
  }

  function vAdd() {
    var next = S.data.frogs.reduce(function (m, f) { return Math.max(m, f.id); }, 0) + 1, nos = tankNos();
    var opts = nos.concat([(nos.length ? nos[nos.length - 1] : 0) + 1]).filter(function (t) { return inTank(t).length < S.data.tankSize; });
    return head('Add a frog', true) + '<form class="rec" id="add-form">' +
      '<div class="row static">' + ph(S.addPhoto && S.addPhoto.thumb, 96, next) + '<div class="grow"><div class="ttl">ID <span class="id">#' + next + '</span></div><p class="note">The ID is the next number in sequence.</p></div></div>' +
      '<label class="btn ghost" for="file-lib" data-act="fileCtx" data-kind="newFrog" data-id="0" id="btn-new-photo">' + (S.addPhoto ? 'Retake photo' : 'Photograph the back') + '</label>' +
      '<label class="field"><span>Arrival date</span><input type="text" id="add-date" value="' + S.data.today + '"></label>' +
      '<label class="field"><span>Source</span><input type="text" id="add-source"></label>' +
      '<label class="field"><span>Notes</span><input type="text" id="add-notes"></label>' +
      '<label class="field"><span>Tank (tanks with a free place)</span><select id="add-tank">' + opts.map(function (t) { return '<option value="' + t + '">Tank ' + t + ' (' + inTank(t).length + ' now)</option>'; }).join('') + '</select></label>' +
      '<button class="btn" type="submit" id="btn-add-save">Add frog</button></form>';
  }

  // The layout is worked out in ID order every time; a tank is marked done on the day its frogs are moved in.
  function vExchange() {
    var act = colony().sort(function (a, b) { return a.id - b.id; }), todo = {};
    var rows = act.map(function (f, i) {
      var nt = Math.floor(i / S.data.tankSize) + 1;
      if (nt !== f.tank) (todo[nt] = todo[nt] || []).push(f);
      return '<tr><td class="id">#' + f.id + '</td><td>Tank ' + f.tank + '</td><td' + (nt !== f.tank ? ' class="chg"' : '') + '>Tank ' + nt + '</td></tr>';
    }).join('');
    var tanks = Object.keys(todo).map(Number).sort(function (a, b) { return a - b; });
    var moved = tanks.reduce(function (n, t) { return n + todo[t].length; }, 0);
    var h = head('Tank exchange', true) + '<p class="note">The ' + act.length + ' frogs in the colony, assigned ' + S.data.tankSize + ' per tank in ID order. ' +
      (moved ? moved + ' still to move, into ' + tanks.length + (tanks.length > 1 ? ' tanks' : ' tank') + '. When a tank has been filled, mark it done; until then its frogs stay listed in the tank they are in now.' : 'Every frog is in its tank.') + '</p>' +
      (inUse().length ? '<div class="alert use">Some frogs are in use. Marking a tank done also changes the tank they return to.</div>' : '');
    if (tanks.length) h += '<div class="stack">' + tanks.map(function (t) {
      var list = todo[t].map(function (f) { return '#' + f.id + ' from Tank ' + f.tank; }).join(', ');
      if (S.confirm === 'ex' + t) return '<div class="alert use">Tank ' + t + ' done? ' + list + ' will be listed in Tank ' + t + '.</div><div class="btnrow"><button class="btn" data-act="applyExchange" data-id="' + t + '" id="btn-ex-yes">Yes, Tank ' + t + ' is done</button><button class="btn ghost" data-act="cancel" id="btn-ex-no">Not yet</button></div>';
      return '<div class="row static"><div class="grow"><div class="ttl">Tank ' + t + '</div><div class="sub">' + list + '</div></div><button class="btn ghost" data-act="askExchange" data-id="' + t + '" id="btn-ex-' + t + '">Done</button></div>';
    }).join('') + '</div>';
    return h + '<div class="scroll"><table><thead><tr><th>ID</th><th>Now</th><th>After</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* ---------- render and navigation ---------- */
  function render() {
    var app = document.getElementById('app'), v = S.view, h;
    if (!S.data) { app.innerHTML = head('XenoLog') + '<p class="note">Loading...</p>'; return; }
    if (v.name === 'tanks') h = vTanks(); else if (v.name === 'tank') h = vTank(v.id); else if (v.name === 'compare') h = vCompare(v);
    else if (v.name === 'tape') h = vTape(v.ids); else if (v.name === 'inuse') h = vInuse(); else if (v.name === 'use') h = vUse(v.id);
    else if (v.name === 'frogs') h = vFrogs(); else if (v.name === 'frog') h = vFrog(v.id); else if (v.name === 'hist') h = vHist(v.id, v.n);
    else if (v.name === 'add') h = vAdd(); else if (v.name === 'check') h = vCheck(); else h = vExchange();
    app.innerHTML = h;
    app.className = v.name === 'check' ? 'wide' : '';
    if (v.name === 'check' && S.check && S.check.result && !S.check.running && wide()) RosterView.drawGrid(S.check.result.pairs);
    var n = inUse().length;
    document.getElementById('tabs').innerHTML = [['priming', 'Priming'], ['inuse', 'In use' + (n ? ' ' + n : '')], ['frogs', 'Frogs']].map(function (t) {
      return '<button data-act="tab" data-id="' + t[0] + '" id="tab-' + t[0] + '"' + (S.tab === t[0] ? ' aria-current="page"' : '') + '>' + t[1] + '</button>';
    }).join('');
  }
  function go(view, keepScroll) { S.view = view; S.warn = null; S.confirm = null; S.error = ''; render(); if (!keepScroll) window.scrollTo(0, 0); }
  var home = { priming: 'tanks', inuse: 'inuse', frogs: 'frogs' };
  function openFrog(id, from) {
    S.detail = null; go({ name: 'frog', id: id, from: from });
    return call('getFrogDetail', [id], true).then(function (d) {
      setDetail(d);
      if (S.view.name === 'frog' && S.view.id === id) render();
      derive(d.photos);
    }).catch(fail);
  }
  function setDetail(d) {
    S.detail = d;
    if (d.photos.length) { d.photos.forEach(function (p) { p.frog = d.id; }); d.photos[d.photos.length - 1].last = true; }
  }
  function recrop(id, p) {
    busy(1);
    call('getFullPhoto', [p.photoId], true).then(Matcher.process).then(function (r) {
      busy(-1);
      cropEdit(r, function (q) {
        busy(1);
        call('savePhotoDerived', [[{ photoId: p.photoId, thumb: q.thumb, pattern: q.pattern, emb: '', crop: 'manual' }]], true).then(function () {
          busy(-1); p.pattern = q.pattern; p.thumb = q.thumb; p.crop = 'manual';
          if (p.last) S.thumbs[id] = q.thumb;
          delete S.tankPhotos[frog(id).tank]; photosChanged(); render(); toast('Crop saved');
        }).catch(function (e) { busy(-1); fail(e); });
      });
    }).catch(function (e) { busy(-1); fail(e); });
  }
  function photosChanged() { if (S.check && S.check.result) S.check.stale = true; }
  // Every photo against every other, as on the check page. Slow on a phone: it can be stopped, and it keeps going while other screens are open.
  async function runCheck() {
    var prev = S.check, c = S.check = { running: true, stop: false, msg: 'Reading the photos...', result: null, stale: false, error: '' };
    var say = function (t) { c.msg = t; var el = document.getElementById('check-msg'); if (el) el.textContent = t; };
    render();
    try {
      var photos = await call('getRosterPhotos', [], true), started = Date.now(), feats = [];
      say('Loading the pattern check...');
      if (!await Matcher.load()) throw new Error('The pattern check could not be loaded. Check the internet connection and try again.');
      for (var i = 0; i < photos.length && !c.stop; i++) {
        say('Reading the back patterns: ' + (i + 1) + ' of ' + photos.length + '...');
        var f = /^data:image\//.test(photos[i].pattern) ? await featuresOf(photos[i]) : null;
        feats[i] = f && f.n >= 4 ? f : null;
      }
      var from = Date.now();
      var pairs = c.stop ? null : await RosterCheck.scoreAll(photos, feats, Matcher.count, function (done, total) {
        var left = done ? Math.round((Date.now() - from) / done * (total - done) / 1000) : null;
        say('Comparing: ' + done + ' of ' + plural(total, 'pair') + (left !== null && done < total ? ', about ' + (left < 90 ? left + ' s' : Math.round(left / 60) + ' min') + ' left' : '') + '...');
      }, function () { return c.stop; });
      if (pairs) {
        var frogs = S.data.frogs.map(function (g) { return { id: g.id, inColony: g.inColony, tank: g.tank }; }), d = new Date();
        c.result = { photos: photos, pairs: pairs, F: RosterCheck.findings(photos, feats, pairs, frogs), secs: Math.round((Date.now() - started) / 100) / 10,
          at: d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes() };
      }
    } catch (e) { c.error = (e && e.message ? e.message : String(e)).replace(/^Error:\s*/, ''); }
    c.running = false;
    if (!c.result && prev && prev.result) { c.result = prev.result; c.stale = prev.stale; }   // stopped or failed: the last result stays
    if (S.check === c && S.view.name === 'check') render();
  }
  function pick(id) {
    var f = frog(id), s = S.shot, t = f.tank;
    if (status(f).k === 'rest') { S.warn = id; S.since.resting.push(id); render(); return; }
    if (status(f).k !== 'ok') return;
    var item = { id: id, tank: t, photo: null, match: null };
    if (s && s.tank === t) {
      item.photo = { full: s.full, pattern: s.pattern, thumb: s.thumb, emb: '', crop: s.crop };
      // Logged for later review: what the pattern check suggested (nothing, when no frog reached the threshold) and every count.
      if (s.ranks) { item.match = { tank: t, best: s.ranks[0].score >= MATCH_MIN ? s.ranks[0].id : '', scores: {} }; s.ranks.forEach(function (r) { if (r.score != null) item.match.scores[r.id] = r.score; }); }
    } else s = null;
    var tr = S.trial && S.trial.tank === t ? S.trial : { opened: null }, n = S.since;
    item.timing = { opened: tr.opened, first: n.first, photoAt: s && s.photoAt, cropAt: s && s.cropAt, doneAt: s && s.doneAt, pickedAt: Date.now(),
      photos: n.photos, found: s ? s.found : null, moved: s ? s.crop === 'manual' : null, compares: n.compares, opens: n.opens,
      resting: n.resting, matchMs: s && s.rankMs != null ? (s.describeMs || 0) + s.rankMs : null, size: s ? s.size : '' };
    S.trial = null; S.since = fresh();
    S.basket.push(item); S.shot = null; go({ name: 'tanks' }); toast('#' + id + ' added to today\'s priming');
  }
  // One Timing row per frog: the clock time the tank was opened, then seconds from there to each step
  // (negative for a photo taken while another tank was open), and the seconds spent in tanks opened before it.
  function timingRow(tm, savedAt) {
    if (!tm) return null;
    var sec = function (ms) { return ms && tm.opened ? Math.round((ms - tm.opened) / 100) / 10 : ''; };
    var two = function (n) { return (n < 10 ? '0' : '') + n; }, d = tm.opened ? new Date(tm.opened) : null;
    return { opened: d ? d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + ' ' + two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds()) + '.' + String(1000 + d.getMilliseconds()).slice(1) : '',
      photo: sec(tm.photoAt), crop: sec(tm.cropAt), match: sec(tm.doneAt), picked: sec(tm.pickedAt), saved: sec(savedAt),
      photos: tm.photos, found: tm.found, moved: tm.moved, compares: tm.compares, opens: tm.opens, resting: tm.resting.join(', '),
      matchMs: tm.matchMs == null ? '' : tm.matchMs, size: tm.size || '', earlier: tm.first && tm.opened ? Math.round((tm.opened - tm.first) / 100) / 10 : '' };
  }
  function reload(quiet) {
    return call('getState', [], quiet).then(function (st) {
      applyState(st);
      if (!quiet || ['use', 'add', 'hist'].indexOf(S.view.name) < 0) render();   // do not wipe a form that is being filled in
      if (!quiet) call('getThumbs', [], true).then(function (t) {              // photos arrive after the lists are usable
        Object.keys(t).forEach(function (id) { S.thumbs[id] = t[id]; });
        if (['tanks', 'tank', 'inuse', 'frogs'].indexOf(S.view.name) >= 0 && !document.getElementById('frog-search')) render();
      }).catch(function () {});
    }).catch(fail);
  }

  document.addEventListener('click', function (e) {
    var zoom = document.getElementById('zoom');
    if (e.target.closest('#zoom')) { zoom.hidden = true; zoom.innerHTML = ''; return; }
    var z = e.target.closest('img[data-zoom]');
    if (z) {
      var zid = +z.dataset.zoom, zf = frog(zid);
      zoom.innerHTML = '<div class="zin"><img class="ph fill" id="zoom-img" src="' + z.src + '" alt="Back of #' + zid + '"><p><strong class="id">#' + zid + '</strong> <span class="sub" id="zoom-cap">returns to Tank ' + zf.tank + '</span></p><button class="btn ghost" id="btn-zoom-close">Close</button></div>';
      zoom.hidden = false;
      call('getTankPhotos', [[zid]], true).then(function (r) {
        var list = r[zid] || [], p = list[list.length - 1], img = document.getElementById('zoom-img');
        if (p && p.pattern && img) { img.src = p.pattern; document.getElementById('zoom-cap').textContent = p.date + ' · ' + p.kind + ' · returns to Tank ' + zf.tank; }
      }).catch(function () {});
      return;
    }
    var b = e.target.closest('[data-act]'); if (!b || !S.data) return;
    var act = b.dataset.act, id = b.dataset.id, v = S.view, f;
    if (act === 'fileCtx') { S.fileCtx = { kind: b.dataset.kind, id: +id }; return; }   // the label itself opens the camera
    if (act === 'tab') { S.tab = id; S.shot = null; go({ name: home[id] }); reload(true); }
    else if (act === 'back') {
      if (v.name === 'compare') go({ name: 'tank', id: v.tank });
      else if (v.name === 'hist') go({ name: 'frog', id: v.id, from: v.from });
      else if (v.name === 'frog' && v.from === 'check') go({ name: 'check' });
      else { if (v.name !== 'tank') S.shot = null; S.addPhoto = null; go({ name: home[S.tab] }); }   // a photo taken in the wrong tank waits on the list
    }
    else if (act === 'dismiss') { S.error = ''; render(); }
    else if (act === 'dropShot') { S.shot = null; render(); }
    else if (act === 'reload') reload().then(function () { toast('Up to date'); });
    else if (act === 'openTank') {
      var now = Date.now();
      if (S.shot && S.shot.tank !== +id) { S.shot.tank = +id; S.shot.ranks = null; S.shot.ranked = false; }   // compared again with this tank's frogs
      S.trial = { tank: +id, opened: now }; S.since.opens++; if (!S.since.first) S.since.first = now;
      go({ name: 'tank', id: +id }); loadTank(+id); Matcher.load();
    }
    else if (act === 'compare') {
      var tk = v.name === 'compare' ? v.tank : v.id;
      if (v.name !== 'compare') S.since.compares++;
      go({ name: 'compare', tank: tk, id: +id, idx: 99, whole: false }, v.name === 'compare');
    }
    else if (act === 'photo') { v.idx = +id; render(); }
    else if (act === 'big') { S.big = !S.big; render(); }
    else if (act === 'whole') {
      v.whole = !v.whole; render();
      var list = refs(v.tank, v.id), p = list[Math.min(v.idx, list.length - 1)];
      if (v.whole && p && !S.full[p.photoId]) call('getFullPhoto', [p.photoId], true).then(function (src) { S.full[p.photoId] = src; render(); }).catch(function () {});
    }
    else if (act === 'pick') pick(+id);
    else if (act === 'unpick') { S.basket = S.basket.filter(function (x) { return x.id !== +id; }); render(); }
    else if (act === 'savePriming') {
      var on = S.data.recordTiming, savedAt = Date.now(), items = S.basket.map(function (x) { return { id: x.id, photo: x.photo, match: x.match, timing: on ? timingRow(x.timing, savedAt) : null }; });
      var client = on ? { device: navigator.userAgent + ' ' + screen.width + 'x' + screen.height + '@' + (window.devicePixelRatio || 1), matcherLoadMs: Matcher.loadMs() } : null;
      call('savePriming', [{ items: items, client: client }]).then(function (st) {
        S.basket.forEach(function (x) { if (x.photo) S.thumbs[x.id] = x.photo.thumb; delete S.tankPhotos[x.tank]; });
        var ids = S.basket.map(function (x) { return x.id; });
        S.basket = []; applyState(st); go({ name: 'tape', ids: ids });
      }).catch(function (e) { fail(e); reload(true); });
    }
    else if (act === 'openUse') go({ name: 'use', id: +id });
    else if (act === 'ret') {
      f = frog(+id);
      call('returnFrog', [f.open.id]).then(function (st) { applyState(st); go({ name: 'inuse' }); toast('#' + f.id + ' returned to Tank ' + f.tank); }).catch(fail);
    }
    else if (act === 'askCancel') { S.confirm = 'cancel' + id; render(); }
    else if (act === 'cancelPriming') {
      f = frog(+id);
      call('cancelPriming', [f.open.id]).then(function (st) {
        delete S.thumbs[f.id]; delete S.tankPhotos[f.tank]; applyState(st); go({ name: 'inuse' }); toast('Priming of #' + f.id + ' cancelled');
        call('getThumbs', [], true).then(function (t) { Object.keys(t).forEach(function (k) { S.thumbs[k] = t[k]; }); if (S.view.name === 'inuse') render(); }).catch(function () {});
      }).catch(fail);
    }
    else if (act === 'openFrog') openFrog(+id);
    else if (act === 'editHist') go({ name: 'hist', id: v.id, n: +id, from: v.from });
    else if (act === 'checkFrog') openFrog(+id, 'check');
    else if (act === 'runCheck') runCheck();
    else if (act === 'stopCheck') { if (S.check) { S.check.stop = true; S.check.msg = 'Stopping...'; render(); } }
    else if (act === 'recrop') recrop(v.id, S.detail.photos[+id]);
    else if (act === 'askRemovePhoto') { S.confirm = 'photo' + S.detail.photos[+id].photoId; render(); }
    else if (act === 'removePhoto') {
      var fid = v.id, rp = S.detail.photos[+id];
      call('removePhoto', [fid, rp.photoId]).then(function (d) {
        S.confirm = null; setDetail(d); delete S.tankPhotos[frog(fid).tank]; frog(fid).photos = d.photos.length; photosChanged();
        if (rp.last) delete S.thumbs[fid];
        if (S.detail.photos.length) S.thumbs[fid] = S.detail.photos[S.detail.photos.length - 1].thumb || S.thumbs[fid];
        render(); toast('Photo removed');
      }).catch(fail);
    }
    else if (act === 'go') { S.addPhoto = null; go({ name: id }); }
    else if (act === 'askRemove') { S.confirm = +id; render(); }
    else if (act === 'cancel') { S.confirm = null; render(); }
    else if (act === 'askExchange') { S.confirm = 'ex' + id; render(); }
    else if (act === 'applyExchange') call('applyExchange', [+id]).then(function (st) { applyState(st); S.tankPhotos = {}; S.confirm = null; render(); toast('Tank ' + id + ' done'); }).catch(fail);
  });

  document.addEventListener('change', function (e) {
    var el = e.target, file = el.files && el.files[0], ctx = S.fileCtx;
    if (!file || !ctx || (el.id !== 'file-cam' && el.id !== 'file-lib')) return;
    S.fileCtx = null;
    if (ctx.kind === 'shot') takeShot(file, ctx.id);
    else if (ctx.kind === 'newFrog') shoot(file, function (p) { S.addPhoto = p; keepForm(render); });
    else if (ctx.kind === 'addPhoto') {
      var id = ctx.id;
      shoot(file, function (p) {
        busy(1);
        call('addPhoto', [id, { full: p.full, pattern: p.pattern, thumb: p.thumb, emb: '', crop: p.crop }], true)
          .then(function (d) { busy(-1); S.thumbs[id] = p.thumb; delete S.tankPhotos[frog(id).tank]; frog(id).photos++; setDetail(d); photosChanged(); render(); toast('Photo added'); })
          .catch(function (x) { busy(-1); fail(x); });
      });
    }
    el.value = '';
  });
  // Re-rendering the add form would wipe what was typed; carry the values across.
  function keepForm(fn) {
    var keep = {}; ['add-date', 'add-source', 'add-notes', 'add-tank'].forEach(function (k) { var el = document.getElementById(k); if (el) keep[k] = el.value; });
    fn();
    Object.keys(keep).forEach(function (k) { var el = document.getElementById(k); if (el) el.value = keep[k]; });
  }

  document.addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target, rec = form.dataset.rec;
    if (form.id === 'rec-form') {
      var id = S.view.id, date = document.getElementById('rec-date').value;
      if (!date) { toast('Enter the collection date'); return; }
      call('saveRecord', [rec, { collection: date, water: checked('water'), sqQty: checked('sqQty'), sqApp: checked('sqApp'), sqCa: checked('sqCa'), laidQty: checked('laidQty'), laidApp: checked('laidApp'), laidCa: checked('laidCa'), activity: checked('activity'), comments: document.getElementById('rec-memo').value }])
        .then(function (st) { applyState(st); go({ name: 'use', id: id }); }).catch(fail);
    } else if (form.id === 'edit-form' || form.id === 'hist-form') {
      var v = S.view;
      call('updateRecord', [rec, { sqCa: checked('sqCa'), laidCa: checked('laidCa'), comments: document.getElementById('edit-memo').value }]).then(function (st) {
        applyState(st); toast('Changes saved');
        if (form.id === 'hist-form') openFrog(v.id); else go({ name: 'use', id: v.id }, true);
      }).catch(fail);
    } else if (form.id === 'remove-form') {
      var rid = +form.dataset.id, reason = checked('removeReason');
      if (!reason) { toast('Choose a reason'); return; }
      call('removeFrog', [rid, reason, document.getElementById('remove-note').value]).then(function (st) { applyState(st); go({ name: 'frogs' }); toast('#' + rid + ' removed'); }).catch(fail);
    } else if (form.id === 'add-form') {
      var p = S.addPhoto;
      call('addFrog', [{ arrival: document.getElementById('add-date').value, source: document.getElementById('add-source').value, notes: document.getElementById('add-notes').value, tank: document.getElementById('add-tank').value,
        photo: p ? { full: p.full, pattern: p.pattern, thumb: p.thumb, emb: '', crop: p.crop } : null }]).then(function (st) {
        if (p) S.thumbs[st.newId] = p.thumb;
        S.addPhoto = null; S.tankPhotos = {}; applyState(st); toast('#' + st.newId + ' added'); openFrog(st.newId);
      }).catch(fail);
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target.id !== 'frog-search') return;
    var q = e.target.value.replace(/[^0-9]/g, '');
    Array.prototype.forEach.call(document.querySelectorAll('#frog-list .row'), function (r) { r.hidden = !!q && r.dataset.key.indexOf(q) !== 0; });
  });

  Matcher.onStatus(function () { if (S.data && S.view.name === 'tank') render(); });
  render();
  reload();
})();
