(function () {
  var COLS = 4, sel = 0, tiles = [];
  var grid = document.getElementById("grid"), idsBox = document.getElementById("ids");
  var hasTizen = typeof tizen !== "undefined";

  APPS.forEach(function (a) {
    var d = document.createElement("div");
    d.className = "tile"; d.textContent = a.name;
    grid.appendChild(d); tiles.push(d);
  });

  function paint() {
    tiles.forEach(function (t, i) { t.className = "tile" + (i === sel ? " sel" : ""); });
  }

  function launch(a) {
    if (!hasTizen || !a.id) { flash("ID app non impostato (tasto giallo)"); return; }
    tizen.application.launch(a.id, function () {}, function (e) { flash("Errore: " + e.message); });
  }

  function flash(msg) {
    var h = document.getElementById("hint"), old = h.textContent;
    h.textContent = msg; setTimeout(function () { h.textContent = old; }, 3000);
  }

  function listIds() {
    if (!hasTizen) { idsBox.textContent = "Disponibile solo sul TV."; idsBox.hidden = false; return; }
    tizen.application.getAppsInfo(function (list) {
      idsBox.textContent = list.map(function (i) { return i.id + "   " + i.name; }).sort().join("\n")
        + "\n\n(Indietro per chiudere)";
      idsBox.hidden = false;
    }, function (e) { idsBox.textContent = "Errore: " + e.message; idsBox.hidden = false; });
  }

  function clock() {
    var n = new Date(), p = function (x) { return (x < 10 ? "0" : "") + x; };
    document.getElementById("clock").textContent = p(n.getHours()) + ":" + p(n.getMinutes());
  }
  clock(); setInterval(clock, 30000);

  document.addEventListener("keydown", function (e) {
    var k = e.keyCode;
    if (k === 10009) { // Indietro
      if (!idsBox.hidden) { idsBox.hidden = true; return; }
      if (hasTizen) tizen.application.getCurrentApplication().exit();
      return;
    }
    if (!idsBox.hidden) return;
    if (k === 37 && sel > 0) sel--;
    else if (k === 39 && sel < tiles.length - 1) sel++;
    else if (k === 38 && sel - COLS >= 0) sel -= COLS;
    else if (k === 40 && sel + COLS < tiles.length) sel += COLS;
    else if (k === 13) launch(APPS[sel]);
    else if (k === 405) listIds(); // tasto giallo
    paint();
  });

  if (hasTizen && tizen.tvinputdevice) {
    ["ColorF2Yellow"].forEach(function (n) {
      try { tizen.tvinputdevice.registerKey(n); } catch (x) {}
    });
  }
  paint();
})();
