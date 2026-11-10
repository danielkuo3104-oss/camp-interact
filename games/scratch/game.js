/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 示範資源包「幸運刮刮樂」（測試用）：賭場用的線上刮刮樂。
 *   序號與獎項：系統先排好（寫死在資源包裡：序號鹽＋活動範圍算出每一張的序號，再用同一個種子洗牌決定哪張是什麼獎），
 *               手機上就能查，不用網路。測試模式換一次範圍，整副重排。
 *   關主（發券／兌獎）：「🎲 隨機發一張」從還沒發出去的序號裡隨機挑一張，顯示 QR code＋代碼；
 *               「🏆 兌獎」掃學員的兌獎 QR code，看是不是第一個刮這張的人、有沒有兌過，按「確認兌獎」。
 *               獎項庫存、最新刮開、重複使用的序號都看得到。測試模式可以指定發哪個獎。
 *   學員：掃關主的 QR code 或輸入序號 → 拿到一張刮刮樂，用手指刮開銀漆（有刮屑、震動），刮掉一半以上自動全開，
 *         中獎放動畫（頭獎全螢幕），沒中「銘謝惠顧」。測試模式可以自己指定獎項領一張。
 * 資料：學員領券、刮開各送一筆到 in-scratch（學員之間看不到別人的，關主看全部）；關主發券、兌獎送到 w-scratch（只有工作人員）。
 */
CampGame.register({
  mount: function (el, host) {
    var D = host.data, pool = buildPool(host, D);
    if (host.mode ? host.mode === 'master' : host.me.kind !== 'student') dealer(el, host, D, pool);
    else player(el, host, D, pool);
  }
});

