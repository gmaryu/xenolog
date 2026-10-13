/* Photo handling in the browser: resize, find the frog's back, and describe the pattern as a
   vector so two photos can be compared. Everything here fails soft: if the back cannot be found
   the centre of the photo is used, and if the model cannot load the app works without ranking. */
var Matcher = (function () {
  var MODEL = 'Xenova/dinov2-small';
  var LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';
  var FULL = 1280, PATTERN = 256, THUMB = 128, WORK = 200;
  var extractor = null, loading = null, status = 'idle', onStatus = function () {};

  function setStatus(s) { status = s; try { onStatus(s); } catch (e) {} }

  function load() {
    if (loading) return loading;
    setStatus('loading');
    loading = import(LIB).then(function (lib) {
      return lib.pipeline('image-feature-extraction', MODEL, { dtype: 'q8' });
    }).then(function (p) { extractor = p; setStatus('ready'); return true; })
      .catch(function (e) { console.warn('Auto-match model did not load', e); setStatus('unavailable'); return false; });
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

  /** src: a File from the camera, or a data URL. Returns { full, pattern, thumb, crop, sq, width, height };
      sq is the suggested crop square, which the person adjusts in the crop screen. */
  function process(src) {
    return (typeof src === 'string' ? Promise.resolve(src) : readFile(src)).then(loadImage).then(function (img) {
      var full = scaled(img, FULL), box = null;
      try { box = findBack(full); } catch (e) { console.warn('Back detection failed', e); }
      var crop = box ? 'auto' : 'centre';
      if (!box) { var s = Math.min(full.width, full.height) * 0.75; box = { x: (full.width - s) / 2, y: (full.height - s) / 2, w: s, h: s }; }
      var sq = squareOf(full, box), c = cuts(full, sq);
      return { full: jpeg(full, 0.82), pattern: c.pattern, thumb: c.thumb, crop: crop, sq: sq, width: full.width, height: full.height };
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

  function toBase64(f32) { var b = new Uint8Array(f32.buffer), s = '', i; for (i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function fromBase64(s) { if (!s) return null; try { var bin = atob(s), b = new Uint8Array(bin.length), i; for (i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return new Float32Array(b.buffer); } catch (e) { return null; } }
  function unit(v) { var n = 0, i; for (i = 0; i < v.length; i++) n += v[i] * v[i]; n = Math.sqrt(n) || 1; for (i = 0; i < v.length; i++) v[i] /= n; return v; }

  /** Describes a back-pattern image as a base64 vector, or resolves to '' when the model is unavailable. */
  function embed(patternDataUrl) {
    return load().then(function (ok) {
      if (!ok) return '';
      return extractor(patternDataUrl).then(function (t) {
        var dims = t.dims, data = t.data, out;
        if (dims.length === 3) {                      // [1, tokens, width]: class token plus the mean of the patch tokens
          var tokens = dims[1], width = dims[2], j, k;
          out = new Float32Array(width * 2);
          for (k = 0; k < width; k++) out[k] = data[k];
          for (j = 1; j < tokens; j++) for (k = 0; k < width; k++) out[width + k] += data[j * width + k] / (tokens - 1);
          unit(out.subarray(0, width)); unit(out.subarray(width));
        } else { out = new Float32Array(data); }
        return toBase64(unit(out));
      });
    }).catch(function (e) { console.warn('Embedding failed', e); return ''; });
  }

  function similarity(a, b) {
    var x = typeof a === 'string' ? fromBase64(a) : a, y = typeof b === 'string' ? fromBase64(b) : b, s = 0, i;
    if (!x || !y || x.length !== y.length) return null;
    for (i = 0; i < x.length; i++) s += x[i] * y[i];
    return s;
  }

  return { load: load, process: process, scaled: scaled, loadImage: loadImage, readFile: readFile, cropAt: cropAt, rotate: rotate, embed: embed, similarity: similarity, findBack: findBack,
    status: function () { return status; }, onStatus: function (f) { onStatus = f; } };
})();
