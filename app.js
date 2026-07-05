/* ==========================================================================
   Repaso OPOS · lógica de la app de tarjetas
   Depende de data/preguntas.js -> window.TEMAS, window.PREGUNTAS
   Modo repaso (flashcard) + Modo juego (puntos, tiempo, pistas, rachas).
   Progreso persistente por pregunta y preguntas descartadas en localStorage.
   ========================================================================== */
(function () {
  'use strict';

  var TEMAS = window.TEMAS || [];
  var PREGUNTAS = window.PREGUNTAS || [];
  var LETRAS = ['A', 'B', 'C', 'D', 'E'];
  var QTIME = 40;                 // segundos por pregunta en modo juego

  // ---- estado de sesión ----
  var st = {
    seleccion: new Set(),
    size: 30, modoTest: true, barajar: true, smart: true,
    juego: true, sonido: true,
    mazo: [], i: 0, volteada: false,
    respondidas: {}, sabidas: {}, committed: {},
    // juego
    score: 0, streak: 0, best: 0, shieldUsed: 0,
    lifes: {}, pendingX2: false, shield: false,
    answered: false, timer: null, timeLeft: QTIME, lastMile: 0
  };

  var stats = {};            // progreso por pregunta
  var discarded = new Set(); // ids descartados

  // ---- helpers DOM ----
  function $(id) { return document.getElementById(id); }
  function show(id) { $(id).classList.remove('hidden'); }
  function hide(id) { $(id).classList.add('hidden'); }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function countTema(n) { var c = 0; for (var k = 0; k < PREGUNTAS.length; k++) if (PREGUNTAS[k].tema === n) c++; return c; }

  /* ======================= SONIDO ======================= */
  var actx = null;
  function audio() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (actx && actx.state === 'suspended') actx.resume(); return actx; }
  function tone(f, t0, dur, type, vol) {
    var a = actx; if (!a) return;
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, a.currentTime + t0);
    g.gain.linearRampToValueAtTime(vol || 0.09, a.currentTime + t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t0 + dur);
    o.connect(g); g.connect(a.destination);
    o.start(a.currentTime + t0); o.stop(a.currentTime + t0 + dur + 0.02);
  }
  function sfx(kind) {
    if (!st.sonido) return; if (!audio()) return;
    if (kind === 'ok') { tone(660, 0, 0.12, 'sine', 0.09); tone(990, 0.09, 0.16, 'sine', 0.08); }
    else if (kind === 'bad') { tone(300, 0, 0.16, 'square', 0.05); tone(200, 0.12, 0.22, 'square', 0.05); }
    else if (kind === 'bonus') { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, i * 0.07, 0.14, 'triangle', 0.07); }); }
    else if (kind === 'life') { tone(880, 0, 0.08, 'triangle', 0.07); tone(1175, 0.07, 0.1, 'triangle', 0.06); }
    else if (kind === 'tick') { tone(1200, 0, 0.04, 'sine', 0.04); }
  }

  /* ======================= VOZ (TTS) ======================= */
  var speaking = false;
  function speak() {
    if (!('speechSynthesis' in window)) { alert('Este dispositivo no permite la lectura por voz.'); return; }
    if (speaking) { window.speechSynthesis.cancel(); speaking = false; $('ttsBtn').classList.remove('on'); return; }
    var q = st.mazo[st.i]; if (!q) return;
    var text = st.volteada ? ('Respuesta. ' + q.a) : q.q;
    if (!st.volteada && !$('optsWrap').classList.contains('hidden') && q.opciones) {
      text += '. Opciones: ' + q.opciones.map(function (o, i) { return LETRAS[i] + '. ' + o; }).join('. ');
    }
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES'; u.rate = 1; u.pitch = 1;
    u.onend = function () { speaking = false; $('ttsBtn').classList.remove('on'); };
    speaking = true; $('ttsBtn').classList.add('on');
    window.speechSynthesis.speak(u);
  }
  function stopSpeak() { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); speaking = false; var b = $('ttsBtn'); if (b) b.classList.remove('on'); }

  /* ======================= PERSISTENCIA ======================= */
  var LS = 'repasoOpos.cfg', LS_STATS = 'repasoOpos.stats', LS_DISC = 'repasoOpos.discarded';
  function saveCfg() { try { localStorage.setItem(LS, JSON.stringify({ sel: Array.from(st.seleccion), size: st.size, test: st.modoTest, shuffle: st.barajar, smart: st.smart, juego: st.juego, sonido: st.sonido })); } catch (e) {} }
  function loadCfg() {
    try {
      var c = JSON.parse(localStorage.getItem(LS) || '{}');
      if (c.sel) c.sel.forEach(function (n) { if (countTema(n)) st.seleccion.add(n); });
      if (typeof c.size === 'number') st.size = c.size;
      ['test:modoTest', 'shuffle:barajar', 'smart:smart', 'juego:juego', 'sonido:sonido'].forEach(function (p) {
        var k = p.split(':'); if (typeof c[k[0]] === 'boolean') st[k[1]] = c[k[0]];
      });
    } catch (e) {}
  }
  function loadStats() { try { stats = JSON.parse(localStorage.getItem(LS_STATS) || '{}') || {}; } catch (e) { stats = {}; } }
  function saveStats() { try { localStorage.setItem(LS_STATS, JSON.stringify(stats)); } catch (e) {} }
  function loadDisc() { try { (JSON.parse(localStorage.getItem(LS_DISC) || '[]') || []).forEach(function (id) { discarded.add(id); }); } catch (e) {} }
  function saveDisc() { try { localStorage.setItem(LS_DISC, JSON.stringify(Array.from(discarded))); } catch (e) {} }
  function getStat(id) { return stats[id] || { ok: 0, fail: 0, seen: 0, t: 0, lo: undefined }; }
  function estadoDe(id) { var s = stats[id]; if (!s || s.lo === undefined) return 'nue'; return s.lo ? 'dom' : 'fal'; }

  /* ======================= PROGRESO ======================= */
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
    for (var k = 0; k < PREGUNTAS.length; k++) {
      var q = PREGUNTAS[k]; if (discarded.has(q.id)) continue;
      if (!m[q.tema]) m[q.tema] = { total: 0, dom: 0, fal: 0, nue: 0 };
      m[q.tema].total++; m[q.tema][estadoDe(q.id)]++;
    }
    return m;
  }

  /* ======================= HOME ======================= */
  function etiquetaTema(n) { return n === 0 ? '⚡ REPASO' : 'TEMA ' + n; }

  function renderTemas() {
    var wrap = $('temaList'); wrap.innerHTML = '';
    var porTema = statsPorTema();
    var orden = [], grupos = {};
    TEMAS.forEach(function (t) { var b = t.bloque || 'General'; if (!grupos[b]) { grupos[b] = []; orden.push(b); } grupos[b].push(t); });
    orden.forEach(function (b) {
      var h = document.createElement('div'); h.className = 'blk-h'; h.innerHTML = '<span>' + b + '</span><span class="ln"></span>'; wrap.appendChild(h);
      var grid = document.createElement('div'); grid.className = 'grid';
      grupos[b].forEach(function (t) {
        var bank = countTema(t.n);
        var s = porTema[t.n] || { total: bank, dom: 0, fal: 0, nue: bank };
        var pct = s.total ? Math.round(s.dom / s.total * 100) : 0;
        var card = document.createElement('button');
        card.className = 'tcard' + (st.seleccion.has(t.n) ? ' sel' : ''); card.type = 'button'; card.dataset.tema = t.n;
        card.innerHTML =
          '<span class="chk">✓</span>' +
          '<span class="num">' + etiquetaTema(t.n) + '</span>' +
          '<span class="tt">' + t.corto + '</span>' +
          '<span class="cnt">' + s.total + ' preguntas</span>' +
          '<span class="prog"><span class="d">🟢<b> ' + s.dom + '</b></span><span class="f">🔴<b> ' + s.fal + '</b></span><span class="n">⚪<b> ' + s.nue + '</b></span></span>' +
          '<span class="pbar"><i style="width:' + pct + '%"></i></span>';
        if (!bank) { card.style.opacity = '.45'; card.disabled = true; }
        card.addEventListener('click', function () {
          if (st.seleccion.has(t.n)) st.seleccion.delete(t.n); else st.seleccion.add(t.n);
          card.classList.toggle('sel'); updateSelInfo(); saveCfg();
        });
        grid.appendChild(card);
      });
      wrap.appendChild(grid);
    });
    updateSelInfo();
  }

  function poolSeleccion() {
    var pool = [];
    for (var k = 0; k < PREGUNTAS.length; k++) { var q = PREGUNTAS[k]; if (st.seleccion.has(q.tema) && !discarded.has(q.id)) pool.push(q); }
    return pool;
  }
  function poolFalladas() { return poolSeleccion().filter(function (q) { return estadoDe(q.id) === 'fal'; }); }

  function updateSelInfo() {
    var pool = poolSeleccion();
    var info = $('selInfo');
    // link restaurar descartadas
    if (discarded.size) { $('discCount').textContent = discarded.size; show('restoreDisc'); } else hide('restoreDisc');
    if (!st.seleccion.size) {
      $('startBtn').disabled = true; info.textContent = 'Selecciona al menos un tema';
      hide('failBtn'); hide('progSum'); hide('resetProg'); return;
    }
    $('startBtn').disabled = false;
    var n = st.seleccion.size, toma = st.size === 0 ? pool.length : Math.min(st.size, pool.length);
    info.textContent = n + (n === 1 ? ' tema' : ' temas') + ' · ' + pool.length + ' preguntas · esta sesión: ' + toma;
    var dom = 0, fal = 0, nue = 0;
    pool.forEach(function (q) { var e = estadoDe(q.id); if (e === 'dom') dom++; else if (e === 'fal') fal++; else nue++; });
    $('progSum').innerHTML = '<span class="d">🟢 <b>' + dom + '</b> dominadas</span><span class="f">🔴 <b>' + fal + '</b> falladas</span><span>⚪ <b>' + nue + '</b> sin ver</span>';
    show('progSum');
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
      st.seleccion = new Set(todos ? [] : disp); this.textContent = todos ? 'Seleccionar todos' : 'Quitar todos';
      renderTemas(); saveCfg();
    });
    $('startBtn').addEventListener('click', function () { startSession(poolSeleccion()); });
    $('failBtn').addEventListener('click', function () { var f = poolFalladas(); if (!f.length) { alert('No tienes falladas en los temas elegidos. ¡Bien!'); return; } startSession(f); });
    $('resetProg').addEventListener('click', function () { if (confirm('¿Reiniciar TODO tu progreso (aciertos y fallos)? No se puede deshacer.')) { stats = {}; saveStats(); renderTemas(); } });
    $('restoreDisc').addEventListener('click', function () { if (confirm('¿Restaurar las ' + discarded.size + ' preguntas descartadas para que vuelvan a salir?')) { discarded = new Set(); saveDisc(); renderTemas(); } });
  }

  /* ======================= SESIÓN ======================= */
  function ordenarMazo(pool) {
    if (st.smart) {
      var prio = { fal: 0, nue: 1, dom: 2 };
      return pool.slice().sort(function (a, b) {
        var pa = prio[estadoDe(a.id)], pb = prio[estadoDe(b.id)]; if (pa !== pb) return pa - pb;
        var ta = getStat(a.id).t || 0, tb = getStat(b.id).t || 0; if (ta !== tb) return ta - tb;
        return Math.random() - 0.5;
      });
    }
    return st.barajar ? shuffle(pool) : pool.slice();
  }

  function startSession(pool) {
    if (!pool || !pool.length) return;
    var mazo = ordenarMazo(pool);
    if (st.size > 0) mazo = mazo.slice(0, st.size);
    st.mazo = mazo; st.i = 0; st.respondidas = {}; st.sabidas = {}; st.committed = {};
    // juego
    st.score = 0; st.streak = 0; st.best = 0; st.shieldUsed = 0; st.pendingX2 = false; st.shield = false; st.lastMile = 0;
    st.lifes = { c5050: 2, ctime: 2, cx2: 1, csh: 1 };
    hide('home'); hide('results'); show('study');
    $('pgTot').textContent = mazo.length;
    if (st.juego) show('hud'); else hide('hud');
    window.scrollTo(0, 0); renderCard();
  }

  function temaTitulo(n) { for (var i = 0; i < TEMAS.length; i++) if (TEMAS[i].n === n) return TEMAS[i].corto; return 'Tema ' + n; }

  function renderCard() {
    stopTimer(); stopSpeak();
    var q = st.mazo[st.i];
    st.volteada = false; st.answered = false;
    $('card3d').classList.remove('flip');

    $('pgCur').textContent = st.i + 1; $('pgLabel').textContent = 'Tarjeta ' + (st.i + 1);
    $('pgBar').style.width = ((st.i) / st.mazo.length * 100) + '%';
    var badge = { dom: '🟢', fal: '🔴', nue: '⚪' }[estadoDe(q.id)] || '';
    $('temaChip').textContent = badge + ' ' + etiquetaTema(q.tema) + ' · ' + temaTitulo(q.tema);
    $('qText').textContent = q.q; $('aText').innerHTML = formatAnswer(q.a); $('qIdx').textContent = '#' + (st.i + 1);

    $('tapHint').textContent = 'Toca la tarjeta para ver la respuesta'; $('tapHint').className = 'tap-hint pulse';
    $('pointsPop').className = 'pointspop'; $('pointsPop').textContent = '';
    hide('knewWrap'); hide('optsWrap'); $('optsWrap').innerHTML = '';

    if (st.juego) {
      // modo juego: opciones ya visibles, temporizador, HUD
      hide('showTest'); hide('navFlash'); hide('nextBtn');
      $('nextBtn').textContent = 'Siguiente ▶';
      buildOptions(q); renderLifes(); updateScoreUI();
      startTimer();
    } else {
      // modo repaso (flashcard)
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

  function flip() {
    st.volteada = !st.volteada;
    $('card3d').classList.toggle('flip', st.volteada);
    var h = $('tapHint');
    if (st.volteada) { h.textContent = 'Toca para volver a la pregunta'; h.classList.remove('pulse'); }
    else { h.textContent = 'Toca la tarjeta para ver la respuesta'; h.classList.add('pulse'); }
  }

  /* ------- opciones ------- */
  function buildOptions(q) {
    var wrap = $('optsWrap'); wrap.innerHTML = '';
    q.opciones.forEach(function (txt, idx) {
      var b = document.createElement('button');
      b.className = 'opt'; b.type = 'button'; b.dataset.idx = idx;
      b.innerHTML = '<span class="k">' + LETRAS[idx] + '</span><span>' + txt + '</span>';
      b.addEventListener('click', function () { onAnswer(q, idx, b); });
      wrap.appendChild(b);
    });
    show('optsWrap');
  }

  function onAnswer(q, idx, btn) {
    if (st.answered) { if (!st.juego) return; }
    if (st.respondidas.hasOwnProperty(q.id) && st.answered) return;
    st.respondidas[q.id] = idx;
    if (st.juego) {
      st.answered = true; stopTimer();
      if (btn) btn.classList.add('picked');
      revealOptions(q, idx);
      disableLifes();
      if (idx === q.correcta) onCorrect(q); else onWrong(q, false);
    } else {
      revealOptions(q, idx);
    }
  }

  function revealOptions(q, chosen) {
    var btns = $('optsWrap').children;
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i], idx = parseInt(b.dataset.idx, 10); b.classList.add('lock');
      if (idx === q.correcta) b.classList.add('correct');
      else if (idx === chosen) b.classList.add('wrong');
      else if (!b.classList.contains('gone')) b.classList.add('dim');
    }
    if (!st.juego) {
      var h = $('tapHint');
      h.textContent = (chosen === q.correcta) ? '✅ ¡Correcto! Toca la tarjeta para ampliar.' : '❌ Correcta: ' + LETRAS[q.correcta] + '. Toca la tarjeta para ver la explicación.';
      h.classList.remove('pulse');
    }
  }

  function toggleTest() {
    var q = st.mazo[st.i]; if (!q.opciones || !q.opciones.length) return;
    var wrap = $('optsWrap');
    if (wrap.classList.contains('hidden')) { buildOptions(q); if (st.respondidas.hasOwnProperty(q.id)) revealOptions(q, st.respondidas[q.id]); $('showTest').textContent = '📝 Ocultar opciones'; }
    else { hide('optsWrap'); $('showTest').textContent = '📝 Ver opciones (test)'; }
  }

  /* ======================= JUEGO ======================= */
  function startTimer() {
    st.timeLeft = QTIME; updateTimeUI();
    st.timer = setInterval(function () {
      st.timeLeft -= 0.2;
      if (st.timeLeft <= 5.2 && Math.abs(st.timeLeft % 1) < 0.2 && st.timeLeft > 0) sfx('tick');
      if (st.timeLeft <= 0) { st.timeLeft = 0; updateTimeUI(); stopTimer(); onTimeout(); return; }
      updateTimeUI();
    }, 200);
  }
  function stopTimer() { if (st.timer) { clearInterval(st.timer); st.timer = null; } }
  function updateTimeUI() {
    var pct = Math.max(0, st.timeLeft / QTIME * 100);
    var bar = $('timeBar'), lab = $('hTime');
    bar.style.width = pct + '%';
    lab.textContent = '⏱ ' + Math.ceil(st.timeLeft);
    var cls = st.timeLeft <= 5 ? 'crit' : (st.timeLeft <= 10 ? 'warn' : '');
    lab.className = 'htime ' + cls; bar.className = cls;
  }
  function updateScoreUI() { $('hScore').textContent = st.score; $('hStreak').textContent = '🔥 ' + st.streak; }

  function pop(txt, cls) { var p = $('pointsPop'); p.textContent = txt; p.className = 'pointspop show' + (cls ? ' ' + cls : ''); }

  function onCorrect(q) {
    sfx('ok');
    var base = 100, timeBonus = Math.round(st.timeLeft * 4), streakBonus = st.streak * 10;
    var pts = base + timeBonus + streakBonus;
    if (st.pendingX2) { pts *= 2; st.pendingX2 = false; sfx('bonus'); }
    st.score += pts; st.streak++; if (st.streak > st.best) st.best = st.streak;
    pop('+' + pts + (streakBonus ? ' 🔥' : ''), st.pendingX2 ? 'bonus' : '');
    updateScoreUI(); renderLifes();
    if (st.streak > 0 && st.streak % 5 === 0 && st.streak !== st.lastMile) { st.lastMile = st.streak; grantBonus(); }
    // preguntar si la sabía de verdad
    show('knewWrap');
  }

  function onWrong(q, timeout) {
    st.sabidas[q.id] = false; // acierto no logrado = no la sabía
    if (st.shield) { st.shield = false; st.shieldUsed++; pop('🛡️ Protegido (racha a salvo)', 'bonus'); sfx('life'); }
    else { st.streak = 0; sfx('bad'); pop(timeout ? '⏱ ¡Tiempo!' : '✗ Fallo', 'bad'); }
    updateScoreUI(); renderLifes();
    $('nextBtn').textContent = 'Siguiente ▶'; show('nextBtn');
  }

  function onTimeout() {
    if (st.answered) return; st.answered = true;
    var q = st.mazo[st.i];
    // mostrar la correcta
    var btns = $('optsWrap').children;
    for (var i = 0; i < btns.length; i++) { var b = btns[i]; b.classList.add('lock'); if (parseInt(b.dataset.idx, 10) === q.correcta) b.classList.add('correct'); else b.classList.add('dim'); }
    disableLifes();
    onWrong(q, true);
  }

  function grantBonus() {
    var keys = ['c5050', 'ctime', 'cx2', 'csh'];
    var idx = (st.best / 5 | 0) % keys.length;
    var k = keys[Math.max(0, idx - 0) % keys.length];
    st.lifes[k] = (st.lifes[k] || 0) + 1;
    var names = { c5050: '50:50', ctime: '+15 s', cx2: '×2 puntos', csh: 'Escudo' };
    pop('🎁 ¡Racha de ' + st.streak + '! +1 ' + names[k], 'bonus'); sfx('bonus'); renderLifes();
  }

  var LIFEDEF = [
    { key: 'c5050', ic: '50:50', cls: '', label: 'Quita 2' },
    { key: 'ctime', ic: '⏱', cls: 't', label: '+15 s' },
    { key: 'cx2', ic: '×2', cls: 'x2', label: 'Dobla' },
    { key: 'csh', ic: '🛡️', cls: 'sh', label: 'Escudo' }
  ];
  function renderLifes() {
    var wrap = $('lifes'); wrap.innerHTML = '';
    LIFEDEF.forEach(function (d) {
      var n = st.lifes[d.key] || 0;
      var b = document.createElement('button');
      var on = (d.key === 'cx2' && st.pendingX2) || (d.key === 'csh' && st.shield);
      b.className = 'life ' + d.cls + (on ? ' on' : '');
      b.disabled = st.answered || n <= 0 || on;
      b.innerHTML = '<span class="ic">' + d.ic + '</span><span>' + d.label + '</span><span class="n">×' + n + '</span>';
      b.addEventListener('click', function () { useLife(d.key); });
      wrap.appendChild(b);
    });
  }
  function disableLifes() { Array.prototype.forEach.call($('lifes').children, function (b) { b.disabled = true; }); }

  function useLife(key) {
    if (st.answered || (st.lifes[key] || 0) <= 0) return;
    var q = st.mazo[st.i];
    if (key === 'c5050') {
      var wrongIdx = [];
      q.opciones.forEach(function (o, i) { if (i !== q.correcta) wrongIdx.push(i); });
      wrongIdx = shuffle(wrongIdx).slice(0, 2);
      Array.prototype.forEach.call($('optsWrap').children, function (b) { if (wrongIdx.indexOf(parseInt(b.dataset.idx, 10)) >= 0) b.classList.add('gone'); });
    } else if (key === 'ctime') { st.timeLeft = Math.min(QTIME, st.timeLeft + 15); updateTimeUI(); }
    else if (key === 'cx2') { st.pendingX2 = true; }
    else if (key === 'csh') { st.shield = true; }
    st.lifes[key]--; sfx('life'); renderLifes();
  }

  /* ------- navegación y descarte ------- */
  function go(dir) {
    stopTimer(); stopSpeak();
    commitCard(st.mazo[st.i].id);
    var ni = st.i + dir;
    if (ni < 0) return;
    if (ni >= st.mazo.length) { finish(); return; }
    st.i = ni; window.scrollTo(0, 0); renderCard();
  }
  function mark(known) { var q = st.mazo[st.i]; st.sabidas[q.id] = known; go(1); }
  function knew(yes) { var q = st.mazo[st.i]; st.sabidas[q.id] = yes; go(1); }

  function discardCurrent() {
    var q = st.mazo[st.i]; if (!q) return;
    if (!confirm('¿Descartar esta pregunta para que no vuelva a salir? Podrás restaurarla desde el inicio.')) return;
    discarded.add(q.id); saveDisc();
    st.committed[q.id] = true; // no contabilizar
    st.mazo.splice(st.i, 1);
    $('pgTot').textContent = st.mazo.length;
    if (!st.mazo.length) { finish(); return; }
    if (st.i >= st.mazo.length) st.i = st.mazo.length - 1;
    renderCard();
  }

  /* ======================= RESULTADOS ======================= */
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
      show('gameScore');
      $('resScore').textContent = st.score; $('resStreak').textContent = st.best; $('resShield').textContent = st.shieldUsed;
      var acc = testTot ? testOk / testTot : 0, badge = '';
      if (acc >= 0.95 && st.score >= 1500) badge = '🏆 ¡Maestro/a! Nivel oposición superado';
      else if (acc >= 0.8) badge = '🥇 ¡Gran nivel! Sigue así';
      else if (acc >= 0.6) badge = '🥈 Bien, a por más rachas';
      else badge = '🥉 A repasar las falladas';
      $('resBadge').textContent = badge;
    } else hide('gameScore');
    window.scrollTo(0, 0);
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
    $('exitBtn').addEventListener('click', function () {
      if (confirm('¿Salir? Se guardará el progreso de lo respondido.')) { commitCard(st.mazo[st.i].id); stopTimer(); stopSpeak(); hide('study'); show('home'); renderTemas(); }
    });
    var x0 = null, scene = document.querySelector('.scene');
    scene.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    scene.addEventListener('touchend', function (e) {
      if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 70) { if (dx < 0) { if (!st.juego || st.answered) go(1); } else { if (!st.juego) go(-1); } }
    }, { passive: true });
    document.addEventListener('keydown', function (e) {
      if ($('study').classList.contains('hidden')) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (st.juego && st.answered) go(1); else flip(); }
      else if (e.key === 'ArrowRight') { if (!st.juego || st.answered) go(1); }
      else if (e.key === 'ArrowLeft') { if (!st.juego) go(-1); }
    });
  }

  function bindResults() {
    $('againAll').addEventListener('click', function () { startSession(poolSeleccion()); });
    $('toHome').addEventListener('click', function () { hide('results'); show('home'); renderTemas(); });
    $('againDunno').addEventListener('click', function () {
      var f = st.mazo.filter(function (q) { return st.sabidas[q.id] === false || (st.respondidas.hasOwnProperty(q.id) && st.respondidas[q.id] !== q.correcta); });
      if (!f.length) { alert('¡No fallaste ninguna! 🎉'); return; } startSession(f);
    });
  }

  /* ======================= INIT ======================= */
  function init() {
    if (!TEMAS.length || !PREGUNTAS.length) { $('temaList').innerHTML = '<div class="empty">No se han cargado las preguntas.<br>Revisa <b>data/preguntas.js</b>.</div>'; return; }
    TEMAS.sort(function (a, b) { return a.n - b.n; });
    loadStats(); loadDisc(); loadCfg();
    document.addEventListener('pointerdown', function once() { audio(); document.removeEventListener('pointerdown', once); });
    bindHome(); bindStudy(); bindResults(); renderTemas();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
