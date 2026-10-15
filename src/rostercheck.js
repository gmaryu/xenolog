/* Roster check: compares every photo with every other photo and lists where the photos and the IDs disagree.
   Used by the check page (docs/check/); runs in a browser, and in Node for the tests. Holds no lab data:
   the photos come from the person's own sheet export or files and never leave the computer. */
var RosterCheck = (function () {
  var MATCH_MIN = 10;   // the same as MATCH_MIN in app.js: matching points needed to call two photos the same frog
  var NEAR_MIN = 6;     // 6 to 9 points between different IDs: not a match, but more than different frogs gave in tests (5 or fewer)
  var BINS = [[0, 0], [1, 5], [6, 9], [10, 14], [15, 49], [50, Infinity]];
  // Column positions in the sheets, as in PHOTO_COLS and FROG_COLS in Code.gs.
  var PHOTO = { id: 0, frog: 1, date: 2, kind: 3, pattern: 6, crop: 8 }, FROG = { id: 0, status: 1, tank: 2 };

  /** Rows of a CSV file as written by Google Sheets: quoted fields may hold commas, quotes and line breaks. */
  function parseCsv(text) {
    var rows = [], row = [], f = '', q = false, i, c;
    text = String(text).replace(/^﻿/, '');
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { f += '"'; i++; }
        else if (c === '"') q = false;
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f); rows.push(row); row = []; f = '';
      } else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  function num(v) { var s = String(v == null ? '' : v).trim(); return /^\d+$/.test(s) ? Number(s) : null; }
  function cell(r, n) { return String(r[n] == null ? '' : r[n]).trim(); }

  /** Which sheet a CSV export is, from its first heading: 'photos', 'frogs' or ''. */
  function kindOfCsv(rows) {
    var h = rows.length ? cell(rows[0], 0) : '';
    return h === 'Photo ID' ? 'photos' : h === 'Animal ID' ? 'frogs' : '';
  }
  /** Photos sheet rows that the app still shows: not removed or cancelled, with an ID. */
  function photosFromRows(rows) {
    return rows.slice(1).map(function (r) {
      return { photoId: cell(r, PHOTO.id), frog: num(r[PHOTO.frog]), date: cell(r, PHOTO.date), kind: cell(r, PHOTO.kind),
        pattern: cell(r, PHOTO.pattern), crop: cell(r, PHOTO.crop) };
    }).filter(function (p) { return p.photoId !== '' && p.frog !== null && p.kind !== 'removed' && p.kind !== 'cancelled'; });
  }
  function frogsFromRows(rows) {
    return rows.slice(1).map(function (r) { return { id: num(r[FROG.id]), inColony: cell(r, FROG.status) === 'In colony', tank: num(r[FROG.tank]) }; })
      .filter(function (f) { return f.id !== null; });
  }
  /** The frog ID in a photo file name: the app's "frog-125_2026-10-14_P1a2b3c4d.jpg", or "125.jpg" and "#125 back.png" as for importing. */
  function idFromName(name) {
    var m = String(name).match(/^frog-(\d+)_/) || String(name).match(/^\s*#?(\d+)/);
    return m ? Number(m[1]) : null;
  }

  /**
   * Counts matching points for every pair of photos that have a description (feats[i], from Matcher.describe).
   * count is Matcher.count. progress(done, total) is called now and then; the work pauses there so the page can redraw.
   * Resolves to [{ a, b, score }] with a < b as indexes into photos.
   */
  function scoreAll(photos, feats, count, progress) {
    var idx = [], pairs = [], i, j;
    for (i = 0; i < photos.length; i++) if (feats[i]) idx.push(i);
    for (i = 0; i < idx.length; i++) for (j = i + 1; j < idx.length; j++) pairs.push({ a: idx[i], b: idx[j], score: 0 });
    var k = 0;
    return new Promise(function (ok, fail) {
      (function next() {
        try {
          var until = Date.now() + 100;      // work in slices of about 0.1 s, then let the page redraw
          while (k < pairs.length && Date.now() < until) { pairs[k].score = count(feats[pairs[k].a], feats[pairs[k].b]); k++; }
          if (progress) progress(k, pairs.length);
          if (k < pairs.length) pause(next); else ok(pairs);
        } catch (e) { fail(e); }
      })();
    });
  }
  // A browser slows timers in a tab that is not in front to one a second; a message is not slowed, so a long check keeps going.
  function pause(f) {
    if (typeof MessageChannel === 'undefined' || typeof document === 'undefined') { setTimeout(f, 0); return; }
    var ch = new MessageChannel();
    ch.port1.onmessage = function () { ch.port1.close(); f(); };
    ch.port2.postMessage(0);
  }

  /**
   * What the scores say about the roster. photos: [{ photoId, frog, date, ... }]; feats[i] is falsy for a photo that could not be read;
   * pairs from scoreAll; frogs (optional, from the Frogs sheet) limits the check to frogs in the colony and finds frogs with no photo.
   *   split:   IDs whose photos fall into more than one group that do not match each other. groups: lists of photo indexes;
   *            best: for each photo in the ID, the best-matching photo of another ID.
   *   merged:  pairs of photos of different IDs that match (MATCH_MIN or more), highest first.
   *   near:    pairs of photos of different IDs with NEAR_MIN to MATCH_MIN - 1 points.
   *   lone:    IDs with a single readable photo; nothing of their own to check it against.
   *   missing: frogs in the colony with no readable photo. unreadable: photo indexes with no pattern or no description.
   *   outside: photo indexes of frogs that are not in the colony (left out of everything else).
   *   bins:    how many pairs fall in each score range, for the same ID (on different days and on the same day) and for different IDs.
   */
  function findings(photos, feats, pairs, frogs) {
    var colony = null, tankOf = {};
    if (frogs && frogs.length) {
      colony = {};
      frogs.forEach(function (f) { if (f.inColony) { colony[f.id] = true; tankOf[f.id] = f.tank; } });
    }
    var inside = function (i) { return !colony || colony[photos[i].frog]; };
    var out = { split: [], merged: [], near: [], lone: [], missing: [], unreadable: [], outside: [], tankOf: tankOf,
      bins: { sameDays: BINS.map(function () { return 0; }), sameDay: BINS.map(function () { return 0; }), other: BINS.map(function () { return 0; }) }, binRanges: BINS };
    var byFrog = {};
    photos.forEach(function (p, i) {
      if (!inside(i)) { out.outside.push(i); return; }
      if (!feats[i]) { out.unreadable.push(i); return; }
      (byFrog[p.frog] = byFrog[p.frog] || []).push(i);
    });
    var score = {}, best = {};
    pairs.forEach(function (pr) {
      if (!inside(pr.a) || !inside(pr.b)) return;
      var A = photos[pr.a], B = photos[pr.b], s = pr.score, bin = BINS.findIndex(function (r) { return s >= r[0] && s <= r[1]; });
      score[pr.a + '|' + pr.b] = score[pr.b + '|' + pr.a] = s;
      if (A.frog === B.frog) { out.bins[A.date && A.date === B.date ? 'sameDay' : 'sameDays'][bin]++; return; }
      out.bins.other[bin]++;
      if (s >= MATCH_MIN) out.merged.push(pr); else if (s >= NEAR_MIN) out.near.push(pr);
      [[pr.a, pr.b], [pr.b, pr.a]].forEach(function (x) { if (!best[x[0]] || s > best[x[0]].score) best[x[0]] = { photo: x[1], score: s }; });
    });
    var byScore = function (x, y) { return y.score - x.score; };
    out.merged.sort(byScore); out.near.sort(byScore);
    Object.keys(byFrog).forEach(function (id) {
      var list = byFrog[id];
      if (list.length === 1) { out.lone.push(Number(id)); return; }
      // photos joined by a match end up in one group
      var group = list.map(function (_, n) { return n; });
      var root = function (n) { while (group[n] !== n) n = group[n] = group[group[n]]; return n; };
      for (var x = 0; x < list.length; x++) for (var y = x + 1; y < list.length; y++) if ((score[list[x] + '|' + list[y]] || 0) >= MATCH_MIN) group[root(x)] = root(y);
      var groups = {};
      list.forEach(function (i, n) { (groups[root(n)] = groups[root(n)] || []).push(i); });
      var g = Object.keys(groups).map(function (k) { return groups[k]; });
      if (g.length > 1) {
        var within = [];
        for (x = 0; x < list.length; x++) for (y = x + 1; y < list.length; y++) within.push({ a: list[x], b: list[y], score: score[list[x] + '|' + list[y]] || 0 });
        out.split.push({ frog: Number(id), groups: g, within: within, best: list.map(function (i) { return { photo: i, match: best[i] || null }; }) });
      }
    });
    if (colony) Object.keys(colony).forEach(function (id) { if (!byFrog[id]) out.missing.push(Number(id)); });
    var asc = function (x, y) { return x - y; };
    out.lone.sort(asc); out.missing.sort(asc); out.split.sort(function (x, y) { return x.frog - y.frog; });
    return out;
  }

  function csvField(v) { var s = String(v == null ? '' : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  /** Every pair and its score as CSV, for looking at the scores outside the page. */
  function pairsCsv(photos, pairs) {
    var head = ['Photo A', 'Animal ID A', 'Date A', 'Photo B', 'Animal ID B', 'Date B', 'Same ID', 'Matching points'];
    return [head].concat(pairs.map(function (pr) {
      var A = photos[pr.a], B = photos[pr.b];
      return [A.photoId, A.frog, A.date, B.photoId, B.frog, B.date, A.frog === B.frog ? 'yes' : 'no', pr.score];
    })).map(function (r) { return r.map(csvField).join(','); }).join('\n') + '\n';
  }

  return { MATCH_MIN: MATCH_MIN, NEAR_MIN: NEAR_MIN, parseCsv: parseCsv, kindOfCsv: kindOfCsv, photosFromRows: photosFromRows, frogsFromRows: frogsFromRows,
    idFromName: idFromName, scoreAll: scoreAll, findings: findings, pairsCsv: pairsCsv };
})();
if (typeof module !== 'undefined') module.exports = RosterCheck;
