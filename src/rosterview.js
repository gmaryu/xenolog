/* Roster check result as HTML, and the grid of every pair. Shared by the check page (check.js) and the app (app.js).
   photos, pairs and F come from RosterCheck (scoreAll and findings). */
var RosterView = (function () {
  var shown = null;     // what drawGrid needs from the last html(): the photos, the findings and how a photo is drawn
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function auto(p) { return p.crop === 'auto' || p.crop === 'centre'; }

  /**
   * opts.link(frogId, html): wraps a photo so that it opens the frog (the app); without it photos are plain.
   * opts.grid: include the grid of every pair (draw it with drawGrid once the HTML is on the page).
   * opts.gridNote: shown in place of the grid when it is left out.
   * opts.download: include the button that downloads every pair as CSV (id "download").
   */
  function html(photos, pairs, F, secs, opts) {
    opts = opts || {};
    var M = RosterCheck.MATCH_MIN, link = opts.link || function (id, h) { return h; };
    var tank = function (id) { return F.tankOf[id] ? ' (Tank ' + F.tankOf[id] + ')' : ''; };
    function fig(i, note) {
      var p = photos[i], img = /^data:image\//.test(p.pattern) ? '<img src="' + esc(p.pattern) + '" alt="Back of #' + p.frog + '" loading="lazy">' : '<div class="noimg"></div>';
      return '<figure>' + link(p.frog, img) + '<figcaption><strong>#' + p.frog + '</strong>' + (p.date ? ' · ' + esc(p.date) : '') + ' · ' + esc(p.kind) + '<br>' + esc(p.photoId) +
        (auto(p) ? '<br>automatic crop, not checked' : '') + (note ? '<br>' + note : '') + '</figcaption></figure>';
    }
    var used = photos.length - F.unreadable.length - F.outside.length, ids = {}, autos = {};
    photos.forEach(function (p, i) {
      if (F.outside.indexOf(i) >= 0) return;
      ids[p.frog] = true;
      if (auto(p) && F.unreadable.indexOf(i) < 0) autos[p.frog] = true;
    });
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
    h += F.merged.length ? '<p class="note">The same frog may be filed under two IDs. Within one tank this is often two frogs swapped when the photos were taken.</p><div class="pairs">' + F.merged.map(function (pr) { return pairCard(photos, pr, F, fig); }).join('') + '</div>' : '<p class="note">None.</p>';

    h += '<h2>Close to the threshold (' + plural(F.near.length, 'pair') + ')</h2>';
    h += F.near.length ? '<details><summary>Different IDs with ' + RosterCheck.NEAR_MIN + ' to ' + (M - 1) + ' matching points: not called a match, but look at them</summary><div class="pairs">' + F.near.map(function (pr) { return pairCard(photos, pr, F, fig); }).join('') + '</div></details>' : '<p class="note">None.</p>';

    var chips = function (list) { return '<div class="chips">' + list.map(function (id) { return link(id, '<span class="chip">#' + id + '</span>'); }).join('') + '</div>'; };
    var autoIds = Object.keys(autos).map(Number).sort(function (a, b) { return a - b; });
    if (autoIds.length) h += '<h2>Automatic crops (' + autoIds.length + ')</h2><p class="note">These IDs have a photo whose crop was never checked by hand. A crop that misses the back gives too few points; adjust it on the frog\'s page and check again.</p>' + chips(autoIds);

    h += '<h2>Not checked</h2><div class="stack">';
    if (F.missing.length) h += '<div><div class="ttl">In the colony with no photo (' + F.missing.length + ')</div>' + chips(F.missing) + '</div>';
    h += '<div><div class="ttl">One photo only (' + F.lone.length + ')</div><p class="note">Checked against other IDs, but there is nothing of their own to check it against.</p>' + (F.lone.length ? chips(F.lone) : '') + '</div>';
    if (F.unreadable.length) h += '<div><div class="ttl">Photos that could not be compared (' + F.unreadable.length + ')</div><p class="note">No back pattern yet (open the frog in the app once to make it) or too little detail.</p><div class="chips">' +
      F.unreadable.map(function (i) { return link(photos[i].frog, '<span class="chip">#' + photos[i].frog + ' ' + esc(photos[i].photoId) + '</span>'); }).join('') + '</div></div>';
    if (F.outside.length) h += '<p class="note">' + plural(F.outside.length, 'photo') + ' of frogs not in the colony left out.</p>';
    h += '<p class="note">A frog photographed only under the wrong ID, with no other photo of it, looks correct here: the check finds photos that disagree, not a mix-up repeated in every photo.</p></div>';

    var heads = ['Matching points', 'Same ID, different days', 'Same ID, same day', 'Different IDs'];
    h += '<h2>Scores</h2><div class="scroll"><table class="bins"><thead><tr>' + heads.map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead><tbody>' +
      F.binRanges.map(function (r, k) {
        return '<tr><td>' + (r[1] === Infinity ? r[0] + ' or more' : r[0] === r[1] ? r[0] : r[0] + '–' + r[1]) + '</td><td>' + F.bins.sameDays[k] + '</td><td>' + F.bins.sameDay[k] + '</td><td>' + F.bins.other[k] + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="note">Photos of one frog taken the same day share light and pose, so they match more easily than photos from different days.</p><h2>All pairs</h2>';
    if (opts.grid) h += '<p class="note">Each photo is a row and a column, ' + (Object.keys(F.tankOf).length ? 'in tank order, then by ID' : 'by ID') + '. The outlined squares on the diagonal are one ID\'s photos with each other: they should be strongly coloured. ' +
      'Outside them every cell should be faint or empty. A strong cell outside the squares is a match between IDs; a faint or empty cell inside one is a pair of one ID that does not match. Point at a cell for its score; click it to show the two photos.</p>' +
      '<div class="heat" id="heat"><div class="legend" id="heat-legend"></div><div class="heat-wrap"><canvas id="heat-canvas" aria-label="Matching points between every pair of photos; the table above gives the counts"></canvas><div class="tip" id="heat-tip" hidden></div></div><div id="heat-pick"></div></div>';
    else if (opts.gridNote) h += '<p class="note">' + opts.gridNote + '</p>';
    if (opts.download) h += '<div class="btnrow"><button class="btn ghost inline" id="download">Download every pair (CSV)</button></div>';
    shown = { photos: photos, F: F, fig: fig };
    return h;
  }

  function pairCard(photos, pr, F, fig) {
    var A = photos[pr.a], B = photos[pr.b], tank = function (id) { return F.tankOf[id] ? ' (Tank ' + F.tankOf[id] + ')' : ''; };
    return '<div class="finding"><div class="ttl"><span class="id">#' + A.frog + '</span>' + tank(A.frog) + ' and <span class="id">#' + B.frog + '</span>' + tank(B.frog) +
      '</div><div class="sim">' + plural(pr.score, 'matching point') + (A.frog === B.frog ? '' : A.date && A.date === B.date ? ' · taken the same day' : '') +
      '</div><div class="photos">' + fig(pr.a) + fig(pr.b) + '</div></div>';
  }

  /** Every pair as a grid of cells in #heat, coloured by the same score ranges as the table. Call after html(..., { grid: true }) is on the page. */
  function drawGrid(pairs) {
    var L = shown, photos = L.photos, F = L.F, $ = function (id) { return document.getElementById(id); };
    if (!L || !$('heat')) return;
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
    cv.onclick = function (e) { var pr = cellAt(e); if (pr) $('heat-pick').innerHTML = '<div class="pairs">' + pairCard(photos, pr, F, L.fig) + '</div>'; };
  }

  return { html: html, drawGrid: drawGrid };
})();
