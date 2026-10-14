"""Assembles ../Index.html (for Apps Script) and dev.html (local test page with in-memory services, the example Roster.gs and Settings.gs)."""
import pathlib
d = pathlib.Path(__file__).parent
gs = d.parent / 'apps-script' if (d.parent / 'apps-script').is_dir() else d.parent   # where Code.gs, Roster.gs and Index.html live
r = lambda n: (d / n).read_text()
page = lambda extra: f"""<!DOCTYPE html>
<html lang="en">
<head>
<base target="_top">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>XenoLog</title>
<style>
{r('style.css')}</style>
</head>
<body>
{r('body.html')}{extra}<script>
{r('matcher.js')}</script>
<script>
{r('app.js')}</script>
</body>
</html>
"""
(gs / 'Index.html').write_text(page(''))
shim = """<script>
""" + r('fakes.js') + """</script>
<script>
""" + (gs / 'Roster.gs').read_text() + (gs / 'Settings.gs').read_text() + (gs / 'Code.gs').read_text() + """</script>
<script>
FAKE.addSheet('Form Responses 1', [['Timestamp','Animal ID','Name','Collection Date','MMR H2O source','Quantity (Squeezed Eggs)','Appearance (Squeezed Eggs)','After Ca activation (Squeezed Eggs)','Quantity (Laid Eggs)','Appearance (Laid Eggs)','After Ca activation (Laid Eggs)','Comments','Priming Date'],
  ['t','2','AB','10/9/2026','MilliQ','Many','Great','','Normal','Good','','','10/2/2026'],
  ['t','5','CD','9/20/2026','RO','Few','Bad','','None','None','','first note','9/15/2026'],
  ['t','10','AB','3/30/2026','Milli-Q','Normal','Good','Looking good','Few','Good','','note','3/24/2026']]);
setup(); importLegacy();
// google.script.run stand-in: calls the server functions directly, with JSON copies like the real bridge.
(function () {
  function make(ok, fail) {
    return new Proxy({}, { get: function (_, name) {
      if (name === 'withSuccessHandler') return function (f) { return make(f, fail); };
      if (name === 'withFailureHandler') return function (f) { return make(ok, f); };
      return function () {
        var args = JSON.parse(JSON.stringify(Array.prototype.slice.call(arguments)));
        setTimeout(function () {
          var res;
          try { res = window[name].apply(null, args); } catch (e) { if (fail) fail(e); return; }
          if (ok) ok(res === undefined ? null : JSON.parse(JSON.stringify(res)));
        }, 60);
      };
    } });
  }
  window.google = { script: { run: make() } };
})();
</script>
"""
(d / 'dev.html').write_text(page(shim))
print('built', (gs / 'Index.html').stat().st_size, (d / 'dev.html').stat().st_size)
