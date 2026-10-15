/* Check page: reads the person's photo exports or files, runs RosterCheck and shows what it found. Nothing is sent anywhere. */
(function () {
  var C = { photos: [], frogs: null, sources: [], skipped: [] };
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function say(text) { $('progress').textContent = text; }
  function readText(file) { return new Promise(function (ok, fail) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = fail; r.readAsText(file); }); }

  function showLoaded() {
    var ids = {};
    C.photos.forEach(function (p) { ids[p.frog] = true; });
    $('loaded').textContent = C.photos.length ? plural(C.photos.length, 'photo') + ' of ' + plural(Object.keys(ids).length, 'ID') + ' from ' + C.sources.join(', ') +
      (C.frogs ? '. Frogs sheet: ' + C.frogs.filter(function (f) { return f.inColony; }).length + ' in the colony' : '') +
      (C.skipped.length ? '. Left out (no ID in the name): ' + C.skipped.slice(0, 6).join(', ') + (C.skipped.length > 6 ? ', ...' : '') : '') + '.'
      : (C.frogs ? 'Frogs sheet read. Choose the Photos sheet export too.' : 'Nothing chosen yet.');
    $('run').disabled = !C.photos.length;
  }

  /** A sheet export: the Photos sheet adds photos, the Frogs sheet sets the colony. */
  function addCsvText(name, text) {
    var rows = RosterCheck.parseCsv(text), kind = RosterCheck.kindOfCsv(rows);
    if (kind === 'photos') { C.photos = C.photos.concat(RosterCheck.photosFromRows(rows)); C.sources.push(name); }
    else if (kind === 'frogs') C.frogs = RosterCheck.frogsFromRows(rows);
    else throw new Error(name + ' is not an export of the Photos or Frogs sheet (its first heading should be "Photo ID" or "Animal ID").');
  }
  /** Image files named by frog ID; the back is cut out automatically, as the app does before the crop screen. */
  function addImageFiles(files) {
    files = Array.prototype.slice.call(files);
    var named = files.filter(function (f) { var id = RosterCheck.idFromName(f.name); if (id === null) C.skipped.push(f.name); return id !== null; }), n = 0;
    return named.reduce(function (chain, f) {
      return chain.then(function () {
        say('Finding the back in ' + f.name + ' (' + (++n) + ' of ' + named.length + ')...');
        return Matcher.process(f).then(function (r) {
          C.photos.push({ photoId: f.name, frog: RosterCheck.idFromName(f.name), date: '', kind: 'file', pattern: r.pattern, crop: r.crop });
        }, function () { C.photos.push({ photoId: f.name, frog: RosterCheck.idFromName(f.name), date: '', kind: 'file', pattern: '', crop: '' }); });
      });
    }, Promise.resolve()).then(function () { if (named.length) C.sources.push(plural(named.length, 'image file')); say(''); });
  }

  function run() {
    $('run').disabled = true; $('result').innerHTML = '';
    var started = Date.now(), feats = [], photos = C.photos.slice(), n = 0;
    say('Loading the pattern check...');
    return Matcher.load().then(function (ok) {
      if (!ok) throw new Error('The pattern check could not be loaded. Check the internet connection and reload the page.');
      return photos.reduce(function (chain, p, i) {
        return chain.then(function () {
          say('Reading the back patterns: ' + (++n) + ' of ' + photos.length + '...');
          if (!/^data:image\//.test(p.pattern)) { feats[i] = null; return; }
          return Matcher.describe(p.pattern).then(function (f) { feats[i] = f && f.n >= 4 ? f : null; });
        });
      }, Promise.resolve());
    }).then(function () {
      var from = Date.now();
      return RosterCheck.scoreAll(photos, feats, Matcher.count, function (done, total) {
        var left = done ? Math.round((Date.now() - from) / done * (total - done) / 1000) : null;
        say('Comparing: ' + done + ' of ' + plural(total, 'pair') + (left !== null && done < total ? ', about ' + (left < 90 ? left + ' s' : Math.round(left / 60) + ' min') + ' left' : '') + '...');
      });
    }).then(function (pairs) {
      var secs = Math.round((Date.now() - started) / 100) / 10;
      say('');
      render(photos, pairs, RosterCheck.findings(photos, feats, pairs, C.frogs), secs);
    }).catch(function (e) { say(e.message || String(e)); })
      .then(function () { $('run').disabled = !C.photos.length; });
  }

  function render(photos, pairs, F, secs) {
    var M = RosterCheck.MATCH_MIN, tank = function (id) { return F.tankOf[id] ? ' (Tank ' + F.tankOf[id] + ')' : ''; };
    function fig(i, note) {
      var p = photos[i], img = /^data:image\//.test(p.pattern) ? '<img src="' + esc(p.pattern) + '" alt="Back of #' + p.frog + '" loading="lazy">' : '<div class="noimg"></div>';
      return '<figure>' + img + '<figcaption><strong>#' + p.frog + '</strong>' + (p.date ? ' · ' + esc(p.date) : '') + ' · ' + esc(p.kind) + '<br>' + esc(p.photoId) +
        (p.crop === 'auto' || p.crop === 'centre' ? '<br>automatic crop, not checked' : '') + (note ? '<br>' + note : '') + '</figcaption></figure>';
    }
    function pairCard(pr) {
      var A = photos[pr.a], B = photos[pr.b];
      return '<div class="finding"><div class="ttl"><span class="id">#' + A.frog + '</span>' + tank(A.frog) + ' and <span class="id">#' + B.frog + '</span>' + tank(B.frog) +
        '</div><div class="sim">' + plural(pr.score, 'matching point') + (A.frog === B.frog ? '' : A.date && A.date === B.date ? ' · taken the same day' : '') +
        '</div><div class="photos">' + fig(pr.a) + fig(pr.b) + '</div></div>';
    }
    // Every pair as a grid of cells, coloured by the same score ranges as the table.
    function drawHeat() {
      var dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light' || document.documentElement.dataset.theme === 'dark';
      // One-hue blue ramp, pale to dark for 1-5, 6-9, 10-14, 15-49 and 50 or more points; on a dark page it runs the other way. 0 is left empty.
      var ramp = dark ? ['#0d366b', '#184f95', '#2a78d6', '#86b6ef', '#cde2fb'] : ['#cde2fb', '#9ec5f4', '#5598e7', '#256abf', '#0d366b'];
      var css = getComputedStyle(document.documentElement), ink = css.getPropertyValue('--fg').trim(), muted = css.getPropertyValue('--muted').trim(), line = css.getPropertyValue('--line').trim();
      var skip = {};
      F.unreadable.concat(F.outside).forEach(function (i) { skip[i] = true; });
      var order = photos.map(function (_, i) { return i; }).filter(function (i) { return !skip[i]; }).sort(function (x, y) {
        var A = photos[x], B = photos[y], ta = F.tankOf[A.frog] || 1e9, tb = F.tankOf[B.frog] || 1e9;
        return ta - tb || A.frog - B.frog || (A.date < B.date ? -1 : A.date > B.date ? 1 : x - y);
      });
      var n = order.length, sc = {}, at = {};
      pairs.forEach(function (pr) { sc[pr.a + '|' + pr.b] = sc[pr.b + '|' + pr.a] = pr; });
      order.forEach(function (i, k) { at[k] = i; });
      var bin = function (s) { return s === 0 ? -1 : s <= 5 ? 0 : s < RosterCheck.MATCH_MIN ? 1 : s <= 14 ? 2 : s <= 49 ? 3 : 4; };
      $('heat-legend').innerHTML = '<span><i class="zero"></i>0</span>' + ['1–5', '6–9', '10–14 (match)', '15–49', '50 or more'].map(function (t, k) { return '<span><i style="background:' + ramp[k] + '"></i>' + t + '</span>'; }).join('');
      if (!n) return;
      var labelW = 44, wrap = $('heat').clientWidth - labelW, cell = Math.max(2, Math.min(14, Math.floor(wrap / n))), size = cell * n;
      var cv = $('heat-canvas'), dpr = window.devicePixelRatio || 1, c = cv.getContext('2d');
      cv.width = (labelW + size) * dpr; cv.height = size * dpr; cv.style.width = (labelW + size) + 'px'; cv.style.height = size + 'px';
      c.scale(dpr, dpr);
      for (var r = 0; r < n; r++) for (var q = 0; q < n; q++) {
        var x = labelW + q * cell, y = r * cell;
        if (r === q) { c.fillStyle = line; c.fillRect(x, y, cell, cell); continue; }
        var pr = sc[at[r] + '|' + at[q]], b = pr ? bin(pr.score) : -1;
        if (b >= 0) { c.fillStyle = ramp[b]; c.fillRect(x, y, cell, cell); }
      }
      // Tank boundaries as faint lines, each ID's own square outlined, and an ID label at the start of each square when there is room.
      var lastLabel = -99, k0 = 0;
      c.font = '10px ' + css.getPropertyValue('--font-id'); c.textBaseline = 'top'; c.textAlign = 'right';
      for (var k = 1; k <= n; k++) {
        var P = photos[at[k0]], Q = k < n ? photos[at[k]] : null;
        if (Q && Q.frog === P.frog) continue;
        c.strokeStyle = ink; c.lineWidth = 1;
        c.strokeRect(labelW + k0 * cell + 0.5, k0 * cell + 0.5, (k - k0) * cell - 1, (k - k0) * cell - 1);
        if (k0 * cell - lastLabel >= 11) { c.fillStyle = muted; c.fillText('#' + P.frog, labelW - 4, k0 * cell); lastLabel = k0 * cell; }
        if (Q && F.tankOf[Q.frog] !== F.tankOf[P.frog]) {
          c.strokeStyle = line; c.beginPath(); c.moveTo(labelW, k * cell); c.lineTo(labelW + size, k * cell); c.moveTo(labelW + k * cell, 0); c.lineTo(labelW + k * cell, size); c.stroke();
        }
        k0 = k;
      }
      var tip = $('heat-tip');
      function cellAt(e) {
        var box = cv.getBoundingClientRect(), q = Math.floor((e.clientX - box.left - labelW) / cell), r = Math.floor((e.clientY - box.top) / cell);
        return q >= 0 && r >= 0 && q < n && r < n && q !== r ? sc[at[r] + '|' + at[q]] || null : null;
      }
      function who(i) { var p = photos[i]; return '#' + p.frog + (F.tankOf[p.frog] ? ' (Tank ' + F.tankOf[p.frog] + ')' : '') + ' · ' + (p.date ? p.date + ' · ' : '') + p.photoId; }
      cv.onpointermove = function (e) {
        var pr = cellAt(e);
        if (!pr) { tip.hidden = true; return; }
        tip.textContent = '';
        var strong = document.createElement('strong'); strong.textContent = plural(pr.score, 'matching point');
        tip.appendChild(strong);
        [who(pr.a), who(pr.b)].forEach(function (t) { var d = document.createElement('div'); d.textContent = t; tip.appendChild(d); });
        var box = cv.getBoundingClientRect();
        tip.style.left = Math.min(e.clientX - box.left + 12, box.width - 200) + 'px'; tip.style.top = (e.clientY - box.top + 12) + 'px';
        tip.hidden = false;
      };
      cv.onpointerleave = function () { tip.hidden = true; };
      cv.onclick = function (e) { var pr = cellAt(e); if (pr) $('heat-pick').innerHTML = '<div class="pairs">' + pairCard(pr) + '</div>'; };
    }
    var ids = {}, used = photos.length - F.unreadable.length - F.outside.length;
    photos.forEach(function (p, i) { if (F.outside.indexOf(i) < 0) ids[p.frog] = true; });
    var h = '<h2>Result</h2><p class="note">' + plural(used, 'photo') + ' of ' + plural(Object.keys(ids).length, 'ID') + ' compared in ' + plural(pairs.length, 'pair') + ' (' + secs + ' s). ' +
      'Two photos are taken as the same frog at ' + M + ' matching points or more; in tests different frogs gave 5 or fewer and the same frog 15 to over 100.</p>';
    if (!F.split.length && !F.merged.length) h += '<div class="alert ok">Every ID\'s photos match each other, and no two IDs match.</div>';

    h += '<h2>IDs whose photos do not match each other (' + F.split.length + ')</h2>';
    if (F.split.length) {
      h += '<p class="note">One of the photos may show another frog, or a blurred photo or a crop that misses the back gives too few points. Photos that match each other are grouped. Under each photo is the other ID it matches best.</p><div class="stack">';
      F.split.forEach(function (s) {
        var bestOf = {};
        s.best.forEach(function (b) { bestOf[b.photo] = b.match; });
        h += '<div class="finding"><div class="ttl"><span class="id">#' + s.frog + '</span>' + tank(s.frog) + ': ' + s.groups.length + ' groups</div><div class="groups">' +
          s.groups.map(function (g) {
            return '<div class="group"><div class="photos">' + g.map(function (i) {
              var b = bestOf[i];
              return fig(i, b ? (b.score >= M ? '<span class="pill rest">matches #' + photos[b.photo].frog + ', ' + b.score + '</span>' : 'best other: #' + photos[b.photo].frog + ', ' + b.score) : '');
            }).join('') + '</div></div>';
          }).join('') + '</div>' +
          '<div class="sim">' + s.within.map(function (w) { return esc(photos[w.a].photoId) + ' – ' + esc(photos[w.b].photoId) + ': ' + w.score; }).join(' · ') + '</div></div>';
      });
      h += '</div>';
    } else h += '<p class="note">None.</p>';

    h += '<h2>Photos of different IDs that match (' + plural(F.merged.length, 'pair') + ')</h2>';
    h += F.merged.length ? '<p class="note">The same frog may be filed under two IDs. Within one tank this is often two frogs swapped when the photos were taken.</p><div class="pairs">' + F.merged.map(pairCard).join('') + '</div>' : '<p class="note">None.</p>';

    h += '<h2>Close to the threshold (' + plural(F.near.length, 'pair') + ')</h2>';
    h += F.near.length ? '<details><summary>Different IDs with ' + RosterCheck.NEAR_MIN + ' to ' + (M - 1) + ' matching points: not called a match, but look at them</summary><div class="pairs">' + F.near.map(pairCard).join('') + '</div></details>' : '<p class="note">None.</p>';

    h += '<h2>Not checked</h2><div class="stack">';
    var chips = function (list) { return '<div class="chips">' + list.map(function (id) { return '<span class="chip">#' + id + '</span>'; }).join('') + '</div>'; };
    if (F.missing.length) h += '<div><div class="ttl">In the colony with no photo (' + F.missing.length + ')</div>' + chips(F.missing) + '</div>';
    h += '<div><div class="ttl">One photo only (' + F.lone.length + ')</div><p class="note">Checked against other IDs, but there is nothing of their own to check it against.</p>' + (F.lone.length ? chips(F.lone) : '') + '</div>';
    if (F.unreadable.length) h += '<div><div class="ttl">Photos that could not be compared (' + F.unreadable.length + ')</div><p class="note">No back pattern yet (open the frog in the app once to make it) or too little detail.</p><div class="chips">' +
      F.unreadable.map(function (i) { return '<span class="chip">#' + photos[i].frog + ' ' + esc(photos[i].photoId) + '</span>'; }).join('') + '</div></div>';
    if (F.outside.length) h += '<p class="note">' + plural(F.outside.length, 'photo') + ' of frogs not in the colony left out.</p>';
    h += '<p class="note">A frog photographed only under the wrong ID, with no other photo of it, looks correct here: the check finds photos that disagree, not a mix-up repeated in every photo.</p></div>';

    var heads = ['Matching points', 'Same ID, different days', 'Same ID, same day', 'Different IDs'];
    h += '<h2>Scores</h2><div class="scroll"><table class="bins"><thead><tr>' + heads.map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead><tbody>' +
      F.binRanges.map(function (r, k) {
        return '<tr><td>' + (r[1] === Infinity ? r[0] + ' or more' : r[0] === r[1] ? r[0] : r[0] + '–' + r[1]) + '</td><td>' + F.bins.sameDays[k] + '</td><td>' + F.bins.sameDay[k] + '</td><td>' + F.bins.other[k] + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="note">Photos of one frog taken the same day share light and pose, so they match more easily than photos from different days.</p>' +
      '<h2>All pairs</h2><p class="note">Each photo is a row and a column, ' + (Object.keys(F.tankOf).length ? 'in tank order, then by ID' : 'by ID') + '. The outlined squares on the diagonal are one ID\'s photos with each other: they should be strongly coloured. ' +
      'Outside them every cell should be faint or empty. A strong cell outside the squares is a match between IDs; a faint or empty cell inside one is a pair of one ID that does not match. Point at a cell for its score; click it to show the two photos.</p>' +
      '<div class="heat" id="heat"><div class="legend" id="heat-legend"></div><div class="heat-wrap"><canvas id="heat-canvas" aria-label="Matching points between every pair of photos; the table above gives the counts"></canvas><div class="tip" id="heat-tip" hidden></div></div><div id="heat-pick"></div></div>' +
      '<div class="btnrow"><button class="btn ghost inline" id="download">Download every pair (CSV)</button></div>';
    $('result').innerHTML = h;
    drawHeat();
    $('download').onclick = function () {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([RosterCheck.pairsCsv(photos, pairs)], { type: 'text/csv' }));
      a.download = 'roster-check-scores.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    };
  }

  $('csv-in').addEventListener('change', function (e) {
    var files = Array.prototype.slice.call(e.target.files);
    Promise.all(files.map(function (f) { return readText(f).then(function (t) { addCsvText(f.name, t); }); }))
      .then(function () { say(''); }, function (err) { say(err.message || String(err)); })
      .then(function () { e.target.value = ''; showLoaded(); });
  });
  $('img-in').addEventListener('change', function (e) {
    addImageFiles(e.target.files).catch(function (err) { say(err.message || String(err)); }).then(function () { e.target.value = ''; showLoaded(); });
  });
  $('run').addEventListener('click', run);
  $('clear').addEventListener('click', function () { C = { photos: [], frogs: null, sources: [], skipped: [] }; $('result').innerHTML = ''; say(''); showLoaded(); });
  Matcher.load();      // start the download while files are being chosen

  window.CheckPage = { addCsvText: function (name, text) { addCsvText(name, text); showLoaded(); }, addImageFiles: function (f) { return addImageFiles(f).then(showLoaded); }, run: run };
})();
