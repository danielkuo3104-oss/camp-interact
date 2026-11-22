/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 隱藏解謎彩蛋（前台）。後端 Puzzle.gs；設計見解謎方案文件。目前做到田園結束＋中世紀的石門。
 *   答案都在後端：這裡只送「點了信的哪裡」「點了夜空哪裡」，對不對、下一關的內容都由後端給。
 *   圖：assets/puzzle/（day／night 背景、envelope 信封、letter 手寫信、pisces 雙魚魔法陣、fish 魚），Daniel 生成的。
 *
 *   入口：左上角「營」剛好敲 7 下（兩下間隔超過 2 秒就重算）。不到 7 下跳「要不要再多敲幾下」，超過 7 下沒反應；
 *         剛好 7 下時標誌逐漸裂開，2 秒內沒有第 8 下就進田園。田園過關後這個入口鎖起來。
 *   田園：一封信遞進來 → 點開 → 圈出 4 個錯字（夜中兩魚）→ 進入夜晚 → 在夜空點雙魚座 → 兩隻魚浮上來給提示。
 *   中世紀入口：學員「個人資訊」／工作人員「小隊資料」那一頁滑到底，繼續往下沉，海底有一扇石門。
 */
var Puzzle = (function () {
  var E = null;            // { camp, side, preview, state: {stage, page}, changed() }
  var knock = { n: 0, t: null, el: null }, busy = false, box = null;
  var GAP = 2000, NEED = 7, IMG = 'assets/puzzle/';
  var queue = Promise.resolve();   // 點信：一個一個送（後端照順序存），畫面不用等

  function init(o) { E = o; }
  function on() { return !!(E && E.state); }
  function stage() { return on() ? E.state.stage || 0 : 0; }
  function setStage(s) { if (on() && s > E.state.stage) { E.state.stage = s; if (E.changed) E.changed(); } }
  function reduced() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function call(kind, data) {
    return op('puzzle.' + kind, { camp: E.camp, data: Object.assign({ side: E.side }, data || {}) });
  }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined && text !== null) n.textContent = text; return n; }

  /* ---------------- 入口：「營」敲 7 下 ---------------- */
  /** 「營」標誌：還沒過田園的人，標誌偶爾晃一下吸引點擊 */
  function decorate(mark) {
    if (!on() || stage() >= 3) return mark;
    mark.classList.add('pz-lure');
    return mark;
  }
  /** 每點一下「營」都呼叫（第一位報名的金光提示照舊，次數照算） */
  function tap(mark) {
    if (!on() || stage() >= 3 || busy) return;
    clearTimeout(knock.t);
    knock.n++; knock.el = mark;
    if (knock.n === NEED) mark.classList.add('pz-crack');
    else mark.classList.remove('pz-crack');
    knock.t = setTimeout(done, GAP);
  }
  function done() {
    var n = knock.n, mark = knock.el;
    knock.n = 0;
    if (n < NEED) { toast('要不要再多敲幾下？'); return; }
    if (n > NEED) return;
    busy = true;
    if (mark) mark.classList.add('pz-break');
    call('knock').then(function (v) {
      busy = false;
      if (mark) mark.classList.remove('pz-crack', 'pz-break');
      setStage(v.stage);
      open(v);
    }, function (e) { busy = false; if (mark) mark.classList.remove('pz-crack', 'pz-break'); if (!/沒有反應|沒有這個功能/.test(e.message)) toast(e.message, true); });
  }

  /* ---------------- 大廳 ---------------- */
  function close() { if (box) { box.remove(); box = null; document.documentElement.classList.remove('pz-open'); } }
  function open(v) {
    close();
    preload();
    box = el('div', 'pz-lobby');
    box.setAttribute('role', 'dialog');
    var x = el('button', 'pz-close', '✕'); x.type = 'button'; x.setAttribute('aria-label', '離開'); x.onclick = close;
    box.appendChild(x);
    document.body.appendChild(box);
    document.documentElement.classList.add('pz-open');
    draw(v, true);
  }
  function draw(v, first) {
    if (!box) return;
    [].slice.call(box.children).forEach(function (c) { if (!c.classList.contains('pz-close')) c.remove(); });
    box.className = 'pz-lobby ' + (v.stage >= 4 ? 'pz-medieval' : v.stage >= 2 ? 'pz-rural pz-night' : 'pz-rural');
    if (v.stage >= 4) { medieval(); return; }
    box.appendChild(scene());
    if (v.stage === 1) envelope(v, first);
    else { box.appendChild(sky(v)); letterIcon(v); }
  }
  /** 先把圖載進來（進大廳時） */
  function preload() { ['day.webp', 'night.webp', 'envelope.webp', 'letter.webp', 'pisces.webp', 'fish.webp'].forEach(function (f) { var i = new Image(); i.src = IMG + f; }); }
  /** 田園的畫：白天、夜晚兩張疊著，天黑時夜晚那張慢慢浮上來；晚上有螢火蟲 */
  function scene() {
    var s = el('div', 'pz-scene');
    s.setAttribute('aria-hidden', 'true');
    s.appendChild(el('i', 'pz-bg pz-bg-day'));
    s.appendChild(el('i', 'pz-bg pz-bg-night'));
    for (var i = 0; i < 26; i++) { var d = el('b', 'pz-dust'); d.style.left = (Math.random() * 100).toFixed(1) + '%'; d.style.top = (62 + Math.random() * 34).toFixed(1) + '%'; d.style.animationDelay = (-Math.random() * 6).toFixed(1) + 's'; s.appendChild(d); }
    return s;
  }

  /* 歡迎信 */
  function envelope(v, first) {
    var env = el('button', 'pz-envelope' + (first && !reduced() ? ' pz-slide' : ''));
    env.type = 'button'; env.setAttribute('aria-label', '一封信');
    var im = el('img'); im.src = IMG + 'envelope.webp'; im.alt = ''; im.draggable = false;
    env.appendChild(im);
    env.onclick = function () { env.classList.add('pz-opening'); setTimeout(function () { env.remove(); letter(v); }, reduced() ? 0 : 450); };
    box.appendChild(env);
  }
  function letterIcon(v) {
    var b = el('button', 'pz-letter-ic'); b.type = 'button'; b.setAttribute('aria-label', '再看一次信');
    var im = el('img'); im.src = IMG + 'envelope.webp'; im.alt = ''; b.appendChild(im);
    b.onclick = function () { letter(v, true); };
    box.appendChild(b);
  }
  /** 錯字的圈（位置是後端給的像素，換成百分比） */
  function ring(wrap, L, r, anim) {
    var c = el('i', 'pz-ring' + (anim && !reduced() ? ' pz-ring-draw' : ''));
    c.style.left = ((r[0] - 10) / L.w * 100) + '%'; c.style.top = ((r[1] - 8) / L.h * 100) + '%';
    c.style.width = ((r[2] + 20) / L.w * 100) + '%'; c.style.height = ((r[3] + 16) / L.h * 100) + '%';
    wrap.appendChild(c);
  }
  function letter(v, readOnly) {
    var old = box.querySelector('.pz-paper'); if (old) old.remove();
    var L = v.letter, p = el('div', 'pz-paper'), wrap = el('div', 'pz-sheet');
    var im = el('img'); im.src = L.src; im.alt = '一封手寫信'; im.draggable = false;
    wrap.style.aspectRatio = L.w + ' / ' + L.h;
    wrap.appendChild(im);
    (v.found || []).forEach(function (r) { ring(wrap, L, r); });
    p.appendChild(wrap);
    if (readOnly) { var x = el('button', 'pz-paper-x', '收起來'); x.type = 'button'; x.onclick = function () { p.remove(); }; p.appendChild(x); }
    else wrap.onclick = pick;
    box.appendChild(p);
    var done = false;
    function pick(e) {
      if (done) return;
      var b = wrap.getBoundingClientRect(), x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      // 點下去馬上有一圈鉛筆痕（不代表對錯），後端說中了才畫紅圈
      var t = el('i', 'pz-tap'); t.style.left = (x * 100) + '%'; t.style.top = (y * 100) + '%';
      wrap.appendChild(t); setTimeout(function () { t.remove(); }, 900);
      var data = { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 };
      queue = queue.then(function () {
        if (done) return;
        return call('typo', data).then(function (r) {
          if (!r.hit) return;                    // 點到正常的字：沒有反應
          if (r.r && !wrap.querySelector('.pz-ring[data-k="' + r.r.join(',') + '"]')) { ring(wrap, L, r.r, true); wrap.lastChild.dataset.k = r.r.join(','); }
          if (r.done) { done = true; nightfall(p, r.view); }
        }, function (e2) { toast(e2.message, true); });
      });
    }
  }
  /** 四個錯字飛出來排成「夜中兩魚」，天慢慢暗下來 */
  function nightfall(p, v) {
    setStage(2);
    var word = el('div', 'pz-word');
    (v.word || '').split('').forEach(function (ch, k) { var s = el('span', '', ch); s.style.animationDelay = (k * 0.35) + 's'; word.appendChild(s); });
    setTimeout(function () {
      p.classList.add('pz-fold');
      box.appendChild(word);
      setTimeout(function () { box.classList.add('pz-dusk'); }, 1600);
      setTimeout(function () { word.remove(); draw(v); }, reduced() ? 1800 : 4600);
    }, 900);
  }

  /* 夜空 */
  function sky(v) {
    var wrap = el('div', 'pz-sky'), svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 1000 657'); svg.setAttribute('class', 'pz-sky-svg');
    // 背景的小星星只是裝飾（每次隨機），答案在後端
    for (var i = 0; i < 90; i++) svg.appendChild(dot(Math.random() * 1000, Math.random() * 657, 0.6 + Math.random() * 0.9, 'pz-faint'));
    (v.stars || []).forEach(function (s) { svg.appendChild(dot(s[0] * 1000, s[1] * 657, 2.1, 'pz-star')); });
    if (v.lines) { drawLines(svg, v); sigil(svg, v); }
    wrap.appendChild(svg);
    if (v.stage === 2) {
      wrap.classList.add('pz-pickable');
      wrap.onclick = function (e) {
        if (busy) return;
        var r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        if (x < 0 || x > 1 || y < 0 || y > 1) return;
        var tp = dot(x * 1000, y * 657, 9, 'pz-tapstar'); svg.appendChild(tp); setTimeout(function () { tp.remove(); }, 900);   // 點下去馬上有反應
        busy = true;
        call('star', { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 }).then(function (res) {
          busy = false;
          if (!res.hit) return;                  // 點錯的地方：沒有反應
          setStage(3);
          wrap.classList.remove('pz-pickable'); wrap.onclick = null;
          drawLines(svg, res.view, true);
          sigil(svg, res.view, true);
          setTimeout(function () { fish(res.view); }, reduced() ? 300 : 2600);
        }, function (e2) { busy = false; toast(e2.message, true); });
      };
    }
    if (v.stage >= 3) setTimeout(function () { fish(v, true); }, 50);
    return wrap;
  }
  function dot(x, y, r, cls) { var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('cx', x.toFixed(1)); c.setAttribute('cy', y.toFixed(1)); c.setAttribute('r', r); c.setAttribute('class', cls); return c; }
  function drawLines(svg, v, anim) {
    (v.lines || []).forEach(function (l, k) {
      var a = v.stars[l[0]], b = v.stars[l[1]]; if (!a || !b) return;
      var ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.setAttribute('x1', a[0] * 1000); ln.setAttribute('y1', a[1] * 657); ln.setAttribute('x2', b[0] * 1000); ln.setAttribute('y2', b[1] * 657);
      ln.setAttribute('class', 'pz-line' + (anim && !reduced() ? ' pz-draw' : ''));
      if (anim) ln.style.animationDelay = (k * 0.08) + 's';
      svg.insertBefore(ln, svg.firstChild);
    });
  }
  /** 找到雙魚座：星座後面浮出雙魚魔法陣 */
  function sigil(svg, v, anim) {
    var xs = [], ys = [];
    (v.lines || []).forEach(function (l) { l.forEach(function (i) { var s = v.stars[i]; if (s) { xs.push(s[0] * 1000); ys.push(s[1] * 657); } }); });
    if (!xs.length) return;
    var cx = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, cy = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2;
    var size = Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys)) * 1.15;
    var im = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    im.setAttribute('href', IMG + 'pisces.webp');
    im.setAttribute('x', (cx - size / 2).toFixed(1)); im.setAttribute('y', (cy - size / 2).toFixed(1));
    im.setAttribute('width', size.toFixed(1)); im.setAttribute('height', size.toFixed(1));
    im.setAttribute('class', 'pz-sigil' + (anim && !reduced() ? ' pz-sigil-in' : ''));
    im.style.transformOrigin = cx.toFixed(1) + 'px ' + cy.toFixed(1) + 'px';
    svg.insertBefore(im, svg.firstChild);
  }
  /** 兩隻魚浮上來，各說一句 */
  function fish(v, still) {
    if (!box || box.querySelector('.pz-fishes')) return;
    var f = el('div', 'pz-fishes' + (still || reduced() ? '' : ' pz-rise'));
    (v.fish || []).forEach(function (t, k) {
      var one = el('div', 'pz-fish f' + (k + 1));
      var body = el('div', 'pz-fish-body'), im = el('img'); im.src = IMG + 'fish.webp'; im.alt = ''; body.appendChild(im);
      one.appendChild(body);
      one.appendChild(el('div', 'pz-bubble', t));
      f.appendChild(one);
    });
    box.appendChild(f);
  }

  /* 中世紀（建造中） */
  function medieval() {
    var m = el('div', 'pz-castle');
    m.appendChild(el('div', 'pz-castle-art', '🏰'));
    m.appendChild(el('p', '', '石門後面是一座還在建造中的城堡。'));
    m.appendChild(el('p', 'pz-muted', '工匠還在敲敲打打，過一陣子再回來看看。'));
    box.appendChild(m);
  }

  /* ---------------- 中世紀入口：沉到海底的石門 ---------------- */
  /** 這一頁是不是石門所在的頁（學員看「我的資料」區塊、工作人員看「小隊資料」區塊） */
  function isGatePage(blocks, pageId) {
    if (!on() || stage() < 3) return false;
    var want = E.state.page;
    return blocks.some(function (b) { return b.page === pageId && b.type === 'pkg' && b.data && b.data.pkg === 'people' && b.data.view === want; });
  }
  function abyss() {
    var a = el('div', 'pz-abyss');
    for (var i = 0; i < 18; i++) { var b = el('i', 'pz-bubble-up'); b.style.left = (5 + Math.random() * 90).toFixed(1) + '%'; b.style.animationDelay = (-Math.random() * 9).toFixed(1) + 's'; b.style.animationDuration = (6 + Math.random() * 6).toFixed(1) + 's'; a.appendChild(b); }
    var door = el('button', 'pz-door'); door.type = 'button'; door.setAttribute('aria-label', '石門');
    door.appendChild(el('span', 'pz-door-ring'));
    door.onclick = function () {
      if (busy) return;
      busy = true; door.classList.add('pz-door-open');
      call('gate').then(function (v) { busy = false; setStage(v.stage); setTimeout(function () { open(v); door.classList.remove('pz-door-open'); }, reduced() ? 0 : 900); },
        function (e) { busy = false; door.classList.remove('pz-door-open'); toast(e.message, true); });
    };
    a.appendChild(door);
    return a;
  }
  /** 重新打開大廳（例如從其他地方回來） */
  function reopen() { if (!on() || busy) return; busy = true; call('view').then(function (v) { busy = false; open(v); }, function (e) { busy = false; toast(e.message, true); }); }

  return { init: init, decorate: decorate, tap: tap, isGatePage: isGatePage, abyss: abyss, reopen: reopen, close: close, _open: open };
})();
