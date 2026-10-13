/* In-memory stand-ins for the Apps Script services, so Code.gs can run in Node and in a plain browser page. */
(function (g) {
  function Range(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
  Range.prototype.getValues = function () { var o = []; for (var i = 0; i < this.nr; i++) { var row = []; for (var j = 0; j < this.nc; j++) { var v = (this.sh.data[this.r - 1 + i] || [])[this.c - 1 + j]; row.push(v === undefined ? '' : v); } o.push(row); } return o; };
  Range.prototype.getDisplayValues = function () { return this.getValues().map(function (r) { return r.map(String); }); };
  Range.prototype.setValues = function (vals) {
    if (vals.length !== this.nr || vals.some(function (r) { return r.length !== this.nc; }, this)) throw new Error('setValues size mismatch on ' + this.sh.name + ': range ' + this.nr + 'x' + this.nc + ', data ' + vals.length + 'x' + (vals[0] || []).length);
    for (var i = 0; i < this.nr; i++) { var row = this.sh.data[this.r - 1 + i] = this.sh.data[this.r - 1 + i] || []; for (var j = 0; j < this.nc; j++) { if (String(vals[i][j]).length > 50000) throw new Error('cell over 50000 chars'); row[this.c - 1 + j] = vals[i][j]; } }
    return this;
  };
  Range.prototype.setValue = function (v) { return this.setValues([[v]]); };
  Range.prototype.clearContent = function () { for (var i = 0; i < this.nr; i++) { var row = this.sh.data[this.r - 1 + i]; if (row) for (var j = 0; j < this.nc; j++) row[this.c - 1 + j] = ''; } while (this.sh.data.length && this.sh.data[this.sh.data.length - 1].every(function (x) { return x === '' || x === undefined; })) this.sh.data.pop(); return this; };
  Range.prototype.setNumberFormat = function () { return this; };
  function Sheet(name, data) { this.name = name; this.data = data || []; }
  Sheet.prototype.getLastRow = function () { return this.data.length; };
  Sheet.prototype.getLastColumn = function () { return this.data.reduce(function (m, r) { return Math.max(m, r.length); }, 0); };
  Sheet.prototype.getMaxRows = function () { return 1000; };
  Sheet.prototype.getRange = function (r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); };
  Sheet.prototype.getDataRange = function () { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); };
  Sheet.prototype.appendRow = function (row) { this.data.push(row.slice()); return this; };
  Sheet.prototype.setFrozenRows = function () {};
  var book = { sheets: {}, getSheetByName: function (n) { return this.sheets[n] || null; }, insertSheet: function (n) { return (this.sheets[n] = new Sheet(n)); },
    getSpreadsheetTimeZone: function () { return 'America/Detroit'; }, toast: function () {} };
  var props = {}, files = {}, fakeNow = null;
  g.FAKE = { book: book, files: files, user: 'tester@example.edu', addSheet: function (n, data) { book.sheets[n] = new Sheet(n, data); }, setToday: function (iso) { fakeNow = iso; } };
  g.SpreadsheetApp = { getActiveSpreadsheet: function () { return book; }, getUi: function () { var m = { addItem: function () { return m; }, addToUi: function () {} }; return { createMenu: function () { return m; } }; } };
  g.Session = { getActiveUser: function () { return { getEmail: function () { return g.FAKE.user; } }; } };
  g.LockService = { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } };
  g.PropertiesService = { getScriptProperties: function () { return { getProperty: function (k) { return props[k] || null; }, setProperty: function (k, v) { props[k] = v; } }; } };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  g.Utilities = {
    formatDate: function (d, tz, f) { if (fakeNow && f === 'yyyy-MM-dd') return fakeNow; var day = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); return f === 'yyyy-MM-dd' ? day : (fakeNow || day) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); },
    getUuid: function () { return 'xxxxxxxx-xxxx'.replace(/x/g, function () { return Math.floor(Math.random() * 16).toString(16); }); },
    base64Decode: function (s) { return s; }, base64Encode: function (b) { return b; },
    newBlob: function (bytes, type, name) { return { bytes: bytes, type: type, name: name }; }
  };
  var n = 0;
  function folder(id) { return { getId: function () { return id; }, createFile: function (blob) { var fid = 'file' + (++n); files[fid] = blob; return { getId: function () { return fid; } }; },
    getFoldersByName: function () { return { hasNext: function () { return false; } }; }, createFolder: function () { return folder('sub'); }, getFiles: function () { return { hasNext: function () { return false; } }; } }; }
  g.DriveApp = { createFolder: function () { return folder('folder1'); }, getFolderById: function (id) { return folder(id); },
    getFileById: function (id) { var b = files[id]; if (!b) throw new Error('no file'); return { getBlob: function () { return { getContentType: function () { return b.type; }, getBytes: function () { return b.bytes; } }; } }; } };
  g.HtmlService = {};
})(typeof window !== 'undefined' ? window : globalThis);
