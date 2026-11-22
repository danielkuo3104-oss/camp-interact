/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 隱藏解謎彩蛋（前台）。後端 Puzzle.gs；設計見解謎方案文件。目前做到田園結束＋中世紀的石門。
 *   答案都在後端：這裡只送「點了信的哪裡」「點了夜空哪裡」，對不對、下一關的內容都由後端給。
 *   圖：assets/puzzle/（day／night 背景、envelope 信封、letter 手寫信、pisces 雙魚魔法陣、fish 魚），Daniel 生成的。
 *
 *   入口：左上角「營」剛好敲 7 下（兩下間隔超過 2 秒就重算）。不到 7 下跳「要不要再多敲幾下」，超過 7 下沒反應；
 *         剛好 7 下時標誌逐漸裂開，1 秒內沒有第 8 下就進田園。田園過關後這個入口鎖起來。
 *   田園：一封信遞進來 → 點開 → 圈出 4 個錯字（夜中兩魚）→ 進入夜晚 → 在夜空點雙魚座 → 兩隻魚浮上來給提示。
 *   中世紀入口：學員「個人資訊」／工作人員「小隊資料」那一頁滑到底，繼續往下沉，海底有一扇石門。
 */
var Puzzle = (function () {
  var E = null;            // { camp, side, preview, state: {stage, page}, changed() }
  var knock = { n: 0, t: null, el: null }, busy = false, box = null;
  var GAP = 1000, NEED = 7, LOCK = 5,   // LOCK：解開中世紀（第 5 關）之前都能敲「營」回田園看線索
     IMG = 'assets/puzzle/';

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
    if (!on() || stage() >= 3) return mark;   // 田園過了就不晃（但還能敲 7 下回田園看線索）
    mark.classList.add('pz-lure');
    return mark;
  }
  /** 每點一下「營」都呼叫（第一位報名的金光提示照舊，次數照算） */
  function tap(mark) {
    if (!on() || stage() >= LOCK || busy) return;
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
      open(v, 'rural');
    }, function (e) { busy = false; if (mark) mark.classList.remove('pz-crack', 'pz-break'); if (!/沒有反應|沒有這個功能/.test(e.message)) toast(e.message, true); });
  }

  /* ---------------- 大廳 ---------------- */
  function close() { if (box) { box.remove(); box = null; document.documentElement.classList.remove('pz-open'); } }
  function open(v, mode) {
    close();
    preload();
    box = el('div', 'pz-lobby');
    box.setAttribute('role', 'dialog');
    var x = el('button', 'pz-close', '✕'); x.type = 'button'; x.setAttribute('aria-label', '離開'); x.onclick = close;
    box.appendChild(x);
    document.body.appendChild(box);
    document.documentElement.classList.add('pz-open');
    draw(v, true, mode);
  }
  /** mode 'rural'：已經到中世紀的人回田園看線索 */
  function draw(v, first, mode) {
    if (!box) return;
    [].slice.call(box.children).forEach(function (c) { if (!c.classList.contains('pz-close')) c.remove(); });
    var castle = v.stage >= 4 && mode !== 'rural';
    box.className = 'pz-lobby ' + (castle ? 'pz-medieval' : v.stage >= 2 ? 'pz-rural pz-night' : 'pz-rural');
    if (castle) { medieval(v); return; }
    box.appendChild(scene());
    if (v.stage === 1) envelope(v, first);
    else { box.appendChild(sky(v)); letterIcon(v); }
    if (v.stage >= 4) box.appendChild(hop('🏰', '回到城堡', function () { draw(v, false); }));
  }
  /** 田園和城堡之間的小按鈕 */
  function hop(icon, text, fn) { var b = el('button', 'pz-hop'); b.type = 'button'; b.appendChild(el('span', '', icon)); b.appendChild(el('span', '', text)); b.onclick = fn; return b; }
  /** 先把圖載進來（進大廳時） */
  function preload() { ['day.webp', 'night.webp', 'envelope.webp', 'letter.webp', 'pisces.webp', 'fish.webp', 'door-open.webp'].forEach(function (f) { var i = new Image(); i.src = IMG + f; }); }
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
    [].slice.call(wrap.querySelectorAll('.pz-ring')).forEach(function (c, k) { if (v.found[k]) c.dataset.k = v.found[k].join(','); });
    var spots = v.spots || [], need = v.need || 4, q = Promise.resolve(), last = null, done = false;
    // 錯字位置在手機上直接判斷（Daniel 11/22：點到附近馬上出紅圈），每圈到一個在背景送後端記進度
    function pick(e) {
      if (done) return;
      var b = wrap.getBoundingClientRect(), x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      var px = x * L.w, py = y * L.h, pad = 14, hit = null;
      spots.forEach(function (r) { if (!hit && px >= r[0] - pad && px <= r[0] + r[2] + pad && py >= r[1] - pad && py <= r[1] + r[3] + pad) hit = r; });
      if (!hit) {   // 沒中：淡淡的鉛筆圈一下就消失
        var m = el('i', 'pz-mark pz-erase'); m.style.left = (x * 100) + '%'; m.style.top = (y * 100) + '%';
        wrap.appendChild(m); setTimeout(function () { m.remove(); }, 650);
        return;
      }
      if (wrap.querySelector('.pz-ring[data-k="' + hit.join(',') + '"]')) return;
      ring(wrap, L, hit, true); wrap.lastChild.dataset.k = hit.join(',');
      var pt = { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 };
      last = q = q.then(function () { return call('typo', { pts: [pt] }); }).catch(function (e2) { toast(e2.message, true); return {}; });
      if (wrap.querySelectorAll('.pz-ring').length >= need) { done = true; nightfall(p, last); }
    }
  }
  /** 四個錯字都圈到：信收起來，天慢慢暗下來 */
  function nightfall(p, wait) {
    var t0 = Date.now(), ms = reduced() ? 1300 : 3300;
    setTimeout(function () { p.classList.add('pz-fold'); box.classList.add('pz-dusk'); }, 700);
    // 動畫照跑；後端記好（拿到夜空）再畫
    Promise.resolve(wait).then(function (r) {
      var go = function (v) { setTimeout(function () { setStage(2); draw(v); }, Math.max(0, ms - (Date.now() - t0))); };
      if (r && r.view) go(r.view);
      else call('view').then(function (v) { if (v.stage >= 2) go(v); else { toast('連線不穩，再試一次', true); draw(v); } }, function (e) { toast(e.message, true); });
    });
  }

  /* 夜空：每個星座都有連線（不標名字），玩家要點出雙魚座 */
  function svgEl(tag) { return document.createElementNS('http://www.w3.org/2000/svg', tag); }
  function sky(v) {
    var wrap = el('div', 'pz-sky'), svg = svgEl('svg');
    svg.setAttribute('viewBox', '0 0 1000 657'); svg.setAttribute('class', 'pz-sky-svg');
    // 背景的小星星只是裝飾（每次隨機），答案在後端
    for (var i = 0; i < 90; i++) svg.appendChild(dot(Math.random() * 1000, Math.random() * 657, 0.6 + Math.random() * 0.9, 'pz-faint'));
    var groups = (v.cons || []).map(function (ls, gi) {
      var g = svgEl('g'); g.setAttribute('class', 'pz-con');
      ls.forEach(function (l) { var a = v.stars[l[0]], b = v.stars[l[1]]; if (a && b) g.appendChild(seg(a, b, 'pz-cline')); });
      svg.appendChild(g);
      return { g: g, ls: ls };
    });
    (v.stars || []).forEach(function (s) { svg.appendChild(dot(s[0] * 1000, s[1] * 657, 2.1, 'pz-star')); });
    if (v.lines) { drawLines(svg, v); sigil(svg, v); }
    wrap.appendChild(svg);
    if (v.stage === 2) {
      wrap.classList.add('pz-pickable');
      wrap.onclick = function (e) {
        if (busy) return;
        var r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        if (x < 0 || x > 1 || y < 0 || y > 1) return;
        var tp = dot(x * 1000, y * 657, 9, 'pz-tapstar'); svg.appendChild(tp); setTimeout(function () { tp.remove(); }, 900);
        // 點下去馬上亮起最近的那個星座（只是畫面；對不對由後端判斷）
        var near = nearest(groups, v.stars, x * 1000, y * 657);
        if (near) near.g.classList.add('pz-con-on');
        busy = true;
        call('star', { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 }).then(function (res) {
          busy = false;
          if (!res.hit) { if (near) { near.g.classList.remove('pz-con-on'); near.g.classList.add('pz-con-no'); setTimeout(function () { near.g.classList.remove('pz-con-no'); }, 700); } return; }
          setStage(3);
          wrap.classList.remove('pz-pickable'); wrap.onclick = null;
          drawLines(svg, res.view, true);
          sigil(svg, res.view, true);
          setTimeout(function () { fish(res.view); }, reduced() ? 300 : 2600);
        }, function (e2) { busy = false; if (near) near.g.classList.remove('pz-con-on'); toast(e2.message, true); });
      };
    }
    if (v.stage >= 3) setTimeout(function () { fish(v, true); }, 50);
    return wrap;
  }
  function seg(a, b, cls) { var ln = svgEl('line'); ln.setAttribute('x1', a[0] * 1000); ln.setAttribute('y1', a[1] * 657); ln.setAttribute('x2', b[0] * 1000); ln.setAttribute('y2', b[1] * 657); ln.setAttribute('class', cls); return ln; }
  /** 點的位置最靠近哪一個星座（60 單位內） */
  function nearest(groups, stars, px, py) {
    var best = null, bd = 60;
    groups.forEach(function (gr) {
      gr.ls.forEach(function (l) {
        var a = stars[l[0]], b = stars[l[1]]; if (!a || !b) return;
        var ax = a[0] * 1000, ay = a[1] * 657, dx = b[0] * 1000 - ax, dy = b[1] * 657 - ay, L2 = dx * dx + dy * dy;
        var t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
        var d = Math.sqrt(Math.pow(ax + t * dx - px, 2) + Math.pow(ay + t * dy - py, 2));
        if (d < bd) { bd = d; best = gr; }
      });
    });
    return best;
  }
  function dot(x, y, r, cls) { var c = svgEl('circle'); c.setAttribute('cx', x.toFixed(1)); c.setAttribute('cy', y.toFixed(1)); c.setAttribute('r', r); c.setAttribute('class', cls); return c; }
  function drawLines(svg, v, anim) {
    (v.lines || []).forEach(function (l, k) {
      var a = v.stars[l[0]], b = v.stars[l[1]]; if (!a || !b) return;
      var ln = seg(a, b, 'pz-line' + (anim && !reduced() ? ' pz-draw' : ''));
      if (anim) ln.style.animationDelay = (k * 0.08) + 's';
      svg.appendChild(ln);
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
  function medieval(v) {
    box.appendChild(hop('🌙', '回田園看線索', function () { draw(v, false, 'rural'); }));
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
    var shut = el('img', 'pz-door-shut'), opened = el('img', 'pz-door-opened');
    shut.src = IMG + 'door.webp'; opened.src = IMG + 'door-open.webp'; shut.alt = opened.alt = ''; shut.loading = opened.loading = 'lazy';
    door.appendChild(el('i', 'pz-door-light')); door.appendChild(opened); door.appendChild(shut);
    door.onclick = function () {
      if (busy) return;
      busy = true; door.classList.add('pz-door-open');
      call('gate').then(function (v) { busy = false; setTimeout(function () { open(v); door.classList.remove('pz-door-open'); setStage(v.stage); }, reduced() ? 0 : 1500); },   // 門開完、大廳蓋上去之後才重畫頁面（不然畫面會跳回頂端）
        function (e) { busy = false; door.classList.remove('pz-door-open'); toast(e.message, true); });
    };
    a.appendChild(door);
    return a;
  }
  /** 重新打開大廳（例如從其他地方回來） */
  function reopen() { if (!on() || busy) return; busy = true; call('view').then(function (v) { busy = false; open(v); }, function (e) { busy = false; toast(e.message, true); }); }

  return { init: init, decorate: decorate, tap: tap, isGatePage: isGatePage, abyss: abyss, reopen: reopen, close: close, _open: open };
})();
