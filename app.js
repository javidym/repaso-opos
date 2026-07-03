/* ==========================================================================
   Repaso OPOS · lógica de la app de tarjetas
   Depende de data/preguntas.js -> window.TEMAS, window.PREGUNTAS
   ========================================================================== */
(function () {
  'use strict';

  var TEMAS = window.TEMAS || [];
  var PREGUNTAS = window.PREGUNTAS || [];
  var LETRAS = ['A', 'B', 'C', 'D', 'E'];

  // ---- estado ----
  var st = {
    seleccion: new Set(),   // números de tema seleccionados
    size: 30,               // 0 = todas
    modoTest: true,
    barajar: true,
    mazo: [],               // preguntas de la sesión
    i: 0,                   // índice actual
    volteada: false,
    respondidas: {},        // id -> índice elegido
    sabidas: {},            // id -> true/false (autoeval)
  };

  // ---- helpers DOM ----
  function $(id) { return document.getElementById(id); }
  function show(id) { $(id).classList.remove('hidden'); }
  function hide(id) { $(id).classList.add('hidden'); }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function countTema(n) {
    var c = 0;
    for (var k = 0; k < PREGUNTAS.length; k++) if (PREGUNTAS[k].tema === n) c++;
    return c;
  }

  // ---- persistencia ligera ----
  var LS = 'repasoOpos.cfg';
  function saveCfg() {
    try {
      localStorage.setItem(LS, JSON.stringify({
        sel: Array.from(st.seleccion), size: st.size,
        test: st.modoTest, shuffle: st.barajar
      }));
    } catch (e) {}
  }
  function loadCfg() {
    try {
      var c = JSON.parse(localStorage.getItem(LS) || '{}');
      if (c.sel) c.sel.forEach(function (n) { if (countTema(n)) st.seleccion.add(n); });
      if (typeof c.size === 'number') st.size = c.size;
      if (typeof c.test === 'boolean') st.modoTest = c.test;
      if (typeof c.shuffle === 'boolean') st.barajar = c.shuffle;
    } catch (e) {}
  }

  /* ======================= HOME ======================= */
  function renderTemas() {
    var wrap = $('temaList');
    wrap.innerHTML = '';
    // agrupar por bloque conservando el orden de aparición
    var orden = [], grupos = {};
    TEMAS.forEach(function (t) {
      var b = t.bloque || 'General';
      if (!grupos[b]) { grupos[b] = []; orden.push(b); }
      grupos[b].push(t);
    });
    orden.forEach(function (b) {
      var h = document.createElement('div');
      h.className = 'blk-h';
      h.innerHTML = '<span>' + b + '</span><span class="ln"></span>';
      wrap.appendChild(h);

      var grid = document.createElement('div');
      grid.className = 'grid';
      grupos[b].forEach(function (t) {
        var n = countTema(t.n);
        var card = document.createElement('button');
        card.className = 'tcard' + (st.seleccion.has(t.n) ? ' sel' : '');
        card.type = 'button';
        card.dataset.tema = t.n;
        card.innerHTML =
          '<span class="chk">✓</span>' +
          '<span class="num">TEMA ' + t.n + '</span>' +
          '<span class="tt">' + t.corto + '</span>' +
          '<span class="cnt">' + n + ' preguntas</span>';
        if (!n) { card.style.opacity = '.45'; card.disabled = true; }
        card.addEventListener('click', function () {
          if (st.seleccion.has(t.n)) st.seleccion.delete(t.n);
          else st.seleccion.add(t.n);
          card.classList.toggle('sel');
          updateSelInfo();
          saveCfg();
        });
        grid.appendChild(card);
      });
      wrap.appendChild(grid);
    });
    updateSelInfo();
  }

  function poolSeleccion() {
    var pool = [];
    for (var k = 0; k < PREGUNTAS.length; k++) {
      if (st.seleccion.has(PREGUNTAS[k].tema)) pool.push(PREGUNTAS[k]);
    }
    return pool;
  }

  function updateSelInfo() {
    var pool = poolSeleccion();
    var btn = $('startBtn'), info = $('selInfo');
    if (!st.seleccion.size) {
      btn.disabled = true;
      info.textContent = 'Selecciona al menos un tema';
    } else {
      btn.disabled = false;
      var n = st.seleccion.size;
      var toma = st.size === 0 ? pool.length : Math.min(st.size, pool.length);
      info.textContent = n + (n === 1 ? ' tema' : ' temas') + ' · ' + pool.length +
        ' preguntas disponibles · esta sesión: ' + toma;
    }
  }

  function bindHome() {
    // tamaño de sesión
    Array.prototype.forEach.call($('sizeSeg').children, function (b) {
      if (parseInt(b.dataset.n, 10) === st.size) {
        Array.prototype.forEach.call($('sizeSeg').children, function (x) { x.classList.remove('on'); });
        b.classList.add('on');
      }
      b.addEventListener('click', function () {
        Array.prototype.forEach.call($('sizeSeg').children, function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        st.size = parseInt(b.dataset.n, 10);
        updateSelInfo(); saveCfg();
      });
    });
    // toggles
    $('tgTest').checked = st.modoTest;
    $('tgShuffle').checked = st.barajar;
    $('tgTest').addEventListener('change', function () { st.modoTest = this.checked; saveCfg(); });
    $('tgShuffle').addEventListener('change', function () { st.barajar = this.checked; saveCfg(); });

    // seleccionar todos / ninguno
    $('selAll').addEventListener('click', function () {
      var disponibles = TEMAS.filter(function (t) { return countTema(t.n); }).map(function (t) { return t.n; });
      var todos = disponibles.every(function (n) { return st.seleccion.has(n); });
      st.seleccion = new Set(todos ? [] : disponibles);
      this.textContent = todos ? 'Seleccionar todos' : 'Quitar todos';
      renderTemas();
      saveCfg();
    });

    $('startBtn').addEventListener('click', startSession);
  }

  /* ======================= SESIÓN ======================= */
  function startSession() {
    var pool = poolSeleccion();
    if (!pool.length) return;
    var mazo = st.barajar ? shuffle(pool) : pool.slice();
    if (st.size > 0) mazo = mazo.slice(0, st.size);
    st.mazo = mazo;
    st.i = 0;
    st.respondidas = {};
    st.sabidas = {};
    hide('home'); hide('results'); show('study');
    $('pgTot').textContent = mazo.length;
    window.scrollTo(0, 0);
    renderCard();
  }

  function temaTitulo(n) {
    for (var i = 0; i < TEMAS.length; i++) if (TEMAS[i].n === n) return TEMAS[i].corto;
    return 'Tema ' + n;
  }

  function renderCard() {
    var q = st.mazo[st.i];
    st.volteada = false;
    $('card3d').classList.remove('flip');

    // progreso
    $('pgCur').textContent = st.i + 1;
    $('pgLabel').textContent = 'Tarjeta ' + (st.i + 1);
    $('pgBar').style.width = ((st.i) / st.mazo.length * 100) + '%';

    // contenido
    $('temaChip').textContent = 'TEMA ' + q.tema + ' · ' + temaTitulo(q.tema);
    $('qText').textContent = q.q;
    $('aText').innerHTML = formatAnswer(q.a);
    $('qIdx').textContent = '#' + (st.i + 1);

    // pista de girar
    var hint = $('tapHint');
    hint.textContent = 'Toca la tarjeta para ver la respuesta';
    hint.className = 'tap-hint pulse';

    // opciones test
    hide('optsWrap');
    $('showTest').classList.remove('hidden');
    $('optsWrap').innerHTML = '';
    if (st.modoTest) {
      $('showTest').textContent = st.respondidas.hasOwnProperty(q.id) ? '📝 Opciones' : '📝 Ver opciones (test)';
    }
    $('showTest').style.display = (st.modoTest && q.opciones && q.opciones.length) ? '' : 'none';
    // si ya se respondió antes, re-mostrar
    if (st.modoTest && st.respondidas.hasOwnProperty(q.id)) { buildOptions(q); revealOptions(q, st.respondidas[q.id]); }

    // botones autoeval
    var saved = st.sabidas[q.id];
    $('knowBtn').classList.toggle('on', saved === true);
    $('dunnoBtn').classList.toggle('on', saved === false);
    $('prevBtn').disabled = st.i === 0;
  }

  function formatAnswer(a) {
    // permite saltos de línea y viñetas simples con "- "
    var safe = a.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return safe.replace(/\n/g, '<br>');
  }

  function flip() {
    st.volteada = !st.volteada;
    $('card3d').classList.toggle('flip', st.volteada);
    var hint = $('tapHint');
    if (st.volteada) { hint.textContent = 'Toca para volver a la pregunta'; hint.classList.remove('pulse'); }
    else { hint.textContent = 'Toca la tarjeta para ver la respuesta'; hint.classList.add('pulse'); }
  }

  /* ------- opciones tipo test ------- */
  function buildOptions(q) {
    var wrap = $('optsWrap');
    wrap.innerHTML = '';
    q.opciones.forEach(function (txt, idx) {
      var b = document.createElement('button');
      b.className = 'opt';
      b.type = 'button';
      b.dataset.idx = idx;
      b.innerHTML = '<span class="k">' + LETRAS[idx] + '</span><span>' + txt + '</span>';
      b.addEventListener('click', function () {
        if (st.respondidas.hasOwnProperty(q.id)) return;
        st.respondidas[q.id] = idx;
        revealOptions(q, idx);
      });
      wrap.appendChild(b);
    });
    show('optsWrap');
  }

  function revealOptions(q, chosen) {
    var btns = $('optsWrap').children;
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i], idx = parseInt(b.dataset.idx, 10);
      b.classList.add('lock');
      if (idx === q.correcta) b.classList.add('correct');
      else if (idx === chosen) b.classList.add('wrong');
      else b.classList.add('dim');
    }
    var hint = $('tapHint');
    if (chosen === q.correcta) { hint.textContent = '✅ ¡Correcto! Toca la tarjeta para ampliar.'; }
    else { hint.textContent = '❌ Correcta: ' + LETRAS[q.correcta] + '. Toca la tarjeta para ver la explicación.'; }
    hint.classList.remove('pulse');
  }

  function toggleTest() {
    var q = st.mazo[st.i];
    if (!q.opciones || !q.opciones.length) return;
    var wrap = $('optsWrap');
    if (wrap.classList.contains('hidden')) {
      buildOptions(q);
      if (st.respondidas.hasOwnProperty(q.id)) revealOptions(q, st.respondidas[q.id]);
      $('showTest').textContent = '📝 Ocultar opciones';
    } else {
      hide('optsWrap');
      $('showTest').textContent = '📝 Ver opciones (test)';
    }
  }

  /* ------- navegación ------- */
  function go(dir) {
    var ni = st.i + dir;
    if (ni < 0) return;
    if (ni >= st.mazo.length) { finish(); return; }
    st.i = ni;
    window.scrollTo(0, 0);
    renderCard();
  }
  function mark(known) {
    var q = st.mazo[st.i];
    st.sabidas[q.id] = known;
    go(1);
  }

  /* ======================= RESULTADOS ======================= */
  function finish() {
    var total = st.mazo.length;
    var know = 0, dunno = 0, testOk = 0, testTot = 0;
    st.mazo.forEach(function (q) {
      if (st.sabidas[q.id] === true) know++;
      else if (st.sabidas[q.id] === false) dunno++;
      if (st.respondidas.hasOwnProperty(q.id)) {
        testTot++;
        if (st.respondidas[q.id] === q.correcta) testOk++;
      }
    });
    var evaluadas = know + dunno;
    var pct = evaluadas ? Math.round(know / evaluadas * 100) : (total ? 0 : 0);

    hide('study'); show('results');
    $('ring').style.setProperty('--pct', pct + '%');
    $('ringPct').textContent = pct + '%';
    $('stKnow').textContent = know;
    $('stDunno').textContent = dunno;
    $('stTest').textContent = testTot ? (testOk + '/' + testTot) : '—';
    $('resSub').textContent = evaluadas
      ? ('Sabías ' + know + ' de ' + evaluadas + ' tarjetas evaluadas')
      : 'No marcaste autoevaluación en esta sesión';
    var nombres = Array.from(st.seleccion).sort(function (a, b) { return a - b; })
      .map(function (n) { return 'T' + n; }).join(' · ');
    $('resTemas').textContent = nombres + ' · ' + total + ' tarjetas';
    window.scrollTo(0, 0);
  }

  function bindStudy() {
    $('card3d').addEventListener('click', flip);
    $('showTest').addEventListener('click', toggleTest);
    $('prevBtn').addEventListener('click', function () { go(-1); });
    $('knowBtn').addEventListener('click', function () { mark(true); });
    $('dunnoBtn').addEventListener('click', function () { mark(false); });
    $('exitBtn').addEventListener('click', function () {
      if (confirm('¿Salir del repaso? Se perderá el progreso de esta sesión.')) {
        hide('study'); show('home'); renderTemas();
      }
    });
    // swipe horizontal para navegar
    var x0 = null;
    var scene = document.querySelector('.scene');
    scene.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    scene.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 70) { if (dx < 0) go(1); else go(-1); }
    }, { passive: true });
    // teclado (para tablet con teclado / escritorio)
    document.addEventListener('keydown', function (e) {
      if ($('study').classList.contains('hidden')) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    });
  }

  function bindResults() {
    $('againAll').addEventListener('click', startSession);
    $('toHome').addEventListener('click', function () { hide('results'); show('home'); renderTemas(); });
    $('againDunno').addEventListener('click', function () {
      var falladas = st.mazo.filter(function (q) {
        return st.sabidas[q.id] === false ||
          (st.respondidas.hasOwnProperty(q.id) && st.respondidas[q.id] !== q.correcta);
      });
      if (!falladas.length) { alert('¡No fallaste ninguna! 🎉'); return; }
      st.mazo = st.barajar ? shuffle(falladas) : falladas;
      st.i = 0; st.respondidas = {}; st.sabidas = {};
      hide('results'); show('study');
      $('pgTot').textContent = st.mazo.length;
      window.scrollTo(0, 0);
      renderCard();
    });
  }

  /* ======================= INIT ======================= */
  function init() {
    if (!TEMAS.length || !PREGUNTAS.length) {
      $('temaList').innerHTML = '<div class="empty">No se han cargado las preguntas.<br>Revisa <b>data/preguntas.js</b>.</div>';
      return;
    }
    // ordenar temas por número
    TEMAS.sort(function (a, b) { return a.n - b.n; });
    loadCfg();
    bindHome();
    bindStudy();
    bindResults();
    renderTemas();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
