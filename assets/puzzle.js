/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 隱藏解謎彩蛋（前台）。後端 Puzzle.gs；設計見解謎方案文件。目前做到田園＋中世紀（圖在 assets/puzzle/med/）。
 *   答案大多在後端；例外（Daniel 同意）：錯字位置、中世紀鑰匙藏的位置、機關輪槽位在手機上直接判斷（點了馬上有反應），進度在背景送後端記。
 *   圖：assets/puzzle/（day／night 背景、envelope 信封、letter 手寫信、pisces 雙魚魔法陣、fish 魚），Daniel 生成的。
 *
 *   入口：左上角「營」剛好敲 7 下（兩下間隔超過 2 秒就重算）。不到 7 下跳「要不要再多敲幾下」，超過 7 下沒反應；
 *         剛好 7 下時標誌逐漸裂開，1 秒內沒有第 8 下就進田園。田園過關後這個入口鎖起來。
 *   田園：一封信遞進來 → 點開 → 圈出 4 個錯字（夜中兩魚）→ 進入夜晚 → 在夜空點雙魚座 → 兩隻魚浮上來給提示。
 *   中世紀入口：學員「個人資訊」／工作人員「小隊資料」那一頁滑到底，繼續往下沉，海底有一扇石門。
 *   中世紀：浮石提示 → 找鑰匙（場景局部恢復彩色）→ 召喚機關輪 → 拖鑰匙入槽 → 內外環反向轉 → 下一關提示（見下面「中世紀」那段）。
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
  /** 每點一下「營」都呼叫（第一位報名的金光提示照舊，次數照算）；home = 現在在首頁 */
  function tap(mark, home) {
    if (!on() || stage() >= LOCK || busy) return;
    if (home && stage() === 4) brandKey(mark);
    clearTimeout(knock.t);
    knock.n++; knock.el = mark;
    if (knock.n === NEED) mark.classList.add('pz-crack');
    else mark.classList.remove('pz-crack');
    knock.t = setTimeout(done, GAP);
  }
  function done() {
    var n = knock.n, mark = knock.el;
    knock.n = 0;
    var quiet = knock.quiet; knock.quiet = false;
    if (n < NEED) { if (!quiet) toast('要不要再多敲幾下？'); return; }
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

  /* 中世紀的鑰匙：火在首頁的「營」、月在田園的月亮、水車、風車。藏在哪後端在第 4 關就給（v.med.hide），
   * 手機上直接判斷、鑰匙馬上浮出來；puzzle.seek 排隊在背景送（機關輪、重新整理畫面都排在它後面，進度才不會亂） */
  var sq = Promise.resolve(), asking = {};
  function after(fn) { var p = sq.then(fn); sq = p.catch(function () {}); return p; }
  function send(data) { return after(function () { return call('seek', data); }).catch(function (e) { if (!/沒有反應/.test(e.message)) toast(e.message, true); }); }
  function haveKey(id) { return on() && (E.state.keys || []).indexOf(id) >= 0; }
  function gotKey(id) { if (!on() || haveKey(id)) return; E.state.keys = (E.state.keys || []).concat([id]); }
  /** 在 where 點了 (x, y)（那張圖的 0～1）：有沒有點到還沒找到的鑰匙（距離換成以寬為單位，和後端 pzMedFind_ 一樣） */
  function findAt(v, where, x, y) {
    var M = v && v.med; if (!M) return null;
    var ar = where === 'rural' ? 1672 / 941 : M.h / M.w, hit = null;
    (M.hide || []).forEach(function (k) {
      if (hit || k.find.in !== where || haveKey(k.id)) return;
      k.find.at.forEach(function (c) { var dx = x - c[0], dy = (y - c[1]) * ar; if (!hit && Math.sqrt(dx * dx + dy * dy) <= c[2]) hit = k; });
    });
    return hit;
  }
  /** 把找到的鑰匙記進畫面資料（藏的清單拿掉、鑰匙清單加上、對應的浮石變彩色） */
  function takeKey(v, k) {
    var M = v.med; gotKey(k.id);
    M.hide = (M.hide || []).filter(function (q) { return q.id !== k.id; });
    if (!(M.keys || []).some(function (q) { return q.id === k.id; })) M.keys = (M.keys || []).concat([{ id: k.id, src: k.src, area: k.area }]);
    (M.stones || []).forEach(function (s) { if (s.src.replace(/stone-/, 'stonec-') === k.lit) s.lit = k.lit; });
  }
  /** 首頁點「營」：還沒拿過那把鑰匙就馬上浮出來 */
  function brandKey(mark) {
    var b = E.state.brand;
    if (!b) {   // 後端還沒給（例如還是舊版 Puzzle.gs）：問一次
      if (asking.brand || haveKey('fire')) return;
      asking.brand = true; knock.quiet = true;
      after(function () { return call('seek', { in: 'brand' }); }).then(function (res) {
        if (!res || !res.hit) { gotKey('fire'); return; }
        gotKey(res.hit);
        var k = ((res.view && res.view.med && res.view.med.keys) || []).filter(function (q) { return q.id === res.hit; })[0], r = mark.getBoundingClientRect();
        if (k) reveal(k.src, r.left + r.width / 2, r.bottom + 46, document.body);
      }, function () { asking.brand = false; });
      return;
    }
    if (haveKey(b.id)) return;
    knock.quiet = true;   // 這一下不跳「要不要再多敲幾下」
    gotKey(b.id); E.state.brand = null;
    send({ in: 'brand' });
    var r = mark.getBoundingClientRect();
    reveal(b.src, r.left + r.width / 2, r.bottom + 46, document.body);
  }
  function keyOf(v, id) { return ((v && v.med && v.med.keys) || []).filter(function (q) { return q.id === id; })[0]; }
  /** 鑰匙在點的地方浮出來；點它才收下（收下後化成光飛走，或飛進袋子） */
  function reveal(src, x, y, parent, to, after) {
    buzz(25); tone(523, 500, 'triangle', 0.05); setTimeout(function () { tone(784, 900, 'triangle', 0.04); }, 160);
    var b = el('button', 'pz-reveal'); b.type = 'button'; b.setAttribute('aria-label', '一把鑰匙');
    var im = el('img'); im.src = src; im.alt = ''; im.draggable = false; b.appendChild(im);
    b.style.left = x + 'px'; b.style.top = y + 'px';
    b.onclick = function (e) {
      e.stopPropagation(); if (b.classList.contains('take')) return;
      b.classList.add('take'); tone(988, 700, 'triangle', 0.035); buzz(15);
      var t = to && to();
      if (t) { b.style.left = (t.left + t.width / 2) + 'px'; b.style.top = (t.top + t.height / 2) + 'px'; b.classList.add('home'); }
      setTimeout(function () { b.remove(); if (after) after(); }, 900);
    };
    parent.appendChild(b);
    return b;
  }
  /** 田園夜晚（已經到中世紀）：點夜空的月亮。背景是 cover、靠下對齊，換成圖上的比例 */
  function moonSeek(v) {
    box.addEventListener('click', function (e) {
      if (!box || !box.classList.contains('pz-night') || e.target.closest('button')) return;
      var W = box.clientWidth, H = box.clientHeight, sc = Math.max(W / 941, H / 1672), iw = 941 * sc, ih = 1672 * sc, left = (W - iw) / 2, top = H - ih;
      var x = (e.clientX - left) / iw, y = (e.clientY - top) / ih;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      var k = findAt(v, 'rural', x, y); if (!k) return;
      takeKey(v, k);
      send({ in: 'rural', x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 });
      reveal(k.src, e.clientX, e.clientY, box);
    });
  }

  /* ---------------- 大廳 ---------------- */
  function close() { if (med && med.cleanup) med.cleanup(); med = null; if (box) { box.remove(); box = null; document.documentElement.classList.remove('pz-open'); } }
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
    if (med && med.cleanup) med.cleanup(); med = null;
    [].slice.call(box.children).forEach(function (c) { if (!c.classList.contains('pz-close')) c.remove(); });
    var castle = v.stage >= 4 && mode !== 'rural';
    box.className = 'pz-lobby ' + (castle ? 'pz-medieval' : v.stage >= 2 ? 'pz-rural pz-night' : 'pz-rural');
    if (castle) { medieval(v); return; }
    box.appendChild(scene());
    if (v.stage === 1) envelope(v, first);
    else { box.appendChild(sky(v)); letterIcon(v); }
    if (v.stage >= 4) box.appendChild(hop('🏰', '回到城堡', function () { draw(v, false); }));   // 畫面資料在手機上就有（找到的鑰匙也記進去了），不用等後端
    if (v.stage === 4) moonSeek(v);
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
    var spots = v.spots || [], need = v.need || 4, last = null, done = false;
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
      last = after(function () { return call('typo', { pts: [pt] }); }).catch(function (e2) { toast(e2.message, true); return {}; });   // 排隊在背景送（點星星也排在後面）
      if (wrap.querySelectorAll('.pz-ring').length >= need) { done = true; nightfall(p, last, v); }
    }
  }
  /** 四個錯字都圈到：信收起來，天慢慢暗下來 */
  function nightfall(p, wait, v) {
    var t0 = Date.now(), ms = reduced() ? 1300 : 3300;
    setTimeout(function () { p.classList.add('pz-fold'); box.classList.add('pz-dusk'); }, 700);
    // 星星在第 1 關就有：天黑動畫跑完直接畫夜空，不等後端（進度在背景排隊送）
    if (v && v.stars && v.cons) {
      var v2 = Object.assign({}, v, { stage: 2, found: (v.spots || []).slice() });
      delete v2.spots;
      setTimeout(function () { if (!box) return; setStage(2); draw(v2); }, ms);
      return;
    }
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
        after(function () { return call('star', { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 }); }).then(function (res) {   // 排在錯字後面
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

  /* ---------------- 中世紀（11/24 設計） ----------------
   *   單色底圖＋四顆浮石（各自一張圖疊上去）→ 點浮石：移到中央吟唱提示，結束回原位
   *   → 在場景裡找到鑰匙（手機上直接判斷，背景送 puzzle.seek）→ 那一區由單色慢慢擴散成彩色
   *   → 四把都有：召喚雙層機關輪 → 自己把鑰匙拖進槽（放對震動＋亮起、放錯沒反應）→ 四把都對：內外環反向轉 → 下一關提示
   *   定位：底圖、彩色圖、浮石都放在同一個「舞台」（底圖的設計尺寸，用 cover 縮放、對齊點 focus），位置都是底圖的比例，
   *         所以不同手機長寬比也不會錯位。太寬或太高的畫面最多裁 20%，再多就留邊（不會把浮石裁掉）。 */
  var med = null;   // 目前城堡畫面：{ v, M, root, stg, layers, tray, wheel, cleanup }
  var AC = null;
  /** 音效（很小聲；手機要點過畫面才會出聲） */
  function tone(f, ms, type, vol, slide) {
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      var o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime, d = ms / 1000;
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.05, t + Math.min(0.4, d / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d + 0.05);
    } catch (e) {}
  }
  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }   // 不支援就算了，畫面回饋照樣有
  function pct(n) { return (n * 100).toFixed(3) + '%'; }

  function medieval(v) {
    var M = v.med;
    if (!M) { box.appendChild(el('div', 'pz-castle', '🏰')); return; }
    if (v.stage < LOCK) box.appendChild(hop('🌙', '回田園看線索', function () { draw(v, false, 'rural'); }));
    var root = el('div', 'pz-med' + (M.done ? ' pz-med-done' : '')), stg = el('div', 'pz-med-stage');
    var mono = el('i', 'pz-med-bg'); mono.style.backgroundImage = 'url("' + M.mono + '")'; stg.appendChild(mono);
    var full = el('i', 'pz-med-bg pz-med-full'); full.style.backgroundImage = 'url("' + M.color + '")'; stg.appendChild(full);   // 解開後整張變彩色
    root.appendChild(stg);
    med = { v: v, M: M, root: root, stg: stg, layers: [], q: Promise.resolve(), wait: 0 };
    var seen = seenKeys();
    (M.keys || []).forEach(function (k) { bloom(k, seen.indexOf(k.id) < 0 && !M.done); });   // 在別的地方找到、還沒回來看過的：慢慢擴散
    markSeen((M.keys || []).map(function (k) { return k.id; }));
    if (M.keys) M.keys.forEach(function (k) { gotKey(k.id); });
    (M.hide || []).forEach(function (k) { if (k.find.in === 'brand' && on() && !E.state.brand) E.state.brand = { id: k.id, src: k.src }; });   // 剛從石門進來的人：首頁的「營」也要知道
    M.stones.forEach(function (s, i) { stg.appendChild(stone(s, i)); });
    stg.onclick = seek;
    root.appendChild(med.tray = el('div', 'pz-tray'));
    box.appendChild(root);
    var onR = function () { fitStage(); };
    window.addEventListener('resize', onR);
    med.cleanup = function () { window.removeEventListener('resize', onR); if (med && med.scroll) med.scroll.timers.forEach(clearTimeout); };
    fitStage();
    drawTray();
    if (M.scroll) scrollBtn(M.scroll);
    var full4 = M.wheel && (M.done || (M.keys || []).length >= (M.need || 4));
    if (full4) setTimeout(function () { if (med && med.root === root) summon(!!M.done); }, M.done ? 200 : 900);
    if (M.scroll && !M.done && !scrollSeen()) setTimeout(function () { if (med && med.root === root) scrollOpen(true); }, full4 ? 0 : 500);   // 第一次進中世紀：捲軸開場
  }
  /** 已經在城堡看過恢復彩色的鑰匙（只是動畫要不要再跑；存不了就每次都跑） */
  function seenKeys() { try { return JSON.parse(localStorage.getItem('ia_pz_seen_' + E.camp) || '[]'); } catch (e) { return []; } }
  function markSeen(ids) { try { localStorage.setItem('ia_pz_seen_' + E.camp, JSON.stringify(ids)); } catch (e) {} }
  /** 舞台跟底圖一樣比例，用 cover 鋪滿（最多裁 20%），對齊點 focus */
  function fitStage() {
    if (!med) return;
    var M = med.M, W = med.root.clientWidth, H = med.root.clientHeight, sx = W / M.w, sy = H / M.h;
    var s = Math.min(Math.max(sx, sy), Math.min(sx, sy) * 1.25), w = M.w * s, h = M.h * s, f = M.focus || [0.5, 0.5];
    var st = med.stg.style;
    st.width = w + 'px'; st.height = h + 'px'; st.left = ((W - w) * f[0]) + 'px'; st.top = ((H - h) * f[1]) + 'px';
    med.layers.forEach(paint);
  }
  /** 彩色區域：同一張彩色圖，用圓形漸層遮罩只露出那一區（p 0～1 是擴散進度） */
  function paint(L) {
    var w = med.stg.clientWidth || 1, r = Math.max(0.1, L.area[2] * w * L.p);
    var m = 'radial-gradient(circle at ' + pct(L.area[0]) + ' ' + pct(L.area[1]) + ', #000 ' + (r * 0.55).toFixed(1) + 'px, rgba(0,0,0,.6) ' + (r * 0.8).toFixed(1) + 'px, transparent ' + r.toFixed(1) + 'px)';
    L.el.style.webkitMaskImage = m; L.el.style.maskImage = m;
  }
  function bloom(k, anim) {
    var c = el('i', 'pz-med-bg pz-med-color'); c.style.backgroundImage = 'url("' + med.M.color + '")';
    med.stg.insertBefore(c, med.stg.children[2] || null);
    var L = { id: k.id, area: k.area, el: c, p: anim && !reduced() ? 0 : 1 };
    med.layers.push(L); paint(L);
    if (L.p >= 1) return;
    var t0 = performance.now(), ms = 2800;
    (function step(t) {
      if (!med || med.layers.indexOf(L) < 0) return;
      var x = Math.min(1, (t - t0) / ms); L.p = 1 - Math.pow(1 - x, 3); paint(L);
      if (x < 1) requestAnimationFrame(step);
    })(t0);
  }
  /** 一顆浮石（位置是底圖比例；外圍淡淡的光暈） */
  function stone(s, i) {
    var b = el('button', 'pz-stone'); b.type = 'button'; b.setAttribute('aria-label', '一顆浮著的石頭');
    b.style.left = pct(s.at[0]); b.style.top = pct(s.at[1]); b.style.width = pct(s.at[2]);
    b.style.animationDelay = (-i * 1.7) + 's';
    var im = el('img'); im.src = s.lit || s.src; im.alt = ''; im.draggable = false; b.appendChild(im);   // 找到對應的鑰匙：浮石變彩色
    if (s.lit) b.classList.add('pz-lit');
    b.onclick = function (e) { e.stopPropagation(); chant(b, s); };
    return b;
  }
  /** 點浮石：移到畫面中央、甦醒、吟唱提示；結束（或點一下）回原位 */
  function chant(b, s) {
    if (!med || med.busy) return;
    med.busy = true;
    var r = b.getBoundingClientRect(), root = med.root;
    var veil = el('div', 'pz-veil'), f = el('div', 'pz-focus'), im = el('img');
    im.src = s.lit || s.src; im.alt = ''; f.appendChild(im);
    for (var i = 0; i < 14; i++) { var m = el('b', 'pz-mote'); m.style.setProperty('--a', (i * 360 / 14) + 'deg'); m.style.animationDelay = (i * 0.13).toFixed(2) + 's'; f.appendChild(m); }
    f.style.left = r.left + 'px'; f.style.top = r.top + 'px'; f.style.width = r.width + 'px'; f.style.height = r.height + 'px';
    root.appendChild(veil); root.appendChild(f);
    b.style.visibility = 'hidden';
    var size = Math.min(window.innerWidth * 0.56, window.innerHeight * 0.3, 260), k = size / r.width;
    var dx = window.innerWidth / 2 - (r.left + r.width / 2), dy = window.innerHeight * 0.36 - (r.top + r.height / 2);
    var fast = reduced(), lines = el('div', 'pz-chant');
    requestAnimationFrame(function () { requestAnimationFrame(function () { veil.classList.add('on'); f.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + k + ')'; }); });
    var total = 0;
    setTimeout(function () {
      f.classList.add('pz-awake'); buzz(12);
      tone(110, 2600, 'sine', 0.04); tone(165, 2600, 'sine', 0.025);
      (s.hint || []).forEach(function (t, li) {
        var p = el('p'); [].forEach.call(t, function (ch, ci) { var sp = el('span', '', ch); sp.style.animationDelay = (total + ci * 0.07).toFixed(2) + 's'; p.appendChild(sp); });
        setTimeout(function () { tone(660 + li * 110, 900, 'triangle', 0.02); }, total * 1000);
        total += t.length * 0.07 + 0.6;
        lines.appendChild(p);
      });
      root.appendChild(lines);
      ready = setTimeout(function () { lines.classList.add('pz-chant-done'); }, (fast ? 0 : total + 0.9) * 1000);   // 唸完不會自己收回，再點一次才收（Daniel 11/26）
    }, fast ? 50 : 950);
    var ready = null, gone = false;
    function back() {
      if (gone) return; gone = true; clearTimeout(ready);
      lines.classList.add('off'); f.classList.remove('pz-awake'); veil.classList.remove('on');
      f.style.transform = 'none';
      setTimeout(function () { f.remove(); veil.remove(); lines.remove(); b.style.visibility = ''; if (med) med.busy = false; }, fast ? 50 : 900);
    }
    veil.onclick = f.onclick = lines.onclick = function () { if (f.classList.contains('pz-awake')) back(); };
  }
  /** 點場景：有沒有點到藏起來的鑰匙（手機上直接判斷） */
  function seek(e) {
    if (!med || med.busy || med.wheel || med.M.done) return;
    var r = med.stg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    var tp = el('i', 'pz-seek'); tp.style.left = pct(x); tp.style.top = pct(y); med.stg.appendChild(tp); setTimeout(function () { tp.remove(); }, 800);
    var k = findAt(med.v, 'scene', x, y); if (!k) return;
    takeKey(med.v, k);
    send({ in: 'scene', x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 });
    found(k, x, y);
  }
  /** 找到鑰匙（水車、風車）：鑰匙在點的地方浮出來；點它才飛進上面的袋子，那一區慢慢恢復彩色、浮石變彩色 */
  function found(k, x, y) {
    var cur = med, M = cur.M;
    drawTray(k.id);
    var r = cur.stg.getBoundingClientRect();
    reveal(k.src, r.left + x * r.width, r.top + y * r.height, cur.root, function () {
      var p = cur.tray.querySelector('[data-k="' + k.id + '"]'); return p && p.getBoundingClientRect();
    }, function () {
      if (med !== cur) return;
      var p = cur.tray.querySelector('[data-k="' + k.id + '"]'); if (p) p.classList.remove('pz-pending');
      bloom(k, true); markSeen(M.keys.map(function (q) { return q.id; }));
      var st = cur.stg.querySelectorAll('.pz-stone');
      M.stones.forEach(function (s, j) { if (s.lit && st[j] && !st[j].classList.contains('pz-lit')) { st[j].classList.add('pz-lit', 'pz-lit-in'); st[j].firstChild.src = s.lit; } });
      if (M.wheel && M.keys.length >= (M.need || 4)) setTimeout(function () { if (med === cur) summon(false); }, 3200);
    });
  }
  /** 下面的袋子：找到的鑰匙（沒找到的位置空著） */
  function drawTray(pending) {
    var t = med.tray; t.textContent = '';
    var have = {}; (med.M.keys || []).forEach(function (k) { have[k.id] = k; });
    var n = med.M.need || 4, list = med.M.keys || [];
    for (var i = 0; i < n; i++) {
      var k = list[i], c = el('div', 'pz-pouch' + (k ? '' : ' pz-empty') + (k && k.id === pending ? ' pz-pending' : ''));
      if (k) { c.dataset.k = k.id; var im = el('img'); im.src = k.src; im.alt = ''; im.draggable = false; c.appendChild(im); }
      t.appendChild(c);
    }
  }

  /* 捲軸（Daniel 11/26）：第一次進中世紀時自己打開——封蠟捲軸落下、攤開成羊皮紙 → 英文傳說用魔法依序浮現
   * → 浮出「要翻譯嗎」→（翻譯就換中文再浮現一次）→ 八種符印依序浮現。之後左上角的捲軸可以再打開、切換內容、收起來。
   * 看過開場記在 localStorage ia_pz_scroll_<營隊>（存不了就每次進城堡都播一次）。 */
  function scrollSeen() { try { return localStorage.getItem('ia_pz_scroll_' + E.camp) === '1'; } catch (e) { return false; } }
  function markScroll() { try { localStorage.setItem('ia_pz_scroll_' + E.camp, '1'); } catch (e) {} }
  function scrollBtn(S) {
    var b = el('button', 'pz-scroll-ic'); b.type = 'button'; b.setAttribute('aria-label', '打開捲軸');
    var im = el('img'); im.src = S.roll; im.alt = ''; im.draggable = false; b.appendChild(im);
    b.onclick = function (e) { e.stopPropagation(); scrollOpen(false); };
    med.root.appendChild(b); med.scrollIc = b;
  }
  function scrollOpen(first) {
    if (!med || med.scroll || !med.M.scroll) return;
    var S = med.M.scroll, cur = med, fast = reduced();
    [S.parch].concat(S.pages.map(function (p) { return p.src; }), S.sigils).forEach(function (f) { var i = new Image(); i.src = f; });   // 先載（攤開的動畫期間就載好了）
    var lay = el('div', 'pz-scroll'), veil = el('div', 'pz-veil pz-veil-deep');
    var parch = el('div', 'pz-parch'), inner = el('div', 'pz-parch-in'), bar = el('div', 'pz-scroll-bar');
    parch.style.backgroundImage = 'url("' + S.parch + '")';
    parch.appendChild(inner); lay.appendChild(veil); lay.appendChild(parch); lay.appendChild(bar);
    cur.root.appendChild(lay);
    var sc = cur.scroll = { lay: lay, parch: parch, inner: inner, bar: bar, page: cur.scrollPage || 'en', skip: null, timers: [] };
    lay.onclick = function (e) { e.stopPropagation(); if (sc.skip) sc.skip(); };   // 動畫中點一下：直接跳到這一段的結尾
    function later(fn, ms) { sc.timers.push(setTimeout(function () { if (med === cur && cur.scroll === sc) fn(); }, ms)); }
    requestAnimationFrame(function () { veil.classList.add('on'); });
    // 切換分頁的按鈕（開場跑完才出現）
    var tabs = S.pages.map(function (p) { return { id: p.id, label: p.label }; }).concat([{ id: 'sigils', label: '八符印' }]);
    tabs.forEach(function (t) {
      var b = el('button', 'pz-tab', t.label); b.type = 'button'; b.dataset.p = t.id;
      b.onclick = function (e) { e.stopPropagation(); show(t.id, false); };
      bar.appendChild(b);
    });
    var fold = el('button', 'pz-tab pz-fold-btn', '收起'); fold.type = 'button';
    fold.onclick = function (e) { e.stopPropagation(); scrollClose(); };
    bar.appendChild(fold);
    function show(id, anim, done) {
      sc.page = cur.scrollPage = id;
      [].forEach.call(bar.querySelectorAll('.pz-tab[data-p]'), function (b) { b.classList.toggle('on', b.dataset.p === id); });
      inner.textContent = ''; parch.classList.toggle('pz-parch-sigils', id === 'sigils');
      if (id === 'sigils') sigilGrid(S, inner, anim && !fast, done, later);
      else {
        var pg = S.pages.filter(function (p) { return p.id === id; })[0] || S.pages[0];
        var im = el('img', 'pz-legend'); im.src = pg.src; im.alt = ''; im.draggable = false; inner.appendChild(im);
        if (anim && !fast) inkIn(sc, im, id === 'en' ? 15000 : 11000, done); else if (done) done();
      }
    }
    if (!first) {
      lay.classList.add('pz-scroll-quick', 'pz-scroll-ready');
      show(sc.page, false);
      return;
    }
    // 開場：捲軸落下 → 封蠟發光 → 攤開
    var roll = el('img', 'pz-roll'); roll.src = S.roll; roll.alt = ''; lay.appendChild(roll);
    if (!fast) { tone(98, 1800, 'sine', 0.04); buzz(15); }
    later(function () { roll.classList.add('pz-roll-glow'); if (!fast) { tone(523, 700, 'triangle', 0.035); setTimeout(function () { tone(784, 1000, 'triangle', 0.03); }, 180); } }, fast ? 0 : 1500);
    later(function () {
      roll.classList.add('pz-roll-gone'); lay.classList.add('pz-scroll-open'); buzz(20);
      later(function () { roll.remove(); }, 900);
      later(function () {
        show('en', true, function () {
          ask(sc, cur, function (yes) {
            if (yes) later(function () { show('zh', true, sigils); }, 200); else sigils();
          });
        });
      }, fast ? 0 : 1300);
    }, fast ? 50 : 2600);
    function sigils() {
      later(function () {
        show('sigils', true, function () {
          markScroll(); lay.classList.add('pz-scroll-ready');
          var tip = el('p', 'pz-scroll-tip', '捲軸收起後，左上角可以再打開'); lay.appendChild(tip);
          later(function () { tip.classList.add('off'); }, 5000);
        });
      }, fast ? 0 : 1600);
    }
  }
  /** 文字由上而下慢慢浮現 */
  function inkIn(sc, im, ms, done) {
    var t0 = performance.now(), end = false, cur = med;
    function set(p) {
      var a = (p * 112 - 12).toFixed(2), b = (p * 112).toFixed(2), m = 'linear-gradient(to bottom, #000 ' + a + '%, rgba(0,0,0,.35) ' + ((+a + +b) / 2).toFixed(2) + '%, transparent ' + b + '%)';
      im.style.webkitMaskImage = m; im.style.maskImage = m;
    }
    function finish() {
      if (end) return; end = true; sc.skip = null;
      im.style.webkitMaskImage = im.style.maskImage = 'none';
      if (done) done();
    }
    sc.skip = finish;
    set(0);
    (function step(t) {
      if (end || med !== cur || cur.scroll !== sc) return;
      var x = Math.min(1, (t - t0) / ms); set(x);
      if (x < 1) requestAnimationFrame(step); else finish();
    })(t0);
  }
  /** 英文浮現完：浮出「要翻譯嗎」 */
  function ask(sc, cur, cb) {
    var a = el('div', 'pz-ask'), p = el('p', '', '這些古老的文字……要讓它化成你看得懂的語言嗎？');
    var yes = el('button', 'pz-ask-yes', '✨ 翻譯'), no = el('button', 'pz-ask-no', '不用了');
    yes.type = no.type = 'button';
    a.appendChild(p); a.appendChild(yes); a.appendChild(no);
    function pick(v) { return function (e) { e.stopPropagation(); a.classList.add('off'); setTimeout(function () { a.remove(); }, 500); if (v) tone(659, 800, 'triangle', 0.035); cb(v); }; }
    yes.onclick = pick(true); no.onclick = pick(false);
    sc.lay.appendChild(a);
  }
  /** 八種符印：一張一張浮現；點一張放大看 */
  function sigilGrid(S, inner, anim, done, later) {
    var g = el('div', 'pz-sigils');
    S.sigils.forEach(function (src, i) {
      var b = el('button', 'pz-sigil-card' + (anim ? ' pz-sigil-wait' : '')); b.type = 'button'; b.setAttribute('aria-label', '符印 ' + (i + 1));
      var im = el('img'); im.src = src; im.alt = ''; im.draggable = false; b.appendChild(im);
      b.onclick = function (e) { e.stopPropagation(); if (b.classList.contains('pz-sigil-wait')) return; bigSigil(src); };
      g.appendChild(b);
      if (anim) later(function () { if (!b.classList.contains('pz-sigil-wait')) return; b.classList.remove('pz-sigil-wait'); b.classList.add('pz-sigil-in'); tone(440 + i * 55, 600, 'triangle', 0.025); buzz(8); }, 400 + i * 650);
    });
    inner.appendChild(g);
    if (anim) {
      var sc = med.scroll, fin = false, end = function () { if (fin) return; fin = true; sc.skip = null; [].forEach.call(g.querySelectorAll('.pz-sigil-wait'), function (b) { b.classList.remove('pz-sigil-wait'); }); if (done) done(); };
      sc.skip = end; later(end, 400 + S.sigils.length * 650 + 600);
    }
    else if (done) done();
  }
  function bigSigil(src) {
    var sc = med && med.scroll; if (!sc) return;
    var o = el('div', 'pz-sigil-big'), im = el('img'); im.src = src; im.alt = ''; o.appendChild(im);
    o.onclick = function (e) { e.stopPropagation(); o.classList.add('off'); setTimeout(function () { o.remove(); }, 300); };
    sc.lay.appendChild(o);
  }
  /** 收起來：羊皮紙捲回去、縮到左上角的捲軸 */
  function scrollClose() {
    var sc = med && med.scroll; if (!sc) return;
    var cur = med; cur.scroll = null;
    sc.timers.forEach(clearTimeout);
    var ic = cur.scrollIc && cur.scrollIc.getBoundingClientRect(), r = sc.parch.getBoundingClientRect();
    if (ic) sc.parch.style.transformOrigin = ((ic.left + ic.width / 2 - r.left) / r.width * 100) + '% ' + ((ic.top + ic.height / 2 - r.top) / r.height * 100) + '%';
    sc.lay.classList.add('pz-scroll-shut'); sc.lay.querySelector('.pz-veil').classList.remove('on');
    if (cur.scrollIc) cur.scrollIc.classList.add('pz-scroll-ic-in');
    setTimeout(function () { sc.lay.remove(); if (cur.scrollIc) cur.scrollIc.classList.remove('pz-scroll-ic-in'); }, reduced() ? 0 : 700);
  }

  /* 機關輪 */
  function summon(quiet) {
    if (!med || med.wheel) return;
    var M = med.M, W = M.wheel, root = med.root, fast = quiet || reduced();
    med.root.classList.add('pz-summoning');
    var veil = el('div', 'pz-veil on pz-veil-deep'); root.appendChild(veil);
    var size = Math.min(window.innerWidth * 0.88, window.innerHeight * 0.56, 480);
    var wrap = el('div', 'pz-wheel' + (fast ? '' : ' pz-wheel-in')); wrap.style.width = wrap.style.height = size + 'px';
    var outer = el('div', 'pz-ring-o'), inner = el('div', 'pz-ring-i');
    var oi = el('img'); oi.src = W.outer; oi.alt = ''; oi.draggable = false; outer.appendChild(oi);
    var ii = el('img'); ii.src = W.inner; ii.alt = ''; ii.draggable = false; inner.appendChild(ii);
    for (var g = 0; g < 8; g++) {   // 寶石的光：內環、外環各四顆（上右下左），轉的時候依序亮起
      var gm = el('b', 'pz-gem'), a = (g % 4) * Math.PI / 2, rr = g < 4 ? 0.315 : 0.462;
      gm.style.left = pct(0.5 + rr * Math.sin(a)); gm.style.top = pct(0.5 - rr * Math.cos(a)); gm.style.animationDelay = (0.4 * g) + 's';
      (g < 4 ? inner : outer).appendChild(gm);
    }
    var keyOf = {}; M.keys.forEach(function (k) { keyOf[k.id] = k; });
    var ks = size * (W.key || 0.2), slots = W.slots.map(function (s, i) {
      var sl = el('div', 'pz-slot' + (s.shape ? ' pz-slot-shape' : '')), a = s.at[0] * Math.PI / 180;
      sl.style.left = pct(0.5 + Math.sin(a) * s.at[1] / 2); sl.style.top = pct(0.5 - Math.cos(a) * s.at[1] / 2);
      sl.style.width = sl.style.height = ks + 'px'; sl.style.transform = 'translate(-50%,-50%) rotate(' + (s.rot || 0) + 'deg)';
      var k = keyOf[s.fit], im = el('img'); if (k) im.src = k.src; im.alt = ''; im.draggable = false; sl.appendChild(im);   // 放對了才看得到；shape：凹槽用鑰匙的剪影畫
      sl.dataset.i = i; (s.ring === 'inner' ? inner : outer).appendChild(sl);
      return { el: sl, s: s, key: null };
    });
    wrap.appendChild(outer); wrap.appendChild(inner);
    root.appendChild(wrap);
    med.wheel = { wrap: wrap, outer: outer, inner: inner, slots: slots, veil: veil, size: size, sel: null };
    if (!fast) { tone(80, 2400, 'sawtooth', 0.025, 160); buzz([20, 60, 20]); }
    // 鑰匙浮起來繞一圈、聚出能量，機關輪才出現
    if (!fast) {
      var c = { x: window.innerWidth / 2, y: wrap.getBoundingClientRect().top + size / 2 };
      M.keys.forEach(function (k, i) {
        var p = med.tray.querySelector('[data-k="' + k.id + '"]'); if (!p) return;
        var r = p.getBoundingClientRect(), f = el('img', 'pz-keyfly pz-orbit'); f.src = k.src; f.alt = '';
        f.style.left = (r.left + r.width / 2) + 'px'; f.style.top = (r.top + r.height / 2) + 'px';
        root.appendChild(f);
        var a = i * Math.PI / 2 - Math.PI / 2;
        setTimeout(function () { f.classList.add('go'); f.style.left = (c.x + Math.cos(a) * size * 0.32) + 'px'; f.style.top = (c.y + Math.sin(a) * size * 0.32) + 'px'; }, 100 + i * 220);
        setTimeout(function () { f.classList.add('pz-merge'); f.style.left = c.x + 'px'; f.style.top = c.y + 'px'; }, 1900);
        setTimeout(function () { f.remove(); }, 2700);
      });
      var burst = el('i', 'pz-burst'); burst.style.top = c.y + 'px'; root.appendChild(burst); setTimeout(function () { burst.remove(); }, 3600);
    }
    setTimeout(function () {
      if (!med || !med.wheel) return;
      wrap.classList.add('pz-wheel-on');
      if (M.done) { solved(true); return; }
      med.tray.classList.add('pz-tray-drag');
      [].forEach.call(med.tray.querySelectorAll('.pz-pouch[data-k]'), function (p) { dragKey(p, keyOf[p.dataset.k]); });
      slots.forEach(function (sl) { sl.el.onclick = function () { if (med.wheel.sel) { var s = med.wheel.sel; selKey(null); drop(s, sl); } }; });
    }, fast ? 100 : 2600);
  }
  function selKey(p) { if (!med || !med.wheel) return; if (med.wheel.sel) med.wheel.sel.p.classList.remove('pz-sel'); med.wheel.sel = p; if (p) p.p.classList.add('pz-sel'); }
  /** 拖鑰匙（也可以點鑰匙再點槽） */
  function dragKey(p, k) {
    var me = { p: p, k: k }, ghost = null, sx = 0, sy = 0, moved = false;
    p.onpointerdown = function (e) {
      if (p.classList.contains('pz-used')) return;
      e.preventDefault(); try { p.setPointerCapture(e.pointerId); } catch (x) {}
      sx = e.clientX; sy = e.clientY; moved = false;
      ghost = el('img', 'pz-ghost'); ghost.src = k.src; ghost.alt = '';
      var s = med.wheel.size * 0.2; ghost.style.width = ghost.style.height = s + 'px';
      ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px'; ghost.style.display = 'none';
      med.root.appendChild(ghost);
    };
    p.onpointermove = function (e) {
      if (!ghost) return;
      if (!moved && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 8) { moved = true; ghost.style.display = ''; p.classList.add('pz-lift'); selKey(null); }
      ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
    };
    p.onpointerup = p.onpointercancel = function (e) {
      if (!ghost) return;
      var g = ghost; ghost = null; p.classList.remove('pz-lift');
      if (!moved) { g.remove(); selKey(med.wheel.sel === me ? null : me); return; }
      var best = null, bd = med.wheel.size * 0.13;
      med.wheel.slots.forEach(function (sl) { var r = sl.el.getBoundingClientRect(), d = Math.hypot(r.left + r.width / 2 - e.clientX, r.top + r.height / 2 - e.clientY); if (d < bd) { bd = d; best = sl; } });
      if (best && drop(me, best)) { g.remove(); return; }
      var r = p.getBoundingClientRect(); g.classList.add('back'); g.style.left = (r.left + r.width / 2) + 'px'; g.style.top = (r.top + r.height / 2) + 'px';   // 放錯：靜靜飄回去
      setTimeout(function () { g.remove(); }, 400);
    };
  }
  /** 放進槽：對就嵌進去（震動、亮起、喀一聲）；錯什麼都不發生 */
  function drop(me, sl) {
    if (sl.key || me.p.classList.contains('pz-used') || sl.s.fit !== me.k.id) return false;
    sl.key = me.k.id; sl.el.classList.add('pz-slot-on'); me.p.classList.add('pz-used');
    buzz(40); tone(1800, 90, 'square', 0.03, 600); tone(140, 260, 'sine', 0.06);
    var W = med.wheel;
    if (W.slots.every(function (x) { return x.key; })) {
      var place = {}; W.slots.forEach(function (x, i) { place[x.key] = i; });
      after(function () { return call('wheel', { place: place }); }).then(function (res) {   // 排在找鑰匙後面（後端要先記到四把）
        if (!res.ok) { W.slots.forEach(function (x) { x.key = null; x.el.classList.remove('pz-slot-on'); }); [].forEach.call(med.tray.querySelectorAll('.pz-used'), function (q) { q.classList.remove('pz-used'); }); return; }
        med.M = res.view.med; setStage(5);
        solved(false);
      }, function (e) { toast(e.message, true); });
    }
    return true;
  }
  /** 四把都對：內外環反向轉、寶石依序亮起，停下後顯示下一關提示 */
  function solved(still) {
    var W = med.wheel, sp = med.M.wheel.spin || { outer: 720, inner: -720, ms: 5000 }, fast = still || reduced();
    W.slots.forEach(function (x) { x.el.classList.add('pz-slot-on'); });
    med.tray.classList.add('pz-tray-gone');
    var hp = box.querySelector('.pz-hop'); if (hp) hp.remove();   // 解開中世紀後不能再回田園
    W.wrap.classList.add('pz-wheel-run');
    var ms = fast ? 0 : sp.ms;
    W.outer.style.transition = W.inner.style.transition = fast ? 'none' : 'transform ' + ms + 'ms cubic-bezier(.45,.05,.25,1)';
    requestAnimationFrame(function () { requestAnimationFrame(function () { W.outer.style.transform = 'rotate(' + sp.outer + 'deg)'; W.inner.style.transform = 'rotate(' + sp.inner + 'deg)'; }); });
    if (!fast) { tone(55, ms, 'sawtooth', 0.03, 90); med.root.classList.add('pz-quake'); for (var i = 0; i < 6; i++) setTimeout(function () { tone(220, 220, 'triangle', 0.02); }, ms * i / 6); }
    setTimeout(function () {
      if (!med) return;
      med.root.classList.remove('pz-quake'); med.root.classList.add('pz-med-done');
      W.wrap.classList.add('pz-wheel-end');
      if (!fast) { buzz([30, 40, 60]); tone(392, 1600, 'triangle', 0.04); setTimeout(function () { tone(587, 1800, 'triangle', 0.035); }, 250); }
      nextHint(med.M.next || [], fast);
    }, ms + (fast ? 0 : 300));
  }
  function nextHint(lines, still) {
    var n = el('div', 'pz-next' + (still ? '' : ' pz-next-in')), t = 0;
    lines.forEach(function (s) {
      var p = el('p');
      if (still) p.textContent = s;
      else [].forEach.call(s, function (ch, ci) { var sp = el('span', '', ch); sp.style.animationDelay = (t + ci * 0.06).toFixed(2) + 's'; p.appendChild(sp); });
      t += s.length * 0.06 + 0.5; n.appendChild(p);
    });
    med.root.appendChild(n);
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
  /** 重新打開大廳（例如從其他地方回來）；排在還沒送完的找鑰匙後面 */
  function reopen() { if (!on() || busy) return; busy = true; after(function () { return call('view'); }).then(function (v) { busy = false; setStage(v.stage); open(v); }, function (e) { busy = false; toast(e.message, true); }); }

  return { init: init, decorate: decorate, tap: tap, isGatePage: isGatePage, abyss: abyss, reopen: reopen, close: close, _open: open };
})();
