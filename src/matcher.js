/* Photo handling in the browser: resize, find the frog's back, and compare two back patterns by
   counting points that line up. Everything here fails soft: if the back cannot be found the centre
   of the photo is used, and if OpenCV cannot load the app works without a suggestion. */
var Matcher = (function () {
  var CV_URL = 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.12.0-release.1/dist/opencv.js';
  var FULL = 1280, PATTERN = 256, THUMB = 128, WORK = 200;
  var MATCH_SIDE = 384, MATCH_POINTS = 800, RATIO = 0.8;   // back image is enlarged to this size; ORB keeps this many points
  var loading = null, status = 'idle', onStatus = function () {}, loadMs = null;

  function setStatus(s) { status = s; try { onStatus(s); } catch (e) {} }

  /** Loads OpenCV once. Resolves to true when matching can be used. */
  function load() {
    if (loading) return loading;
    setStatus('loading');
    var started = Date.now();
    loading = new Promise(function (ok) {
      var s = document.createElement('script'), timer = setTimeout(function () { ok(false); }, 90000);
      s.src = CV_URL; s.async = true;
      s.onerror = function () { clearTimeout(timer); ok(false); };
      s.onload = function () {
        var c = window.cv;
        // The OpenCV module object has its own .then. Awaiting it, or resolving a promise with it, never finishes
        // and freezes the page, so it is only ever used through the global and .then is removed.
        function done() { clearTimeout(timer); try { delete c.then; } catch (e) {} ok(typeof c.ORB === 'function' && typeof c.BFMatcher === 'function'); }
        if (!c) { clearTimeout(timer); ok(false); } else if (c.Mat) done(); else c.onRuntimeInitialized = done;
      };
      document.head.appendChild(s);
    }).then(function (good) { loadMs = Date.now() - started; setStatus(good ? 'ready' : 'unavailable'); return good; });
    return loading;
  }

  function readFile(file) {
    return new Promise(function (ok, fail) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = fail; r.readAsDataURL(file); });
  }
  function loadImage(src) {
    return new Promise(function (ok, fail) { var im = new Image(); im.onload = function () { ok(im); }; im.onerror = function () { fail(new Error('The photo could not be read.')); }; im.src = src; });
  }
  function canvasOf(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function scaled(img, maxSide) {
    var k = Math.min(1, maxSide / Math.max(img.width, img.height));
    var c = canvasOf(Math.round(img.width * k), Math.round(img.height * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  /* ---- binary image helpers on Uint8Array masks of size w*h ---- */
  function morph(m, w, h, grow) {           // one step with a plus-shaped neighbourhood
    var o = new Uint8Array(m.length), x, y, i, v;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x;
      if (grow) v = m[i] || (x > 0 && m[i - 1]) || (x < w - 1 && m[i + 1]) || (y > 0 && m[i - w]) || (y < h - 1 && m[i + w]);
      else v = m[i] && x > 0 && m[i - 1] && x < w - 1 && m[i + 1] && y > 0 && m[i - w] && y < h - 1 && m[i + w];
      o[i] = v ? 1 : 0;
    }
    return o;
  }
  function repeat(m, w, h, grow, n) { for (var i = 0; i < n; i++) m = morph(m, w, h, grow); return m; }
  function largest(m, w, h) {               // keep the biggest connected blob
    var lab = new Int32Array(m.length), best = 0, bestN = 0, cur = 0, stack = [], i, j, n, x, y;
    for (i = 0; i < m.length; i++) {
      if (!m[i] || lab[i]) continue;
      cur++; n = 0; stack.push(i); lab[i] = cur;
      while (stack.length) {
        j = stack.pop(); n++; x = j % w; y = (j - x) / w;
        if (x > 0 && m[j - 1] && !lab[j - 1]) { lab[j - 1] = cur; stack.push(j - 1); }
        if (x < w - 1 && m[j + 1] && !lab[j + 1]) { lab[j + 1] = cur; stack.push(j + 1); }
        if (y > 0 && m[j - w] && !lab[j - w]) { lab[j - w] = cur; stack.push(j - w); }
        if (y < h - 1 && m[j + w] && !lab[j + w]) { lab[j + w] = cur; stack.push(j + w); }
      }
      if (n > bestN) { bestN = n; best = cur; }
    }
    var o = new Uint8Array(m.length);
    if (best) for (i = 0; i < m.length; i++) o[i] = lab[i] === best ? 1 : 0;
    return { mask: o, area: bestN };
  }
  function fillHoles(m, w, h) {             // background reachable from the border stays background
    var seen = new Uint8Array(m.length), stack = [], i, j, x, y;
    function push(k) { if (!m[k] && !seen[k]) { seen[k] = 1; stack.push(k); } }
    for (x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (stack.length) {
      j = stack.pop(); x = j % w; y = (j - x) / w;
      if (x > 0) push(j - 1); if (x < w - 1) push(j + 1); if (y > 0) push(j - w); if (y < h - 1) push(j + w);
    }
    var o = new Uint8Array(m.length);
    for (i = 0; i < m.length; i++) o[i] = seen[i] ? 0 : 1;
    return o;
  }
  function distance(m, w, h, edge) {              // distance (in pixels) from each pixel to the nearest 0, chamfer 3-4
    var INF = 1e9, d = new Float32Array(m.length), x, y, i;
    for (i = 0; i < m.length; i++) d[i] = m[i] ? INF : 0;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x; if (!d[i]) continue;
      if (edge && (x === 0 || y === 0 || x === w - 1 || y === h - 1)) d[i] = Math.min(d[i], 3);
      if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 3);
      if (y > 0) { d[i] = Math.min(d[i], d[i - w] + 3); if (x > 0) d[i] = Math.min(d[i], d[i - w - 1] + 4); if (x < w - 1) d[i] = Math.min(d[i], d[i - w + 1] + 4); }
    }
    for (y = h - 1; y >= 0; y--) for (x = w - 1; x >= 0; x--) {
      i = y * w + x; if (!d[i]) continue;
      if (x < w - 1) d[i] = Math.min(d[i], d[i + 1] + 3);
      if (y < h - 1) { d[i] = Math.min(d[i], d[i + w] + 3); if (x < w - 1) d[i] = Math.min(d[i], d[i + w + 1] + 4); if (x > 0) d[i] = Math.min(d[i], d[i + w - 1] + 4); }
    }
    for (i = 0; i < d.length; i++) d[i] /= 3;
    return d;
  }

  /* Two ways to mark "frog" pixels on a small copy of the photo.
     colour:  yellow-olive skin (green clearly above blue). Works on grey backgrounds, misses dark frogs.
     salient: pixels that differ from the photo's typical colour or sit in a busy, blotchy area.
              Works when the background is plain (white paper), whatever the frog's colour. */
  function maskColour(px, n) {
    var m = new Uint8Array(n), i, r, g, b, mx, mn;
    for (i = 0; i < n; i++) {
      r = px[i * 4]; g = px[i * 4 + 1]; b = px[i * 4 + 2]; mx = Math.max(r, g, b); mn = Math.min(r, g, b);
      m[i] = (g - b > 15 && r > b && mx > 0 && (mx - mn) / mx > 0.18) ? 1 : 0;
    }
    return m;
  }
  function median(a) { var s = Array.prototype.slice.call(a).sort(function (p, q) { return p - q; }); return s[s.length >> 1]; }
  function scaleTo98(a) {
    var s = Array.prototype.slice.call(a).sort(function (p, q) { return p - q; }), hi = s[Math.floor(s.length * 0.98)] || 1, o = new Float32Array(a.length), i;
    for (i = 0; i < a.length; i++) o[i] = Math.min(1, a[i] / hi);
    return o;
  }
  function maskSalient(px, w, h) {
    var n = w * h, R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n), L = new Float32Array(n), i, x, y;
    for (i = 0; i < n; i++) { R[i] = px[i * 4]; G[i] = px[i * 4 + 1]; B[i] = px[i * 4 + 2]; L[i] = 0.3 * R[i] + 0.59 * G[i] + 0.11 * B[i]; }
    var mr = median(R), mg = median(G), mb = median(B), diff = new Float32Array(n);
    for (i = 0; i < n; i++) diff[i] = Math.sqrt((R[i] - mr) * (R[i] - mr) + (G[i] - mg) * (G[i] - mg) + (B[i] - mb) * (B[i] - mb));
    // local contrast: standard deviation of brightness in an 11x11 window, from summed-area tables
    var W1 = w + 1, I = new Float64Array(W1 * (h + 1)), I2 = new Float64Array(W1 * (h + 1)), s, s2, v, rad = 5, sd = new Float32Array(n);
    for (y = 0; y < h; y++) { s = 0; s2 = 0; for (x = 0; x < w; x++) { v = L[y * w + x]; s += v; s2 += v * v; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + s; I2[(y + 1) * W1 + x + 1] = I2[y * W1 + x + 1] + s2; } }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var x0 = Math.max(0, x - rad), x1 = Math.min(w, x + rad + 1), y0 = Math.max(0, y - rad), y1 = Math.min(h, y + rad + 1), c = (x1 - x0) * (y1 - y0);
      s = I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0];
      s2 = I2[y1 * W1 + x1] - I2[y0 * W1 + x1] - I2[y1 * W1 + x0] + I2[y0 * W1 + x0];
      sd[y * w + x] = Math.sqrt(Math.max(0, s2 / c - (s / c) * (s / c)));
    }
    var nd = scaleTo98(diff), ns = scaleTo98(sd), f = new Float32Array(n), hist = [], t;
    for (t = 0; t < 64; t++) hist.push(0);
    for (i = 0; i < n; i++) { f[i] = 0.5 * nd[i] + 0.5 * ns[i]; hist[Math.min(63, Math.floor(f[i] * 64))]++; }
    var sum = 0, sB = 0, wB = 0, best = 0, thr = 0, wF, d;        // Otsu's threshold on the combined score
    for (t = 0; t < 64; t++) sum += t * hist[t];
    for (t = 0; t < 64; t++) { wB += hist[t]; if (!wB) continue; wF = n - wB; if (!wF) break; sB += t * hist[t]; d = sB / wB - (sum - sB) / wF; v = wB * wF * d * d; if (v > best) { best = v; thr = t; } }
    var m = new Uint8Array(n);
    for (i = 0; i < n; i++) m[i] = f[i] * 64 > thr ? 1 : 0;
    return m;
  }

  /* From a pixel mask: take the biggest blob, then remove everything thinner than the trunk (legs, container edges). */
  function trunk(m, w, h, k) {
    var i;
    m = repeat(repeat(m, w, h, true, 2), w, h, false, 2);       // close small gaps
    m = repeat(repeat(m, w, h, false, 1), w, h, true, 1);       // drop specks
    var body = largest(m, w, h);
    if (body.area < 0.03 * w * h || body.area > 0.75 * w * h) return null;
    var filled = fillHoles(body.mask, w, h), rad = Math.sqrt(body.area) * 0.22;
    var inside = distance(filled, w, h, true), core = new Uint8Array(w * h), inv = new Uint8Array(w * h);
    for (i = 0; i < core.length; i++) core[i] = inside[i] > rad ? 1 : 0;
    core = largest(core, w, h).mask;
    for (i = 0; i < inv.length; i++) inv[i] = core[i] ? 0 : 1;
    var near = distance(inv, w, h, false), x0 = w, y0 = h, x1 = -1, y1 = -1, x, y, n = 0;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      if (!core[y * w + x] && near[y * w + x] > rad) continue;   // opening = core grown back by the same radius
      if (!filled[y * w + x]) continue;
      n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (!n || x1 - x0 < 0.1 * w || y1 - y0 < 0.1 * w) return null;
    return { x: x0 / k, y: y0 / k, w: (x1 - x0 + 1) / k, h: (y1 - y0 + 1) / k, fill: n / ((x1 - x0 + 1) * (y1 - y0 + 1)) };
  }
  // How frog-like a detected box is: a solid blob of plausible size near the middle of the photo.
  function plausible(box, cw, ch) {
    if (!box) return -1;
    var frac = box.w * box.h / (cw * ch), size = frac < 0.06 ? frac / 0.06 : (frac > 0.45 ? 0.45 / frac : 1);
    var dx = (box.x + box.w / 2) / cw - 0.5, dy = (box.y + box.h / 2) / ch - 0.5;
    return box.fill * size * (1 - Math.min(1, Math.sqrt(dx * dx + dy * dy) / 0.5) * 0.5);
  }
  /* Tries both methods and keeps the more plausible box. Returns null when neither is convincing,
     for example when the frog fills the whole photo; the caller then uses the centre. */
  function findBack(canvas, method) {
    var k = WORK / canvas.width, w = WORK, h = Math.max(1, Math.round(canvas.height * k));
    var small = canvasOf(w, h); small.getContext('2d').drawImage(canvas, 0, 0, w, h);
    var px = small.getContext('2d').getImageData(0, 0, w, h).data;
    var a = method === 'salient' ? null : trunk(maskColour(px, w * h), w, h, k);
    var b = method === 'colour' ? null : trunk(maskSalient(px, w, h), w, h, k);
    if (method) return a || b;
    var sa = plausible(a, canvas.width, canvas.height), sb = plausible(b, canvas.width, canvas.height);
    return Math.max(sa, sb) < 0.5 ? null : (sb >= sa ? b : a);
  }

  function squareOf(canvas, box) {             // the square the crop uses, in photo pixels
    var side = Math.min(Math.max(box.w, box.h) * 1.04, canvas.width, canvas.height);
    return { x: Math.min(Math.max(0, box.x + box.w / 2 - side / 2), canvas.width - side),
      y: Math.min(Math.max(0, box.y + box.h / 2 - side / 2), canvas.height - side), side: side };
  }
  function cut(canvas, sq, size) {
    var c = canvasOf(size, size);
    c.getContext('2d').drawImage(canvas, sq.x, sq.y, sq.side, sq.side, 0, 0, size, size);
    return c;
  }
  function cuts(canvas, sq) { return { pattern: jpeg(cut(canvas, sq, PATTERN), 0.8, 40000), thumb: jpeg(cut(canvas, sq, THUMB), 0.7, 20000) }; }
  function jpeg(canvas, q, maxChars) {
    var s = canvas.toDataURL('image/jpeg', q);
    while (maxChars && s.length > maxChars && q > 0.3) { q -= 0.1; s = canvas.toDataURL('image/jpeg', q); }
    return s;
  }

  /** src: a File from the camera, or a data URL. Returns { full, pattern, thumb, crop, sq, width, height, size };
      sq is the suggested crop square, which the person adjusts in the crop screen; size is the photo as taken, "4032x3024". */
  function process(src) {
    return (typeof src === 'string' ? Promise.resolve(src) : readFile(src)).then(loadImage).then(function (img) {
      var full = scaled(img, FULL), box = null;
      try { box = findBack(full); } catch (e) { console.warn('Back detection failed', e); }
      var crop = box ? 'auto' : 'centre';
      if (!box) { var s = Math.min(full.width, full.height) * 0.75; box = { x: (full.width - s) / 2, y: (full.height - s) / 2, w: s, h: s }; }
      var sq = squareOf(full, box), c = cuts(full, sq);
      return { full: jpeg(full, 0.82), pattern: c.pattern, thumb: c.thumb, crop: crop, sq: sq, width: full.width, height: full.height, size: img.width + 'x' + img.height };
    });
  }
  /** Cuts the chosen square out of a photo that process() returned. */
  function cropAt(fullDataUrl, sq) { return loadImage(fullDataUrl).then(function (img) { return cuts(scaled(img, FULL), sq); }); }
  /** The same photo turned a quarter turn clockwise. */
  function rotate(fullDataUrl) {
    return loadImage(fullDataUrl).then(function (img) {
      var c = canvasOf(img.height, img.width), x = c.getContext('2d');
      x.translate(c.width, 0); x.rotate(Math.PI / 2); x.drawImage(img, 0, 0);
      return jpeg(c, 0.85);
    });
  }

  /**
   * Points of interest in a back-pattern image, with a short binary description of the skin around each.
   * Resolves to { n, pts: Float32Array [x0, y0, ...], des: Uint8Array n*32 }, or null when OpenCV is unavailable.
   */
  function describe(patternDataUrl) {
    return load().then(function (ok) {
      if (!ok) return null;
      return loadImage(patternDataUrl).then(function (img) {
        var c = canvasOf(MATCH_SIDE, MATCH_SIDE); c.getContext('2d').drawImage(img, 0, 0, MATCH_SIDE, MATCH_SIDE);
        var src = cv.imread(c), gray = new cv.Mat(), eq = new cv.Mat(), clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
        var orb = new cv.ORB(MATCH_POINTS), kp = new cv.KeyPointVector(), des = new cv.Mat(), none = new cv.Mat(), out;
        try {
          cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY); clahe.apply(gray, eq);   // even out lighting before looking for points
          orb.detectAndCompute(eq, none, kp, des);
          var n = kp.size(), pts = new Float32Array(n * 2), i, p;
          for (i = 0; i < n; i++) { p = kp.get(i).pt; pts[2 * i] = p.x; pts[2 * i + 1] = p.y; }
          out = { n: n, pts: pts, des: n ? new Uint8Array(des.data) : new Uint8Array(0) };   // copied out, so nothing in OpenCV's memory is kept
        } finally { src.delete(); gray.delete(); eq.delete(); clahe.delete(); orb.delete(); kp.delete(); des.delete(); none.delete(); }
        return out;
      });
    }).catch(function (e) { console.warn('Could not describe the pattern', e); return null; });
  }

  /**
   * How many points of pattern a line up with points of pattern b under one consistent placement
   * (shift, turn, modest stretch). Different frogs give a handful at most; the same frog gives tens to hundreds.
   */
  function count(a, b) {
    if (!a || !b || a.n < 4 || b.n < 4 || status !== 'ready') return 0;
    var da = cv.matFromArray(a.n, 32, cv.CV_8U, a.des), db = cv.matFromArray(b.n, 32, cv.CV_8U, b.des);
    var bf = new cv.BFMatcher(cv.NORM_HAMMING, false), mm = new cv.DMatchVectorVector(), best = {}, good = [], i, pr, m, m2, result = 0;
    var from = null, to = null, inl = null, M = null;
    try {
      bf.knnMatch(da, db, mm, 2);
      for (i = 0; i < mm.size(); i++) {
        pr = mm.get(i); if (pr.size() < 2) continue;
        m = pr.get(0); m2 = pr.get(1);
        // keep a pairing only when it is clearly better than the runner-up, and let each point of b be used once
        if (m.distance < RATIO * m2.distance && (!best[m.trainIdx] || m.distance < best[m.trainIdx].d)) best[m.trainIdx] = { q: m.queryIdx, t: m.trainIdx, d: m.distance };
      }
      Object.keys(best).forEach(function (k) { good.push(best[k]); });
      if (good.length < 4) return 0;
      from = new cv.Mat(good.length, 1, cv.CV_32FC2); to = new cv.Mat(good.length, 1, cv.CV_32FC2); inl = new cv.Mat();
      for (i = 0; i < good.length; i++) {
        from.data32F[2 * i] = a.pts[2 * good[i].q]; from.data32F[2 * i + 1] = a.pts[2 * good[i].q + 1];
        to.data32F[2 * i] = b.pts[2 * good[i].t]; to.data32F[2 * i + 1] = b.pts[2 * good[i].t + 1];
      }
      M = cv.estimateAffine2D(from, to, inl, cv.RANSAC, MATCH_SIDE * 0.012, 5000, 0.999, 10);
      if (M && M.rows === 2) {
        var d = M.data64F, sx = Math.hypot(d[0], d[3]), sy = Math.hypot(d[1], d[4]), det = d[0] * d[4] - d[1] * d[3];
        // reject placements no real pair of photos could need: collapsing to a dot, heavy stretch, or a mirror image
        if (sx >= 0.4 && sx <= 2.5 && sy >= 0.4 && sy <= 2.5 && sx / sy >= 0.6 && sx / sy <= 1.67 && det > 0) result = cv.countNonZero(inl);
      }
    } catch (e) { console.warn('Matching failed', e); result = 0; }
    finally { da.delete(); db.delete(); bf.delete(); mm.delete(); if (from) from.delete(); if (to) to.delete(); if (inl) inl.delete(); if (M) M.delete(); }
    return result;
  }

  return { load: load, process: process, scaled: scaled, loadImage: loadImage, readFile: readFile, cropAt: cropAt, rotate: rotate, describe: describe, count: count, findBack: findBack,
    status: function () { return status; }, onStatus: function (f) { onStatus = f; }, loadMs: function () { return loadMs; } };
})();
