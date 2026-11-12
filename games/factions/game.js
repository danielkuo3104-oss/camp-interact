/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 測試資源包「神域・CHAOS 降臨」（雙陣營 RPG）：
 *   ・小隊分成兩個陣營（設定 teams），同一個遊戲看到不同的顏色、目標、歷史、NPC 對你說的話。
 *   ・神域疊在校園地圖上：NPC 的位置一開始是迷霧，找到關主、掃專屬密鑰（綁小隊）→ 迷霧散開、看到 NPC 的自介和給你陣營的話，
 *     手冊蓋上那位 NPC 的印戳（每位 NPC 一個符號）。
 *   ・每隊固定一個天賦、一個弱點（照活動範圍＋小隊算，關主畫面也看得到，不用另外記）。
 *   ・兩陣營的進度即時拔河（關主手機每 45 秒統計各小隊頻道，寫到同步頻道 war；學員只看工作人員寫的）。
 *   ・揭曉時間（endAt）到：所有人看到領先陣營的結局（關主也可以手動宣布）。
 * 關主：選 NPC＋小隊 → 密鑰／QR、這一隊的陣營與天賦弱點、自己的台詞（含問不出關鍵問題時的固定台詞）；「✓ 過關」記錄＋上傳分數。
 */
CampGame.register({
  mount: function (el, host) {
    var D = host.data, npcs = (Array.isArray(D.npcs) ? D.npcs : []).filter(function (n) { return n && n.id; });
    var byId = {}; npcs.forEach(function (n, i) { n.no = i + 1; byId[n.id] = n; });
    var F = (Array.isArray(D.factions) ? D.factions : []).slice(0, 4), fById = {}; F.forEach(function (f) { fById[f.id] = f; });
    if (!npcs.length || F.length < 2) { el.appendChild(host.h('div', { class: 'card' }, '這個活動還沒設定 NPC 或陣營')); return; }
    var ctx = { D: D, npcs: npcs, byId: byId, F: F, fById: fById, teamOf: teamMap(D, F) };
    if (host.mode === 'player') player(el, host, ctx); else master(el, host, ctx);

    // 即時分數榜（平台 host.api 2 才有）：玩家畫面最下面
    if (host.mode === 'player' && host.activity && host.scoreboard) { var bd = host.h('div', { class: 'gb-card' }); (el.querySelector('.fx-root') || el).appendChild(bd); host.scoreboard(bd); }
  }
});

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
function hm(t) { var d = new Date(Number(t) + 8 * 3600000); return pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()); }
function norm(v) { return String(v || '').toUpperCase().replace(/[\s\-_]/g, ''); }
/** 'A:1,3,5,7;B:2,4,6,8' → { '1': 'A', … }；沒寫到的小隊照奇偶分 */
function teamMap(D, F) {
  var m = {};
  String(D.teams || '').split(/[;；\n]/).forEach(function (part) {
    var x = part.split(/[:：]/); if (x.length < 2) return;
    var fid = x[0].trim(); x[1].split(/[,，\s]+/).forEach(function (n) { if (n.trim()) m[String(Number(n))] = fid; });
  });
  for (var i = 1; i <= (Number(D.squads) || 8); i++) if (!m[i]) m[i] = F[(i - 1) % 2].id;
  return m;
}
function npcKey(host, D, id, sq) { return host.key('rpg|' + (D.keySalt || 'factions') + '|' + host.scope + '|' + id + '|' + sq, 8); }
function npcCode(host, D, id, sq) { return id + '-' + npcKey(host, D, id, sq); }
/** 每隊固定的天賦、弱點 */
function traitsOf(host, D, sq) {
  var t = D.traits || {}, a = t.talents || [], b = t.weaknesses || [], k = host.key('trait|' + host.scope + '|' + sq, 4), n1 = k.charCodeAt(0) + k.charCodeAt(1), n2 = k.charCodeAt(2) * 7 + k.charCodeAt(3);
  return { talent: a.length ? a[n1 % a.length] : '', weak: b.length ? b[n2 % b.length] : '' };
}
function teamState(host, ctx, items, sq) {
  var got = {};
  items.slice().sort(function (a, b) { return (a.t || 0) - (b.t || 0); }).forEach(function (x) {
    var d = x.d || {}, at = Number(d.at) || x.t;
    if (!d.npc || !ctx.byId[d.npc] || norm(d.key) !== npcKey(host, ctx.D, d.npc, sq)) return;
    if (d.revoke) delete got[d.npc]; else if (!got[d.npc] || at < got[d.npc].at) got[d.npc] = { at: at };
  });
  return got;
}
/* ---- 拔河：關主手機統計、寫在同步頻道；學員只認工作人員（w／u 開頭）寫的、版本最新的 ---- */
function warCh(host) { return host.scope ? 'war:' + host.scope : 'war'; }
function watchWar(host, opts, cb) {
  var cur = null;
  var s = host.sync(warCh(host), Object.assign({ fast: 15000, slow: 45000 }, opts, {
    onStates: function (m) {
      var ch = false;
      Object.keys(m).forEach(function (c) { if (!/^[wu]/.test(c)) return; var st = m[c].st; if (st && st.v && (!cur || Number(st.v) > Number(cur.v) || (st.final && !cur.final))) { cur = st; ch = true; } });
      if (ch) cb(cur);
    }
  }));
  return { sync: s, get: function () { return cur; } };
}
/** 各陣營進度百分比：陣營所有小隊解開的 NPC ÷（小隊數 × NPC 數） */
function tally(ctx, perTeam) {
  var out = {}, n = ctx.npcs.length;
  ctx.F.forEach(function (f) { out[f.id] = { got: 0, max: 0 }; });
  Object.keys(ctx.teamOf).forEach(function (sq) { var f = out[ctx.teamOf[sq]]; if (!f) return; f.max += n; f.got += perTeam[sq] || 0; });
  Object.keys(out).forEach(function (k) { out[k].pct = out[k].max ? Math.round(out[k].got / out[k].max * 1000) / 10 : 0; });
  return out;
}
function leader(ctx, t) { var best = null; ctx.F.forEach(function (f) { if (!best || (t[f.id] && t[f.id].pct > t[best.id].pct)) best = f; }); return best; }

