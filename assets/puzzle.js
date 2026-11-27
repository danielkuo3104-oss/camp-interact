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
 *   中世紀後半（Daniel 11/27）：轉盤分裂吐提示、浮石飛走、出現影子 → 暗 → 翻面＝光 → 光束照山 3 秒＝地 → 水鑰匙滴在巨木 3 秒＝木；
 *         每把鑰匙都有英文藝術字（要取的字母淡淡發光），集齊八把打開捲軸，字母飄出來排成暗號。
 *   工業入口：過關後按登出是假登出（app.js 倒數 30 秒），姓名欄輸入暗號按登入 → Puzzle.code（後端判斷）。工業還是佔位。
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
    if (stage() === 4) brandKey(mark);   // 哪一頁的「營」都可以（Daniel 11/26：去過田園的人都知道從這裡進）
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
      if (hit || k.find.in !== where || haveKey(k.id) || !heard(k.lit)) return;   // 沒點過那顆浮石：鑰匙藏的地方點了也沒反應（Daniel 11/27：不然亂按就有了）
      k.find.at.forEach(function (c) { var dx = x - c[0], dy = (y - c[1]) * ar; if (!hit && Math.sqrt(dx * dx + dy * dy) <= c[2]) hit = k; });
    });
    return hit;
  }
  /** 點過哪幾顆浮石（聽過提示）：存在手機上（ia_pz_heard_<營隊>，浮石圖的網址）；從石門第一次進中世紀時清掉 */
  function heardList() { try { return JSON.parse(localStorage.getItem('ia_pz_heard_' + E.camp) || '[]'); } catch (e) { return []; } }
  function heard(lit) { if (!lit) return true; var src = lit.replace(/stonec-/, 'stone-'); return heardList().indexOf(src) >= 0 || (med && med.heard && med.heard.indexOf(src) >= 0); }
  function markHeard(src) { if (med) med.heard = (med.heard || []).concat([src]); var l = heardList(); if (l.indexOf(src) < 0) l.push(src); try { localStorage.setItem('ia_pz_heard_' + E.camp, JSON.stringify(l)); } catch (e) {} }
  /** 從石門第一次進中世紀：捲軸開場要播、浮石要重新聽 */
  function freshMed() { try { localStorage.removeItem('ia_pz_scroll_' + E.camp); localStorage.removeItem('ia_pz_heard_' + E.camp); } catch (e) {} }
  /** 把找到的鑰匙記進畫面資料（藏的清單拿掉、鑰匙清單加上、對應的浮石變彩色） */
  function takeKey(v, k) {
    var M = v.med; gotKey(k.id);
    M.hide = (M.hide || []).filter(function (q) { return q.id !== k.id; });
    if (!(M.keys || []).some(function (q) { return q.id === k.id; })) M.keys = (M.keys || []).concat([{ id: k.id, src: k.src, area: k.area, word: k.word }]);
    (M.stones || []).forEach(function (s) { if (s.src.replace(/stone-/, 'stonec-') === k.lit) { s.lit = k.lit; s.word = k.word; } });
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
    if (haveKey(b.id) || !heard(b.lit)) return;   // 還沒點過火的浮石：「營」照舊只是敲
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
  var onShut = null;   // 大廳關掉時要做的事（從假登出進工業：關掉就回到 App）
  function close() {
    if (med && med.cleanup) med.cleanup(); med = null;
    if (box) { box.remove(); box = null; document.documentElement.classList.remove('pz-open'); }
    var f = onShut; onShut = null; if (f) f();
  }
  function open(v, mode, back) {
    close();
    onShut = back || null;
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
    if (mode === 'ind') { box.className = 'pz-lobby pz-ind'; industrial(v); return; }
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
    (M.hide || []).forEach(function (k) { if (k.find.in === 'brand' && on() && (!E.state.brand || !E.state.brand.lit)) E.state.brand = { id: k.id, src: k.src, lit: k.lit }; });   // 剛從石門進來的人：首頁的「營」也要知道
    if (!M.done) M.stones.forEach(function (s, i) { stg.appendChild(stone(s, i)); });   // 解開中世紀後浮石已經飛走了
    stg.onclick = seek;
    root.appendChild(med.tray = el('div', 'pz-tray'));
    box.appendChild(root);
    var onR = function () { fitStage(); };
    window.addEventListener('resize', onR);
    med.cleanup = function () { window.removeEventListener('resize', onR); if (med && med.scroll) med.scroll.timers.forEach(clearTimeout); };
    fitStage();
    drawTray();
    if (M.scroll) scrollBtn(M.scroll);
    var full4 = M.wheel && !M.done && (M.keys || []).length >= (M.need || 4);
    if (full4) setTimeout(function () { if (med && med.root === root) summon(false); }, 900);
    if (M.done) laterScene();   // 後四把：影子
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
  function chant(b, s, onEnd) {
    if (!med || med.busy) return;
    med.busy = true;
    var r = b ? b.getBoundingClientRect() : { left: window.innerWidth / 2 - 40, top: window.innerHeight * 0.36 - 40, width: 80, height: 80 }, root = med.root;
    var veil = el('div', 'pz-veil'), f = el('div', 'pz-focus'), im = el('img');
    im.src = s.lit || s.src; im.alt = ''; f.appendChild(im);
    for (var i = 0; i < 14; i++) { var m = el('b', 'pz-mote'); m.style.setProperty('--a', (i * 360 / 14) + 'deg'); m.style.animationDelay = (i * 0.13).toFixed(2) + 's'; f.appendChild(m); }
    f.style.left = r.left + 'px'; f.style.top = r.top + 'px'; f.style.width = r.width + 'px'; f.style.height = r.height + 'px';
    root.appendChild(veil); root.appendChild(f);
    if (b && s.src) markHeard(s.src);   // 聽過這顆浮石：它的鑰匙才找得到
    if (b) { b.style.visibility = 'hidden'; f.classList.add('pz-shake'); buzz(30); } else f.classList.add('pz-pop');   // 點浮石：先震一下
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
      if (s.word) {   // 唸完浮出英文藝術字（要取的字母淡淡發光）
        var wd = wordEl(s.word); wd.classList.add('pz-word-in'); wd.style.animationDelay = (fast ? 0 : total + 0.2).toFixed(2) + 's';
        lines.appendChild(wd);
        setTimeout(function () { tone(880, 1400, 'triangle', 0.03); buzz(10); }, (fast ? 0 : total + 0.2) * 1000);
        total += 1.4;
      }
      root.appendChild(lines);
      ready = setTimeout(function () { lines.classList.add('pz-chant-done'); }, (fast ? 0 : total + 0.9) * 1000);   // 唸完不會自己收回，再點一次才收（Daniel 11/26）
    }, fast ? 50 : 950);
    var ready = null, gone = false;
    function back() {
      if (gone) return; gone = true; clearTimeout(ready);
      lines.classList.add('off'); f.classList.remove('pz-awake'); veil.classList.remove('on');
      f.style.transform = 'none';
      setTimeout(function () { f.remove(); veil.remove(); lines.remove(); if (b) b.style.visibility = ''; if (med) med.busy = false; if (onEnd) onEnd(); }, fast ? 50 : 900);
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
  /** 上面的袋子：找到的鑰匙（沒找到的位置空著；解開中世紀後變 8 格）。點袋子：黑底展示所有鑰匙 */
  function drawTray(pending) {
    var t = med.tray, M = med.M; t.textContent = '';
    var list = allKeys(M), n = M.done ? 8 : (M.need || 4), nx = M.done ? laterNext(M) : null;
    t.classList.toggle('pz-tray-8', n > 4);
    for (var i = 0; i < n; i++) {
      var k = list[i], c = el('div', 'pz-pouch' + (k ? '' : ' pz-empty') + (k && (k.id === pending || (Array.isArray(pending) && pending.indexOf(k.id) >= 0)) ? ' pz-pending' : ''));
      if (k) {
        c.dataset.k = k.id; var im = el('img'); im.src = k.src; im.alt = ''; im.draggable = false; c.appendChild(im);
        if (nx && k.id === 'light' && nx.how === 'aim') c.classList.add('pz-glowkey');   // 光：可以拖出去照
        if (nx && k.id === 'water' && nx.how === 'drip') { c.classList.add('pz-drip'); c.appendChild(el('i', 'pz-drip-dot')); }   // 地吟唱完，水鑰匙開始滴水
        if (M.done) toolDrag(c, k);
      }
      t.appendChild(c);
    }
    t.onclick = function () {
      if (!med || t.classList.contains('pz-tray-drag') || med.wheel) return;
      if (med.noTap) { med.noTap = false; return; }
      gallery();
    };
  }
  /** 所有拿到的鑰匙（前四把＋後四把） */
  function allKeys(M) {
    var out = (M.keys || []).slice();
    if (M.done) (M.chain || []).forEach(function (c) { if ((M.later || []).indexOf(c.id) >= 0) out.push(c); });
    return out;
  }
  /** 後四把：下一把要找的（一把接一把） */
  function laterNext(M) { var h = M.later || []; return (M.chain || []).filter(function (c) { return h.indexOf(c.id) < 0; })[0] || null; }
  function wordOf(M, id) { var k = (M.keys || []).concat(M.chain || []).filter(function (q) { return q.id === id; })[0]; return k && k.word; }
  /** 英文藝術字：要取的那個字母上面一層淡淡的光 */
  function wordEl(w) {
    var d = el('div', 'pz-word'), im = el('img'); im.src = w.src; im.alt = ''; im.draggable = false; d.appendChild(im);
    if (w.w && w.h) d.style.aspectRatio = w.w + ' / ' + w.h;
    if (w.glow) { var g = el('i', 'pz-glow'); g.style.left = pct(w.glow[0]); g.style.width = pct(w.glow[1] - w.glow[0]); d.appendChild(g); }
    return d;
  }

  /* ---------------- 中世紀後半：後四把鑰匙（Daniel 11/27） ----------------
   *   影子（點）→ 暗 → 在鑰匙展示裡翻轉暗 → 光 → 把光拖出去，光束停在山上 3 秒 → 地 → 水鑰匙開始滴水，拖到巨木上 3 秒 → 木
   *   都在手機上判斷，背景送 puzzle.later；光照、滴水中途離開歸零，只有畫面回饋（光束變亮、水滴變多） */
  function laterScene() {
    if (!med) return;
    var nx = laterNext(med.M), old = med.stg.querySelector('.pz-shadow');
    if (nx && nx.how === 'shadow' && nx.at) { if (!old) med.stg.appendChild(shadowEl(nx)); }
    else if (old) old.remove();
  }
  function shadowEl(c) {
    var b = el('button', 'pz-shadow'); b.type = 'button'; b.setAttribute('aria-label', '一個影子');
    b.style.left = pct(c.at[0]); b.style.top = pct(c.at[1]); b.style.width = pct(c.at[2]);
    var im = el('img'); im.src = c.src; im.alt = ''; im.draggable = false; b.appendChild(im);
    b.onclick = function (e) {
      e.stopPropagation();
      if (!med || med.busy || med.gal || b.classList.contains('pz-shadow-go')) return;
      b.classList.add('pz-shadow-go'); buzz(20); tone(196, 1400, 'sine', 0.04);
      var r = b.getBoundingClientRect();
      setTimeout(function () { b.remove(); }, 900);
      gain(c, r.left + r.width / 2, r.top + r.height / 2);
    };
    return b;
  }
  /** 拿到後四把的其中一把：記進畫面資料、背景送後端；at 有位置就在那裡浮出來（點它才收下），收下後吟唱＋藝術字 */
  function gain(c, x, y, noReveal) {
    var cur = med, M = cur.M;
    if ((M.later || []).indexOf(c.id) < 0) M.later = (M.later || []).concat([c.id]);
    after(function () { return call('later', { k: c.id }); }).then(function (res) {
      var nm = res && res.view && res.view.med; if (nm && nm.spell) cur.M.spell = nm.spell;   // 集齊八把：排序答案
    }, function (e) { if (!/沒有反應/.test(e.message)) toast(e.message, true); });
    drawTray(noReveal ? null : c.id);
    if (noReveal) return;
    reveal(c.src, x, y, cur.root, function () {
      var p = cur.tray.querySelector('[data-k="' + c.id + '"]'); return p && p.getBoundingClientRect();
    }, function () {
      if (med !== cur) return;
      var p = cur.tray.querySelector('[data-k="' + c.id + '"]'); if (p) p.classList.remove('pz-pending');
      chant(null, c, function () { if (med === cur) { drawTray(); laterScene(); } });
    });
  }
  /** 這把鑰匙現在能不能拖出去用：光（下一把是地）、水（下一把是木） */
  function toolOf(id) {
    var nx = med && laterNext(med.M); if (!nx) return null;
    if (id === 'light' && nx.how === 'aim') return nx;
    if (id === 'water' && nx.how === 'drip') return nx;
    return null;
  }
  function beamLen() { return Math.min(window.innerHeight * 0.26, 220); }
  /** 光束的尖端（或水滴落下的地方）是不是在目標的圓裡（底圖比例，和找鑰匙一樣以寬為單位） */
  function onTarget(c, pt) {
    var r = med.stg.getBoundingClientRect(), x = (pt.x - r.left) / r.width, y = (pt.y - r.top) / r.height;
    var dx = x - c.at[0], dy = (y - c.at[1]) * (med.M.h / med.M.w);
    return Math.sqrt(dx * dx + dy * dy) <= c.at[2];
  }
  /** 從袋子拖出光或水：光往上射出一束光，水往下滴；對準目標持續 hold 毫秒就拿到下一把。沒拖動＝點一下（打開鑰匙展示） */
  function toolDrag(c, k) {
    var g = null, sx = 0, sy = 0, moved = false, tool = null, raf = 0, t0 = 0, aim = null;
    c.onpointerdown = function (e) {
      tool = toolOf(k.id); if (!tool || !med || med.busy || med.gal || med.scroll) return;
      e.preventDefault(); try { c.setPointerCapture(e.pointerId); } catch (x) {}
      sx = e.clientX; sy = e.clientY; moved = false; t0 = 0; aim = null;
      var light = k.id === 'light';
      g = el('div', 'pz-tool ' + (light ? 'pz-tool-light' : 'pz-tool-water'));
      if (light) { var bm = el('i', 'pz-beam'); bm.style.height = beamLen() + 'px'; g.appendChild(bm); }
      else { var dr = el('i', 'pz-drops'); for (var i = 0; i < 8; i++) { var d = el('b'); d.style.left = (25 + Math.random() * 50).toFixed(0) + '%'; d.style.animationDelay = (i * 0.14).toFixed(2) + 's'; dr.appendChild(d); } g.appendChild(dr); }
      var im = el('img'); im.src = k.src; im.alt = ''; im.draggable = false; g.appendChild(im);
      g.style.display = 'none'; med.root.appendChild(g); pos(e);
    };
    function pos(e) { g.style.left = e.clientX + 'px'; g.style.top = e.clientY + 'px'; aim = { x: e.clientX, y: e.clientY + (k.id === 'light' ? -beamLen() : 56) }; }
    c.onpointermove = function (e) {
      if (!g) return;
      if (!moved && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 8) { moved = true; g.style.display = ''; c.classList.add('pz-lift'); med.noTap = true; buzz(10); loop(); }
      pos(e);
    };
    function loop() {
      raf = requestAnimationFrame(function (t) {
        if (!g || !med) return;
        var p = 0;
        if (aim && onTarget(tool, aim)) { if (!t0) t0 = t; p = Math.min(1, (t - t0) / (med.M.hold || 3000)); } else t0 = 0;   // 離開就歸零
        g.style.setProperty('--p', p.toFixed(3)); g.classList.toggle('pz-hit', p > 0);
        [].forEach.call(g.querySelectorAll('.pz-drops b'), function (d, i) { d.style.opacity = i < 2 + p * 6 ? 1 : 0; });
        if (p >= 1) { var a = aim; stop(false); buzz([30, 40, 30]); gain(tool, a.x, a.y); return; }
        loop();
      });
    }
    function stop(back) {
      cancelAnimationFrame(raf); var gg = g; g = null; c.classList.remove('pz-lift'); if (!gg) return;
      if (!back) { gg.remove(); return; }
      var r = c.getBoundingClientRect(); gg.classList.add('back'); gg.style.left = (r.left + r.width / 2) + 'px'; gg.style.top = (r.top + r.height / 2) + 'px';
      setTimeout(function () { gg.remove(); }, 400);
    }
    c.onpointerup = c.onpointercancel = function () {
      if (!g) return;
      if (!moved) { stop(false); med.noTap = true; gallery(); return; }
      stop(true);
    };
  }
  /** 鑰匙展示：黑底，收集到的鑰匙漂浮著；點一把飛到中央、亮出藝術字；中央的暗再點一下會翻面（背面是光） */
  function gallery() {
    if (!med || med.gal || med.busy || med.wheel || med.scroll) return;
    var cur = med, M = cur.M, all = allKeys(M); if (!all.length) return;
    var g = el('div', 'pz-gal'), word = el('div', 'pz-gal-word'), sel = null;
    var lightC = (M.chain || []).filter(function (c) { return c.id === 'light'; })[0];
    var x = el('button', 'pz-gal-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', '收起'); x.onclick = function (e) { e.stopPropagation(); shut(); };
    g.appendChild(x);
    var items = all.map(function (k, i) {
      var b = el('button', 'pz-gal-key'); b.type = 'button'; b.setAttribute('aria-label', '一把鑰匙'); b.dataset.k = k.id;
      var a = -Math.PI / 2 + i * 2 * Math.PI / all.length, home = { l: 50 + 34 * Math.cos(a), t: 45 + 26 * Math.sin(a) };
      b.style.left = home.l.toFixed(2) + '%'; b.style.top = home.t.toFixed(2) + '%'; b.style.animationDelay = (-i * 0.7).toFixed(1) + 's';
      var inn = el('span', 'pz-gal-in'), fr = el('img', 'pz-face'); fr.src = k.src; fr.alt = ''; fr.draggable = false; inn.appendChild(fr);
      if (k.id === 'shadow' && lightC) { var bk = el('img', 'pz-face pz-back'); bk.src = lightC.src; bk.alt = ''; bk.draggable = false; inn.appendChild(bk); }
      b.appendChild(inn);
      var it = { k: k, b: b, home: home, flip: false };
      b.onclick = function (e) { e.stopPropagation(); pick(it); };
      g.appendChild(b);
      return it;
    });
    g.appendChild(word);
    g.onclick = function () { if (sel) unpick(); else shut(); };
    cur.root.appendChild(g); cur.gal = g;
    requestAnimationFrame(function () { requestAnimationFrame(function () { g.classList.add('on'); }); });
    tone(330, 900, 'sine', 0.03);
    function showWord(w) { word.textContent = ''; if (w) { var we = wordEl(w); we.classList.add('pz-word-in'); word.appendChild(we); } }
    function pick(it) {
      if (sel === it) { flip(it); return; }
      if (sel) unpick();
      sel = it; it.b.classList.add('on'); it.b.style.left = '50%'; it.b.style.top = '38%';
      buzz(10); tone(660, 700, 'triangle', 0.03);
      showWord(it.flip ? lightC.word : it.k.word);
    }
    function unpick() { var it = sel; sel = null; it.b.classList.remove('on'); it.b.style.left = it.home.l.toFixed(2) + '%'; it.b.style.top = it.home.t.toFixed(2) + '%'; word.textContent = ''; }
    function flip(it) {
      if (it.k.id !== 'shadow' || !lightC) { it.b.classList.remove('pz-nudge'); void it.b.offsetWidth; it.b.classList.add('pz-nudge'); return; }
      it.flip = !it.flip; it.b.classList.toggle('pz-flipped', it.flip); buzz(15); tone(it.flip ? 784 : 392, 900, 'triangle', 0.03);
      var nx = laterNext(cur.M);
      if (it.flip && nx && nx.id === 'light') {   // 第一次翻過來：拿到光
        word.textContent = '';
        setTimeout(function () { if (med !== cur) return; shut(true); gain(lightC, 0, 0, true); chant(null, lightC, function () { if (med === cur) drawTray(); }); }, 1100);
        return;
      }
      showWord(it.flip ? lightC.word : it.k.word);
    }
    function shut(fast) { if (cur.gal !== g) return; cur.gal = null; g.classList.remove('on'); setTimeout(function () { g.remove(); }, fast ? 0 : 500); }
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
      b.onclick = function (e) { e.stopPropagation(); show(t.id, true); };   // 每次切過去都重新浮現一次（點一下跳到結尾）
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
        if (anim && !fast) inkIn(sc, im, (id === 'en' ? 15000 : 11000) * (first ? 1 : 0.5), done); else if (done) done();   // 開場慢慢來；之後再看快一半
      }
    }
    if (!first) {
      lay.classList.add('pz-scroll-quick', 'pz-scroll-ready');
      show(sc.page, !cur.M.spell);   // 從左上角打開：魔法文字再浮現一次（Daniel 11/26：動畫不要只有第一次）
      if (cur.M.spell) later(function () { spell(sc, cur, later); }, 500);   // 集齊八把：字母飄出來排好（不提示，有打開的人才看得到）
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
  /** 八個藝術字的字母：從羊皮紙上一個一個亮起來，再飄到上方排成暗號 */
  function spell(sc, cur, later) {
    var M = cur.M, ids = M.spell || [], ws = ids.map(function (id) { return wordOf(M, id); });
    if (!ids.length || ws.some(function (w) { return !w || !w.glow || !w.w; })) return;
    var row = el('div', 'pz-spell'); sc.lay.appendChild(row); sc.lay.classList.add('pz-spelling');   // 羊皮紙暗下來，字母在中間排好
    var vw = window.innerWidth, H = Math.min(78, window.innerHeight * 0.09), gap = 2, items = [];
    function widths() { return ws.map(function (w) { return (w.glow[1] - w.glow[0]) * w.w * H / w.h; }); }
    var lw = widths(), tot = lw.reduce(function (a, b) { return a + b; }, 0) + gap * (ids.length - 1);
    if (tot > vw - 24) { H = H * (vw - 24) / tot; lw = widths(); tot = vw - 24; }
    var pr = sc.parch.getBoundingClientRect(), y = pr.top + pr.height * 0.42 - H / 2, x = (vw - tot) / 2, xs = [];
    lw.forEach(function (w) { xs.push(x); x += w + gap; });
    var band = el('i', 'pz-band'); band.style.top = (y - 14).toFixed(1) + 'px'; band.style.height = (H + 28).toFixed(1) + 'px'; row.appendChild(band);
    later(function () { band.classList.add('in'); }, 50);
    var ord = ids.map(function (_, i) { return i; }).sort(function () { return Math.random() - 0.5; }), n = ids.length;
    ws.forEach(function (w, i) {
      var L = el('div', 'pz-letter'), s = H / w.h, im = el('img');
      L.style.width = lw[i].toFixed(1) + 'px'; L.style.height = H.toFixed(1) + 'px';
      im.src = w.src; im.alt = ''; im.draggable = false; im.style.width = (w.w * s).toFixed(1) + 'px'; im.style.height = H.toFixed(1) + 'px'; im.style.left = (-w.glow[0] * w.w * s).toFixed(1) + 'px';
      L.appendChild(im);
      L.style.left = (pr.left + pr.width * (0.15 + Math.random() * 0.6)).toFixed(1) + 'px'; L.style.top = (pr.top + pr.height * (0.2 + Math.random() * 0.55)).toFixed(1) + 'px';
      row.appendChild(L);
      var k = ord.indexOf(i), it = { L: L, x: xs[i], shown: false, placed: false };
      it.show = function () { if (it.shown) return; it.shown = true; L.classList.add('in'); };
      it.place = function () { if (it.placed) return; it.show(); it.placed = true; L.classList.add('go'); L.style.left = it.x.toFixed(1) + 'px'; L.style.top = y.toFixed(1) + 'px'; };
      items.push(it);
      later(function () { if (!it.shown) { it.show(); tone(523 + k * 60, 700, 'triangle', 0.025); buzz(6); } }, 150 + k * 300);
      later(function () { it.place(); }, 150 + n * 300 + 900 + i * 140);
    });
    // 點一下：還在飄就直接排好；排好了再點一下，字母散去、羊皮紙亮回來
    var endT = 150 + n * 300 + 900 + n * 140 + 1300;
    function off() { sc.skip = null; row.classList.add('off'); sc.lay.classList.remove('pz-spelling'); setTimeout(function () { row.remove(); }, 900); }
    sc.skip = function () { items.forEach(function (it) { it.place(); }); sc.skip = off; };
    later(function () { if (sc.skip && sc.skip !== off) sc.skip = off; tone(392, 1600, 'triangle', 0.03); setTimeout(function () { tone(587, 1800, 'triangle', 0.025); }, 220); }, endT);
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
      split(fast);
    }, ms + (fast ? 0 : 300));
  }
  /** 轉盤分裂成兩半、吐出提示；點一下：兩半沉下去，鑰匙回到袋子，浮石脫離飛走，畫面多出一個影子 */
  function split(fast) {
    var cur = med, W = cur.wheel, M = cur.M;
    cur.busy = true;
    var keyBy = {}; (M.keys || []).forEach(function (k) { keyBy[k.id] = k; });
    var flies = W.slots.map(function (x) {
      var r = x.el.getBoundingClientRect(), k = keyBy[x.s.fit]; if (!k) return null;
      var im = el('img', 'pz-keyfly pz-hover'); im.src = k.src; im.alt = ''; im.style.left = (r.left + r.width / 2) + 'px'; im.style.top = (r.top + r.height / 2) + 'px';
      cur.root.appendChild(im); return { el: im, id: k.id };
    }).filter(Boolean);
    var halves = [0, 1].map(function (i) {
      var hh = W.wrap.cloneNode(true); hh.classList.add('pz-half', i ? 'pz-half-r' : 'pz-half-l');
      [].forEach.call(hh.querySelectorAll('.pz-slot img'), function (q) { q.remove(); });
      cur.root.appendChild(hh); return hh;
    });
    W.wrap.style.visibility = 'hidden';
    if (!fast) { tone(70, 1800, 'sawtooth', 0.03, 40); buzz([40, 30, 80]); }
    requestAnimationFrame(function () { requestAnimationFrame(function () { halves.forEach(function (hh) { hh.classList.add('go'); }); }); });
    var hint = nextHint(M.next || [], fast), ready = false;
    setTimeout(function () { if (med !== cur) return; ready = true; hint.classList.add('pz-tap-on'); }, fast ? 0 : (hint.t + 1) * 1000);
    W.veil.onclick = hint.onclick = function () { if (ready) { ready = false; go(); } };
    function go() {
      hint.classList.add('off'); setTimeout(function () { hint.remove(); }, 700);
      halves.forEach(function (hh) { hh.classList.add('sink'); }); setTimeout(function () { halves.forEach(function (hh) { hh.remove(); }); }, fast ? 0 : 1700);
      W.veil.classList.remove('on'); setTimeout(function () { W.veil.remove(); }, 900);
      W.wrap.remove(); cur.wheel = null; cur.root.classList.remove('pz-summoning');
      [].forEach.call(cur.stg.querySelectorAll('.pz-stone'), function (st, i) {   // 浮石脫離飛走
        st.style.setProperty('--fx', ((i % 2 ? 1 : -1) * (30 + i * 12)) + 'vw'); st.style.animationDelay = (i * 0.15) + 's';
        st.classList.add('pz-stone-away'); setTimeout(function () { st.remove(); }, fast ? 0 : 2600);
      });
      if (!fast) tone(262, 1600, 'sine', 0.03, 523);
      cur.tray.classList.remove('pz-tray-gone', 'pz-tray-drag');
      drawTray(flies.map(function (f) { return f.id; }));   // 鑰匙飛回袋子（8 格）
      flies.forEach(function (f, i) {
        setTimeout(function () {
          var p = cur.tray.querySelector('[data-k="' + f.id + '"]');
          if (!p || fast) { f.el.remove(); if (p) p.classList.remove('pz-pending'); return; }
          var r = p.getBoundingClientRect(); f.el.classList.add('go'); f.el.style.left = (r.left + r.width / 2) + 'px'; f.el.style.top = (r.top + r.height / 2) + 'px';
          setTimeout(function () { f.el.remove(); p.classList.remove('pz-pending'); buzz(8); tone(880 + i * 60, 400, 'triangle', 0.025); }, 950);
        }, fast ? 0 : 300 + i * 180);
      });
      setTimeout(function () { if (med !== cur) return; cur.busy = false; laterScene(); var sh = cur.stg.querySelector('.pz-shadow'); if (sh && !fast) sh.classList.add('pz-shadow-in'); }, fast ? 0 : 2200);
    }
  }
  function nextHint(lines, still, parent) {
    var n = el('div', 'pz-next' + (still ? '' : ' pz-next-in')), t = 0;
    lines.forEach(function (s) {
      var p = el('p');
      if (still) p.textContent = s;
      else [].forEach.call(s, function (ch, ci) { var sp = el('span', '', ch); sp.style.animationDelay = (t + ci * 0.06).toFixed(2) + 's'; p.appendChild(sp); });
      t += s.length * 0.06 + 0.5; n.appendChild(p);
    });
    n.t = still ? 0 : t;
    (parent || med.root).appendChild(n);
    return n;
  }
  /* ---------------- 工業（還沒設計：背景＋佔位文字） ---------------- */
  function industrial(v) {
    var I = v.ind || {}, bg = el('i', 'pz-ind-bg');
    if (I.bg) bg.style.backgroundImage = 'url("' + I.bg + '")';
    box.appendChild(bg);
    nextHint(I.text || [], reduced(), box).classList.add('pz-ind-text');
    if (!reduced()) { tone(98, 2400, 'sawtooth', 0.02, 70); buzz([20, 60, 20]); }
  }
  /** 假登出（app.js）：過關（第 5 關）以後才有 */
  function canFake() { return on() && !E.preview && stage() >= LOCK; }
  /** 假登出時在姓名欄輸入的字：送後端判斷是不是暗號。對了就打開工業（關掉時呼叫 back）、回 true；不是回 false（照一般登入） */
  function code(text, back) {
    if (!canFake() || !String(text || '').trim()) return Promise.resolve(false);
    return call('code', { code: String(text) }).then(function (res) {
      if (!res || !res.ok || !res.view) return false;
      E.state.stage = Math.max(E.state.stage || 0, res.view.stage || 0);   // 不呼叫 changed（App 現在是登入畫面）
      open(res.view, 'ind', back);
      return true;
    }, function () { return false; });
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
      if (stage() === 3) freshMed();   // 第一次進中世紀：捲軸一定自動打開（不管這支手機以前看過沒有）
      call('gate').then(function (v) { busy = false; setTimeout(function () { open(v); door.classList.remove('pz-door-open'); setStage(v.stage); }, reduced() ? 0 : 1500); },   // 門開完、大廳蓋上去之後才重畫頁面（不然畫面會跳回頂端）
        function (e) { busy = false; door.classList.remove('pz-door-open'); toast(e.message, true); });
    };
    a.appendChild(door);
    return a;
  }
  /** 重新打開大廳（例如從其他地方回來）；排在還沒送完的找鑰匙後面 */
  function reopen() { if (!on() || busy) return; busy = true; after(function () { return call('view'); }).then(function (v) { busy = false; setStage(v.stage); open(v); }, function (e) { busy = false; toast(e.message, true); }); }

  return { init: init, decorate: decorate, tap: tap, isGatePage: isGatePage, abyss: abyss, reopen: reopen, close: close, canFake: canFake, code: code, _open: open };
})();
