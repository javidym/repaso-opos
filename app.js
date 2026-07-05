/* ==========================================================================
   Repaso OPOS · app de tarjetas
   Modo repaso (flashcard) + Modo juego (puntos, tiempo, comodines, rachas).
   Comodines: 50:50, Público, Teléfono, ×2, Escudo, +tiempo.
   Monedas persistentes + tienda. Progreso y descartes en localStorage.
   ========================================================================== */
(function () {
  'use strict';

  var TEMAS = window.TEMAS || [];
  var PREGUNTAS = window.PREGUNTAS || [];
  var LETRAS = ['A', 'B', 'C', 'D', 'E'];
  var QTIME = 40;

  var st = {
    seleccion: new Set(),
    size: 30, modoTest: true, barajar: true, smart: true, juego: true, sonido: true,
    mazo: [], i: 0, volteada: false,
    respondidas: {}, sabidas: {}, committed: {}, cardUsed: {},
    score: 0, streak: 0, best: 0, shieldUsed: 0,
    pendingX2: false, shield: false, answered: false, timer: null, timeLeft: QTIME, lastMile: 0
  };

  var stats = {};                 // progreso por pregunta
  var discarded = new Set();      // ids descartados
  var inv = {};                   // inventario de comodines (persistente)
  var coins = 0;                  // monedas (persistente)

  var LIFEDEF = [
    { key: 'c5050', ic: '50:50', cls: '', label: 'Quita 2' },
    { key: 'cpub', ic: '📊', cls: '', label: 'Público' },
    { key: 'ctel', ic: '📞', cls: '', label: 'Teléfono' },
    { key: 'cx2', ic: '×2', cls: 'x2', label: 'Dobla' },
    { key: 'csh', ic: '🛡️', cls: 'sh', label: 'Escudo' },
    { key: 'ctime', ic: '⏱', cls: 't', label: '+15 s' }
  ];
  var SHOP = [
    { key: 'c5050', ic: '50:50', name: 'Comodín 50:50', desc: 'Elimina 2 opciones incorrectas', price: 300 },
    { key: 'cpub', ic: '📊', name: 'Comodín del público', desc: 'Muestra un % por opción (¡no siempre acierta!)', price: 500 },
    { key: 'ctel', ic: '📞', name: 'Llamada a un amigo', desc: 'Puede saberla… o no llegar a tiempo', price: 700 },
    { key: 'cx2', ic: '×2', name: 'Doblar puntos', desc: 'Duplica los puntos de esa pregunta', price: 900 },
    { key: 'csh', ic: '🛡️', name: 'Escudo', desc: 'Anula el próximo fallo (racha a salvo)', price: 1200 },
    { key: 'ctime', ic: '⏱', name: '+15 segundos', desc: 'Amplía el tiempo de la pregunta', price: 250 }
  ];

  function $(id) { return document.getElementById(id); }
  function show(id) { $(id).classList.remove('hidden'); }
  function hide(id) { $(id).classList.add('hidden'); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function countTema(n) { var c = 0; for (var k = 0; k < PREGUNTAS.length; k++) if (PREGUNTAS[k].tema === n) c++; return c; }

  /* ---------------- SONIDO ---------------- */
  var actx = null;
  function audio() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (actx && actx.state === 'suspended') actx.resume(); return actx; }
  function tone(f, t0, dur, type, vol) {
    var a = actx; if (!a) return;
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, a.currentTime + t0);
    g.gain.linearRampToValueAtTime(vol || 0.09, a.currentTime + t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t0 + dur);
    o.connect(g); g.connect(a.destination); o.start(a.currentTime + t0); o.stop(a.currentTime + t0 + dur + 0.02);
  }
  function sfx(kind) {
    if (!st.sonido) return; if (!audio()) return;
    if (kind === 'ok') { tone(660, 0, 0.12, 'sine', 0.09); tone(990, 0.09, 0.16, 'sine', 0.08); }
    else if (kind === 'bad') { tone(300, 0, 0.16, 'square', 0.05); tone(200, 0.12, 0.22, 'square', 0.05); }
    else if (kind === 'bonus') { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, i * 0.07, 0.14, 'triangle', 0.07); }); }
    else if (kind === 'life') { tone(880, 0, 0.08, 'triangle', 0.07); tone(1175, 0.07, 0.1, 'triangle', 0.06); }
    else if (kind === 'tick') { tone(1200, 0, 0.04, 'sine', 0.04); }
  }

  /* ---------------- VOZ ---------------- */
  var speaking = false;
  function speak() {
    if (!('speechSynthesis' in window)) { alert('Este dispositivo no permite la lectura por voz.'); return; }
    if (speaking) { window.speechSynthesis.cancel(); speaking = false; $('ttsBtn').classList.remove('on'); return; }
    var q = st.mazo[st.i]; if (!q) return;
    var text = st.volteada ? ('Respuesta. ' + q.a) : q.q;
    if (!st.volteada && !$('optsWrap').classList.contains('hidden') && q.opciones) text += '. Opciones: ' + q.opciones.map(function (o, i) { return LETRAS[i] + '. ' + o; }).join('. ');
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text); u.lang = 'es-ES'; u.rate = 1;
    u.onend = function () { speaking = false; $('ttsBtn').classList.remove('on'); };
    speaking = true; $('ttsBtn').classList.add('on'); window.speechSynthesis.speak(u);
  }
  function stopSpeak() { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); speaking = false; var b = $('ttsBtn'); if (b) b.classList.remove('on'); }

  /* ---------------- PERSISTENCIA ---------------- */
  var LS = 'repasoOpos.cfg', LS_STATS = 'repasoOpos.stats', LS_DISC = 'repasoOpos.discarded', LS_INV = 'repasoOpos.inv', LS_COINS = 'repasoOpos.coins';
  function saveCfg() { try { localStorage.setItem(LS, JSON.stringify({ sel: Array.from(st.seleccion), size: st.size, test: st.modoTest, shuffle: st.barajar, smart: st.smart, juego: st.juego, sonido: st.sonido })); } catch (e) {} }
  function loadCfg() {
    try {
      var c = JSON.parse(localStorage.getItem(LS) || '{}');
      if (c.sel) c.sel.forEach(function (n) { if (countTema(n)) st.seleccion.add(n); });
      if (typeof c.size === 'number') st.size = c.size;
      ['test:modoTest', 'shuffle:barajar', 'smart:smart', 'juego:juego', 'sonido:sonido'].forEach(function (p) { var k = p.split(':'); if (typeof c[k[0]] === 'boolean') st[k[1]] = c[k[0]]; });
    } catch (e) {}
  }
  function loadStats() { try { stats = JSON.parse(localStorage.getItem(LS_STATS) || '{}') || {}; } catch (e) { stats = {}; } }
  function saveStats() { try { localStorage.setItem(LS_STATS, JSON.stringify(stats)); } catch (e) {} }
  function loadDisc() { try { (JSON.parse(localStorage.getItem(LS_DISC) || '[]') || []).forEach(function (id) { discarded.add(id); }); } catch (e) {} }
  function saveDisc() { try { localStorage.setItem(LS_DISC, JSON.stringify(Array.from(discarded))); } catch (e) {} }
  function loadInv() {
    var d = { c5050: 3, cpub: 2, ctel: 1, cx2: 1, csh: 1, ctime: 2 };
    try { var s = localStorage.getItem(LS_INV); if (s) { var o = JSON.parse(s) || {}; LIFEDEF.forEach(function (l) { inv[l.key] = typeof o[l.key] === 'number' ? o[l.key] : 0; }); } else { inv = d; saveInv(); } } catch (e) { inv = d; }
  }
  function saveInv() { try { localStorage.setItem(LS_INV, JSON.stringify(inv)); } catch (e) {} }
  function loadCoins() { try { coins = parseInt(localStorage.getItem(LS_COINS) || '0', 10) || 0; } catch (e) { coins = 0; } }
  function saveCoins() { try { localStorage.setItem(LS_COINS, String(coins)); } catch (e) {} }
  function getStat(id) { return stats[id] || { ok: 0, fail: 0, seen: 0, t: 0, lo: undefined }; }
  function estadoDe(id) { var s = stats[id]; if (!s || s.lo === undefined) return 'nue'; return s.lo ? 'dom' : 'fal'; }

  function updateCoinsUI() { ['coins', 'coinsRes', 'coinsShop'].forEach(function (id) { var e = $(id); if (e) e.textContent = coins; }); }

  /* ---------------- PROGRESO ---------------- */
  function commitCard(id) {
    if (!id || st.committed[id]) return;
    st.committed[id] = true;
    var q = null; for (var k = 0; k < st.mazo.length; k++) if (st.mazo[k].id === id) { q = st.mazo[k]; break; }
    var s = stats[id] || { ok: 0, fail: 0, seen: 0, t: 0, lo: undefined };
    s.seen = (s.seen || 0) + 1; s.t = Date.now();
    var outcome = null;
    if (st.sabidas.hasOwnProperty(id)) outcome = st.sabidas[id];
    else if (q && st.respondidas.hasOwnProperty(id)) outcome = (st.respondidas[id] === q.correcta);
    if (outcome === true) { s.ok = (s.ok || 0) + 1; s.lo = true; }
    else if (outcome === false) { s.fail = (s.fail || 0) + 1; s.lo = false; }
    stats[id] = s; saveStats();
  }
  function statsPorTema() {
    var m = {};
    for (var k = 0; k < PREGUNTAS.length; k++) { var q = PREGUNTAS[k]; if (discarded.has(q.id)) continue; if (!m[q.tema]) m[q.tema] = { total: 0, dom: 0, fal: 0, nue: 0 }; m[q.tema].total++; m[q.tema][estadoDe(q.id)]++; }
    return m;
  }

  /* ---------------- HOME ---------------- */
  function etiquetaTema(n) { return n === 0 ? '⚡ REPASO' : 'TEMA ' + n; }
  function renderTemas() {
    var wrap = $('temaList'); wrap.innerHTML = '';
    var porTema = statsPorTema(), orden = [], grupos = {};
    TEMAS.forEach(function (t) { var b = t.bloque || 'General'; if (!grupos[b]) { grupos[b] = []; orden.push(b); } grupos[b].push(t); });
    orden.forEach(function (b) {
      var h = document.createElement('div'); h.className = 'blk-h'; h.innerHTML = '<span>' + b + '</span><span class="ln"></span>'; wrap.appendChild(h);
      var grid = document.createElement('div'); grid.className = 'grid';
      grupos[b].forEach(function (t) {
        var bank = countTema(t.n), s = porTema[t.n] || { total: bank, dom: 0, fal: 0, nue: bank };
        var pct = s.total ? Math.round(s.dom / s.total * 100) : 0;
        var card = document.createElement('button');
        card.className = 'tcard' + (st.seleccion.has(t.n) ? ' sel' : ''); card.type = 'button'; card.dataset.tema = t.n;
        card.innerHTML = '<span class="chk">✓</span><span class="num">' + etiquetaTema(t.n) + '</span><span class="tt">' + t.corto + '</span><span class="cnt">' + s.total + ' preguntas</span><span class="prog"><span class="d">🟢<b> ' + s.dom + '</b></span><span class="f">🔴<b> ' + s.fal + '</b></span><span class="n">⚪<b> ' + s.nue + '</b></span></span><span class="pbar"><i style="width:' + pct + '%"></i></span>';
        if (!bank) { card.style.opacity = '.45'; card.disabled = true; }
        card.addEventListener('click', function () { if (st.seleccion.has(t.n)) st.seleccion.delete(t.n); else st.seleccion.add(t.n); card.classList.toggle('sel'); updateSelInfo(); saveCfg(); });
        grid.appendChild(card);
      });
      wrap.appendChild(grid);
    });
    updateSelInfo(); updateCoinsUI();
  }
  function poolSeleccion() { var p = []; for (var k = 0; k < PREGUNTAS.length; k++) { var q = PREGUNTAS[k]; if (st.seleccion.has(q.tema) && !discarded.has(q.id)) p.push(q); } return p; }
  function poolFalladas() { return poolSeleccion().filter(function (q) { return estadoDe(q.id) === 'fal'; }); }
  function updateSelInfo() {
    var pool = poolSeleccion(), info = $('selInfo');
    if (discarded.size) { $('discCount').textContent = discarded.size; show('restoreDisc'); } else hide('restoreDisc');
    if (!st.seleccion.size) { $('startBtn').disabled = true; info.textContent = 'Selecciona al menos un tema'; hide('failBtn'); hide('progSum'); hide('resetProg'); return; }
    $('startBtn').disabled = false;
    var n = st.seleccion.size, toma = st.size === 0 ? pool.length : Math.min(st.size, pool.length);
    info.textContent = n + (n === 1 ? ' tema' : ' temas') + ' · ' + pool.length + ' preguntas · esta sesión: ' + toma;
    var dom = 0, fal = 0, nue = 0; pool.forEach(function (q) { var e = estadoDe(q.id); if (e === 'dom') dom++; else if (e === 'fal') fal++; else nue++; });
    $('progSum').innerHTML = '<span class="d">🟢 <b>' + dom + '</b> dominadas</span><span class="f">🔴 <b>' + fal + '</b> falladas</span><span>⚪ <b>' + nue + '</b> sin ver</span>'; show('progSum');
    if (fal > 0) { $('failBtn').textContent = '🔴 Repasar solo mis falladas (' + fal + ')'; $('failBtn').disabled = false; show('failBtn'); } else hide('failBtn');
    if (dom + fal > 0 || Object.keys(stats).length) show('resetProg'); else hide('resetProg');
  }

  function bindHome() {
    Array.prototype.forEach.call($('sizeSeg').children, function (b) {
      if (parseInt(b.dataset.n, 10) === st.size) { Array.prototype.forEach.call($('sizeSeg').children, function (x) { x.classList.remove('on'); }); b.classList.add('on'); }
      b.addEventListener('click', function () { Array.prototype.forEach.call($('sizeSeg').children, function (x) { x.classList.remove('on'); }); b.classList.add('on'); st.size = parseInt(b.dataset.n, 10); updateSelInfo(); saveCfg(); });
    });
    var tg = { tgTest: 'modoTest', tgShuffle: 'barajar', tgSmart: 'smart', tgJuego: 'juego', tgSonido: 'sonido' };
    Object.keys(tg).forEach(function (id) { $(id).checked = st[tg[id]]; $(id).addEventListener('change', function () { st[tg[id]] = this.checked; saveCfg(); }); });
    $('selAll').addEventListener('click', function () {
      var disp = TEMAS.filter(function (t) { return countTema(t.n); }).map(function (t) { return t.n; });
      var todos = disp.every(function (n) { return st.seleccion.has(n); });
      st.seleccion = new Set(todos ? [] : disp); this.textContent = todos ? 'Seleccionar todos' : 'Quitar todos'; renderTemas(); saveCfg();
    });
    $('startBtn').addEventListener('click', function () { startSession(poolSeleccion(), false); });
    $('failBtn').addEventListener('click', function () { var f = poolFalladas(); if (!f.length) { alert('No tienes falladas en los temas elegidos. ¡Bien!'); return; } startSession(f, false); });
    $('resetProg').addEventListener('click', function () { if (confirm('¿Reiniciar TODO tu progreso (aciertos y fallos)? No se puede deshacer.')) { stats = {}; saveStats(); renderTemas(); } });
    $('restoreDisc').addEventListener('click', function () { if (confirm('¿Restaurar las ' + discarded.size + ' preguntas descartadas?')) { discarded = new Set(); saveDisc(); renderTemas(); } });
    $('shopBtn').addEventListener('click', openShop);
    $('shopBtn2').addEventListener('click', openShop);
    $('shopClose').addEventListener('click', function () { hide('shop'); });
    $('shop').addEventListener('click', function (e) { if (e.target === this) hide('shop'); });
  }

  /* ---------------- TIENDA ---------------- */
  function openShop() { buildShop(); updateCoinsUI(); show('shop'); }
  function buildShop() {
    var wrap = $('shopList'); wrap.innerHTML = '';
    SHOP.forEach(function (it) {
      var row = document.createElement('div'); row.className = 'shopitem';
      row.innerHTML = '<div class="sic">' + it.ic + '</div><div class="sinfo"><div class="sn">' + it.name + '</div><div class="sd">' + it.desc + '</div><div class="sown">Tienes: ' + (inv[it.key] || 0) + '</div></div>';
      var btn = document.createElement('button'); btn.className = 'buybtn'; btn.textContent = '🪙 ' + it.price;
      btn.disabled = coins < it.price;
      btn.addEventListener('click', function () { buyItem(it); });
      row.appendChild(btn); wrap.appendChild(row);
    });
  }
  function buyItem(it) {
    if (coins < it.price) return;
    coins -= it.price; inv[it.key] = (inv[it.key] || 0) + 1; saveCoins(); saveInv();
    sfx('bonus'); buildShop(); updateCoinsUI();
    if (!$('study').classList.contains('hidden') && st.juego) renderLifes();
  }

  /* ---------------- SESIÓN ---------------- */
  function ordenarMazo(pool) {
    if (st.smart) { var prio = { fal: 0, nue: 1, dom: 2 }; return pool.slice().sort(function (a, b) { var pa = prio[estadoDe(a.id)], pb = prio[estadoDe(b.id)]; if (pa !== pb) return pa - pb; var ta = getStat(a.id).t || 0, tb = getStat(b.id).t || 0; if (ta !== tb) return ta - tb; return Math.random() - 0.5; }); }
    return st.barajar ? shuffle(pool) : pool.slice();
  }
  function startSession(pool, keepScore) {
    if (!pool || !pool.length) return;
    var mazo = ordenarMazo(pool); if (st.size > 0) mazo = mazo.slice(0, st.size);
    st.mazo = mazo; st.i = 0; st.respondidas = {}; st.sabidas = {}; st.committed = {};
    if (!keepScore) { st.score = 0; st.best = 0; st.shieldUsed = 0; }   // el repaso de falladas continúa la puntuación
    st.streak = 0; st.pendingX2 = false; st.shield = false; st.lastMile = 0;
    hide('home'); hide('results'); hide('shop'); show('study');
    $('pgTot').textContent = mazo.length;
    if (st.juego) show('hud'); else hide('hud');
    window.scrollTo(0, 0); renderCard();
  }
  function temaTitulo(n) { for (var i = 0; i < TEMAS.length; i++) if (TEMAS[i].n === n) return TEMAS[i].corto; return 'Tema ' + n; }

  function renderCard() {
    stopTimer(); stopSpeak();
    var q = st.mazo[st.i];
    st.volteada = false; st.answered = false; st.cardUsed = {};
    $('card3d').classList.remove('flip');
    $('pgCur').textContent = st.i + 1; $('pgLabel').textContent = 'Tarjeta ' + (st.i + 1);
    $('pgBar').style.width = ((st.i) / st.mazo.length * 100) + '%';
    var badge = { dom: '🟢', fal: '🔴', nue: '⚪' }[estadoDe(q.id)] || '';
    $('temaChip').textContent = badge + ' ' + etiquetaTema(q.tema) + ' · ' + temaTitulo(q.tema);
    $('qText').textContent = q.q; renderBack(q, st.respondidas.hasOwnProperty(q.id) ? st.respondidas[q.id] : null); $('qIdx').textContent = '#' + (st.i + 1);
    $('tapHint').textContent = 'Toca la tarjeta para ver la respuesta'; $('tapHint').className = 'tap-hint pulse';
    $('pointsPop').className = 'pointspop'; $('pointsPop').textContent = '';
    hide('infoMsg'); $('infoMsg').textContent = '';
    hide('knewWrap'); hide('optsWrap'); $('optsWrap').innerHTML = '';
    if (st.juego) {
      hide('showTest'); hide('navFlash'); hide('nextBtn'); $('nextBtn').textContent = 'Siguiente ▶';
      buildOptions(q); renderLifes(); updateScoreUI(); startTimer();
    } else {
      hide('hud'); hide('nextBtn'); show('navFlash');
      $('showTest').classList.remove('hidden');
      $('showTest').textContent = st.respondidas.hasOwnProperty(q.id) ? '📝 Opciones' : '📝 Ver opciones (test)';
      $('showTest').style.display = (st.modoTest && q.opciones && q.opciones.length) ? '' : 'none';
      if (st.modoTest && st.respondidas.hasOwnProperty(q.id)) { buildOptions(q); revealOptions(q, st.respondidas[q.id]); }
      $('knowBtn').classList.toggle('on', st.sabidas[q.id] === true);
      $('dunnoBtn').classList.toggle('on', st.sabidas[q.id] === false);
      $('prevBtn').disabled = st.i === 0;
    }
  }
  function formatAnswer(a) { return a.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function renderBack(q, chosen) {
    var opc = q.opciones && q.opciones.length, html = '';
    if (opc) html += '<div class="ansok"><span class="tag ok">✅ Correcta</span> <b>' + LETRAS[q.correcta] + '.</b> ' + esc(q.opciones[q.correcta]) + '</div>';
    html += '<div class="ansexp">' + formatAnswer(q.a) + '</div>';
    if (opc && chosen != null && chosen !== q.correcta) html += '<div class="anschosen"><span class="tag bad">✗ Marcaste</span> <b>' + LETRAS[chosen] + '.</b> ' + esc(q.opciones[chosen]) + ' — no es la válida; la buena es la ' + LETRAS[q.correcta] + ' (arriba).</div>';
    $('aText').innerHTML = html;
  }
  function hintExpl() { var h = $('tapHint'); h.textContent = '👆 Toca la tarjeta para ver la explicación'; h.classList.add('pulse'); }
  function flip() {
    st.volteada = !st.volteada; $('card3d').classList.toggle('flip', st.volteada);
    var h = $('tapHint');
    if (st.volteada) { h.textContent = 'Toca para volver a la pregunta'; h.classList.remove('pulse'); }
    else { h.textContent = 'Toca la tarjeta para ver la respuesta'; h.classList.add('pulse'); }
  }

  /* ---------------- OPCIONES ---------------- */
  function buildOptions(q) {
    var wrap = $('optsWrap'); wrap.innerHTML = '';
    q.opciones.forEach(function (txt, idx) {
      var b = document.createElement('button'); b.className = 'opt'; b.type = 'button'; b.dataset.idx = idx;
      b.innerHTML = '<span class="k">' + LETRAS[idx] + '</span><span>' + txt + '</span>';
      b.addEventListener('click', function () { onAnswer(q, idx, b); });
      wrap.appendChild(b);
    });
    show('optsWrap');
  }
  function onAnswer(q, idx, btn) {
    if (st.juego && st.answered) return;
    if (!st.juego && st.respondidas.hasOwnProperty(q.id)) return;
    st.respondidas[q.id] = idx;
    if (st.juego) {
      st.answered = true; stopTimer(); if (btn) btn.classList.add('picked');
      revealOptions(q, idx); renderBack(q, idx); disableLifes();
      if (idx === q.correcta) onCorrect(q); else onWrong(q, false);
      hintExpl();
    } else { revealOptions(q, idx); renderBack(q, idx); }
  }
  function revealOptions(q, chosen) {
    var btns = $('optsWrap').children;
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i], idx = parseInt(b.dataset.idx, 10); b.classList.add('lock');
      if (idx === q.correcta) b.classList.add('correct');
      else if (idx === chosen) b.classList.add('wrong');
      else if (!b.classList.contains('gone')) b.classList.add('dim');
    }
    if (!st.juego) { var h = $('tapHint'); h.textContent = (chosen === q.correcta) ? '✅ ¡Correcto! Toca la tarjeta para ampliar.' : '❌ Correcta: ' + LETRAS[q.correcta] + '. Toca la tarjeta para ver la explicación.'; h.classList.remove('pulse'); }
  }
  function toggleTest() {
    var q = st.mazo[st.i]; if (!q.opciones || !q.opciones.length) return; var wrap = $('optsWrap');
    if (wrap.classList.contains('hidden')) { buildOptions(q); if (st.respondidas.hasOwnProperty(q.id)) revealOptions(q, st.respondidas[q.id]); $('showTest').textContent = '📝 Ocultar opciones'; }
    else { hide('optsWrap'); $('showTest').textContent = '📝 Ver opciones (test)'; }
  }

  /* ---------------- JUEGO ---------------- */
  function startTimer() {
    st.timeLeft = QTIME; updateTimeUI();
    st.timer = setInterval(function () {
      st.timeLeft -= 0.2;
      if (st.timeLeft <= 5.2 && (st.timeLeft % 1) < 0.2 && st.timeLeft > 0) sfx('tick');
      if (st.timeLeft <= 0) { st.timeLeft = 0; updateTimeUI(); stopTimer(); onTimeout(); return; }
      updateTimeUI();
    }, 200);
  }
  function stopTimer() { if (st.timer) { clearInterval(st.timer); st.timer = null; } }
  function updateTimeUI() {
    var pct = Math.max(0, st.timeLeft / QTIME * 100), bar = $('timeBar'), lab = $('hTime');
    bar.style.width = pct + '%'; lab.textContent = '⏱ ' + Math.ceil(st.timeLeft);
    var cls = st.timeLeft <= 5 ? 'crit' : (st.timeLeft <= 10 ? 'warn' : ''); lab.className = 'htime ' + cls; bar.className = cls;
  }
  function updateScoreUI() { $('hScore').textContent = st.score; $('hStreak').textContent = '🔥 ' + st.streak; }
  function pop(txt, cls) { var p = $('pointsPop'); p.textContent = txt; p.className = 'pointspop show' + (cls ? ' ' + cls : ''); }

  function onCorrect(q) {
    sfx('ok');
    var base = 100, timeBonus = Math.round(st.timeLeft * 4), streakBonus = st.streak * 10, doubled = st.pendingX2;
    var pts = base + timeBonus + streakBonus; if (doubled) { pts *= 2; st.pendingX2 = false; sfx('bonus'); }
    st.score += pts; coins += pts; saveCoins();
    st.streak++; if (st.streak > st.best) st.best = st.streak;
    pop('+' + pts + (streakBonus ? ' 🔥' : ''), doubled ? 'bonus' : '');
    updateScoreUI(); updateCoinsUI(); renderLifes();
    if (st.streak > 0 && st.streak % 5 === 0 && st.streak !== st.lastMile) { st.lastMile = st.streak; grantBonus(); }
    show('knewWrap');
  }
  function onWrong(q, timeout) {
    st.sabidas[q.id] = false;
    if (st.shield) { st.shield = false; st.shieldUsed++; pop('🛡️ Protegido (racha a salvo)', 'bonus'); sfx('life'); }
    else { st.streak = 0; sfx('bad'); pop(timeout ? '⏱ ¡Tiempo!' : '✗ Fallo', 'bad'); }
    updateScoreUI(); renderLifes(); $('nextBtn').textContent = 'Siguiente ▶'; show('nextBtn');
  }
  function onTimeout() {
    if (st.answered) return; st.answered = true; var q = st.mazo[st.i];
    var btns = $('optsWrap').children;
    for (var i = 0; i < btns.length; i++) { var b = btns[i]; b.classList.add('lock'); if (parseInt(b.dataset.idx, 10) === q.correcta) b.classList.add('correct'); else b.classList.add('dim'); }
    renderBack(q, null); disableLifes(); onWrong(q, true); hintExpl();
  }
  function grantBonus() {
    var keys = ['c5050', 'cpub', 'ctel', 'cx2', 'csh', 'ctime'];
    var k = keys[(((st.best / 5 | 0) - 1) % keys.length + keys.length) % keys.length];
    inv[k] = (inv[k] || 0) + 1; saveInv();
    var names = { c5050: '50:50', cpub: 'Público', ctel: 'Teléfono', cx2: '×2 puntos', csh: 'Escudo', ctime: '+15 s' };
    pop('🎁 ¡Racha de ' + st.streak + '! +1 ' + names[k], 'bonus'); sfx('bonus'); renderLifes();
  }

  function renderLifes() {
    var wrap = $('lifes'); wrap.innerHTML = '';
    LIFEDEF.forEach(function (d) {
      var n = inv[d.key] || 0, on = (d.key === 'cx2' && st.pendingX2) || (d.key === 'csh' && st.shield);
      var b = document.createElement('button'); b.className = 'life ' + d.cls + (on ? ' on' : '');
      b.disabled = st.answered || n <= 0 || st.cardUsed[d.key] || on;
      b.innerHTML = '<span class="ic">' + d.ic + '</span><span>' + d.label + '</span><span class="n">×' + n + '</span>';
      b.addEventListener('click', function () { useLife(d.key); });
      wrap.appendChild(b);
    });
  }
  function disableLifes() { Array.prototype.forEach.call($('lifes').children, function (b) { b.disabled = true; }); }

  function useLife(key) {
    if (st.answered || (inv[key] || 0) <= 0 || st.cardUsed[key]) return;
    var q = st.mazo[st.i];
    if (key === 'c5050') {
      var wrongIdx = []; q.opciones.forEach(function (o, i) { if (i !== q.correcta) wrongIdx.push(i); });
      wrongIdx = shuffle(wrongIdx).slice(0, 2);
      Array.prototype.forEach.call($('optsWrap').children, function (b) { if (wrongIdx.indexOf(parseInt(b.dataset.idx, 10)) >= 0) b.classList.add('gone'); });
    } else if (key === 'cpub') { publico(q); }
    else if (key === 'ctel') { telefono(q); }
    else if (key === 'ctime') { st.timeLeft = Math.min(QTIME, st.timeLeft + 15); updateTimeUI(); }
    else if (key === 'cx2') { st.pendingX2 = true; }
    else if (key === 'csh') { st.shield = true; }
    inv[key]--; saveInv(); st.cardUsed[key] = true; sfx('life'); renderLifes();
  }

  function publico(q) {
    var opts = Array.prototype.slice.call($('optsWrap').children).filter(function (b) { return !b.classList.contains('gone'); });
    var idxs = opts.map(function (b) { return parseInt(b.dataset.idx, 10); });
    var acierta = Math.random() < 0.72;
    var star = q.correcta;
    if (!acierta) { var w = idxs.filter(function (i) { return i !== q.correcta; }); if (w.length) star = w[Math.floor(Math.random() * w.length)]; }
    var wt = {}; idxs.forEach(function (i) { wt[i] = 2 + Math.random() * 7; }); wt[star] += 18 + Math.random() * 16;
    var sum = idxs.reduce(function (s, i) { return s + wt[i]; }, 0), acc = 0, perc = {};
    idxs.forEach(function (i, k) { perc[i] = (k === idxs.length - 1) ? (100 - acc) : Math.round(wt[i] / sum * 100); acc += perc[i]; });
    opts.forEach(function (b) { var i = parseInt(b.dataset.idx, 10); var bar = document.createElement('span'); bar.className = 'pubbar'; bar.innerHTML = '<i style="width:' + Math.max(4, perc[i]) + '%"></i><em>' + perc[i] + '%</em>'; b.appendChild(bar); });
  }
  function telefono(q) {
    var msg, r = Math.random();
    if (r < 0.15) { msg = '📞 «¡Uf! No me dio tiempo a mirarla bien…»'; }
    else {
      var acierta = Math.random() < 0.7, idxs = q.opciones.map(function (o, i) { return i; }), pick;
      if (acierta) pick = q.correcta; else { var w = idxs.filter(function (i) { return i !== q.correcta; }); pick = w[Math.floor(Math.random() * w.length)]; }
      var pre = acierta ? (Math.random() < 0.5 ? 'Estoy casi seguro de que' : 'Yo diría que') : 'No lo tengo claro, pero puede que sea';
      msg = '📞 «' + pre + ' es la ' + LETRAS[pick] + '.»';
    }
    var el = $('infoMsg'); el.textContent = msg; el.classList.remove('hidden');
  }

  /* ---------------- NAV / DESCARTE ---------------- */
  function go(dir) {
    stopTimer(); stopSpeak(); commitCard(st.mazo[st.i].id);
    var ni = st.i + dir; if (ni < 0) return; if (ni >= st.mazo.length) { finish(); return; }
    st.i = ni; window.scrollTo(0, 0); renderCard();
  }
  function mark(known) { st.sabidas[st.mazo[st.i].id] = known; go(1); }
  function knew(yes) { st.sabidas[st.mazo[st.i].id] = yes; go(1); }
  function discardCurrent() {
    var q = st.mazo[st.i]; if (!q) return;
    if (!confirm('¿Descartar esta pregunta para que no vuelva a salir? Podrás restaurarla desde el inicio.')) return;
    discarded.add(q.id); saveDisc(); st.committed[q.id] = true;
    st.mazo.splice(st.i, 1); $('pgTot').textContent = st.mazo.length;
    if (!st.mazo.length) { finish(); return; }
    if (st.i >= st.mazo.length) st.i = st.mazo.length - 1; renderCard();
  }

  /* ---------------- RESULTADOS ---------------- */
  function finish() {
    stopTimer(); stopSpeak();
    var total = st.mazo.length, know = 0, dunno = 0, testOk = 0, testTot = 0;
    st.mazo.forEach(function (q) {
      if (st.sabidas[q.id] === true) know++; else if (st.sabidas[q.id] === false) dunno++;
      if (st.respondidas.hasOwnProperty(q.id)) { testTot++; if (st.respondidas[q.id] === q.correcta) testOk++; }
    });
    var evaluadas = know + dunno, pct = evaluadas ? Math.round(know / evaluadas * 100) : 0;
    hide('study'); show('results');
    $('ring').style.setProperty('--pct', pct + '%'); $('ringPct').textContent = pct + '%';
    $('stKnow').textContent = know; $('stDunno').textContent = dunno; $('stTest').textContent = testTot ? (testOk + '/' + testTot) : '—';
    $('resSub').textContent = evaluadas ? ('Sabías ' + know + ' de ' + evaluadas + ' tarjetas · progreso guardado') : 'Progreso guardado';
    $('resTemas').textContent = Array.from(st.seleccion).sort(function (a, b) { return a - b; }).map(function (n) { return n === 0 ? 'REPASO' : 'T' + n; }).join(' · ') + ' · ' + total + ' tarjetas';
    if (st.juego) {
      show('gameScore'); $('resScore').textContent = st.score; $('resStreak').textContent = st.best; $('resShield').textContent = st.shieldUsed;
      var acc = testTot ? testOk / testTot : 0, badge = '';
      if (acc >= 0.95 && st.score >= 1500) badge = '🏆 ¡Maestro/a! Nivel oposición superado';
      else if (acc >= 0.8) badge = '🥇 ¡Gran nivel! Sigue así';
      else if (acc >= 0.6) badge = '🥈 Bien, a por más rachas';
      else badge = '🥉 A repasar las falladas';
      $('resBadge').textContent = badge;
    } else hide('gameScore');
    updateCoinsUI(); window.scrollTo(0, 0);
  }

  function bindStudy() {
    $('card3d').addEventListener('click', flip);
    $('showTest').addEventListener('click', toggleTest);
    $('prevBtn').addEventListener('click', function () { go(-1); });
    $('knowBtn').addEventListener('click', function () { mark(true); });
    $('dunnoBtn').addEventListener('click', function () { mark(false); });
    $('nextBtn').addEventListener('click', function () { go(1); });
    $('knewYes').addEventListener('click', function () { knew(true); });
    $('knewLuck').addEventListener('click', function () { knew(false); });
    $('ttsBtn').addEventListener('click', speak);
    $('discardBtn').addEventListener('click', discardCurrent);
    $('exitBtn').addEventListener('click', function () { if (confirm('¿Salir? Se guardará el progreso de lo respondido.')) { commitCard(st.mazo[st.i].id); stopTimer(); stopSpeak(); hide('study'); show('home'); renderTemas(); } });
    var x0 = null, scene = document.querySelector('.scene');
    scene.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    scene.addEventListener('touchend', function (e) { if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 70) { if (dx < 0) { if (!st.juego || st.answered) go(1); } else { if (!st.juego) go(-1); } } }, { passive: true });
    document.addEventListener('keydown', function (e) {
      if (!$('shop').classList.contains('hidden') && e.key === 'Escape') { hide('shop'); return; }
      if ($('study').classList.contains('hidden')) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (st.juego && st.answered) go(1); else flip(); }
      else if (e.key === 'ArrowRight') { if (!st.juego || st.answered) go(1); }
      else if (e.key === 'ArrowLeft') { if (!st.juego) go(-1); }
    });
  }
  function bindResults() {
    $('againAll').addEventListener('click', function () { startSession(poolSeleccion(), false); });
    $('toHome').addEventListener('click', function () { hide('results'); show('home'); renderTemas(); });
    $('againDunno').addEventListener('click', function () {
      var f = st.mazo.filter(function (q) { return st.sabidas[q.id] === false || (st.respondidas.hasOwnProperty(q.id) && st.respondidas[q.id] !== q.correcta); });
      if (!f.length) { alert('¡No fallaste ninguna! 🎉'); return; }
      startSession(f, true);   // continúa la puntuación y los comodines
    });
  }

  function init() {
    if (!TEMAS.length || !PREGUNTAS.length) { $('temaList').innerHTML = '<div class="empty">No se han cargado las preguntas.<br>Revisa <b>data/preguntas.js</b>.</div>'; return; }
    TEMAS.sort(function (a, b) { return a.n - b.n; });
    loadStats(); loadDisc(); loadInv(); loadCoins(); loadCfg();
    document.addEventListener('pointerdown', function once() { audio(); document.removeEventListener('pointerdown', once); });
    bindHome(); bindStudy(); bindResults(); renderTemas(); updateCoinsUI();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