/** 神域地圖（畫在手機上，不用下載）：校園輪廓＋符文陣；迷霧用遮罩，解開的 NPC 周圍挖洞 */
function realmMap(host, ctx, got, f, onPin) {
  var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 1000 700'); svg.setAttribute('class', 'fx-map');
  var el = function (tag, attrs, parent) { var e = document.createElementNS(NS, tag); Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); (parent || svg).appendChild(e); return e; };
  var defs = el('defs', {});
  var g = el('radialGradient', { id: 'fxg' }, defs); el('stop', { offset: '0', 'stop-color': f.color, 'stop-opacity': '.55' }, g); el('stop', { offset: '1', 'stop-color': f.color, 'stop-opacity': '0' }, g);
  var mask = el('mask', { id: 'fxm' }, defs); el('rect', { x: 0, y: 0, width: 1000, height: 700, fill: '#fff' }, mask);
  ctx.npcs.forEach(function (n) { if (got[n.id]) el('circle', { cx: n.x, cy: n.y, r: 95, fill: '#000', class: 'fx-hole' }, mask); });
  // 校園（抽象）：草地、湖、道路、建築
  el('rect', { x: 0, y: 0, width: 1000, height: 700, fill: '#1c2a24' });
  el('ellipse', { cx: 300, cy: 300, rx: 120, ry: 70, fill: '#1f4a5a' });
  el('path', { d: 'M0 420 C 200 400, 400 470, 1000 430 M520 0 C 540 200, 500 450, 560 700 M120 0 C 160 240, 120 500, 220 700', stroke: '#4a5a52', 'stroke-width': 14, fill: 'none', 'stroke-linecap': 'round' });
  ctx.npcs.forEach(function (n) { el('rect', { x: n.x - 34, y: n.y - 22, width: 68, height: 44, rx: 6, fill: '#33443c' }); });
  // 神域符文陣
  var rune = el('g', { class: 'fx-rune', opacity: '.5' });
  [140, 230, 320].forEach(function (r, i) { el('circle', { cx: 500, cy: 350, r: r, fill: 'none', stroke: f.color, 'stroke-width': i === 1 ? 2 : 1, 'stroke-dasharray': i === 2 ? '4 10' : i ? '18 6' : '2 6' }, rune); });
  el('polygon', { points: '500,60 760,500 240,500', fill: 'none', stroke: f.color, 'stroke-width': 1.2, opacity: '.6' }, rune);
  el('polygon', { points: '500,640 760,200 240,200', fill: 'none', stroke: f.color, 'stroke-width': 1.2, opacity: '.6' }, rune);
  // 迷霧
  el('rect', { x: 0, y: 0, width: 1000, height: 700, fill: '#0c0f14', opacity: '.86', mask: 'url(#fxm)', class: 'fx-mist' });
  ctx.npcs.forEach(function (n) {
    var on = !!got[n.id], pin = el('g', { class: 'fx-pin' + (on ? ' on' : ''), transform: 'translate(' + n.x + ',' + n.y + ')' });
    if (on) el('circle', { r: 70, fill: 'url(#fxg)' }, pin);
    el('circle', { r: 24, fill: on ? f.color : '#2a2f3a', stroke: on ? '#fff' : f.color, 'stroke-width': 2, 'stroke-dasharray': on ? '' : '4 4' }, pin);
    var t = el('text', { 'text-anchor': 'middle', y: 9, 'font-size': 24, fill: '#fff' }, pin); t.textContent = on ? n.sigil || '★' : '？';
    var lb = el('text', { 'text-anchor': 'middle', y: 46, 'font-size': 20, fill: on ? '#fff' : '#9aa', 'font-weight': 700 }, pin); lb.textContent = on ? n.name : n.place || '';
    pin.addEventListener('click', function () { onPin(n); });
  });
  return svg;
}

