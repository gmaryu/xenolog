/* Check page: reads the person's photo exports or files, runs RosterCheck and shows what it found. Nothing is sent anywhere. */
(function () {
  var C = { photos: [], frogs: null, sources: [], skipped: [] };
  var $ = function (id) { return document.getElementById(id); };
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
    $('result').innerHTML = RosterView.html(photos, pairs, F, secs, { grid: true, download: true });
    RosterView.drawGrid(pairs);
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
