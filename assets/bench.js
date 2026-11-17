/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 遊戲測試台（bench.html?c=營隊ID）：編輯者用，一頁同時看關主、玩家（1～3 位、可以選小隊）、投影畫面。
 *   選一個資源包 → 自動找（沒有就建立）名稱「🧪 測試台：資源包名稱」的活動（不公開）、連上資源包、開測試模式，
 *   然後用 iframe 開 game.html：關主（s=worker）、玩家（as=player&vp=p1&sq=1，見 game.js 的 bench）、投影（view=show）。
 *   每一格用自己的裝置代號（dev=），玩家用後端的虛擬玩家身分（Sync.gs gameAs_），所以關主收得到每位玩家各自的資料。
 *   「重新開始」＝結束測試（資料歸零）再開一次。測試台的活動學員看不到；要改遊戲設定到管理端「流程與活動 → 遊戲」改這個活動。
 */
(function () {
  var camp = param('c'), root = $('#root'), LS = 'ia_bench_' + camp;
  IA.token = store('ia_token');
  var toLogin = function () { location.href = 'index.html?next=' + encodeURIComponent('bench.html' + location.search); };
  if (!camp || !IA.token) { toLogin(); return; }
  IA.onAuth = function () { store('ia_token', null); toLogin(); };
  var pref = jget(LS, {}) || {}, packs = [], cur = null, seq = 0;
  var save = function () { jset(LS, pref); };
  var PREFIX = '🧪 測試台：';
  var sched = function (name, data, ver) { return op('pkg.data', { camp: camp, action: 'update', target: { pkg: 'schedule', op: name }, data: data, ver: ver }); };
  var acts = function () { return api('getPkgAdmin', camp, 'schedule').then(function (r) { return (r.data && r.data.activities) || []; }); };

  var pk = h('select', { class: 'input bench-pack', 'aria-label': '資源包' }), np = h('select', { class: 'input', 'aria-label': '玩家人數' }, [1, 2, 3].map(function (n) { return h('option', { value: String(n) }, n + ' 位玩家'); }));
  var showOn = h('input', { type: 'checkbox' }), status = h('div', { class: 'bench-status' }), frames = h('div', { class: 'bench-frames' });
  var again = h('button', { class: 'btn', type: 'button' }, '↺ 重新開始（歸零）');
  np.value = String(pref.n || 1); showOn.checked = pref.show !== false;
  clear(root);
  root.appendChild(h('div', { class: 'bench-top' },
    h('a', { class: 'btn ghost sm', href: 'admin.html?c=' + encodeURIComponent(camp) + '#data/schedule/games' }, '‹ 管理端'),
    h('b', { class: 'bench-title' }, '🧪 遊戲測試台'), pk, np, h('label', { class: 'bench-chk' }, showOn, ' 投影畫面'), again, status));
  root.appendChild(frames);

  function say(text, bad) { status.textContent = text || ''; status.classList.toggle('bad', !!bad); }
  /** 找到（或建立）這個資源包的測試台活動，連上資源包、開測試模式 → 活動 */
  function ensure(p, restart) {
    var name = PREFIX + p.name.replace(/（測試）$/, '');
    var find = function () { return acts().then(function (list) { return list.filter(function (a) { return a.data.name === name || (a.data.name.indexOf(PREFIX) === 0 && a.data.game && a.data.game.pack === p.id); })[0]; }); };
    return find().then(function (a) {
      if (a) return a;
      say('建立測試用的活動「' + name + '」…');
      return sched('activity.save', { name: name, publicMode: 'hidden' }).then(find);
    }).then(function (a) {
      if (!a) throw new Error('建立活動失敗');
      if (a.data.game && a.data.game.pack === p.id) return a;
      say('連上資源包…');
      return fetch('games/' + p.id + '/manifest.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (m) {
        return sched('activity.game', { id: a.id, game: { pack: p.id, label: '', cfg: {}, score: !!m.scoring, master: { on: false, pass: '' } } }, a.version);
      }).then(find);
    }).then(function (a) {
      var on = !!(a.data.game && a.data.game.test && a.data.game.test.on);
      if (on && !restart) return a;
      say(on ? '結束上一次測試、資料歸零…' : '開始測試模式…');
      return (on ? sched('activity.gameTest', { id: a.id, on: false }) : Promise.resolve()).then(function () { return sched('activity.gameTest', { id: a.id, on: true }); }).then(find);
    });
  }
  function frame(title, src, extra) {
    var f = h('iframe', { src: src, title: title, allow: 'camera; fullscreen; autoplay' });
    return h('div', { class: 'bench-cell ' + (extra && extra.cls || '') }, h('div', { class: 'bench-bar' }, h('b', null, title), extra && extra.tools || null,
      h('button', { class: 'btn ghost sm', type: 'button', title: '重新整理這一格', onclick: function () { f.src = src; } }, '↻'),
      h('a', { class: 'btn ghost sm', href: src.replace(/&dev=[^&]*/, ''), target: '_blank', title: '在新分頁打開', onclick: function (ev) { var w = window.open(this.href, '_blank'); if (w) ev.preventDefault(); } }, '↗')), f);
  }
  function draw() {
    clear(frames);
    if (!cur) return;
    var base = 'game.html?c=' + encodeURIComponent(camp) + '&g=' + encodeURIComponent(cur.pack.id) + '&a=' + encodeURIComponent(cur.act.id);
    var n = Number(np.value) || 1, sqs = pref.sq || [1, 2, 3];
    var phones = h('div', { class: 'bench-phones' });
    phones.appendChild(frame('🎯 關主／主持人', base + '&s=worker&dev=m', { cls: 'master' }));
    for (var i = 1; i <= n; i++) (function (i) {
      var sq = h('select', { class: 'input bench-sq', 'aria-label': '小隊' }, [1, 2, 3, 4, 5, 6, 7, 8].map(function (q) { return h('option', { value: String(q) }, '第 ' + q + ' 小隊'); }));
      sq.value = String(sqs[i - 1] || i);
      sq.addEventListener('change', function () { sqs[i - 1] = Number(sq.value); pref.sq = sqs; save(); draw(); });
      phones.appendChild(frame('📱 玩家 ' + i, base + '&as=player&vp=p' + i + '&sq=' + sq.value + '&vn=' + encodeURIComponent('玩家 ' + i) + '&dev=p' + i, { tools: sq }));
    })(i);
    frames.appendChild(phones);
    if (showOn.checked) frames.appendChild(frame('📺 投影畫面', base + '&s=worker&view=show&dev=s', { cls: 'show' }));
  }
  function open(restart) {
    var p = packs.filter(function (x) { return x.id === pk.value; })[0], my = ++seq;
    if (!p) return;
    pref.pack = p.id; save();
    pk.disabled = again.disabled = true; clear(frames);
    ensure(p, restart).then(function (a) {
      if (my !== seq) return;
      cur = { pack: p, act: a };
      say('活動「' + a.data.name + '」・測試模式第 ' + a.data.game.test.n + ' 次（學員看不到這個活動；結束測試會全部歸零）');
      draw();
    }, function (e) { if (my === seq) say('打不開：' + e.message, true); }).then(function () { pk.disabled = again.disabled = false; });
  }
  pk.addEventListener('change', function () { open(false); });
  np.addEventListener('change', function () { pref.n = Number(np.value); save(); draw(); });
  showOn.addEventListener('change', function () { pref.show = showOn.checked; save(); draw(); });
  again.addEventListener('click', function () { if (cur) open(true); });

  say('讀取資源包清單…');
  Promise.all([
    fetch('games/index.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }),
    // 後端有沒有「虛擬玩家」（Sync.gs gameAs_）：沒有的話每位玩家會被當成同一個人
    api('sync', camp, 'benchprobe', [], null, { peek: true, dev: 'probe', as: { p: 'p0' } }).then(function (r) { return /^v/.test(String(r.me)); }, function () { return true; })
  ]).then(function (res) {
    packs = (res[0] && res[0].packs) || [];
    pk.appendChild(h('option', { value: '' }, '選一個遊戲資源包…'));
    packs.forEach(function (p) { pk.appendChild(h('option', { value: p.id }, p.name + '（' + p.id + '）')); });
    if (!res[1]) root.insertBefore(h('div', { class: 'game-testbar' }, '後端還沒更新（Sync.gs）：玩家會被當成同一個人、沒有小隊，請先貼上新的 Sync.gs 並部署新版本。'), frames);
    say('選一個資源包開始。');
    if (pref.pack && packs.some(function (p) { return p.id === pref.pack; })) { pk.value = pref.pack; open(false); }
  }, function (e) { say('讀不到資源包清單：' + e.message, true); });
})();