/* ---------------- 學員 ---------------- */
function player(el, host, ctx) {
  var h = host.h, D = ctx.D, sq = host.me.squad;
  if (!sq) { el.appendChild(h('div', { class: 'card' }, '你還沒有小隊，請找隊輔')); return; }
  var f = ctx.fById[ctx.teamOf[String(sq)]] || ctx.F[0], foe = ctx.F.filter(function (x) { return x !== f; })[0];
  var ch = host.ch('sq' + sq + '-rpg'), got = host.load('got', {}) || {}, tr = traitsOf(host, D, sq);
  var root = h('div', { class: 'fx-root' }); root.style.setProperty('--fc', f.color);
  var war = h('div', { class: 'fx-war' }), mapBox = h('div', { class: 'fx-mapbox' }), book = h('div', { class: 'fx-book' }), cnt = h('span');
  var code = h('input', { class: 'input fx-code', placeholder: '輸入 NPC 給的密鑰，例如 N1-ABCD2345', autocomplete: 'off', autocapitalize: 'characters' });
  code.addEventListener('keydown', function (e) { if (e.key === 'Enter') claim(code.value); });
  root.appendChild(h('div', { class: 'fx-hd' }, h('div', { class: 'fx-crest' }, f.icon || '◆'), h('div', { class: 'grow' }, h('div', { class: 'fx-fname' }, f.name), h('div', { class: 'small fx-dim' }, (D.title || '') + '・第 ' + sq + ' 小隊'))));
  root.appendChild(h('div', { class: 'fx-goal' }, h('b', null, '你們的目標　'), f.goal || ''));
  root.appendChild(h('details', { class: 'fx-story' }, h('summary', null, '📖 你們讀到的歷史'), h('div', null, f.story || '')));
  root.appendChild(h('div', { class: 'fx-traits' }, h('div', null, h('b', null, '✨ 天賦　'), tr.talent || '—'), h('div', null, h('b', null, '⛓ 弱點　'), tr.weak || '—')));
  root.appendChild(war);
  root.appendChild(h('div', { class: 'fx-sec' }, '神域地圖'));
  root.appendChild(mapBox);
  root.appendChild(h('div', { class: 'fx-input' }, h('div', { class: 'row', style: { gap: '8px' } }, code, h('button', { class: 'btn primary', onclick: function () { claim(code.value); } }, '解開')),
    h('button', { class: 'btn fx-scan', onclick: function () { host.scan('掃描 NPC 的密鑰').then(function (t) { if (t) claim(t); }); } }, '📷 掃描 NPC 的 QR code')));
  root.appendChild(h('div', { class: 'fx-sec' }, '印戳手冊　', cnt));
  root.appendChild(book);
  el.appendChild(root);

  function showNpc(n, fresh) {
    var g = got[n.id];
    host.modal({ title: (g ? (n.sigil || '★') + ' ' : '') + (g ? n.name : '？？？'), body: g ? h('div', { class: 'fx-npc' }, h('div', { class: 'small fx-dim' }, '📍 ' + (n.place || '') + '　・　' + hm(g.at) + ' 相遇'),
      h('p', null, n.intro || ''), h('div', { class: 'fx-say' }, h('b', null, '對' + f.name + '說：'), h('div', null, n[f.id] || '')), fresh ? h('div', { class: 'small fx-dim' }, '印戳已經蓋進手冊') : null)
      : h('div', null, '還沒找到這位 NPC。地點提示：' + (n.place || '？')) });
  }
  function render(fresh) {
    clear(mapBox).appendChild(realmMap(host, ctx, got, f, function (n) { showNpc(n); }));
    clear(book);
    ctx.npcs.forEach(function (n) {
      var g = got[n.id];
      book.appendChild(h('div', { class: 'fx-seal' + (g ? ' on' : '') + (fresh === n.id ? ' fresh' : ''), onclick: function () { showNpc(n); } },
        h('div', { class: 'fx-sig' }, g ? n.sigil || '★' : '？'), h('div', { class: 'fx-sn' }, g ? n.name : n.place || ''), h('div', { class: 'small fx-dim' }, g ? hm(g.at) : '')));
    });
    cnt.textContent = Object.keys(got).filter(function (k) { return ctx.byId[k]; }).length + ' / ' + ctx.npcs.length;
  }
  var warSt = null;
  function renderWar() {
    var t = warSt && warSt.t || {}, a = t[f.id] || { pct: 0 }, b = t[foe.id] || { pct: 0 }, sum = a.pct + b.pct, w = sum ? a.pct / sum * 100 : 50;
    clear(war).appendChild(h('div', { class: 'fx-wlbl' }, h('span', null, (f.icon || '') + ' ' + f.name + ' ' + a.pct + '%'), h('span', null, b.pct + '% ' + foe.name + ' ' + (foe.icon || ''))));
    var bar = h('div', { class: 'fx-wbar' }, h('i', { style: { width: w + '%', background: f.color } }), h('u', { style: { background: foe.color } }));
    war.appendChild(bar);
    war.appendChild(h('div', { class: 'small fx-dim' }, warSt ? '兩陣營即時進度（' + hm(warSt.at || host.now()) + ' 更新）' : '等待關主回報兩陣營進度…'));
    checkEnd();
  }
  /** 揭曉：時間到或關主宣布 → 全螢幕播放領先陣營的結局（每人只自動播一次，可以再點來看） */
  var endAt = host.time(D.endAt);
  if (endAt !== null && (host.trial || (host.activity && host.activity.test)) && host.now() > endAt) endAt = null;   // 測試／試玩時已經過了：只看關主手動宣布
  function checkEnd() {
    var fin = warSt && warSt.final ? warSt : null, timeUp = endAt !== null && host.now() >= endAt;
    if (!fin && !timeUp) return;
    var win = fin && ctx.fById[fin.winner] || (warSt ? leader(ctx, warSt.t || {}) : null);
    if (!win) return;
    var eb = root.querySelector('.fx-endbtn'); if (eb) eb.remove();
    root.insertBefore(h('button', { class: 'btn fx-endbtn', onclick: function () { ending(win); } }, '🎬 結局：' + win.name), war);
    var tag = win.id + (fin ? ':' + fin.v : '');   // 關主宣布的結局一定再播一次
    if (host.load('endShown', '') === tag) return;
    host.save('endShown', tag); ending(win);
  }
  function ending(win) {
    var mine = win.id === f.id, box = h('div', { class: 'fx-end' + (mine ? ' win' : ' lose') }, h('div', { class: 'fx-endcard' },
      h('div', { class: 'fx-endk' }, mine ? '你們的陣營主導了結局' : win.name + ' 主導了結局'), h('div', { class: 'fx-endt', style: { color: win.color } }, (win.icon || '') + ' ' + win.name), h('p', null, win.ending || ''), h('div', { class: 'small fx-dim' }, '點一下關閉')));
    box.style.setProperty('--wc', win.color);
    box.onclick = function () { box.remove(); };
    document.body.appendChild(box);
    if (mine) host.fx.confetti({ colors: [win.color, '#fff', '#ffe08a'] }); else host.fx.flash(win.color);
  }
  function parse(v) {
    var raw = String(v || ''), m = raw.match(/[?&]k=([^&#]+)/);
    if (m) { try { raw = decodeURIComponent(m[1]); } catch (e) { raw = m[1]; } }
    m = norm(raw).match(/^([A-Z0-9]+?)([A-Z2-9]{8})$/);
    return m && ctx.byId[m[1]] ? { id: m[1], key: m[2] } : null;
  }
  function claim(v) {
    var p = parse(v);
    if (!p) { host.toast('密鑰格式不對（例如 N1-ABCD2345）', true); host.fx.shake(root); return; }
    if (p.key !== npcKey(host, D, p.id, sq)) { host.toast('迷霧沒有散開……這不是給你們小隊的密鑰', true); host.fx.shake(root); host.fx.buzz([40, 30, 40]); return; }
    code.value = '';
    var n = ctx.byId[p.id];
    if (got[p.id]) { showNpc(n); return; }
    got[p.id] = { at: host.now() }; host.save('got', got);
    host.submit(ch, { npc: p.id, key: p.key, at: got[p.id].at }).catch(function () {});
    host.fx.flash(f.color); host.fx.buzz(90);
    render(p.id);
    setTimeout(function () { showNpc(n, true); }, 650);
    if (Object.keys(got).length === ctx.npcs.length) setTimeout(function () { host.fx.confetti({ colors: [f.color, '#fff'] }); host.fx.banner('印戳全部集齊！'); }, 1200);
  }
  function refresh() {
    return host.inbox(ch, 0).then(function (r) {
      var srv = teamState(host, ctx, r.items || [], String(sq)), wait = {};
      host.queued(ch).forEach(function (d) { if (d && d.npc) wait[d.npc] = 1; });
      Object.keys(got).forEach(function (k) { if (!srv[k] && wait[k]) srv[k] = got[k]; });
      var before = Object.keys(got).length; got = srv; host.save('got', got);
      if (Object.keys(got).length !== before) render();
    }, function () {});
  }
  render(); renderWar();
  watchWar(host, { peek: true }, function (st) { warSt = st; renderWar(); });
  host.every(25000 + Math.floor(Math.random() * 8000), refresh, { now: true });
  if (endAt !== null) setInterval(checkEnd, 15000);
  var k = host.param('k');
  if (k) { try { history.replaceState(null, '', host.link({})); } catch (e) {} setTimeout(function () { claim(k); }, 400); }
}

/* ---------------- 關主 ---------------- */
function master(el, host, ctx) {
  var h = host.h, D = ctx.D, nSq = Math.max(1, Number(D.squads) || 8);
  var npc = host.load('npc', ctx.npcs[0].id), sq = host.load('sq', '1');
  if (!ctx.byId[npc]) npc = ctx.npcs[0].id;
  var npcBox = h('div', { class: 'fx-btns' }), sqBox = h('div', { class: 'fx-btns' }), keyBox = h('div', { class: 'fx-keyout' }), info = h('div'), script = h('div');
  var pts = h('input', { class: 'input', type: 'number', value: String(Number(D.pointsPerNpc) || 100), style: { width: '90px' } });
  var pass = h('button', { class: 'btn primary' }, host.activity ? '✓ 過關（記錄＋上傳分數）' : '✓ 記錄過關'), msg = h('div', { class: 'small fx-mdim' });
  var board = h('div', { class: 'fx-board' }), warBox = h('div');
  el.appendChild(h('div', { class: 'card fx-mcard' }, h('div', { class: 'fx-mtitle' }, (D.title || '雙陣營 RPG') + '・NPC／關主'), h('div', { class: 'small fx-mdim' }, host.me.name),
    h('div', { class: 'fx-msec' }, '我是哪位 NPC'), npcBox, h('div', { class: 'fx-msec' }, '眼前是第幾隊'), sqBox, info, keyBox,
    h('div', { class: 'row wrap', style: { gap: '8px', marginTop: '10px', alignItems: 'center' } }, h('span', null, '分數'), pts, pass), msg));
  el.appendChild(h('div', { class: 'card fx-mcard' }, h('div', { class: 'fx-msec' }, '🎭 台詞'), script));
  var rf = h('button', { class: 'btn sm' }, '重新統計'), fin = h('button', { class: 'btn sm danger' }, '🎬 宣布結局');
  el.appendChild(h('div', { class: 'card fx-mcard' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('div', { class: 'fx-msec' }, '兩陣營進度'), h('div', { class: 'row', style: { gap: '6px' } }, rf, fin)), warBox, board));
  host.qr(h('div'), 'x', 40);
  function draw() {
    clear(npcBox); clear(sqBox);
    ctx.npcs.forEach(function (n) { npcBox.appendChild(h('button', { class: 'btn sm' + (n.id === npc ? ' on' : ''), onclick: function () { npc = n.id; host.save('npc', npc); draw(); } }, (n.sigil || '') + ' ' + n.name)); });
    for (var i = 1; i <= nSq; i++) (function (s) {
      var fc = ctx.fById[ctx.teamOf[s]];
      sqBox.appendChild(h('button', { class: 'btn sm' + (s === sq ? ' on' : ''), style: { borderColor: fc ? fc.color : '' }, onclick: function () { sq = s; host.save('sq', s); draw(); } }, '第 ' + s + ' 隊'));
    })(String(i));
    var n = ctx.byId[npc], f = ctx.fById[ctx.teamOf[sq]] || ctx.F[0], tr = traitsOf(host, D, sq);
    clear(info).appendChild(h('div', { class: 'fx-minfo', style: { borderColor: f.color } }, h('div', null, h('b', { style: { color: f.color } }, (f.icon || '') + ' ' + f.name), '　第 ' + sq + ' 隊'),
      h('div', { class: 'small' }, '✨ 天賦：' + (tr.talent || '—')), h('div', { class: 'small' }, '⛓ 弱點：' + (tr.weak || '—'))));
    var qr = h('div', { class: 'fx-qr' }), c = npcCode(host, D, n.id, sq);
    clear(keyBox).appendChild(h('div', { class: 'col', style: { alignItems: 'center', gap: '6px' } }, qr, h('div', { class: 'fx-big' }, c), h('div', { class: 'small fx-mdim' }, '只有第 ' + sq + ' 隊能用（別隊偷掃驗不過）')));
    host.qr(qr, host.link({ k: c, s: 'student' }), 200);
    clear(script).appendChild(h('div', null, h('div', null, h('b', null, (n.sigil || '') + ' ' + n.name), '　📍 ' + (n.place || '')),
      h('div', { class: 'fx-line' }, '自我介紹：' + (n.intro || '')),
      h('div', { class: 'fx-line', style: { borderLeft: '4px solid ' + f.color } }, '對' + f.name + '：' + (n[f.id] || '')),
      h('div', { class: 'fx-line' }, n.fallback || '（沒有固定台詞）')));
  }
  pass.onclick = function () {
    var n = ctx.byId[npc], team = sq, pv = Number(pts.value);
    if (host.activity && !isFinite(pv)) return host.toast('請填分數', true);
    pass.disabled = true;
    host.submit(host.ch('sq' + team + '-rpg'), { npc: n.id, key: npcKey(host, D, n.id, team), master: 1, at: host.now() }).catch(function () {});
    (host.activity ? host.scoreSafe({ stage: n.id, stageName: n.name, team: Number(team), score: pv }) : Promise.resolve({ queued: 0 })).then(function (r) {
      msg.textContent = '✓ 第 ' + team + ' 隊遇見「' + n.name + '」' + (host.activity ? (r.queued ? '（沒網路，分數連上後自動上傳）' : '，' + pv + ' 分已上傳') : '');
      host.toast(msg.textContent.slice(2)); pass.disabled = false; setTimeout(load, 1500);
    });
  };
  // 統計各小隊 → 寫到同步頻道（學員看拔河）
  var war = watchWar(host, {}, function (st) { drawWar(st); });
  var per = {}, gotBy = {};
  function load() {
    var jobs = [];
    for (var i = 1; i <= nSq; i++) (function (s) {
      jobs.push(host.inbox(host.ch('sq' + s + '-rpg'), 0).then(function (r) { gotBy[s] = teamState(host, ctx, r.items || [], String(s)); per[s] = Object.keys(gotBy[s]).length; }, function () {}));
    })(i);
    return Promise.all(jobs).then(function () {
      var cur = war.get(), st = { v: host.now(), at: host.now(), t: tally(ctx, per), per: per };
      if (cur && cur.final) { st.final = true; st.winner = cur.winner; }
      war.sync.setState(st); drawWar(st); drawBoard();
    });
  }
  function drawWar(st) {
    if (!st) return;
    clear(warBox);
    ctx.F.forEach(function (f) { var x = st.t[f.id] || { pct: 0, got: 0, max: 0 }; warBox.appendChild(h('div', { class: 'fx-mwar' }, h('b', { style: { color: f.color } }, (f.icon || '') + ' ' + f.name), h('div', { class: 'fx-wbar sm' }, h('i', { style: { width: x.pct + '%', background: f.color } })), h('span', { class: 'small' }, x.pct + '%（' + x.got + '/' + x.max + '）'))); });
    if (st.final) warBox.appendChild(h('div', { class: 'small', style: { marginTop: '6px' } }, '🎬 已宣布結局：' + (ctx.fById[st.winner] || {}).name));
  }
  function drawBoard() {
    clear(board);
    for (var i = 1; i <= nSq; i++) {
      var s = String(i), f = ctx.fById[ctx.teamOf[s]] || {}, g = gotBy[s] || {};
      board.appendChild(h('div', { class: 'fx-brow' }, h('b', { style: { color: f.color, width: '64px' } }, '第 ' + s + ' 隊'), h('span', { class: 'fx-dots' }, ctx.npcs.map(function (n) { return h('i', { class: g[n.id] ? 'on' : '', style: g[n.id] ? { background: f.color } : null, title: n.name }); })), h('span', { class: 'small fx-mdim' }, Object.keys(g).length + '/' + ctx.npcs.length)));
    }
  }
  rf.onclick = function () { rf.disabled = true; load().then(function () { rf.disabled = false; }); };
  fin.onclick = function () {
    var t = tally(ctx, per), win = leader(ctx, t);
    var m = host.modal({ title: '宣布結局', body: h('div', null, '所有人的手機會播放「', h('b', { style: { color: win.color } }, win.name), '」的結局（照目前進度領先的陣營）。'), actions: [{ text: '取消' }, { text: '宣布', cls: 'primary', onClick: function () {
      war.sync.setState({ v: host.now(), at: host.now(), t: t, per: per, final: true, winner: win.id }); host.toast('已宣布：' + win.name); drawWar({ t: t, final: true, winner: win.id });
    } }] });
    return m;
  };
  draw();
  host.every(45000, load, { now: true });
}