/* ---------------- 序號與獎項（寫死在資源包裡） ---------------- */
var SC_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 沒有 0/O、1/I，好輸入
function scHash(str) {
  var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (var i = 0; i < str.length; i++) { var c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return [h1 >>> 0, h2 >>> 0];
}
function scCode(str) {
  var x = scHash(str), out = '';
  for (var j = 0; j < 8; j++) out += SC_ABC[(j < 4 ? x[0] >>> (j * 6) : x[1] >>> ((j - 4) * 6)) & 31];
  return out;
}
/** 序號顯示成 ABCD-EFGH */
function snShow(sn) { return sn.slice(0, 4) + '-' + sn.slice(4); }
/** 輸入的序號／掃到的網址 → 8 個字（大寫、去掉 - 和空白）；掃到網址時取 k 參數 */
function snParse(v) {
  v = String(v || '');
  var m = v.match(/[?&]k=([^&#]+)/);
  if (m) { try { v = decodeURIComponent(m[1]); } catch (e) { v = m[1]; } }
  m = v.match(/^SCRATCH:([A-Za-z0-9-]+)/);
  if (m) v = m[1];
  return v.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
/** 獎項：活動設定的 prizeText（一行一個：名稱|張數|說明）優先，沒填用資源包預設；最多 4 種（4 種圖） */
function prizeList(D) {
  var base = Array.isArray(D.prizes) && D.prizes.length ? D.prizes : [{ name: '中獎', count: 10, art: 'p4.svg' }];
  var txt = String(D.prizeText || '').trim(), list;
  if (txt) {
    list = txt.split(/\n+/).map(function (line) { return line.split(/[|｜]/).map(function (s) { return s.trim(); }); })
      .filter(function (p) { return p[0]; }).slice(0, 4)
      .map(function (p, i) { return { name: p[0].slice(0, 20), count: Math.max(0, parseInt(p[1], 10) || 0), note: (p[2] || '').slice(0, 40), art: (base[i] || base[base.length - 1]).art }; });
  } else list = base.slice(0, 4).map(function (p) { return { name: p.name, count: Math.max(0, Number(p.count) || 0), note: p.note || '', art: p.art }; });
  return list.map(function (p, i) { p.id = 'P' + (i + 1); p.tier = i + 1; return p; });
}
/** 整副刮刮樂：每張 { i, sn, p }，p 是獎項（沒中是 lose）。同一個活動範圍（測試模式每次不同）算出來都一樣 */
function buildPool(host, D) {
  var prizes = prizeList(D), lose = { id: 'L', name: String(D.loseName || '').trim() || '銘謝惠顧', note: '再接再厲', art: 'lose.svg', tier: 0, lose: true };
  var need = prizes.reduce(function (s, p) { return s + p.count; }, 0);
  var total = Math.min(2000, Math.max(need, Math.round(Number(D.total) || 0) || 120));
  var salt = 'scr|' + (D.keySalt || 'scratch') + '|' + (host.scope || '') + '|';
  // 洗牌：前面照獎項張數放好，再用固定種子打亂（mulberry32）
  var deck = [];
  prizes.forEach(function (p) { for (var k = 0; k < p.count && deck.length < total; k++) deck.push(p); });
  while (deck.length < total) deck.push(lose);
  var seed = scHash(salt + 'deal')[0];
  var rnd = function () { seed = (seed + 0x6D2B79F5) >>> 0; var t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (var i = deck.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
  var list = [], bySn = {}, byId = { L: lose };
  prizes.forEach(function (p) { byId[p.id] = p; });
  deck.forEach(function (p, n) {
    var sn = scCode(salt + 'sn|' + n), x = 0;
    while (bySn[sn]) sn = scCode(salt + 'sn|' + n + '|' + (++x));   // 極少數撞號：換一個
    var e = { i: n, sn: sn, p: p };
    list.push(e); bySn[sn] = e;
  });
  return { list: list, bySn: bySn, prizes: prizes, lose: lose, byId: byId, total: total, title: String(D.title || '').trim() || '幸運刮刮樂' };
}

/** 時間標記（台灣時間 月/日 時:分:秒） */
function scWhen(t) { var d = new Date(Number(t) + 8 * 3600000); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds()); }
function scStill() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
function scBuzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

/* ---------------- 一張刮刮樂（卡片＋銀漆＋刮的手勢） ----------------
 * 銀漆是 canvas：手指（或滑鼠）劃過的地方用 destination-out 擦掉，掉下銀色刮屑。
 * 刮了多少用格子算（24×12 格，筆刷碰到就算），不讀像素，舊 iPhone 也不會卡；刮掉 55% 以上自動全開。 */
function ticketView(host, pool, e, rec, onReveal) {
  var h = host.h, p = e.p;
  var under = h('div', { class: 'sc-under' + (p.lose ? ' lose' : ' win t' + p.tier) },
    h('img', { class: 'sc-art', src: host.asset(p.art), alt: '' }),
    h('div', { class: 'sc-pz' }, h('div', { class: 'sc-pzn' }, p.name), h('div', { class: 'sc-pzd' }, p.note || '')));
  var zone = h('div', { class: 'sc-zone' }, under), fx = h('div', { class: 'sc-fx' });
  var wrap = h('div', { class: 'sc-ticket' + (rec.rev ? ' done ' + (p.lose ? 'is-lose' : 'is-win t' + p.tier) : '') },
    h('img', { class: 'sc-bg', src: host.asset('card.svg'), alt: '' }),
    h('div', { class: 'sc-title' }, pool.title), h('div', { class: 'sc-sn' }, 'No. ' + snShow(e.sn)), zone, fx);
  var api = { el: wrap, reveal: null };
  if (rec.rev) return api;

  var cv = h('canvas', { class: 'sc-foil', 'aria-label': '刮開這裡' });
  zone.appendChild(cv);
  var W = 0, H = 0, dpr = 1, ctx = null, down = false, lx = 0, ly = 0, cells = {}, GX = 24, GY = 12, finished = false, lastFlake = 0, lastBuzz = 0, flakes = 0;
  function paint() {
    W = zone.clientWidth; H = zone.clientHeight; if (!W || !H) return false;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 先畫一層銀色（圖還沒載好也看不到底下的獎），圖好了再蓋上去
    var g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#e3e7ec'); g.addColorStop(0.5, '#b9c1ca'); g.addColorStop(1, '#dde2e8');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var img = new Image();
    img.onload = function () { if (!Object.keys(cells).length && !finished) { ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(img, 0, 0, W, H); } };
    img.src = host.asset('foil.svg');
    return true;
  }
  function brush() { return Math.max(18, W * 0.07); }
  function mark(x, y) {
    var r = brush() / 2, c0 = Math.max(0, Math.floor((x - r) / W * GX)), c1 = Math.min(GX - 1, Math.floor((x + r) / W * GX));
    var r0 = Math.max(0, Math.floor((y - r) / H * GY)), r1 = Math.min(GY - 1, Math.floor((y + r) / H * GY));
    for (var cx = c0; cx <= c1; cx++) for (var cy = r0; cy <= r1; cy++) cells[cx + ',' + cy] = 1;
  }
  function pos(ev) { var b = cv.getBoundingClientRect(); return { x: (ev.clientX - b.left) * (W / b.width), y: (ev.clientY - b.top) * (H / b.height) }; }
  function scratch(x0, y0, x1, y1) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = brush(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    // 線段上每隔半個筆刷記一次格子
    var dist = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(dist / (brush() / 2)));
    for (var k = 0; k <= n; k++) mark(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n);
    var now = performance.now();
    if (now - lastFlake > 40 && !scStill()) { lastFlake = now; flake(x1, y1); }
    if (now - lastBuzz > 140) { lastBuzz = now; scBuzz(6); }
  }
  /** 銀色刮屑：從手指的位置掉下來 */
  function flake(x, y) {
    if (flakes > 36) return;
    var zb = zone.getBoundingClientRect(), wb = wrap.getBoundingClientRect(), k = zb.width / W;
    for (var i = 0; i < 3; i++) {
      flakes++;
      var f = h('i', { class: 'sc-flake', style: { left: (zb.left - wb.left + x * k) + 'px', top: (zb.top - wb.top + y * k) + 'px',
        width: (3 + Math.random() * 4) + 'px', height: (2 + Math.random() * 3) + 'px' } });
      f.style.setProperty('--dx', Math.round((Math.random() - 0.5) * 60) + 'px');
      f.style.setProperty('--dy', Math.round(30 + Math.random() * 50) + 'px');
      f.style.setProperty('--r', Math.round(Math.random() * 540) + 'deg');
      fx.appendChild(f);
      setTimeout(function (f) { return function () { f.remove(); flakes--; }; }(f), 700);
    }
  }
  function ratio() { return Object.keys(cells).length / (GX * GY); }
  function finish() {
    if (finished) return; finished = true;
    cv.classList.add('gone');
    setTimeout(function () { cv.remove(); }, 600);
    wrap.classList.add('done', p.lose ? 'is-lose' : 'is-win', 't' + p.tier);
    onReveal();
  }
  api.reveal = finish;
  cv.addEventListener('pointerdown', function (ev) {
    if (finished || !ctx) return;
    down = true; try { cv.setPointerCapture(ev.pointerId); } catch (x) {}
    var q = pos(ev); lx = q.x; ly = q.y; scratch(lx, ly, lx + 0.1, ly + 0.1); ev.preventDefault();
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!down || finished) return;
    var q = pos(ev); scratch(lx, ly, q.x, q.y); lx = q.x; ly = q.y; ev.preventDefault();
    if (ratio() >= 0.55) finish();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (n) { cv.addEventListener(n, function () { down = false; if (!finished && ratio() >= 0.55) finish(); }); });
  // 卡片要先放到畫面上才量得到大小
  var tries = 0;
  (function init() { if (!paint() && tries++ < 40) requestAnimationFrame(init); })();
  api.ratio = ratio;
  return api;
}

/** 中獎動畫：頭獎、二獎全螢幕（光芒＋金幣雨），其他在卡片上（彩帶＋跳出獎項）；沒中是灰色搖一搖 */
function celebrate(host, pool, e, card) {
  var h = host.h, p = e.p, still = scStill();
  if (p.lose) { scBuzz(30); return; }
  scBuzz(p.tier <= 2 ? [80, 60, 80, 60, 200] : [60, 50, 120]);
  var big = p.tier <= 2, box = h('div', { class: 'sc-party' + (big ? ' big' : '') + ' t' + p.tier, role: 'status' });
  if (big) box.appendChild(h('div', { class: 'sc-rays' }));
  var colors = ['#ffd34d', '#f2c230', '#e23b4a', '#fff3b0', '#56ccf2', '#2f7d55'];
  if (!still) for (var i = 0; i < (big ? 70 : 36); i++) {
    var coin = big && i % 2 === 0;
    box.appendChild(h('i', { class: coin ? 'sc-coin' : 'sc-conf', style: { left: (Math.random() * 100) + '%', background: coin ? '' : colors[i % colors.length],
      animationDelay: (Math.random() * (big ? 1.4 : 0.6)) + 's', animationDuration: (1.6 + Math.random() * 1.6) + 's', transform: 'rotate(' + Math.round(Math.random() * 360) + 'deg)' } }));
  }
  box.appendChild(h('div', { class: 'sc-party-card' },
    h('img', { src: host.asset(p.art), alt: '' }),
    h('div', { class: 'sc-party-big' }, '🎉 恭喜中獎！'),
    h('div', { class: 'sc-party-pz' }, p.name), p.note ? h('div', { class: 'sc-party-note' }, p.note) : null,
    h('div', { class: 'small', style: { opacity: '.8', marginTop: '6px' } }, '點一下關閉')));
  (big ? document.body : card).appendChild(box);
  var close = function () { box.classList.add('out'); setTimeout(function () { box.remove(); }, 500); };
  box.addEventListener('click', close);
  setTimeout(close, big ? 6500 : 4200);
}

/* ---------------- 學員 ---------------- */
function player(el, host, D, pool) {
  var h = host.h, IN = host.ch('in-scratch'), cards = host.load('cards', {}) || {};
  var head = h('div', { class: 'card sc-card' }), stage = h('div', { class: 'sc-stage' }), list = h('div', { class: 'sc-list' });
  var code = h('input', { class: 'input sc-code', placeholder: '例如 ABCD-EFGH', autocapitalize: 'characters', autocomplete: 'off', maxlength: 12 });
  var claimBox = h('div', { class: 'card sc-card' }, h('div', { class: 'sc-t' }, '拿到刮刮樂了嗎？'),
    h('div', { class: 'small muted' }, '在兌換處拿到序號後，按「📷 掃描」掃關主的 QR code（不要用手機的相機 App），或輸入序號。'),
    h('button', { class: 'btn primary', style: { marginTop: '8px', width: '100%' }, onclick: function () { host.scan('掃描刮刮樂的 QR code').then(function (t) { if (t) claim(t); }); } }, '📷 掃描 QR code'),
    h('div', { class: 'row', style: { gap: '8px', marginTop: '8px' } }, code, h('button', { class: 'btn', onclick: function () { claim(code.value); } }, '開始刮')));
  el.appendChild(head); el.appendChild(stage); el.appendChild(claimBox);
  if (host.activity && host.activity.test) el.appendChild(testBox());
  el.appendChild(list);

  function renderHead() {
    var all = Object.keys(cards), won = all.filter(function (sn) { var e = pool.bySn[sn]; return e && cards[sn].rev && !e.p.lose; }).length;
    clear(head).appendChild(h('div', { class: 'sc-hd' }, h('div', null, h('div', { class: 'sc-name' }, '🎰 ' + pool.title), h('div', { class: 'small muted' }, host.me.name + (host.me.squad ? '・第 ' + host.me.squad + ' 小隊' : ''))),
      h('div', { class: 'sc-count' }, h('b', null, all.length), ' 張', won ? h('div', { class: 'small', style: { color: '#b47a10', fontWeight: '700' } }, '中獎 ' + won + ' 張') : null)));
  }
  function renderList() {
    clear(list);
    var sns = Object.keys(cards).sort(function (a, b) { return (cards[b].at || 0) - (cards[a].at || 0); });
    if (!sns.length) return;
    list.appendChild(h('div', { class: 'sc-t' }, '我的刮刮樂'));
    sns.forEach(function (sn) {
      var e = pool.bySn[sn], r = cards[sn]; if (!e) return;
      var res = !r.rev ? '還沒刮' : e.p.lose ? e.p.name : '🎉 ' + e.p.name + (e.p.note ? '（' + e.p.note + '）' : '');
      list.appendChild(h('button', { class: 'sc-item' + (r.rev ? (e.p.lose ? ' lose' : ' win') : ' new'), onclick: function () { open(sn); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
        h('div', { class: 'grow' }, h('div', { class: 'sc-it' }, 'No. ' + snShow(sn)), h('div', { class: 'small muted' }, '領取 ' + scWhen(r.at) + (r.rev ? '・刮開 ' + scWhen(r.rev) : ''))),
        h('div', { class: 'sc-res' }, res)));
    });
  }
  /** 打開一張：還沒刮的可以刮；刮過的直接看結果（中獎有兌獎 QR code） */
  function open(sn) {
    var e = pool.bySn[sn], r = cards[sn];
    clear(stage);
    var after = h('div', { class: 'sc-after' });
    var t = ticketView(host, pool, e, r, function () {
      r.rev = host.now(); host.save('cards', cards);
      host.submit(IN, { sn: sn, rev: 1, p: e.p.id }).catch(function () {});
      setTimeout(function () { celebrate(host, pool, e, t.el); result(); renderHead(); renderList(); }, 450);
    });
    function result() {
      clear(after);
      if (!r.rev) {
        after.appendChild(h('div', { class: 'small muted sc-hint' }, '用手指在銀色的地方刮刮看 👆　', h('a', { href: '#', onclick: function (ev) { ev.preventDefault(); t.reveal && t.reveal(); } }, '直接全部刮開')));
        return;
      }
      if (e.p.lose) { after.appendChild(h('div', { class: 'sc-msg lose' }, h('b', null, e.p.name), '，再接再厲！')); return; }
      var qr = h('div', { class: 'sc-qr' });
      after.appendChild(h('div', { class: 'sc-msg win' }, h('div', null, h('b', null, '🎉 中了「' + e.p.name + '」'), e.p.note ? '：' + e.p.note : ''),
        h('div', { class: 'small', style: { margin: '6px 0' } }, '到兌獎處出示這個 QR code（刮開時間 ' + scWhen(r.rev) + '）'), qr));
      host.qr(qr, 'SCRATCH:' + sn, 160);
    }
    stage.appendChild(t.el); stage.appendChild(after); result();
  }
  /** 領一張：序號要在這副牌裡；同一支手機領過的直接打開 */
  function claim(v, forced) {
    var sn = snParse(v), e = pool.bySn[sn];
    if (!e) { host.toast(sn ? '找不到這個序號，請再確認一次' : '請輸入序號', true); return; }
    code.value = '';
    if (!cards[sn]) {
      cards[sn] = { at: host.now() }; host.save('cards', cards);
      var d = { sn: sn, claim: 1 }; if (forced) d.test = 1;
      host.submit(IN, d).catch(function () {});
      host.toast('拿到一張刮刮樂！刮刮看');
      scBuzz(20);
    }
    open(sn); renderHead(); renderList();
  }
  /** 測試模式：自己指定獎項（或隨機）領一張，不用等關主發 */
  function testBox() {
    var sel = h('select', { class: 'input' }, h('option', { value: '' }, '隨機'), pool.prizes.concat([pool.lose]).map(function (p) { return h('option', { value: p.id }, p.name + (p.note ? '（' + p.note + '）' : '')); }));
    return h('div', { class: 'card sc-card sc-test' }, h('div', { class: 'sc-t' }, '🧪 測試：指定刮到哪個獎'),
      h('div', { class: 'small muted' }, '只有測試模式看得到。從這副牌裡挑一張（還沒在這支手機領過的）。'),
      h('div', { class: 'row', style: { gap: '8px', marginTop: '8px' } }, sel, h('button', { class: 'btn', onclick: function () {
        var c = pool.list.filter(function (x) { return !cards[x.sn] && (!sel.value || x.p.id === sel.value); });
        if (!c.length) { host.toast('這個獎的序號都領過了', true); return; }
        claim(c[Math.floor(Math.random() * c.length)].sn, true);
      } }, '領一張')));
  }
  renderHead(); renderList();
  // 一開始：有還沒刮的就打開最新的那張
  var pending = Object.keys(cards).filter(function (sn) { return !cards[sn].rev && pool.bySn[sn]; }).sort(function (a, b) { return cards[b].at - cards[a].at; });
  if (pending.length) open(pending[0]);
  var k = host.param('k');
  if (k) { try { history.replaceState(null, '', host.link({})); } catch (x) {} claim(k); }
}

/* ---------------- 關主（發券、兌獎、庫存） ---------------- */
function dealer(el, host, D, pool) {
  var h = host.h, IN = host.ch('in-scratch'), DESK = host.ch('w-scratch'), test = !!(host.activity && host.activity.test);
  var st = { issued: {}, claims: {}, revs: {}, paid: {}, feed: [] };   // 伺服器＋這支手機的狀態
  var tabs = h('div', { class: 'sc-tabs' }), body = h('div');
  el.appendChild(h('div', { class: 'card sc-card' }, h('div', { class: 'sc-hd' }, h('div', null, h('div', { class: 'sc-name' }, '🎰 ' + pool.title + '・兌換處'), h('div', { class: 'small muted' }, host.me.name + '・共 ' + pool.total + ' 張')),
    h('button', { class: 'btn sm', onclick: function (ev) { busy(ev.currentTarget, load); } }, '重新整理')), tabs));
  el.appendChild(body);
  var cur = host.load('tab', 'issue');
  var TABS = [['issue', '🎲 發券'], ['pay', '🏆 兌獎'], ['stock', '📊 庫存'], ['table', '📋 序號表']];
  function renderTabs() {
    clear(tabs);
    TABS.forEach(function (t) { tabs.appendChild(h('button', { class: 'sc-tab' + (cur === t[0] ? ' on' : ''), onclick: function () { cur = t[0]; host.save('tab', cur); renderTabs(); render(); } }, t[1])); });
  }

  /** 讀伺服器：w-scratch（發券、兌獎）＋ in-scratch（學員領券、刮開） */
  function load() {
    return Promise.all([host.inbox(DESK, 0), host.inbox(IN, 0)]).then(function (r) {
      var s = { issued: {}, claims: {}, revs: {}, paid: {}, feed: [] };
      (host.load('issued', []) || []).forEach(function (x) { s.issued[x.sn] = s.issued[x.sn] || { at: x.at, by: host.me.name }; });
      r[0].items.forEach(function (x) {
        var d = x.d || {}; if (!pool.bySn[d.sn]) return;
        if (d.issue) s.issued[d.sn] = s.issued[d.sn] || { at: x.t, by: x.name };
        if (d.paid) s.paid[d.sn] = s.paid[d.sn] || { at: x.t, by: x.name };
      });
      r[1].items.slice().sort(function (a, b) { return a.t - b.t; }).forEach(function (x) {
        var d = x.d || {}, e = pool.bySn[d.sn]; if (!e) return;
        var who = { c: x.c, name: x.name, squad: x.squad, at: x.t };
        if (d.claim) { (s.claims[d.sn] = s.claims[d.sn] || []).some(function (y) { return y.c === x.c; }) || s.claims[d.sn].push(who); }
        if (d.rev && !s.revs[d.sn]) { s.revs[d.sn] = who; s.feed.push({ e: e, who: who }); }
      });
      s.feed.reverse();
      st = s;
      var a = document.activeElement;   // 正在輸入序號、選獎項時不要重畫（不然打到一半會被清掉）
      if (!(a && body.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName))) render();
    }, function (e) { if (!(e && e.code === 'NET')) host.toast('讀取失敗：' + (e && e.message || ''), true); });
  }
  function used(sn) { return st.issued[sn] || st.claims[sn]; }
  function claimers(sn) { return st.claims[sn] || []; }
  function whoText(w) { return w ? w.name + (w.squad ? '（第 ' + w.squad + ' 小隊）' : '') : ''; }

  /* ---- 發券 ---- */
  var shown = null;
  function issue(pid) {
    var c = pool.list.filter(function (e) { return !used(e.sn) && (!pid || e.p.id === pid); });
    if (!c.length) { host.toast(pid ? '這個獎的序號都發完了' : '全部都發完了', true); return; }
    var e = c[Math.floor(Math.random() * c.length)], at = host.now();
    st.issued[e.sn] = { at: at, by: host.me.name };
    var lg = host.load('issued', []) || []; lg.unshift({ sn: e.sn, at: at }); host.save('issued', lg.slice(0, 2000));
    host.submit(DESK, { sn: e.sn, issue: 1 }).catch(function () {});
    shown = e.sn; scBuzz(15); render();
  }
  function issueTab() {
    var left = pool.list.filter(function (e) { return !used(e.sn); }).length;
    var out = h('div');
    var box = h('div', { class: 'card sc-card' }, h('div', { class: 'sc-t' }, '隨機發一張'),
      h('div', { class: 'small muted' }, '從還沒發出去的序號裡隨機挑一張。學員用遊戲裡的「📷 掃描」掃 QR code，或輸入序號。還剩 ' + left + ' / ' + pool.total + ' 張。'),
      h('button', { class: 'btn primary sc-big', onclick: function () { issue(''); } }, '🎲 隨機發一張'));
    if (test) {
      var sel = h('select', { class: 'input' }, pool.prizes.concat([pool.lose]).map(function (p) { return h('option', { value: p.id }, p.name); }));
      box.appendChild(h('div', { class: 'sc-test', style: { marginTop: '10px' } }, h('div', { class: 'small' }, '🧪 測試模式：指定發哪個獎'),
        h('div', { class: 'row', style: { gap: '8px', marginTop: '6px' } }, sel, h('button', { class: 'btn', onclick: function () { issue(sel.value); } }, '發這個獎'))));
    }
    out.appendChild(box);
    if (shown) {
      var e = pool.bySn[shown], qr = h('div', { class: 'sc-qr' });
      out.appendChild(h('div', { class: 'card sc-card sc-issued' }, h('div', { class: 'col', style: { alignItems: 'center', gap: '8px' } }, qr,
        h('div', { class: 'sc-bigcode' }, snShow(shown)), h('div', { class: 'small muted' }, '發出時間 ' + scWhen(st.issued[shown].at) + (test ? '・🧪 這張是「' + e.p.name + '」' : '')),
        h('button', { class: 'btn', onclick: function () { issue(''); } }, '下一張'))));
      host.qr(qr, host.link({ k: shown, s: 'student' }), 220);
    }
    var lg = (host.load('issued', []) || []).slice(0, 15);
    if (lg.length) {
      out.appendChild(h('div', { class: 'card sc-card' }, h('div', { class: 'sc-t' }, '這支手機最近發的'),
        lg.map(function (x) {
          var c = claimers(x.sn), rv = st.revs[x.sn];
          return h('div', { class: 'sc-row' }, h('code', null, snShow(x.sn)), h('span', { class: 'small muted grow' }, scWhen(x.at)),
            h('span', { class: 'small' }, rv ? '已刮・' + whoText(rv) : c.length ? '已領・' + whoText(c[0]) : '還沒領'),
            h('button', { class: 'btn sm ghost', onclick: function () { shown = x.sn; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }, '顯示'));
        })));
    }
    return out;
  }

  /* ---- 兌獎 ---- */
  var payOut = h('div'), paySn = '';
  function check(v) {
    var sn = snParse(v), e = pool.bySn[sn];
    if (!e) { host.toast('找不到這個序號', true); return; }
    paySn = sn;
    load().then(render);
  }
  function payCard() {
    if (!paySn) return null;
    var e = pool.bySn[paySn], c = claimers(paySn), rv = st.revs[paySn], pd = st.paid[paySn], warn = [];
    if (!rv) warn.push('伺服器還沒收到這張刮開的紀錄（學員可能沒網路，等一下再按重新整理）');
    if (c.length > 1) warn.push('⚠ 這張序號有 ' + c.length + ' 個人領過：' + c.map(whoText).join('、') + '。只算第一個人');
    var btn = h('button', { class: 'btn primary sc-big' }, '✓ 確認兌獎');
    btn.onclick = function () {
      busy(btn, function () { return host.submit(DESK, { sn: paySn, paid: 1 }); }).then(function () {
        st.paid[paySn] = { at: host.now(), by: host.me.name }; host.toast('已兌獎：' + e.p.name); scBuzz(30); render();
      }, function () {});
    };
    return h('div', { class: 'card sc-card sc-pay ' + (e.p.lose ? 'lose' : 'win') },
      h('div', { class: 'row', style: { gap: '12px', alignItems: 'center' } }, h('img', { class: 'sc-pay-art', src: host.asset(e.p.art), alt: '' }),
        h('div', { class: 'grow' }, h('div', { class: 'sc-pay-pz' }, e.p.name + (e.p.note ? '：' + e.p.note : '')), h('div', { class: 'small muted' }, 'No. ' + snShow(paySn)),
          h('div', { class: 'small' }, c.length ? '領取：' + whoText(c[0]) + '・' + scWhen(c[0].at) : '還沒有人領'),
          rv ? h('div', { class: 'small' }, '刮開：' + whoText(rv) + '・' + scWhen(rv.at)) : null)),
      warn.map(function (w) { return h('div', { class: 'sc-warn' }, w); }),
      e.p.lose ? h('div', { class: 'sc-msg lose' }, '這張沒有中獎') : pd ? h('div', { class: 'sc-msg done' }, '✓ 已經兌過了（' + pd.by + '・' + scWhen(pd.at) + '）') : btn);
  }
  function payTab() {
    var inp = h('input', { class: 'input sc-code', placeholder: '序號，例如 ABCD-EFGH', autocapitalize: 'characters', autocomplete: 'off' });
    clear(payOut).appendChild(payCard() || h('span'));
    return h('div', null, h('div', { class: 'card sc-card' }, h('div', { class: 'sc-t' }, '兌獎'),
      h('div', { class: 'small muted' }, '掃學員中獎畫面上的 QR code，或輸入序號。會檢查是不是第一個領這張的人、有沒有兌過。'),
      h('button', { class: 'btn primary', style: { marginTop: '8px', width: '100%' }, onclick: function () { host.scan('掃描學員的兌獎 QR code').then(function (t) { if (t) check(t); }); } }, '📷 掃描兌獎 QR code'),
      h('div', { class: 'row', style: { gap: '8px', marginTop: '8px' } }, inp, h('button', { class: 'btn', onclick: function () { check(inp.value); } }, '查詢'))), payOut);
  }

  /* ---- 庫存＋最新刮開 ---- */
  function stockTab() {
    var rows = pool.prizes.concat([pool.lose]).map(function (p) {
      var all = pool.list.filter(function (e) { return e.p === p; });
      var n = function (f) { return all.filter(function (e) { return f(e.sn); }).length; };
      return h('tr', null, h('td', null, h('b', null, p.name), p.note ? h('div', { class: 'small muted' }, p.note) : null), h('td', null, all.length),
        h('td', null, n(used)), h('td', null, n(function (sn) { return st.revs[sn]; })), h('td', null, p.lose ? '—' : n(function (sn) { return st.paid[sn]; })));
    });
    var dup = Object.keys(st.claims).filter(function (sn) { return st.claims[sn].length > 1; });
    return h('div', null,
      h('div', { class: 'card sc-card' }, h('div', { class: 'sc-t' }, '獎項庫存'),
        h('table', { class: 'sc-tbl' }, h('thead', null, h('tr', null, ['獎項', '總數', '已發', '已刮', '已兌'].map(function (t) { return h('th', null, t); }))), h('tbody', null, rows))),
      dup.length ? h('div', { class: 'card sc-card' }, h('div', { class: 'sc-t' }, '⚠ 重複使用的序號'), dup.map(function (sn) {
        return h('div', { class: 'sc-row' }, h('code', null, snShow(sn)), h('span', { class: 'small grow' }, st.claims[sn].map(whoText).join('、')));
      })) : null,
      h('div', { class: 'card sc-card' }, h('div', { class: 'sc-t' }, '最新刮開'),
        st.feed.length ? st.feed.slice(0, 30).map(function (x) {
          return h('div', { class: 'sc-row' + (x.e.p.lose ? '' : ' win') }, h('span', { class: 'sc-feed-pz' }, x.e.p.lose ? x.e.p.name : '🎉 ' + x.e.p.name),
            h('span', { class: 'small grow' }, whoText(x.who)), h('span', { class: 'small muted' }, scWhen(x.who.at)));
        }) : h('div', { class: 'small muted' }, '還沒有人刮開')));
  }

  /* ---- 序號表（可以複製去印實體卡） ---- */
  function tableTab() {
    var copy = h('button', { class: 'btn sm', onclick: function () {
      var txt = '序號\t獎項\n' + pool.list.map(function (e) { return snShow(e.sn) + '\t' + e.p.name; }).join('\n');
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { host.toast('已複製 ' + pool.total + ' 筆，可以貼到試算表'); }, function () { host.toast('沒辦法複製，請手動選取', true); });
    } }, '複製全部（貼到試算表）');
    return h('div', { class: 'card sc-card' }, h('div', { class: 'sc-hd' }, h('div', { class: 'sc-t' }, '序號與獎項（' + pool.total + ' 張）'), copy),
      h('div', { class: 'small muted', style: { marginBottom: '6px' } }, '系統先排好的，同一個活動每支手機算出來都一樣。不要給學員看。' + (test ? '測試模式是另一副，結束測試後作廢。' : '')),
      h('div', { class: 'sc-snlist' }, pool.list.map(function (e) {
        var s = st.paid[e.sn] ? '已兌' : st.revs[e.sn] ? '已刮' : claimers(e.sn).length ? '已領' : st.issued[e.sn] ? '已發' : '';
        return h('div', { class: 'sc-sni' + (e.p.lose ? '' : ' win') }, h('code', null, snShow(e.sn)), h('span', null, e.p.name), h('span', { class: 'small muted' }, s));
      })));
  }

  function render() {
    clear(body);
    body.appendChild(cur === 'pay' ? payTab() : cur === 'stock' ? stockTab() : cur === 'table' ? tableTab() : issueTab());
  }
  renderTabs(); render(); load();
  setInterval(function () { if (!document.hidden) load(); }, 20000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
  host.qr(h('div'), 'x', 40);   // QR code 程式先載好
}
