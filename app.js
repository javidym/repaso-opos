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
  var QTIME = 60;

  var st = {
    seleccion: new Set(),
    size: 30, modoTest: true, barajar: true, smart: true, juego: true, sonido: true, tiempo: true, eink: false, adapt: false, juegoEf: true,
    mazo: [], i: 0, volteada: false, cardStart: 0, repeatCount: {}, repInjected: 0,
    respondidas: {}, sabidas: {}, committed: {}, cardUsed: {},
    score: 0, streak: 0, best: 0, shieldUsed: 0, autoX2: false,
    pendingX2: false, shield: false, answered: false, timer: null, timeLeft: QTIME, lastMile: 0
  };

  var stats = {};                 // progreso por pregunta
  var discarded = new Set();      // ids descartados
  var favorites = new Set();      // ids marcados como "buena pregunta"
  var inv = {};                   // inventario de comodines (persistente)
  var coins = 0;                  // monedas (persistente)
  var cosmet = { temas: ['clasico'], tema: 'clasico', extras: [], confeti: false, estrellas: false, monedas: false, finde: false, coinMult: 1, trofeos: [] };  // temas, efectos, mejoras y colección

  var LIFEDEF = [
    { key: 'c5050', ic: '50:50', cls: '', label: 'Quita 2' },
    { key: 'cpub', ic: '📊', cls: '', label: 'Público' },
    { key: 'ctel', ic: '📞', cls: '', label: 'Teléfono' },
    { key: 'cx2', ic: '×2', cls: 'x2', label: 'Dobla' },
    { key: 'csh', ic: '🛡️', cls: 'sh', label: 'Escudo' },
    { key: 'ctime', ic: '⏱', cls: 't', label: '+15 s' }
  ];
  var SHOP = [
    { key: 'ctel', ic: '📞', name: 'Llamada a un amigo', desc: 'A veces la sabe… y a veces te hace dudar', price: 1500 },
    { key: 'cpub', ic: '📊', name: 'Comodín del público', desc: 'Reparte un % por opción (no siempre acierta)', price: 1000 },
    { key: 'c5050', ic: '50:50', name: 'Comodín 50:50', desc: 'Elimina 2 opciones incorrectas', price: 500 },
    { key: 'csh', ic: '🛡️', name: 'Escudo', desc: 'Anula el próximo fallo (racha a salvo)', price: 400 },
    { key: 'cx2', ic: '×2', name: 'Doblar puntos', desc: 'Duplica los puntos de esa pregunta', price: 250 },
    { key: 'ctime', ic: '⏱', name: '+15 segundos', desc: 'Amplía el tiempo de la pregunta', price: 150 }
  ];
  // Packs de comodines (más baratos por unidad)
  var PACKS = [
    { key: 'c5050', ic: '50:50', name: 'Pack ×5 de 50:50', desc: 'Cinco comodines 50:50 de golpe', qty: 5, price: 2000 },
    { key: 'cpub', ic: '📊', name: 'Pack ×5 de Público', desc: 'Cinco comodines del público', qty: 5, price: 4000 },
    { key: 'ctime', ic: '⏱', name: 'Pack ×10 de +15 s', desc: 'Diez ampliaciones de tiempo', qty: 10, price: 1200 }
  ];
  // Cajas sorpresa: para fundir puntos rápido (dan uno de CADA comodín ×N)
  var BOXES = [
    { key: 'caja', ic: '🎁', name: 'Caja sorpresa', desc: 'Uno de cada comodín', qty: 1, price: 2500 },
    { key: 'caja3', ic: '📦', name: 'Caja grande', desc: 'Tres de cada comodín', qty: 3, price: 6000 },
    { key: 'caja6', ic: '🧰', name: 'Caja enorme', desc: 'Seis de cada comodín', qty: 6, price: 11000 },
    { key: 'caja12', ic: '🎒', name: 'Cofre', desc: 'Doce de cada comodín + 3000 🪙', qty: 12, coins: 3000, price: 20000 },
    { key: 'caja25', ic: '🏆', name: 'Cofre gigante', desc: 'Veinticinco de cada comodín + 8000 🪙', qty: 25, coins: 8000, price: 40000 },
    { key: 'caja50', ic: '💎', name: 'Baúl legendario', desc: '¡Cincuenta de cada comodín + 20000 🪙!', qty: 50, coins: 20000, price: 85000 }
  ];
  // Extras: efectos y mejoras
  var EXTRAS = [
    { key: 'confeti', ic: '🎉', name: 'Fiesta de aciertos', desc: 'Lluvia de confeti al acertar (se puede quitar)', price: 800, kind: 'toggle', flag: 'confeti' },
    { key: 'estrellas', ic: '🌟', name: 'Lluvia de estrellas', desc: 'Estrellas cayendo al acertar', price: 800, kind: 'toggle', flag: 'estrellas' },
    { key: 'monedas', ic: '💰', name: 'Lluvia de monedas', desc: 'Monedas volando al acertar', price: 800, kind: 'toggle', flag: 'monedas' },
    { key: 'finde', ic: '🍀', name: 'Amuleto de la suerte', desc: 'El comodín del público acierta mucho más', price: 3000, kind: 'toggle', flag: 'finde' },
    { key: 'coinmult', ic: '💎', name: 'Multiplicador de monedas', desc: 'Ganas un 50% MÁS de monedas para siempre', price: 5000, kind: 'upgrade', flag: 'coinMult', val: 1.5 }
  ];
  // Juegos de azar: funde puntos con posibilidad de premios gordos
  var GAMES = [
    { key: 'ruleta', ic: '🎰', name: 'Ruleta de la suerte', desc: 'Gira: comodines, monedas… o el bote', price: 400, prizes: [
      { w: 28, txt: '😅 ¡Casi! Te llevas +50 🪙', apply: function () { giveCoins(50); } },
      { w: 30, txt: '🎉 ¡1 comodín!', apply: function () { return giveComodines(1); } },
      { w: 22, txt: '🎉 ¡2 comodines!', apply: function () { return giveComodines(2); } },
      { w: 12, txt: '💰 ¡+800 monedas!', apply: function () { giveCoins(800); } },
      { w: 6, txt: '🔥 ¡4 comodines!', apply: function () { return giveComodines(4); } },
      { w: 2, jackpot: true, txt: '💎 ¡¡BOTE!! +2000 🪙 y caja sorpresa', apply: function () { giveCoins(2000); return giveBox(1); } }
    ] },
    { key: 'cofre', ic: '🧰', name: 'Cofre legendario', desc: 'Más caro, premios mucho mayores (¡y temas!)', price: 2000, prizes: [
      { w: 20, txt: '😬 Cofre casi vacío… +300 🪙', apply: function () { giveCoins(300); } },
      { w: 25, txt: '🎁 ¡3 comodines!', apply: function () { return giveComodines(3); } },
      { w: 25, txt: '💰 ¡+3000 monedas!', apply: function () { giveCoins(3000); } },
      { w: 15, txt: '🎁 ¡Caja grande!', apply: function () { return giveBox(3); } },
      { w: 10, txt: '🔥 ¡8 comodines!', apply: function () { return giveComodines(8); } },
      { w: 5, jackpot: true, txt: '💎 ¡¡BOTE LEGENDARIO!! +8000 🪙', apply: function () { giveCoins(8000); return '+ ' + grantRandomTheme(); } }
    ] }
  ];
  // Coleccionables: puro lujo para fundir puntos, NO dan ninguna ventaja de juego.
  var TROPHIES = [
    { key: 'tr_bronce', ic: '🥉', name: 'Copa de bronce', price: 5000 },
    { key: 'tr_plata', ic: '🥈', name: 'Copa de plata', price: 12000 },
    { key: 'tr_oro', ic: '🥇', name: 'Copa de oro', price: 25000 },
    { key: 'tr_medalla', ic: '🎖️', name: 'Medalla de honor', price: 40000 },
    { key: 'tr_corona', ic: '👑', name: 'Corona real', price: 60000 },
    { key: 'tr_diamante', ic: '💎', name: 'Diamante', price: 90000 },
    { key: 'tr_unicornio', ic: '🦄', name: 'Unicornio', price: 150000 },
    { key: 'tr_dragon', ic: '🐉', name: 'Dragón legendario', price: 300000 },
    { key: 'tr_ovni', ic: '🛸', name: 'Platillo cósmico', price: 500000 },
    { key: 'tr_gato', ic: '🐈', name: 'Gato de la suerte', price: 800000 }
  ];
  // Temas estéticos. "clasico" es el de siempre (gratis). Los de degradado llevan "bgimg".
  var THEMES = [
    { key: 'clasico', ic: '🎨', name: 'Clásico', price: 0, vars: null },
    { key: 'noche', ic: '🌙', name: 'Noche neón', price: 600, vars: { bg:'#0a0a12', bg2:'#05050a', panel:'#14141f', panel2:'#1c1c2b', line:'#2b2b3d', ink:'#eafff9', soft:'#9fb6cf', muted:'#7382a0', azul:'#3df0ff', 'azul-d':'#1fbfd6', verde:'#39ff9e', 'verde-d':'#1fd67f', rojo:'#ff4d6d', naranja:'#ffb03a', morado:'#c77dff', dorado:'#ffe14d' } },
    { key: 'oceano', ic: '🌊', name: 'Océano', price: 500, vars: { bg:'#e8f4f8', bg2:'#d6eaf2', panel:'#ffffff', panel2:'#eef8fc', line:'#c5e0ea', ink:'#0b2a38', soft:'#3d6b7d', muted:'#6f97a6', azul:'#0e7c9b', 'azul-d':'#0a5f77', verde:'#12a5a5', 'verde-d':'#0d8080', rojo:'#e2585b', naranja:'#e08a3c', morado:'#5b8ac9', dorado:'#d9a441' } },
    { key: 'sakura', ic: '🌸', name: 'Sakura', price: 500, vars: { bg:'#fdeef3', bg2:'#fbe0ea', panel:'#ffffff', panel2:'#fdf2f6', line:'#f4d0dd', ink:'#3a2230', soft:'#7d5566', muted:'#a97e8e', azul:'#c86b9c', 'azul-d':'#a8497c', verde:'#5fae7a', 'verde-d':'#468a5f', rojo:'#e05a7a', naranja:'#e0975a', morado:'#b06bc8', dorado:'#d9a441' } },
    { key: 'bosque', ic: '🌲', name: 'Bosque', price: 700, vars: { bg:'#eef4ec', bg2:'#e0ebdb', panel:'#ffffff', panel2:'#f1f7ef', line:'#d0e0c8', ink:'#1e2c1c', soft:'#4f6b48', muted:'#7a9170', azul:'#3d7a5a', 'azul-d':'#2c5e44', verde:'#3f9d4e', 'verde-d':'#2f7a3b', rojo:'#d05a4a', naranja:'#d0913c', morado:'#7d6bc8', dorado:'#b8922f' } },
    { key: 'lava', ic: '🔥', name: 'Lava', price: 900, vars: { bg:'#160c0a', bg2:'#0d0605', panel:'#241412', panel2:'#301a17', line:'#43221d', ink:'#ffece4', soft:'#d0a08f', muted:'#9a6f60', azul:'#ff8a3d', 'azul-d':'#e06a1f', verde:'#ffb03a', 'verde-d':'#e0902a', rojo:'#ff4d3d', naranja:'#ff7a3d', morado:'#e0673d', dorado:'#ffc23d' } },
    { key: 'pergamino', ic: '📜', name: 'Pergamino', price: 700, vars: { bg:'#f2e9d8', bg2:'#e8dcc4', panel:'#fbf5e8', panel2:'#f3ead6', line:'#dccba8', ink:'#3a2e1c', soft:'#6b5a3d', muted:'#94815e', azul:'#8a6d3b', 'azul-d':'#6f5629', verde:'#6b7d3a', 'verde-d':'#54632c', rojo:'#a8503a', naranja:'#b07a2e', morado:'#7d5b3a', dorado:'#b8922f' } },
    { key: 'galaxia', ic: '🌌', name: 'Galaxia', price: 1200, vars: { bg:'#0f0a1f', bg2:'#080512', panel:'#191233', panel2:'#221847', line:'#332963', ink:'#ece6ff', soft:'#b0a0d8', muted:'#7d6fa8', azul:'#7d6bff', 'azul-d':'#5a49d6', verde:'#3fd6a0', 'verde-d':'#2fa87d', rojo:'#ff5d8f', naranja:'#ffab5d', morado:'#c77dff', dorado:'#ffd24d' } },
    { key: 'atardecer', ic: '🌅', name: 'Atardecer (degradado)', price: 1000, bgimg: 'linear-gradient(160deg, #ffd194 0%, #ff9a8b 45%, #d76d77 100%)', vars: { panel:'#fff6f0', panel2:'#ffece1', line:'#f2cdbb', ink:'#3d2320', soft:'#7a5548', muted:'#a07d6e', azul:'#c25e3a', 'azul-d':'#a2482a', verde:'#4f9d6b', 'verde-d':'#3c7c53', rojo:'#d84b4b', naranja:'#e07a2e', morado:'#a05a8a', dorado:'#c8912f' } },
    { key: 'aurora', ic: '🌠', name: 'Aurora (degradado)', price: 1100, bgimg: 'linear-gradient(160deg, #0f2027 0%, #203a43 50%, #2c5364 100%)', vars: { panel:'#12222a', panel2:'#183038', line:'#2b4650', ink:'#eafbff', soft:'#a9c6cf', muted:'#7a9aa3', azul:'#38e0c8', 'azul-d':'#20b8a2', verde:'#57e08a', 'verde-d':'#38b86a', rojo:'#ff6b7a', naranja:'#ffb15c', morado:'#9d8bff', dorado:'#ffd85c' } },
    { key: 'chicle', ic: '🍬', name: 'Chicle (degradado)', price: 1000, bgimg: 'linear-gradient(160deg, #f9d423 0%, #ff6fb5 55%, #a06bff 100%)', vars: { panel:'#fff5fb', panel2:'#ffe9f5', line:'#f3cbe2', ink:'#3a2036', soft:'#7d5570', muted:'#a37f97', azul:'#c65baa', 'azul-d':'#a3428a', verde:'#57a06f', 'verde-d':'#417c54', rojo:'#e0587a', naranja:'#e08a3c', morado:'#9a5fd0', dorado:'#c8912f' } },
    { key: 'amatista', ic: '🔮', name: 'Amatista (degradado)', price: 1300, bgimg: 'linear-gradient(160deg, #2b0f3a 0%, #4a1a6a 50%, #7b2ff7 100%)', vars: { panel:'#241033', panel2:'#301545', line:'#452a5e', ink:'#f2e9ff', soft:'#c3a9e0', muted:'#9077b0', azul:'#b18bff', 'azul-d':'#8b5fe0', verde:'#4fd6a0', 'verde-d':'#38a87d', rojo:'#ff6b9a', naranja:'#ffab5d', morado:'#d29bff', dorado:'#ffd24d' } },
    { key: 'marea', ic: '💧', name: 'Marea (degradado)', price: 1000, bgimg: 'linear-gradient(160deg, #43cea2 0%, #2b78c4 100%)', vars: { panel:'#f0fbf8', panel2:'#e0f4ee', line:'#c2e2d8', ink:'#0d2a2a', soft:'#3d6b66', muted:'#6f9a94', azul:'#0e8a9b', 'azul-d':'#0a6777', verde:'#12a578', 'verde-d':'#0d805c', rojo:'#e2585b', naranja:'#e08a3c', morado:'#5b7ac9', dorado:'#c8912f' } },
    { key: 'arcoiris', ic: '🌈', name: 'Arcoíris (degradado)', price: 1500, bgimg: 'linear-gradient(120deg, #f6d365 0%, #fda085 25%, #f78ca0 50%, #a18cd1 75%, #84fab0 100%)', vars: { panel:'#fffaf3', panel2:'#fff0e6', line:'#efd9c6', ink:'#33262e', soft:'#6f5a63', muted:'#9a8590', azul:'#c25ea0', 'azul-d':'#a04680', verde:'#48a06a', 'verde-d':'#367c50', rojo:'#e0596a', naranja:'#e08a3c', morado:'#8a6bd0', dorado:'#c8912f' } },
    { key: 'cosmos', ic: '🪐', name: 'Cosmos (degradado)', price: 1400, bgimg: 'linear-gradient(160deg, #0b0f2a 0%, #1a1a4a 45%, #3a1c6a 100%)', vars: { panel:'#12163a', panel2:'#1a1f4d', line:'#2c2f66', ink:'#e9ecff', soft:'#aab0e0', muted:'#7d84b8', azul:'#6b8bff', 'azul-d':'#4960d6', verde:'#3fd6b0', 'verde-d':'#2fa88a', rojo:'#ff6b8f', naranja:'#ffb15c', morado:'#b78bff', dorado:'#ffd24d' } }
  ];

  function $(id) { return document.getElementById(id); }
  function show(id) { $(id).classList.remove('hidden'); }
  function hide(id) { $(id).classList.add('hidden'); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function countTema(n) { var c = 0; for (var k = 0; k < PREGUNTAS.length; k++) if (PREGUNTAS[k].tema === n) c++; return c; }
  // ¿alguna opción se refiere a otras por letra/posición? (A y B, Solo A, Ninguna, todas/anteriores...)
  function esMeta(ops) {
    return ops.some(function (o) {
      return /\b[abcd]\s*y\s*[abcd]\b/i.test(o) || /\bs[oó]lo\s+[abcd]\b/i.test(o) || /\bsolo\s+[abcd]\b/i.test(o) ||
        /\bningun[ao]\b/i.test(o) || /anteriores/i.test(o) || /\bambas\b/i.test(o) || /(todas|ambas) son/i.test(o) || /son (correctas|ciertas|falsas|verdaderas)/i.test(o);
    });
  }
  // orden de presentación de las 4 opciones (barajado, salvo preguntas meta)
  function makeOrder(q) { var base = q.opciones.map(function (o, i) { return i; }); return (esMeta(q.opciones) || esMulti(q)) ? base : shuffle(base); }
  function esMulti(q) { return Array.isArray(q.multi); }   // pregunta de marcar TODAS las ciertas (tema 29)

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
  var LS = 'repasoOpos.cfg', LS_STATS = 'repasoOpos.stats', LS_DISC = 'repasoOpos.discarded', LS_INV = 'repasoOpos.inv', LS_COINS = 'repasoOpos.coins', LS_FAV = 'repasoOpos.fav', LS_COSMET = 'repasoOpos.cosmet';
  function saveCfg() { try { localStorage.setItem(LS, JSON.stringify({ sel: Array.from(st.seleccion), size: st.size, test: st.modoTest, shuffle: st.barajar, smart: st.smart, juego: st.juego, sonido: st.sonido, tiempo: st.tiempo, eink: st.eink, adapt: st.adapt, autoX2: st.autoX2 })); } catch (e) {} }
  function loadCfg() {
    try {
      var c = JSON.parse(localStorage.getItem(LS) || '{}');
      if (c.sel) c.sel.forEach(function (n) { if (countTema(n)) st.seleccion.add(n); });
      if (typeof c.size === 'number') st.size = c.size;
      ['test:modoTest', 'shuffle:barajar', 'smart:smart', 'juego:juego', 'sonido:sonido', 'tiempo:tiempo', 'eink:eink', 'adapt:adapt', 'autoX2:autoX2'].forEach(function (p) { var k = p.split(':'); if (typeof c[k[0]] === 'boolean') st[k[1]] = c[k[0]]; });
    } catch (e) {}
  }
  function loadStats() { try { stats = JSON.parse(localStorage.getItem(LS_STATS) || '{}') || {}; } catch (e) { stats = {}; } }
  function saveStats() { try { localStorage.setItem(LS_STATS, JSON.stringify(stats)); } catch (e) {} }
  function loadDisc() { try { (JSON.parse(localStorage.getItem(LS_DISC) || '[]') || []).forEach(function (id) { discarded.add(id); }); } catch (e) {} }
  function saveDisc() { try { localStorage.setItem(LS_DISC, JSON.stringify(Array.from(discarded))); } catch (e) {} }
  function loadFav() { try { (JSON.parse(localStorage.getItem(LS_FAV) || '[]') || []).forEach(function (id) { favorites.add(id); }); } catch (e) {} }
  function saveFav() { try { localStorage.setItem(LS_FAV, JSON.stringify(Array.from(favorites))); } catch (e) {} }
  function loadInv() {
    var d = { c5050: 3, cpub: 2, ctel: 1, cx2: 1, csh: 1, ctime: 2 };
    try { var s = localStorage.getItem(LS_INV); if (s) { var o = JSON.parse(s) || {}; LIFEDEF.forEach(function (l) { inv[l.key] = typeof o[l.key] === 'number' ? o[l.key] : 0; }); } else { inv = d; saveInv(); } } catch (e) { inv = d; }
  }
  function saveInv() { try { localStorage.setItem(LS_INV, JSON.stringify(inv)); } catch (e) {} }
  function loadCoins() { try { coins = parseInt(localStorage.getItem(LS_COINS) || '0', 10) || 0; } catch (e) { coins = 0; } }
  function loadCosmet() { try { var o = JSON.parse(localStorage.getItem(LS_COSMET) || '{}') || {}; cosmet.temas = (o.temas && o.temas.length) ? o.temas : ['clasico']; cosmet.tema = o.tema || 'clasico'; cosmet.extras = o.extras || []; cosmet.confeti = !!o.confeti; cosmet.estrellas = !!o.estrellas; cosmet.monedas = !!o.monedas; cosmet.finde = !!o.finde; cosmet.coinMult = o.coinMult || 1; cosmet.trofeos = o.trofeos || []; } catch (e) {} }
  function saveCosmet() { try { localStorage.setItem(LS_COSMET, JSON.stringify(cosmet)); } catch (e) {} }
  function saveCoins() { try { localStorage.setItem(LS_COINS, String(coins)); } catch (e) {} }
  function getStat(id) { return stats[id] || { ok: 0, fail: 0, seen: 0, t: 0, lo: undefined }; }
  function estadoDe(id) { var s = stats[id]; if (!s || s.lo === undefined) return 'nue'; return s.lo ? 'dom' : 'fal'; }

  function updateCoinsUI() { ['coins', 'coinsRes', 'coinsShop'].forEach(function (id) { var e = $(id); if (e) e.textContent = coins; }); }

  /* ---------------- MODO KINDLE (e-ink) ---------------- */
  function applyEink() {
    document.body.classList.toggle('eink', st.eink);
    var b = $('einkBtn'); if (b) b.classList.toggle('on', st.eink);
    var t = $('tgEink'); if (t) t.checked = st.eink;
  }
  // deja el HUD sin cuenta atrás (partida relajada o modo Kindle)
  function noTimer() {
    stopTimer(); st.timeLeft = QTIME;
    var bar = $('timeBar'), lab = $('hTime');
    if (bar) { bar.style.width = '100%'; bar.className = ''; }
    if (lab) { lab.textContent = '⏱ ∞'; lab.className = 'htime'; }
  }

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
  function poolFavoritas() { return poolSeleccion().filter(function (q) { return favorites.has(q.id); }); }
  function updateSelInfo() {
    var pool = poolSeleccion(), info = $('selInfo');
    if (discarded.size) { $('discCount').textContent = discarded.size; show('restoreDisc'); } else hide('restoreDisc');
    if (!st.seleccion.size) { $('startBtn').disabled = true; info.textContent = 'Selecciona al menos un tema'; hide('failBtn'); hide('favBtnHome'); hide('progSum'); hide('resetProg'); return; }
    $('startBtn').disabled = false;
    var n = st.seleccion.size, toma = st.size === 0 ? pool.length : Math.min(st.size, pool.length);
    info.textContent = n + (n === 1 ? ' tema' : ' temas') + ' · ' + pool.length + ' preguntas · esta sesión: ' + toma;
    var dom = 0, fal = 0, nue = 0, fav = 0; pool.forEach(function (q) { var e = estadoDe(q.id); if (e === 'dom') dom++; else if (e === 'fal') fal++; else nue++; if (favorites.has(q.id)) fav++; });
    $('progSum').innerHTML = '<span class="d">🟢 <b>' + dom + '</b> dominadas</span><span class="f">🔴 <b>' + fal + '</b> falladas</span><span>⚪ <b>' + nue + '</b> sin ver</span>' + (fav ? '<span style="color:var(--dorado)">⭐ <b>' + fav + '</b> buenas</span>' : ''); show('progSum');
    if (fal > 0) { $('failBtn').textContent = '🔴 Repasar solo mis falladas (' + fal + ')'; $('failBtn').disabled = false; show('failBtn'); } else hide('failBtn');
    if (fav > 0) { $('favBtnHome').textContent = '⭐ Repasar solo mis buenas (' + fav + ')'; $('favBtnHome').disabled = false; show('favBtnHome'); } else hide('favBtnHome');
    if (dom + fal > 0 || Object.keys(stats).length) show('resetProg'); else hide('resetProg');
  }

  function bindHome() {
    Array.prototype.forEach.call($('sizeSeg').children, function (b) {
      if (parseInt(b.dataset.n, 10) === st.size) { Array.prototype.forEach.call($('sizeSeg').children, function (x) { x.classList.remove('on'); }); b.classList.add('on'); }
      b.addEventListener('click', function () { Array.prototype.forEach.call($('sizeSeg').children, function (x) { x.classList.remove('on'); }); b.classList.add('on'); st.size = parseInt(b.dataset.n, 10); updateSelInfo(); saveCfg(); });
    });
    var tg = { tgTest: 'modoTest', tgShuffle: 'barajar', tgSmart: 'smart', tgJuego: 'juego', tgSonido: 'sonido', tgTiempo: 'tiempo', tgAdapt: 'adapt' };
    Object.keys(tg).forEach(function (id) { $(id).checked = st[tg[id]]; $(id).addEventListener('change', function () { st[tg[id]] = this.checked; saveCfg(); }); });
    $('tgEink').checked = st.eink;
    $('tgEink').addEventListener('change', function () { st.eink = this.checked; applyEink(); saveCfg(); renderTemas(); });
    $('selAll').addEventListener('click', function () {
      var disp = TEMAS.filter(function (t) { return countTema(t.n); }).map(function (t) { return t.n; });
      var todos = disp.every(function (n) { return st.seleccion.has(n); });
      st.seleccion = new Set(todos ? [] : disp); this.textContent = todos ? 'Seleccionar todos' : 'Quitar todos'; renderTemas(); saveCfg();
    });
    $('startBtn').addEventListener('click', function () { startSession(poolSeleccion(), false); });
    $('failBtn').addEventListener('click', function () { var f = poolFalladas(); if (!f.length) { alert('No tienes falladas en los temas elegidos. ¡Bien!'); return; } startSession(f, false); });
    $('favBtnHome').addEventListener('click', function () { var f = poolFavoritas(); if (!f.length) { alert('Aún no has marcado ninguna pregunta como buena. Toca la ☆ en una tarjeta para marcarla.'); return; } startSession(f, false); });
    $('resetProg').addEventListener('click', function () { if (confirm('¿Reiniciar TODO tu progreso (aciertos y fallos)? No se puede deshacer.')) { stats = {}; saveStats(); renderTemas(); } });
    $('restoreDisc').addEventListener('click', function () { if (confirm('¿Restaurar las ' + discarded.size + ' preguntas descartadas?')) { discarded = new Set(); saveDisc(); renderTemas(); } });
    $('shopBtn').addEventListener('click', openShop);
    $('shopBtn2').addEventListener('click', openShop);
    $('shopClose').addEventListener('click', function () { hide('shop'); });
    $('shop').addEventListener('click', function (e) { if (e.target === this) hide('shop'); });
  }

  /* ---------------- TIENDA ---------------- */
  function openShop() { buildShop(); updateCoinsUI(); show('shop'); }
  function applyTheme() {
    var t = null; for (var i = 0; i < THEMES.length; i++) if (THEMES[i].key === cosmet.tema) t = THEMES[i];
    var root = document.documentElement;
    var keys = ['bg', 'bg2', 'panel', 'panel2', 'line', 'ink', 'soft', 'muted', 'azul', 'azul-d', 'verde', 'verde-d', 'rojo', 'naranja', 'morado', 'dorado'];
    keys.forEach(function (k) { root.style.removeProperty('--' + k); });
    if (t && t.vars) keys.forEach(function (k) { if (t.vars[k]) root.style.setProperty('--' + k, t.vars[k]); });
    // la capa de fondo fija (body::before) usa --pagebg; en temas de degradado la sustituimos por su imagen
    if (t && t.bgimg) root.style.setProperty('--pagebg', t.bgimg);
    else root.style.removeProperty('--pagebg');
    document.body.style.removeProperty('background');
    document.documentElement.style.removeProperty('background');
  }
  function shopHead(wrap, txt) { var h = document.createElement('div'); h.className = 'shophead'; h.textContent = txt; wrap.appendChild(h); }
  function shopRow(wrap, ic, name, desc, sub, label, disabled, cls, onClick) {
    var row = document.createElement('div'); row.className = 'shopitem';
    row.innerHTML = '<div class="sic">' + ic + '</div><div class="sinfo"><div class="sn">' + name + '</div><div class="sd">' + desc + '</div>' + (sub ? '<div class="sown">' + sub + '</div>' : '') + '</div>';
    var btn = document.createElement('button'); btn.className = 'buybtn' + (cls ? ' ' + cls : ''); btn.textContent = label; btn.disabled = disabled;
    btn.addEventListener('click', onClick); row.appendChild(btn); wrap.appendChild(row);
  }
  function buildShop() {
    var wrap = $('shopList'); wrap.innerHTML = '';
    shopHead(wrap, '🎁 Cajas sorpresa (funde puntos rápido)');
    BOXES.forEach(function (it) { shopRow(wrap, it.ic, it.name, it.desc, '', '🪙 ' + it.price, coins < it.price, '', function () { buyBox(it); }); });
    shopHead(wrap, '🃏 Comodines');
    SHOP.forEach(function (it) { shopRow(wrap, it.ic, it.name, it.desc, 'Tienes: ' + (inv[it.key] || 0), '🪙 ' + it.price, coins < it.price, '', function () { buyItem(it); }); });
    shopHead(wrap, '📦 Packs (más baratos por unidad)');
    PACKS.forEach(function (it) { shopRow(wrap, it.ic, it.name, it.desc, 'Tienes: ' + (inv[it.key] || 0), '🪙 ' + it.price, coins < it.price, '', function () { buyPack(it); }); });
    shopHead(wrap, '🎰 Juegos de azar (funde puntos, gana premios)');
    GAMES.forEach(function (g) { shopRow(wrap, g.ic, g.name, g.desc, '', '🪙 ' + g.price + ' · ¡Jugar!', st.spinning || coins < g.price, 'play', function () { gamble(g); }); });
    shopHead(wrap, '✨ Regalos, efectos y mejoras');
    EXTRAS.forEach(function (it) {
      if (it.kind === 'toggle') {
        var owned = cosmet.extras.indexOf(it.key) >= 0, on = !!cosmet[it.flag];
        var label = owned ? (on ? '✓ Activado' : 'Activar') : '🪙 ' + it.price;
        shopRow(wrap, it.ic, it.name, it.desc, owned ? 'Comprado · toca para activar/desactivar' : '', label, owned ? false : coins < it.price, on ? 'own' : (owned ? 'use' : ''), function () { buyExtra(it); });
      } else if (it.kind === 'upgrade') {
        var got = cosmet[it.flag] >= it.val;
        shopRow(wrap, it.ic, it.name, it.desc, got ? '✓ Comprado (permanente)' : '', got ? '✓' : '🪙 ' + it.price, got ? true : coins < it.price, got ? 'own' : '', function () { buyExtra(it); });
      } else {
        shopRow(wrap, it.ic, it.name, it.desc, '', '🪙 ' + it.price, coins < it.price, '', function () { buyExtra(it); });
      }
    });
    shopHead(wrap, '🏆 Colección (solo por presumir, sin ventajas)');
    var got = TROPHIES.filter(function (t) { return cosmet.trofeos.indexOf(t.key) >= 0; });
    var vit = document.createElement('div'); vit.className = 'trophycase';
    vit.innerHTML = got.length ? got.map(function (t) { return '<span title="' + t.name + '">' + t.ic + '</span>'; }).join('') : '<span class="empty">Tu vitrina está vacía… ¡funde puntos aquí!</span>';
    wrap.appendChild(vit);
    TROPHIES.forEach(function (t) {
      var owned = cosmet.trofeos.indexOf(t.key) >= 0;
      shopRow(wrap, t.ic, t.name, owned ? '¡En tu vitrina!' : 'Objeto de lujo, puro capricho', '', owned ? '✓ Tuyo' : '🪙 ' + t.price, owned ? true : coins < t.price, owned ? 'own' : '', function () { buyTrophy(t); });
    });
    shopHead(wrap, '🎨 Temas estéticos');
    THEMES.forEach(function (t) {
      var owned = cosmet.temas.indexOf(t.key) >= 0, active = cosmet.tema === t.key;
      var label = active ? '✓ En uso' : (owned ? 'Usar' : '🪙 ' + t.price);
      shopRow(wrap, t.ic, t.name, active ? 'Tema en uso' : (owned ? 'Comprado' : 'Cambia los colores de toda la app'), '', label, active ? true : (owned ? false : coins < t.price), active ? 'own' : (owned ? 'use' : ''), function () { owned ? useTheme(t) : buyTheme(t); });
    });
  }
  function afterBuy() { sfx('bonus'); buildShop(); updateCoinsUI(); if (!$('study').classList.contains('hidden') && st.juegoEf) renderLifes(); }
  function buyItem(it) { if (coins < it.price) return; coins -= it.price; inv[it.key] = (inv[it.key] || 0) + 1; saveCoins(); saveInv(); afterBuy(); }
  function buyPack(it) { if (coins < it.price) return; coins -= it.price; inv[it.key] = (inv[it.key] || 0) + it.qty; saveCoins(); saveInv(); afterBuy(); }
  function buyBox(it) { if (coins < it.price) return; coins -= it.price; giveBox(it.qty); if (it.coins) giveCoins(it.coins); saveCoins(); saveInv(); afterBuy(); }
  function buyExtra(it) {
    if (it.kind === 'toggle' && cosmet.extras.indexOf(it.key) >= 0) { cosmet[it.flag] = !cosmet[it.flag]; saveCosmet(); buildShop(); return; }
    if (it.kind === 'upgrade' && cosmet[it.flag] >= it.val) return;
    if (coins < it.price) return; coins -= it.price; saveCoins();
    if (it.kind === 'box') { for (var r = 0; r < (it.qty || 1); r++) LIFEDEF.forEach(function (l) { inv[l.key] = (inv[l.key] || 0) + 1; }); saveInv(); }
    else if (it.kind === 'toggle') { if (cosmet.extras.indexOf(it.key) < 0) cosmet.extras.push(it.key); cosmet[it.flag] = true; saveCosmet(); }
    else if (it.kind === 'upgrade') { cosmet[it.flag] = it.val; if (cosmet.extras.indexOf(it.key) < 0) cosmet.extras.push(it.key); saveCosmet(); }
    afterBuy();
  }
  function buyTrophy(t) { if (coins < t.price || cosmet.trofeos.indexOf(t.key) >= 0) return; coins -= t.price; cosmet.trofeos.push(t.key); saveCoins(); saveCosmet(); afterBuy(); }
  function buyTheme(t) { if (coins < t.price) return; coins -= t.price; cosmet.temas.push(t.key); cosmet.tema = t.key; saveCoins(); saveCosmet(); applyTheme(); afterBuy(); }
  function useTheme(t) { cosmet.tema = t.key; saveCosmet(); applyTheme(); buildShop(); }
  /* ---- juegos de azar ---- */
  function giveCoins(n) { coins += n; saveCoins(); }
  function comLabel(keys) { var c = {}, ic = {}; LIFEDEF.forEach(function (l) { ic[l.key] = l.ic; }); keys.forEach(function (k) { c[k] = (c[k] || 0) + 1; }); return Object.keys(c).map(function (k) { return c[k] + '× ' + ic[k]; }).join(', '); }
  function giveComodines(n) { var got = []; for (var i = 0; i < n; i++) { var k = LIFEDEF[Math.floor(Math.random() * LIFEDEF.length)].key; inv[k] = (inv[k] || 0) + 1; got.push(k); } saveInv(); return comLabel(got); }
  function giveBox(q) { for (var r = 0; r < q; r++) LIFEDEF.forEach(function (l) { inv[l.key] = (inv[l.key] || 0) + 1; }); saveInv(); return q + ' de cada comodín'; }
  function grantRandomTheme() { var no = THEMES.filter(function (t) { return t.price > 0 && cosmet.temas.indexOf(t.key) < 0; }); if (no.length) { var t = no[Math.floor(Math.random() * no.length)]; cosmet.temas.push(t.key); saveCosmet(); return 'tema ' + t.ic + ' ' + t.name; } giveCoins(3000); return '+3000 🪙 (ya tienes todos los temas)'; }
  function weightedPick(list) { var tot = 0, i; for (i = 0; i < list.length; i++) tot += list[i].w; var r = Math.random() * tot, acc = 0; for (i = 0; i < list.length; i++) { acc += list[i].w; if (r < acc) return list[i]; } return list[list.length - 1]; }
  function gamble(g) {
    if (st.spinning || coins < g.price) return;
    st.spinning = true; coins -= g.price; saveCoins(); updateCoinsUI();
    var prize = weightedPick(g.prizes);
    var el = $('gambleResult'); el.classList.remove('hidden'); el.className = 'gambleres show';
    var frames = ['🎰', '🍒', '💎', '🔔', '⭐', '🍀', '🪙', '7️⃣', '🎁'];
    function rnd3() { return frames[Math.floor(Math.random() * frames.length)] + ' ' + frames[Math.floor(Math.random() * frames.length)] + ' ' + frames[Math.floor(Math.random() * frames.length)]; }
    var t = 0, iv = setInterval(function () {
      el.textContent = rnd3(); t++;
      if (t > 8) {
        clearInterval(iv); var detail = prize.apply(); st.spinning = false;
        el.className = 'gambleres show' + (prize.jackpot ? ' jackpot' : ''); el.textContent = prize.txt + (detail ? ' → ' + detail : '');
        sfx(prize.jackpot ? 'bonus' : 'life'); if (prize.jackpot) confettiBurst(['🎉', '💎', '🪙', '🎊', '⭐', '🏆']);
        saveInv(); buildShop(); updateCoinsUI();
        if (!$('study').classList.contains('hidden') && st.juegoEf) renderLifes();
      }
    }, 85);
  }

  /* ---------------- SESIÓN ---------------- */
  function ordenarMazo(pool) {
    if (st.smart) {
      // falladas → sin ver → ⭐ buenas (ya vistas) → resto dominadas.
      // Así, cuando ya has visto todo y empieza a repetirse, salen antes tus buenas.
      var g = { fal: [], nue: [], favDom: [], dom: [] };
      pool.forEach(function (q) {
        var e = estadoDe(q.id);
        if (e === 'fal') g.fal.push(q);
        else if (e === 'nue') g.nue.push(q);
        else if (favorites.has(q.id)) g.favDom.push(q);
        else g.dom.push(q);
      });
      return shuffle(g.fal).concat(shuffle(g.nue), shuffle(g.favDom), shuffle(g.dom)); // barajadas dentro de cada grupo
    }
    return st.barajar ? shuffle(pool) : pool.slice();
  }
  // Compone el mazo de la sesión: reserva ~20% para preguntas ya contestadas (dominadas)
  // para ir repasándolas poco a poco, y el 80% con la prioridad normal (falladas + sin ver).
  function buildDeck(pool) {
    var ordered = ordenarMazo(pool);
    var size = st.size;
    if (size <= 0) return ordered;                 // "Todas": sin recorte
    if (!st.smart) return ordered.slice(0, size);  // sin repaso inteligente, comportamiento normal
    var dom = [], resto = [];
    ordered.forEach(function (q) { (estadoDe(q.id) === 'dom' ? dom : resto).push(q); });
    if (!dom.length) return ordered.slice(0, size);   // aún no hay dominadas que repasar
    var nDom = Math.min(dom.length, Math.round(size * 0.2));   // ~20% ya contestadas
    var nResto = size - nDom;
    if (nResto > resto.length) { nResto = resto.length; nDom = Math.min(size - nResto, dom.length); }
    var deck = resto.slice(0, nResto);                          // falladas + sin ver (prioridad)
    shuffle(dom).slice(0, nDom).forEach(function (q) {          // repaso intercalado al azar
      deck.splice(Math.floor(Math.random() * (deck.length + 1)), 0, q);
    });
    return deck;
  }
  function startSession(pool, keepScore) {
    if (!pool || !pool.length) return;
    var mazo = buildDeck(pool);
    st.mazo = mazo; st.deckSize = mazo.length; st.i = 0; st.respondidas = {}; st.sabidas = {}; st.committed = {}; st.repeatCount = {}; st.repInjected = 0;
    if (!keepScore) { st.score = 0; st.best = 0; st.shieldUsed = 0; }   // el repaso de falladas continúa la puntuación
    st.streak = 0; st.pendingX2 = false; st.shield = false; st.lastMile = 0;
    hide('home'); hide('results'); hide('shop'); show('study');
    $('pgTot').textContent = mazo.length;
    st.juegoEf = st.juego || st.eink;                // en Kindle SIEMPRE con juego (puntos y comodines, como la versión normal)
    if (st.juegoEf) show('hud'); else hide('hud');
    window.scrollTo(0, 0); renderCard();
  }
  function temaTitulo(n) { for (var i = 0; i < TEMAS.length; i++) if (TEMAS[i].n === n) return TEMAS[i].corto; return 'Tema ' + n; }

  function renderCard() {
    stopTimer(); stopSpeak();
    var q = st.mazo[st.i];
    st.volteada = false; st.answered = false; st.cardUsed = {}; st.cardStart = Date.now();
    st.order = makeOrder(q); st.correctDisp = st.order.indexOf(q.correcta);   // barajar opciones cada vez
    $('card3d').classList.remove('flip'); var _sc = document.querySelector('.scene'); if (_sc) _sc.style.minHeight = '';
    $('pgCur').textContent = st.i + 1; $('pgLabel').textContent = 'Tarjeta ' + (st.i + 1);
    $('pgBar').style.width = ((st.i) / st.mazo.length * 100) + '%';
    var badge = { dom: '🟢', fal: '🔴', nue: '⚪' }[estadoDe(q.id)] || '';
    var esRepeat = st.juegoEf && st.respondidas.hasOwnProperty(q.id);   // ya contestada en esta partida → repaso adaptativo
    $('temaChip').textContent = (esRepeat ? '🔁 Repaso · ' : '') + badge + ' ' + etiquetaTema(q.tema) + ' · ' + temaTitulo(q.tema);
    $('qText').textContent = q.q; renderBack(q, st.respondidas.hasOwnProperty(q.id) ? st.respondidas[q.id] : null); $('qIdx').textContent = '#' + (st.i + 1);
    $('tapHint').textContent = 'Toca la tarjeta para ver la respuesta'; $('tapHint').className = 'tap-hint pulse';
    $('pointsPop').className = 'pointspop'; $('pointsPop').textContent = '';
    hide('infoMsg'); $('infoMsg').textContent = '';
    hide('knewWrap'); hide('postActions'); hide('optsWrap'); $('optsWrap').innerHTML = ''; resetDiscBtn();
    hide('multiBar'); hide('countHint');
    if (esMulti(q)) {   // ===== modo multirespuesta (tema 29) =====
      hide('showTest'); hide('navFlash'); hide('nextBtn'); $('nextBtn').textContent = 'Siguiente ▶';
      buildMulti(q);
      if (st.juegoEf) {
        show('hud'); renderLifes(); updateScoreUI();
        if (st.autoX2 && !st.pendingX2 && (inv.cx2 || 0) > 0) { inv.cx2--; saveInv(); st.pendingX2 = true; }
        if (st.tiempo && !st.eink) startTimer(); else noTimer();
      } else { hide('hud'); }
      if (st.eink) { show('postActions'); updatePostActions(q); }
      return;
    }
    if (st.juegoEf) {
      show('hud');
      hide('showTest'); hide('navFlash'); hide('nextBtn'); $('nextBtn').textContent = 'Siguiente ▶';
      buildOptions(q);
      if (st.autoX2 && !st.pendingX2 && (inv.cx2 || 0) > 0) { inv.cx2--; saveInv(); st.pendingX2 = true; }   // ×2 automático
      renderLifes(); updateScoreUI();
      if (st.tiempo && !st.eink) startTimer(); else noTimer();   // en Kindle sin cuenta atrás (evita parpadeo e-ink)
      if (st.eink) { show('postActions'); updatePostActions(q); }   // barra fija (Buena/Descartar/Siguiente) en Kindle
    } else {
      hide('hud'); hide('nextBtn'); show('navFlash');
      var hasOpts = st.modoTest && q.opciones && q.opciones.length;
      $('showTest').classList.remove('hidden');
      if (st.eink && hasOpts) {
        // Modo Kindle: opciones visibles por defecto, sin botón (menos toques en el táctil)
        buildOptions(q);
        if (st.respondidas.hasOwnProperty(q.id)) revealOptions(q, st.respondidas[q.id]);
        $('showTest').style.display = 'none';
      } else {
        $('showTest').textContent = st.respondidas.hasOwnProperty(q.id) ? '📝 Opciones' : '📝 Ver opciones (test)';
        $('showTest').style.display = hasOpts ? '' : 'none';
        if (hasOpts && st.respondidas.hasOwnProperty(q.id)) { buildOptions(q); revealOptions(q, st.respondidas[q.id]); }
      }
      $('knowBtn').classList.toggle('on', st.sabidas[q.id] === true);
      $('dunnoBtn').classList.toggle('on', st.sabidas[q.id] === false);
      $('prevBtn').disabled = st.i === 0;
      show('postActions'); updatePostActions(q);   // en modo tarjeta, borrar/me gusta siempre disponibles
    }
  }
  function formatAnswer(a) { return a.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  // Listados de referencia del Tema 30 (se muestran completos al girar la tarjeta)
  var LISTAS30 = {
    transversal: { t: 'Elementos transversales (8)', items: [
      'Comprensión lectora, expresión oral y escrita', 'Comunicación audiovisual', 'Competencia digital',
      'Fomento de la creatividad', 'Educación cívica y en valores', 'Igualdad de género',
      'Educación para la salud', 'Consumo responsable'] },
    ods: { t: 'ODS · Agenda 2030 (17) · las 5P', nota: 'Personas 1-5 · Prosperidad 7-11 · Planeta 6 y 12-15 · Paz 16 · Pacto 17. Clave en educación: 4, 5, 10, 12 y 13.', items: [
      'Fin de la pobreza — Personas', 'Hambre cero — Personas', 'Salud y bienestar — Personas',
      'Educación de calidad — Personas', 'Igualdad de género — Personas', 'Agua limpia y saneamiento — Planeta',
      'Energía no contaminante — Prosperidad', 'Crecimiento económico — Prosperidad',
      'Industria, innovación e infraestructura — Prosperidad', 'Reducción de las desigualdades — Prosperidad',
      'Ciudades y comunidades sostenibles — Prosperidad', 'Consumo responsable — Planeta',
      'Acción por el clima — Planeta', 'Vida submarina — Planeta', 'Vida de ecosistemas terrestres — Planeta',
      'Paz, justicia e instituciones sólidas — Paz', 'Alianzas para lograr los objetivos — Pacto'] },
    reto: { t: 'Retos del siglo XXI (7)', items: [
      'Uso de las TIC', 'Emergencia climática', 'Convivencia', 'Resiliencia',
      'Aprender a lo largo de la vida', 'Desigualdad', 'Consumo responsable'] },
    objetivo: { t: 'Objetivos generales de etapa (17)', nota: '"Convivo hablando y sabiendo que creo y cuido."', items: [
      'Convivencia y ciudadanía — Convivir', 'Trabajo y esfuerzo — Convivir', 'Resolución de conflictos — Convivir',
      'Respeto e igualdad — Convivir', 'Lenguas oficiales — Hablar', 'Lengua extranjera — Hablar',
      'Plurilingüismo — Hablar', 'Competencia matemática — Saber', 'Conocimiento del entorno — Saber',
      'Competencia digital — Crear', 'Expresión artística — Crear', 'Salud y bienestar — Cuidar',
      'Respeto a los animales — Cuidar', 'Desarrollo afectivo — Cuidar', 'Movilidad segura — Cuidar',
      'Sostenibilidad — Cuidar', 'Respeto a la comunidad educativa — Cuidar'] },
    principio: { t: 'Principios pedagógicos (D 106/2022)', nota: 'Resumida (IPS-DULO): "Inés Previene Significativamente con DUA, Proyectos, Lectura y Orientación". · Oficial: "Inés Participa Previniendo Desastres, Trabajando Especialmente, Promoviendo Orientación Activa, Tiene Proyectos, Usa DUA".', groups: {
      'Versión resumida (7) · IPS-DULO': ['Inclusión educativa (INCLUSIÓN)', 'Atención a la diversidad y prevención de dificultades (PREVENCIÓN)', 'Aprendizaje significativo que promueva la autonomía (SIGNIFICATIVO)', 'Diseño Universal para el Aprendizaje / DUA', 'Proyectos significativos y resolución colaborativa (PROYECTOS)', 'Tiempo diario de lectura (LECTURA)', 'Orientación educativa y acción tutorial (ORIENTACIÓN)'],
      'Versión oficial (13)': ['Inclusión educativa', 'Participación y convivencia', 'Prevención de dificultades', 'Desarrollo progresivo (Perfil de salida)', 'Trabajo transversal', 'Especial consideración de las áreas instrumentales', 'Promoción desde todas las áreas', 'Orientación educativa, tutorial y emocional', 'Aprendizaje significativo (autonomía)', 'Tiempo diario de lectura', 'Proyectos significativos', 'Uso de las lenguas oficiales (apoyo)', 'Diseño Universal para el Aprendizaje (DUA)'] } },
    sda: { t: 'Características de las SDA · enfoque de enseñanza (7)', nota: '"Gradualmente jugamos e investigamos la tecnología activa a las familias y eso le da significado." (NO son los principios pedagógicos.)', items: [
      'Gradualidad', 'Juego', 'Investigación e interdisciplinariedad', 'Tecnología', 'Actividad', 'Familia', 'Significatividad'] },
    ce: { t: 'Competencias específicas por área (pin 9·8·8·6)', groups: {
      'Lengua Castellana y Literatura (9)': ['Multilingüismo', 'Comprensión oral', 'Comprensión escrita', 'Expresión oral', 'Expresión escrita', 'Interacción', 'Mediación', 'Lectura autónoma', 'Competencia literaria'],
      'Conocimiento del Medio (8)': ['Competencia digital', 'Proyectos, investigación y pensamiento computacional', 'Pensamiento científico', 'Hábitos saludables', 'Impacto humano y sostenibilidad', 'Conciencia histórica', 'Organización política y territorial', 'Patrimonio'],
      'Matemáticas (8)': ['Resolución de problemas', 'Razonamiento y conjeturas', 'Modelización', 'Pensamiento computacional', 'Representaciones', 'Comunicación matemática', 'Conexiones con la vida real', 'Destrezas afectivas'],
      'Educación Artística (6)': ['Patrimonio y cultura visual', 'Valoración de obras', 'Terminología artística', 'Técnicas y materiales', 'Recursos digitales', 'Proceso creativo colaborativo'] } },
    saber: { t: 'Saberes/bloques por área (pin 3·3·6·2)', groups: {
      'Lengua Castellana y Literatura (3)': ['Lengua y uso', 'Estrategias comunicativas', 'Lectura y literatura'],
      'Conocimiento del Medio (3)': ['Cultura científica', 'Tecnología y digitalización', 'Sociedades y territorios'],
      'Matemáticas (6)': ['Sentido numérico', 'Estimación y medición', 'Espacial-geométrico', 'Incertidumbre y probabilidad', 'Análisis de datos y estadística', 'Pensamiento computacional'],
      'Educación Artística (2)': ['Percepción y análisis', 'Experimentación y creación'] } }
  };
  function renderList30(cat) {
    var L = LISTAS30[cat]; if (!L) return '';
    var body = '';
    if (L.groups) {
      for (var g in L.groups) {
        body += '<div class="listgrp"><b>' + esc(g) + '</b><ol>';
        L.groups[g].forEach(function (it) { body += '<li>' + esc(it) + '</li>'; });
        body += '</ol></div>';
      }
    } else {
      body += '<ol class="listol">';
      L.items.forEach(function (it) { body += '<li>' + esc(it) + '</li>'; });
      body += '</ol>';
    }
    if (L.nota) body += '<div class="listnota">' + esc(L.nota) + '</div>';
    return '<div class="anslist"><span class="exlab">📋 Listado completo · ' + esc(L.t) + '</span>' + body + '</div>';
  }
  // Tema 27: libros de psicología/desarrollo con títulos parecidos (para no confundirlos).
  // Se muestran juntos en el reverso, con una clave, resaltando el de la tarjeta actual.
  var PSICO27 = [
    { a: 'Piaget', o: 'Psicología de la inteligencia', y: 1975, e: 'Psiqué', k: 'los estadios del desarrollo de la inteligencia' },
    { a: 'Vygotsky', o: 'Pensamiento y lenguaje', y: 2010, e: 'Paidós', k: 'la zona de desarrollo próximo (lo social)' },
    { a: 'Ausubel', o: 'Adquisición y retención del conocimiento', y: 2002, e: 'Paidós', k: 'el aprendizaje significativo' },
    { a: 'Beltrán y Bueno', o: 'Psicología de la educación', y: 1987, e: 'Eudema', k: 'manual GENERAL de psicología educativa' },
    { a: 'Córdoba y Descals', o: 'Psicología del desarrollo en edad escolar', y: 2010, e: 'Pirámide', k: 'el desarrollo centrado en la ETAPA ESCOLAR (6-12)' }
  ];
  function renderPsico27(cita) {
    if (!cita || !PSICO27.some(function (b) { return cita.indexOf(b.o) >= 0; })) return '';
    var body = '<div class="anslist psico"><span class="exlab">🧠 No los confundas · Psicología y desarrollo</span><ul class="psicolist">';
    PSICO27.forEach(function (b) {
      var cur = cita.indexOf(b.o) >= 0;
      body += '<li' + (cur ? ' class="cur"' : '') + '><b>' + esc(b.a) + '</b> · «' + esc(b.o) + '» (' + b.y + ', ' + esc(b.e) + ') → ' + esc(b.k) + '</li>';
    });
    return body + '</ul></div>';
  }
  function renderBack(q, chosen) {
    if (esMulti(q)) {
      var m = q.multi || [], h2 = '';
      h2 += '<div class="ansok"><span class="oktxt">✔ Cierto: ' + (m.length ? m.map(function (i) { return '«' + esc(q.opciones[i]) + '»'; }).join(' · ') : 'ninguna de las opciones') + '</span></div>';
      if (q.a) h2 += '<div class="ansexp"><span class="exlab">Por qué</span>' + formatAnswer(q.a) + '</div>';
      if (q.cita) h2 += '<div class="anscita"><span class="exlab">📚 Cita (APA)</span>' + formatAnswer(q.cita) + '</div>';
      $('aText').innerHTML = h2; return;
    }
    var opc = q.opciones && q.opciones.length, html = '';
    if (opc) html += '<div class="ansok"><span class="okbadge">' + LETRAS[st.correctDisp] + '</span><span class="oktxt">' + esc(q.opciones[q.correcta]) + '</span></div>';
    html += '<div class="ansexp"><span class="exlab">Por qué</span>' + formatAnswer(q.a) + '</div>';
    if (q.cita) html += '<div class="anscita"><span class="exlab">📚 Cita (APA)</span>' + formatAnswer(q.cita) + '</div>';
    if (opc && chosen != null && chosen !== q.correcta) html += '<div class="anschosen">Marcaste la <b>' + LETRAS[st.order.indexOf(chosen)] + '</b> («' + esc(q.opciones[chosen]) + '»): no es la válida.</div>';
    if (q.cat) html += renderList30(q.cat);
    if (q.tema === 27) html += renderPsico27(q.cita);
    $('aText').innerHTML = html;
  }
  function hintExpl() { var h = $('tapHint'); h.textContent = '👆 Toca la tarjeta para ver la explicación'; h.classList.add('pulse'); }
  function fitScene() {
    // al ver el reverso, la escena crece para que la cita/explicación no se corten (ni en horizontal ni con citas largas)
    var scene = document.querySelector('.scene'); if (!scene || st.eink) return;
    if (st.volteada) {
      var back = document.querySelector('.back'), front = document.querySelector('.front');
      var need = Math.max(back ? back.scrollHeight : 0, front ? front.scrollHeight : 0);
      if (need > 0) scene.style.minHeight = (need + 6) + 'px';
    } else { scene.style.minHeight = ''; }
  }
  function flip() {
    st.volteada = !st.volteada; $('card3d').classList.toggle('flip', st.volteada);
    fitScene();
    var h = $('tapHint');
    if (st.volteada) { h.textContent = 'Toca para volver a la pregunta'; h.classList.remove('pulse'); }
    else { h.textContent = 'Toca la tarjeta para ver la respuesta'; h.classList.add('pulse'); }
  }

  /* ---------------- OPCIONES ---------------- */
  function buildOptions(q) {
    var wrap = $('optsWrap'); wrap.innerHTML = '';
    st.order.forEach(function (orig, disp) {
      var b = document.createElement('button'); b.className = 'opt'; b.type = 'button'; b.dataset.idx = disp; b.dataset.orig = orig;
      b.innerHTML = '<span class="k">' + LETRAS[disp] + '</span><span>' + esc(q.opciones[orig]) + '</span>';
      b.addEventListener('click', function () { onAnswer(q, orig, b); });
      wrap.appendChild(b);
    });
    show('optsWrap');
  }
  // ----- multirespuesta -----
  function buildMulti(q) {
    var wrap = $('optsWrap'); wrap.innerHTML = '';
    q.opciones.forEach(function (txt, disp) {
      var b = document.createElement('button'); b.className = 'opt multi'; b.type = 'button'; b.dataset.idx = disp;
      b.innerHTML = '<span class="k">' + LETRAS[disp] + '</span><span>' + esc(txt) + '</span>';
      b.addEventListener('click', function () { if (st.answered) return; b.classList.toggle('sel'); });
      wrap.appendChild(b);
    });
    show('optsWrap'); show('multiBar'); $('checkBtn').disabled = false;
    $('countHint').textContent = ''; hide('countHint');
  }
  function checkMulti(q, timeout) {
    if (st.answered) return;
    st.answered = true; stopTimer(); disableLifes(); $('checkBtn').disabled = true;
    var correctSet = q.multi || [], btns = $('optsWrap').children, fully = true;
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i], disp = +b.dataset.idx, isC = correctSet.indexOf(disp) >= 0, isS = b.classList.contains('sel');
      b.classList.add('lock');
      if (isC && isS) b.classList.add('correct');
      else if (isC && !isS) { b.classList.add('missed'); fully = false; }
      else if (!isC && isS) { b.classList.add('wrong'); fully = false; }
      else b.classList.add('dim');
    }
    if (timeout) fully = false;
    renderBack(q, null); st.sabidas[q.id] = fully; hide('multiBar');
    if (st.juegoEf) {
      if (fully) { onCorrect(q); hide('knewWrap'); $('nextBtn').textContent = 'Siguiente ▶'; show('nextBtn'); }
      else onWrong(q, false);
      if (!fully || st.cardUsed.c5050 || st.cardUsed.cpub || st.cardUsed.ctel) scheduleRepeat(q);
    } else { show('postActions'); updatePostActions(q); $('nextBtn').textContent = 'Siguiente ▶'; show('nextBtn'); }
    hintExpl();
  }
  // Repaso adaptativo: re-inyecta una pregunta "dura" unas cartas más adelante en la misma partida.
  function scheduleRepeat(q) {
    if (!st.adapt || !st.juegoEf) return;
    var id = q.id;
    if ((st.repeatCount[id] || 0) >= 1) return;                        // como máximo 1 repaso por pregunta
    var budget = Math.max(1, Math.ceil((st.deckSize || st.mazo.length) * 0.15));  // hasta un 15% extra
    if ((st.repInjected || 0) >= budget) return;                      // presupuesto de repasos agotado
    if (st.mazo.length - st.i < 3) return;                            // sin hueco por delante
    var maxOff = st.mazo.length - st.i;                               // puede añadirse al final (crece el total)
    var off = Math.min(3 + Math.floor(Math.random() * 4), maxOff);   // 3-6 cartas más adelante
    st.mazo.splice(st.i + off, 0, q);
    st.repeatCount[id] = (st.repeatCount[id] || 0) + 1;
    st.repInjected = (st.repInjected || 0) + 1;
    $('pgTot').textContent = st.mazo.length;                          // suma como extra, con tope del 15%
  }
  function esDura(q, idx, timeout) {
    var fallo = timeout || idx !== q.correcta;
    var cu = st.cardUsed || {};
    var ayuda = cu.c5050 || cu.cpub || cu.ctel;                        // solo pistas de verdad (no escudo/×2/tiempo)
    var lenta = (Date.now() - (st.cardStart || Date.now())) > 30000;   // dudó más de la cuenta (>30 s)
    return fallo || ayuda || lenta;
  }
  function onAnswer(q, idx, btn) {
    if (st.juegoEf && st.answered) return;
    if (!st.juegoEf && st.respondidas.hasOwnProperty(q.id)) return;
    st.respondidas[q.id] = idx;
    if (st.juegoEf) {
      st.answered = true; stopTimer(); if (btn) btn.classList.add('picked');
      revealOptions(q, idx); renderBack(q, idx); disableLifes();
      if (idx === q.correcta) onCorrect(q); else onWrong(q, false);
      if (esDura(q, idx, false)) scheduleRepeat(q);
      hintExpl();
    } else { revealOptions(q, idx); renderBack(q, idx); }
  }
  function revealOptions(q, chosen) {
    var btns = $('optsWrap').children;
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i], orig = parseInt(b.dataset.orig, 10); b.classList.add('lock');
      if (orig === q.correcta) b.classList.add('correct');
      else if (orig === chosen) b.classList.add('wrong');
      else if (!b.classList.contains('gone')) b.classList.add('dim');
    }
    if (!st.juegoEf) { var h = $('tapHint'); h.textContent = (chosen === q.correcta) ? '✅ ¡Correcto! Toca la tarjeta para ampliar.' : '❌ Correcta: ' + LETRAS[st.correctDisp] + '. Toca la tarjeta para ver la explicación.'; h.classList.remove('pulse'); }
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
  function confettiBurst(customEmo) {
    if (st.eink) return;
    var emo = customEmo;
    if (!emo) { emo = []; if (cosmet.confeti) emo = emo.concat(['🎉', '🎊', '🥳']); if (cosmet.estrellas) emo = emo.concat(['🌟', '⭐', '✨', '💫']); if (cosmet.monedas) emo = emo.concat(['🪙', '💰', '🤑']); }
    if (!emo.length) return;
    for (var i = 0; i < 16; i++) {
      var s = document.createElement('span'); s.className = 'confetti'; s.textContent = emo[Math.floor(Math.random() * emo.length)];
      s.style.left = (Math.random() * 100) + 'vw';
      s.style.fontSize = (14 + Math.random() * 18) + 'px';
      s.style.animationDuration = (1.1 + Math.random() * 1.1) + 's';
      s.style.animationDelay = (Math.random() * 0.25) + 's';
      document.body.appendChild(s);
      (function (el) { setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2600); })(s);
    }
  }

  function onCorrect(q) {
    sfx('ok');
    st.streak++; if (st.streak > st.best) st.best = st.streak;
    // sin racha, pocos puntos; con cada acierto seguido, sustancialmente más
    var pts = 10 * st.streak + Math.round(st.timeLeft / 10), doubled = st.pendingX2;
    if (doubled) { pts *= 2; st.pendingX2 = false; sfx('bonus'); }
    st.score += pts; coins += Math.round(pts * (cosmet.coinMult || 1)); saveCoins();
    pop('+' + pts + (st.streak >= 2 ? ' 🔥×' + st.streak : ''), doubled ? 'bonus' : '');
    updateScoreUI(); updateCoinsUI(); renderLifes();
    if (st.streak % 5 === 0 && st.streak !== st.lastMile) { st.lastMile = st.streak; grantBonus(); }
    confettiBurst();
    if (!st.eink) show('knewWrap');
    show('postActions'); updatePostActions(q);
  }
  function onWrong(q, timeout) {
    st.sabidas[q.id] = false;
    if (st.shield) { st.shield = false; st.shieldUsed++; pop('🛡️ Protegido (racha a salvo)', 'bonus'); sfx('life'); }
    else { st.streak = 0; sfx('bad'); pop(timeout ? '⏱ ¡Tiempo!' : '✗ Fallo', 'bad'); }
    updateScoreUI(); renderLifes(); $('nextBtn').textContent = 'Siguiente ▶'; show('nextBtn');
    show('postActions'); updatePostActions(q);
  }
  function onTimeout() {
    if (st.answered) return; var q = st.mazo[st.i];
    if (esMulti(q)) { checkMulti(q, true); return; }
    st.answered = true;
    var btns = $('optsWrap').children;
    for (var i = 0; i < btns.length; i++) { var b = btns[i]; b.classList.add('lock'); if (parseInt(b.dataset.orig, 10) === q.correcta) b.classList.add('correct'); else b.classList.add('dim'); }
    renderBack(q, null); disableLifes(); onWrong(q, true); scheduleRepeat(q); hintExpl();
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
    updateAutoX2Btn();
  }
  function updateAutoX2Btn() {
    var b = $('autoX2Btn'); if (!b) return;
    b.classList.toggle('on', st.autoX2);
    b.textContent = st.autoX2 ? ('⚡ ×2 auto ON · quedan ' + (inv.cx2 || 0)) : '⚡ ×2 auto: OFF';
  }
  function disableLifes() { Array.prototype.forEach.call($('lifes').children, function (b) { b.disabled = true; }); }

  function useLife(key) {
    if (st.answered || (inv[key] || 0) <= 0 || st.cardUsed[key]) return;
    var q = st.mazo[st.i];
    if (key === 'c5050') {
      var wrongIdx = []; q.opciones.forEach(function (o, i) { if (i !== q.correcta) wrongIdx.push(i); });
      wrongIdx = shuffle(wrongIdx).slice(0, 2);
      Array.prototype.forEach.call($('optsWrap').children, function (b) { if (wrongIdx.indexOf(parseInt(b.dataset.orig, 10)) >= 0) b.classList.add('gone'); });
    } else if (key === 'cpub') { publico(q); }
    else if (key === 'ctel') { telefono(q); }
    else if (key === 'ctime') { st.timeLeft = Math.min(QTIME, st.timeLeft + 15); updateTimeUI(); }
    else if (key === 'cx2') { st.pendingX2 = true; }
    else if (key === 'csh') { st.shield = true; }
    inv[key]--; saveInv(); st.cardUsed[key] = true; sfx('life'); renderLifes();
  }

  function publico(q) {
    var opts = Array.prototype.slice.call($('optsWrap').children).filter(function (b) { return !b.classList.contains('gone'); });
    var disp = opts.map(function (b) { return parseInt(b.dataset.idx, 10); });
    var acierta = Math.random() < (cosmet.finde ? 0.85 : 0.58);
    var star = st.correctDisp;
    if (!acierta || disp.indexOf(star) < 0) { var w = disp.filter(function (i) { return i !== st.correctDisp; }); if (w.length) star = w[Math.floor(Math.random() * w.length)]; }
    var wt = {}; disp.forEach(function (i) { wt[i] = 4 + Math.random() * 8; }); wt[star] += 6 + Math.random() * 9;
    var sum = disp.reduce(function (s, i) { return s + wt[i]; }, 0), acc = 0, perc = {};
    disp.forEach(function (i, k) { perc[i] = (k === disp.length - 1) ? (100 - acc) : Math.round(wt[i] / sum * 100); acc += perc[i]; });
    opts.forEach(function (b) { var i = parseInt(b.dataset.idx, 10); var bar = document.createElement('span'); bar.className = 'pubbar'; bar.innerHTML = '<i style="width:' + Math.max(4, perc[i]) + '%"></i><em>' + perc[i] + '%</em>'; b.appendChild(bar); });
  }
  function telefono(q) {
    var msg, r = Math.random();
    if (r < 0.2) { msg = '📞 «¡Uf! No me dio tiempo a mirarla bien…»'; }
    else {
      var acierta = Math.random() < 0.55, seguro = Math.random() < 0.45;
      var disp = st.order.map(function (o, i) { return i; }), pick;
      if (acierta) pick = st.correctDisp; else { var w = disp.filter(function (i) { return i !== st.correctDisp; }); pick = w[Math.floor(Math.random() * w.length)]; }
      var frase;
      if (acierta) frase = seguro ? ('Casi seguro que es la ' + LETRAS[pick] + '.') : ('Me suena que es la ' + LETRAS[pick] + ', pero no lo juraría…');
      else frase = seguro ? ('Yo diría que es la ' + LETRAS[pick] + '…') : ('No estoy nada seguro, ¿quizá la ' + LETRAS[pick] + '?');
      msg = '📞 «' + frase + '»';
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
  function updatePostActions(q) {
    var lb = $('likeBtn'); if (!lb || !q) return;
    var isf = favorites.has(q.id);
    lb.classList.toggle('on', isf);
    lb.textContent = isf ? '⭐ Guardada' : '⭐ Me gusta';
  }
  function toggleFav() {
    var q = st.mazo[st.i]; if (!q) return;
    if (favorites.has(q.id)) favorites.delete(q.id);
    else { favorites.add(q.id); sfx('life'); }
    saveFav(); updatePostActions(q);
  }
  function resetDiscBtn() { st.discArm = false; var db = $('discBtn'); if (db) { db.textContent = '🗑️ Descartar'; db.classList.remove('arm'); } }
  function discardCurrent() {
    var q = st.mazo[st.i]; if (!q) return;
    // doble toque: 1º arma («¿Seguro?»), 2º descarta. Sin diálogo nativo, funciona en el Paperwhite.
    if (!st.discArm) { st.discArm = true; var db = $('discBtn'); if (db) { db.textContent = '🗑️ ¿Seguro?'; db.classList.add('arm'); } return; }
    st.discArm = false;
    discarded.add(q.id); saveDisc(); favorites.delete(q.id); saveFav(); st.committed[q.id] = true;
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
    $('resSub').textContent = (evaluadas ? ('Sabías ' + know + ' de ' + evaluadas + ' tarjetas · progreso guardado') : 'Progreso guardado') + (st.repInjected ? ' · 🔁 ' + st.repInjected + ' repasos' : '');
    $('resTemas').textContent = Array.from(st.seleccion).sort(function (a, b) { return a - b; }).map(function (n) { return n === 0 ? 'REPASO' : 'T' + n; }).join(' · ') + ' · ' + total + ' tarjetas';
    if (st.juegoEf) {
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
    $('likeBtn').addEventListener('click', toggleFav);
    $('discBtn').addEventListener('click', discardCurrent);
    $('paNext').addEventListener('click', function () { go(1); });
    $('checkBtn').addEventListener('click', function () { var q = st.mazo[st.i]; if (esMulti(q)) checkMulti(q, false); });
    $('countBtn').addEventListener('click', function () { var q = st.mazo[st.i]; if (!esMulti(q)) return; var n = (q.multi || []).length; $('countHint').textContent = n === 0 ? 'Debes marcar: NINGUNA' : ('Debes marcar: ' + n + (n === 1 ? ' opción' : ' opciones')); show('countHint'); });
    $('autoX2Btn').addEventListener('click', function () {
      st.autoX2 = !st.autoX2; saveCfg();
      // si lo activas a mitad de pregunta (sin responder aún), arma el ×2 al momento
      if (st.autoX2 && !st.pendingX2 && (inv.cx2 || 0) > 0 && st.juegoEf && !st.answered) { inv.cx2--; saveInv(); st.pendingX2 = true; }
      updateAutoX2Btn(); if (st.juegoEf) renderLifes();
    });
    $('einkBtn').addEventListener('click', function () {
      st.eink = !st.eink; applyEink(); saveCfg();
      st.juegoEf = st.juego || st.eink; stopTimer(); renderCard();   // aplica el cambio en la tarjeta actual
    });
    $('exitBtn').addEventListener('click', function () { if (confirm('¿Salir? Se guardará el progreso de lo respondido.')) { commitCard(st.mazo[st.i].id); stopTimer(); stopSpeak(); hide('study'); show('home'); renderTemas(); } });
    var x0 = null, scene = document.querySelector('.scene');
    scene.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    scene.addEventListener('touchend', function (e) { if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 70) { if (dx < 0) { if (!st.juegoEf || st.answered) go(1); } else { if (!st.juegoEf) go(-1); } } }, { passive: true });
    document.addEventListener('keydown', function (e) {
      if (!$('shop').classList.contains('hidden') && e.key === 'Escape') { hide('shop'); return; }
      if ($('study').classList.contains('hidden')) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (st.juegoEf && st.answered) go(1); else flip(); }
      else if (e.key === 'ArrowRight') { if (!st.juegoEf || st.answered) go(1); }
      else if (e.key === 'ArrowLeft') { if (!st.juegoEf) go(-1); }
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
    TEMAS.sort(function (a, b) {
      var qa = /^⚡/.test(a.bloque || '') ? 0 : 1, qb = /^⚡/.test(b.bloque || '') ? 0 : 1;
      if (qa !== qb) return qa - qb;   // los mazos ⚡ (Repaso rápido y Glosario) van primero
      return a.n - b.n;
    });
    loadStats(); loadDisc(); loadFav(); loadInv(); loadCoins(); loadCosmet(); loadCfg(); applyEink(); applyTheme();
    document.addEventListener('pointerdown', function once() { audio(); document.removeEventListener('pointerdown', once); });
    bindHome(); bindStudy(); bindResults(); renderTemas(); updateCoinsUI();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
