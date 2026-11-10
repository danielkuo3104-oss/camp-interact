/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 測試資源包「集章手冊」：每個人一本手冊，每格印章一開始是灰色輪廓。
 *   學員：到關卡掃 QR code（遊戲裡的「📷 掃描」）或輸入序號（例如 A1-ABCD2345）→ 蓋章動畫 → 蓋上彩色印章，下面記蓋章時間。
 *   工作人員（關主）：看每一關的序號和 QR code（可以全部印出來貼在關卡），看誰集了幾個。
 * 序號寫死在資源包裡（印章＋活動範圍算出來），驗證在手機上，不用網路；
 * 蓋好的章用 host.submit 送到頻道 sb（學員只讀得到自己的，換手機也找得回來；斷網先存著，連上自動補送）。
 */
CampGame.register({
  mount: function (el, host) {
    var D = host.data, stamps = D.stamps || [], byId = {};
    stamps.forEach(function (s) { byId[s.id] = s; });
    if (host.mode ? host.mode === 'player' : host.me.kind === 'student') student(el, host, D, stamps, byId);   // 工作人員試玩也是玩家畫面
    else master(el, host, D, stamps, byId);
  }
});

function pad2(n) { return (n < 10 ? '0' : '') + n; }
/** 台灣時間 月/日 時:分 */
function when(t) { var d = new Date(Number(t) + 8 * 3600000); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()); }
/** 台灣時間 2026.11.10 16:32（蓋在印章旁邊的日期） */
function postmark(t) { var d = new Date(Number(t) + 8 * 3600000); return d.getUTCFullYear() + '.' + pad2(d.getUTCMonth() + 1) + '.' + pad2(d.getUTCDate()) + ' ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()); }
function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
function reduced() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

/* ---------------- 序號（寫死在資源包裡，不用連線） ----------------
 * 序號 = 雜湊（序號鹽＋活動範圍＋印章）→ 8 個好輸入的字（沒有 0/O、1/I）。
 * 同一個資源包用在別的活動（或測試模式換一次）序號就不一樣；每個人拿到的是同一個（像關卡上的實體印章）。 */
var KEY_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function keyOf(host, D, id) {
  var str = 'stamp|' + (D.keySalt || 'stampbook') + '|' + (host.scope || '') + '|' + id;
  var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (var i = 0; i < str.length; i++) { var c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  var a = h1 >>> 0, b = h2 >>> 0, out = '';
  for (var j = 0; j < 8; j++) out += KEY_ABC[(j < 4 ? a >>> (j * 6) : b >>> ((j - 4) * 6)) & 31];
  return out;
}
function codeOf(host, D, id) { return id + '-' + keyOf(host, D, id); }
function keyOk(host, D, id, key) { return !!key && String(key).toUpperCase() === keyOf(host, D, id); }
/** 收件 → { 印章: { at } }（最早的那次），序號在手機上驗 */
function collected(host, D, byId, items) {
  var got = {};
  items.forEach(function (x) {
    var d = x.d; if (!d || !byId[d.stamp] || !keyOk(host, D, d.stamp, d.key)) return;
    var at = Number(d.at) || x.t;
    if (!got[d.stamp] || at < got[d.stamp].at) got[d.stamp] = { at: at };
  });
  return got;
}

/** 一格印章：灰色輪廓（還沒蓋）或彩色印章＋時間 */
function cell(host, s, g, onclick) {
  var h = host.h, art = host.asset(s.art);
  var ring = h('div', { class: 'sb-ring' + (g ? ' got' : '') },
    h('img', { class: 'sb-ghost', src: art, alt: '' }),
    g ? h('img', { class: 'sb-ink', src: art, alt: s.name, style: { transform: 'rotate(' + tilt(s.id) + 'deg)' } }) : null,
    g ? h('div', { class: 'sb-date' }, postmark(g.at)) : null);
  return h('div', { class: 'sb-cell' + (g ? ' got' : ''), 'data-id': s.id, onclick: onclick }, ring,
    h('div', { class: 'sb-cap' }, h('b', null, s.name), h('span', { class: 'small muted' }, g ? '✓ ' + when(g.at) : s.hint || '')));
}
/** 每個印章固定歪一點點（像真的手蓋的），重開也一樣 */
function tilt(id) { var n = 0; for (var i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) % 997; return (n % 15) - 7; }

/* ---------------- 學員 ---------------- */
function student(el, host, D, stamps, byId) {
  var h = host.h, ch = host.ch('sb'), got = host.load('got', {}) || {};
  var grid = h('div', { class: 'sb-grid' }), count = h('div', { class: 'sb-count' }), bar = h('i');
  var code = h('input', { class: 'input sb-code', placeholder: '輸入序號，例如 A1-ABCD2345', autocomplete: 'off', autocapitalize: 'characters' });
  code.addEventListener('keydown', function (e) { if (e.key === 'Enter') claim(code.value); });
  el.appendChild(h('div', { class: 'sb-book' },
    h('div', { class: 'sb-hd' }, h('img', { class: 'sb-hdicon', src: host.asset('stamp.svg'), alt: '' }), h('div', null, h('div', { class: 'sb-title' }, D.title || '一起集滿印章吧！'), h('div', { class: 'small muted' }, host.me.name))),
    h('div', { class: 'sb-prog' }, count, h('div', { class: 'sb-bar' }, bar)),
    grid));
  el.appendChild(h('div', { class: 'card sb-card' },
    h('button', { class: 'btn primary sb-scan', onclick: function () { host.scan('掃描關卡的印章 QR code').then(function (t) { if (t) claim(t); }); } }, '📷 掃描印章 QR code'),
    h('div', { class: 'row', style: { gap: '8px', marginTop: '8px' } }, code, h('button', { class: 'btn', onclick: function () { claim(code.value); } }, '蓋章')),
    h('div', { class: 'small muted', style: { marginTop: '6px' } }, '序號在手機上驗，沒網路也能蓋；連上網路後自動存到伺服器。')));

  function render(fresh) {
    clear(grid);
    stamps.forEach(function (s) {
      var c = cell(host, s, got[s.id], function () { if (got[s.id]) host.toast(s.name + '：' + postmark(got[s.id].at) + ' 蓋的'); else if (s.hint) host.toast('提示：' + s.hint); });
      if (fresh === s.id) c.classList.add('fresh');
      grid.appendChild(c);
    });
    var n = stamps.filter(function (s) { return got[s.id]; }).length;
    clear(count).appendChild(h('span', null, '已集 ', h('b', null, String(n)), ' / ' + stamps.length));
    bar.style.width = (stamps.length ? n / stamps.length * 100 : 0) + '%';
    var all = stamps.length && n === stamps.length;
    if (all) {
      var last = Math.max.apply(null, stamps.map(function (s) { return got[s.id].at; }));
      count.appendChild(h('span', { class: 'sb-done' }, '🎉 集章完成 ' + when(last)));
    }
    return all;
  }
  /** 伺服器上的（換手機、清掉瀏覽器也找得回來）＋手機上還沒送出去的 */
  function refresh() {
    return host.inbox(ch, 0).then(function (r) {
      var items = r.items || [];
      if (host.trial) items = items.filter(function (x) { return x.name === host.me.name; });   // 工作人員試玩：只看自己的
      var srv = collected(host, D, byId, items), wait = {};
      host.queued(ch).forEach(function (d) { if (d && d.stamp) wait[d.stamp] = 1; });
      Object.keys(got).forEach(function (k) { if (!srv[k] && wait[k]) srv[k] = got[k]; });   // 以伺服器為準；只留斷網時蓋、還排在手機裡沒送出的
      Object.keys(srv).forEach(function (k) { if (got[k] && got[k].at < srv[k].at) srv[k] = { at: got[k].at }; });
      got = srv; host.save('got', got); render();
    }, function () {});
  }
  function parse(v) {
    var m = String(v || '').match(/[?&]k=([^&#]+)/);   // 掃到的是網址（…&k=A1-XXXX）
    if (m) { try { v = decodeURIComponent(m[1]); } catch (e) { v = m[1]; } }
    v = String(v || '').toUpperCase().replace(/\s/g, '');
    m = v.match(/^([A-Z0-9]+?)-?([A-Z2-9]{8})$/);
    return m && byId[m[1]] ? { id: m[1], key: m[2] } : null;
  }
  var busy = false;
  function claim(v) {
    if (busy) return;
    var p = parse(v);
    if (!p) { host.toast('序號格式不對（例如 A1-ABCD2345）', true); return; }
    if (!keyOk(host, D, p.id, p.key)) { host.toast('這個序號不對', true); return; }
    var s = byId[p.id];
    if (got[p.id]) { host.toast('「' + s.name + '」已經蓋過了（' + when(got[p.id].at) + '）'); code.value = ''; return; }
    var at = host.now();
    got[p.id] = { at: at }; host.save('got', got);
    code.value = '';
    // 送到伺服器（沒網路先存手機，連上自動補送）
    host.submit(ch, { stamp: p.id, key: p.key, at: at }).catch(function () {});
    busy = true;
    press(host, s, at).then(function () {
      busy = false;
      var all = render(p.id);
      var c = grid.querySelector('[data-id="' + p.id + '"]'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
      if (all && !host.load('allDone', false)) { host.save('allDone', true); celebrate(host); }
    });
  }
  render();
  refresh();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  window.addEventListener('online', function () { setTimeout(refresh, 3000); });
  // 用手機相機掃 QR code 進來的：網址帶 k
  var k = host.param('k');
  if (k) { try { history.replaceState(null, '', host.link({})); } catch (e) {} setTimeout(function () { claim(k); }, 300); }
}

/** 蓋章動畫：印章從上面壓下來 → 碰一下（震動、墨水濺開）→ 抬起來，留下彩色印章和日期。點一下可以跳過 */
function press(host, s, at) {
  var h = host.h, art = host.asset(s.art);
  return new Promise(function (done) {
    var ink = h('img', { class: 'sb-ink', src: art, alt: s.name, style: { transform: 'rotate(' + tilt(s.id) + 'deg)' } });
    var date = h('div', { class: 'sb-date' }, postmark(at));
    var ring = h('div', { class: 'sb-ring big' }, h('img', { class: 'sb-ghost', src: art, alt: '' }), ink, date);
    var tool = h('img', { class: 'sb-tool', src: host.asset('stamp.svg'), alt: '' });
    var dots = h('div', { class: 'sb-splat' });
    for (var i = 0; i < 10; i++) {
      var a = i / 10 * Math.PI * 2 + Math.random() * .4, r = 46 + Math.random() * 14;
      dots.appendChild(h('i', { style: { left: 50 + Math.cos(a) * r + '%', top: 50 + Math.sin(a) * r + '%', animationDelay: (Math.random() * .08) + 's' } }));
    }
    var box = h('div', { class: 'sb-press' }, h('div', { class: 'sb-stage' }, h('div', { class: 'sb-pname' }, s.name), h('div', { class: 'sb-pwrap' }, ring, dots, tool), h('div', { class: 'sb-pmsg' }, '蓋章成功！'), h('div', { class: 'small sb-ptap' }, '點一下繼續')));
    document.body.appendChild(box);
    var ended = false, timers = [];
    function finish() {
      if (ended) return; ended = true; timers.forEach(clearTimeout);
      box.classList.add('out'); setTimeout(function () { box.remove(); done(); }, 300);
    }
    box.addEventListener('click', finish);
    if (reduced()) { box.classList.add('hit', 'up', 'calm'); timers.push(setTimeout(finish, 2200)); return; }
    // 0：印章在上面 → 0.55 秒壓下來 → 碰到：墨水出現、震一下 → 1.2 秒抬起來 → 3.2 秒自動關
    requestAnimationFrame(function () { box.classList.add('go'); });
    timers.push(setTimeout(function () { box.classList.add('hit'); if (navigator.vibrate) navigator.vibrate(60); }, 600));
    timers.push(setTimeout(function () { box.classList.add('up'); }, 1150));
    timers.push(setTimeout(finish, 3400));
  });
}
function celebrate(host) {
  var h = host.h, box = h('div', { class: 'sb-party' });
  var colors = ['#2f8f83', '#d9623b', '#6b7f2e', '#3a74b8', '#7a5bb5', '#c94f7c', '#d23c3c', '#2a8fb0'];
  if (!reduced()) for (var i = 0; i < 50; i++) box.appendChild(h('i', { style: { left: Math.random() * 100 + '%', background: colors[i % colors.length], animationDuration: (2 + Math.random() * 2) + 's', animationDelay: Math.random() * .8 + 's' } }));
  box.appendChild(h('div', { class: 'sb-party-card' }, h('div', { class: 'sb-party-big' }, '🎉 集章完成！'), h('div', null, '全部印章都蓋好了')));
  box.addEventListener('click', function () { box.remove(); });
  document.body.appendChild(box);
  setTimeout(function () { box.classList.add('out'); setTimeout(function () { box.remove(); }, 600); }, 4500);
}

/* ---------------- 工作人員（關主） ---------------- */
function master(el, host, D, stamps, byId) {
  var h = host.h;
  var list = h('div', { class: 'sb-keys' });
  stamps.forEach(function (s) {
    var codeText = codeOf(host, D, s.id);
    list.appendChild(h('div', { class: 'sb-keyrow' }, h('img', { src: host.asset(s.art), alt: '' }),
      h('div', { class: 'grow' }, h('b', null, s.name), h('div', { class: 'sb-mono' }, codeText)),
      h('button', { class: 'btn sm', onclick: function () { showQR(s); } }, '顯示 QR')));
  });
  function showQR(s) {
    var qr = h('div', { class: 'sb-qr' }), codeText = codeOf(host, D, s.id);
    host.modal({ title: s.id + ' ' + s.name, body: h('div', { class: 'col', style: { alignItems: 'center', gap: '8px' } }, qr, h('div', { class: 'sb-bigcode' }, codeText),
      h('div', { class: 'small muted' }, '學員用遊戲裡的「📷 掃描」掃，或輸入序號。每個人都是同一個序號，可以印出來貼在關卡。')) });
    host.qr(qr, host.link({ k: codeText, s: 'student' }), 240);
  }
  // 全部印出來：一頁一格，貼在各關卡
  var sheet = h('div', { class: 'sb-print' });
  function printAll() {
    clear(sheet);
    stamps.forEach(function (s) {
      var qr = h('div', { class: 'sb-qr' });
      sheet.appendChild(h('div', { class: 'sb-pcell' }, h('img', { src: host.asset(s.art), alt: '' }), h('b', null, s.name), qr, h('div', { class: 'sb-mono' }, codeOf(host, D, s.id))));
      host.qr(qr, host.link({ k: codeOf(host, D, s.id), s: 'student' }), 180);
    });
    setTimeout(function () { window.print(); }, 600);
  }
  el.appendChild(h('div', { class: 'card sb-card' }, h('div', { class: 'sb-title' }, host.pack.name + '・關主'), h('div', { class: 'small muted' }, host.me.name),
    h('div', { class: 'sb-t', style: { marginTop: '10px' } }, '各關印章序號'),
    h('div', { class: 'small muted', style: { marginBottom: '6px' } }, '序號寫在遊戲裡，沒網路也看得到；學員也是在手機上驗。' + (host.activity && host.activity.test ? '測試模式的序號跟正式不同，正式前要重新印。' : '')),
    list,
    h('button', { class: 'btn', style: { marginTop: '10px', width: '100%' }, onclick: printAll }, '🖨 列印全部 QR code')));
  // 誰集了幾個
  var board = h('div', { class: 'sb-board' }), rf = h('button', { class: 'btn sm' }, '重新整理');
  el.appendChild(h('div', { class: 'card sb-card' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('div', { class: 'sb-t' }, '集章進度'), rf), board));
  el.appendChild(sheet);
  function load() {
    return host.inbox(host.ch('sb'), 0).then(function (r) {
      var people = {}, per = {};
      (r.items || []).forEach(function (x) { (people[x.c] = people[x.c] || { name: x.name, squad: x.squad, items: [] }).items.push(x); });
      var rows = Object.keys(people).map(function (c) { var p = people[c]; p.got = collected(host, D, byId, p.items); p.n = Object.keys(p.got).length; return p; });
      rows.forEach(function (p) { Object.keys(p.got).forEach(function (k) { per[k] = (per[k] || 0) + 1; }); });
      rows.sort(function (a, b) { return b.n - a.n || String(a.name).localeCompare(String(b.name)); });
      clear(board);
      var full = rows.filter(function (p) { return p.n === stamps.length; }).length;
      board.appendChild(h('div', { class: 'small muted' }, rows.length + ' 人蓋過章・' + full + ' 人集滿'));
      board.appendChild(h('div', { class: 'sb-per' }, stamps.map(function (s) { return h('span', { class: 'sb-chip' }, h('img', { src: host.asset(s.art), alt: '' }), String(per[s.id] || 0)); })));
      if (!rows.length) board.appendChild(h('div', { class: 'small muted' }, '還沒有人蓋章'));
      rows.forEach(function (p) {
        board.appendChild(h('div', { class: 'sb-prow' }, h('span', { class: 'grow' }, p.name + (p.squad ? '（第 ' + p.squad + ' 小隊）' : '')),
          h('span', { class: 'sb-dots' }, stamps.map(function (s) { return h('i', { class: p.got[s.id] ? 'on' : '', title: s.name + (p.got[s.id] ? ' ' + when(p.got[s.id].at) : '') }); })),
          h('span', { class: 'small muted' }, p.n + '/' + stamps.length)));
      });
    });
  }
  rf.onclick = function () { rf.disabled = true; load().then(function () { rf.disabled = false; }, function (e) { rf.disabled = false; host.toast(e && e.message || '讀取失敗', true); }); };
  load().catch(function () { clear(board).appendChild(h('div', { class: 'small muted' }, '沒網路，連上後按「重新整理」')); });
}
