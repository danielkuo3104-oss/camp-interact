/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 示範資源包「霧之校園」（測試用）：定向越野＋集章。
 *   學員：地圖一開始整片是霧，提示只給謎語不給地點；找到關主、拿到密鑰（掃 QR code 或輸入代碼）後，那一關附近的霧散開。
 *         同一小隊共用進度（集章存在伺服器的小隊頻道 sqN-fog，隊友即時收到通知）。終點在結束前 N 分鐘自動公布（照伺服器時間）。
 *   工作人員：選關卡＋小隊產生關主密鑰（QR code／代碼，綁小隊：A 隊拿去給 B 隊用驗不過），看各小隊進度；
 *             這一隊過關時按「過關」，記錄完成並把分數送進團隊計分（每隊每關一筆，重送是更新）；產生過的密鑰有紀錄，可以撤回或補標完成。
 * 密鑰寫死在資源包裡（keyOf：關卡＋小隊＋活動算出來），關主產生、學員驗證都在手機上，不用連線；
 * 伺服器只用來讓同一小隊互相補齊（集章送到小隊頻道，斷網先存手機、連上自動補送）。
 */
CampGame.register({
  mount: function (el, host) {
    var h = host.h, D = host.data, stamps = D.stamps || [], byId = {};
    stamps.forEach(function (s) { byId[s.id] = s; });
    if (host.mode ? host.mode === 'player' : host.me.kind === 'student') student(el, host, h, D, stamps, byId);   // 工作人員試玩也是玩家畫面
    else worker(el, host, h, D, stamps);

    // 即時分數榜（平台 host.api 2 才有）：玩家畫面最下面
    if (host.mode === 'player' && host.activity && host.scoreboard) { var bd = host.h('div', { class: 'gb-card' }); (el.querySelector('.fm-root') || el).appendChild(bd); host.scoreboard(bd); }
  }
});

/** 解開的時間（台灣時間 月/日 時:分） */
function when(t) { var d = new Date(Number(t) + 8 * 3600000); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()); }

/* ---------------- 密鑰（寫死在資源包裡，不用連線） ----------------
 * 密鑰 = 雜湊（資源包鹽＋活動範圍＋關卡＋小隊）轉成 8 個好輸入的字（沒有 0/O、1/I）。
 * 同一個資源包用在別的活動（或測試模式換一次）密鑰就不一樣；小隊 '*' 是哪一隊都能用。 */
var KEY_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function keyOf(host, D, stampId, squad) {
  var str = 'fog|' + (D.keySalt || 'fogmap') + '|' + (host.scope || '') + '|' + stampId + '|' + squad;
  var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (var i = 0; i < str.length; i++) { var c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  var a = h1 >>> 0, b = h2 >>> 0, out = '';
  for (var j = 0; j < 8; j++) out += KEY_ABC[(j < 4 ? a >>> (j * 6) : b >>> ((j - 4) * 6)) & 31];
  return out;
}
function keyOk(host, D, stampId, key, squad) {
  key = String(key || '').toUpperCase();
  return !!key && (key === keyOf(host, D, stampId, String(squad)) || key === keyOf(host, D, stampId, '*'));
}
/** 小隊頻道的紀錄 → 解開了哪些關（照時間：解開／關主撤回），密鑰在手機上驗；舊版有伺服器簽章的（x.ok）也算 */
function teamState(host, D, byId, items, squad) {
  var got = {}, revokedAt = {}, bad = 0;
  items.slice().sort(function (x, y) { return x.t - y.t; }).forEach(function (x) {
    var d = x.d; if (!d || !byId[d.stamp]) return;
    var ok = d.key ? keyOk(host, D, d.stamp, d.key, squad) : x.ok === true;
    if (!ok) { if (!d.revoke) bad++; return; }
    if (d.revoke) { delete got[d.stamp]; revokedAt[d.stamp] = x.t; }
    else if (!got[d.stamp]) got[d.stamp] = { at: x.t, master: !!d.master };
  });
  return { got: got, revokedAt: revokedAt, bad: bad };
}

/* ---------------- 隱藏關卡 ----------------
 * 關卡設 hidden: true（例如第 7 關＝最後集合的地方）：學員畫面上完全不出現（不顯示、不倒數），
 * 直到「活動結束時間」前 revealMinutesBefore 分鐘（照伺服器時間）才出現在清單和地圖上；
 * 時間還沒到就先拿到關主密鑰的也算（解開了就看得到）。關主那邊一直看得到，可以產生密鑰、記錄過關。
 * 時間用活動設定（管理端填）的 endAt／revealMinutesBefore，沒填用關卡自己的。沒有時間就不會自己出現。 */
function revealAt(host, D, s) {
  var t = host.time(D.endAt || s.endAt);
  return t === null ? null : t - (Number(D.revealMinutesBefore) || Number(s.revealMinutesBefore) || 30) * 60000;
}
function revealed(host, D, s) { var t = revealAt(host, D, s); return t !== null && host.now() >= t; }

/* ---------------- 地圖＋霧 ----------------
 * 霧會慢慢飄動：兩層雲的紋理（開地圖時畫好一次）往不同方向平移，解開的地方邊緣輕輕起伏。
 * 全部在手機上畫（canvas），不用網路，斷網照樣動。為了省電：每秒最多畫 24 次；
 * 切到背景、地圖捲出畫面、全部過關（霧散掉）就停；手機設定「減少動態效果」只畫靜態的霧。 */
function fogMap(host, D) {
  var h = host.h, wrap = h('div', { class: 'fm-map' }), img = h('img', { class: 'fm-img', src: host.asset(D.map), alt: '校園地圖' });
  var cv = h('canvas', { class: 'fm-fog' }), pins = h('div', { class: 'fm-pins' });
  wrap.appendChild(img); wrap.appendChild(cv); wrap.appendChild(pins);
  var open = [], anim = {}, W = 0, H = 0, R = D.radius || 120, layers = [], dpr = 1;
  var still = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var t0 = performance.now(), raf = 0, last = 0, seen = true, cleared = false, FPS = 24;
  /** 一層雲的紋理：左右接得起來（超出邊的雲在另一邊再畫一次），平移時看不到接縫 */
  function layer(seed, n, rMin, rMax, a) {
    var c = document.createElement('canvas'); c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    var x = c.getContext('2d'), k = W / 1000; x.setTransform(dpr, 0, 0, dpr, 0, 0);
    var rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (var i = 0; i < n; i++) {
      var cx = rnd() * W, cy = rnd() * H, r = (rMin + rnd() * (rMax - rMin)) * k, al = a * (0.5 + rnd() * 0.5);
      [cx - W, cx, cx + W].forEach(function (px) {
        if (px + r < 0 || px - r > W) return;
        var g = x.createRadialGradient(px, cy, 0, px, cy, r);
        g.addColorStop(0, 'rgba(235,240,248,' + al + ')'); g.addColorStop(1, 'rgba(235,240,248,0)');
        x.fillStyle = g; x.beginPath(); x.arc(px, cy, r, 0, 7); x.fill();
      });
    }
    return c;
  }
  function size() {
    var w = wrap.clientWidth; if (!w) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = w; H = Math.round(w * 0.7);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px';
    cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    layers = [layer(7, 26, 60, 150, 0.10), layer(31, 34, 30, 90, 0.08)];
    draw(performance.now());
    loop();
  }
  /** 一層雲往右（dir 1）或往左平移 off 像素，兩張接起來蓋滿 */
  function slide(c, L, off, dy) {
    off = ((off % W) + W) % W;
    c.drawImage(L, 0, 0, L.width, L.height, off - W, dy, W, H);
    c.drawImage(L, 0, 0, L.width, L.height, off, dy, W, H);
  }
  function draw(now) {
    if (!W) return;
    var c = cv.getContext('2d'), k = W / 1000, s = still ? 0 : (now - t0) / 1000;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, W, H);
    var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, 'rgba(70,80,96,.94)'); g.addColorStop(1, 'rgba(40,48,62,.96)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // 兩層雲：大的慢慢往右、小的往左快一點，上下也輕輕晃
    if (layers[0]) slide(c, layers[0], s * 9 * k, Math.sin(s / 7) * 6 * k);
    if (layers[1]) slide(c, layers[1], -s * 16 * k, Math.sin(s / 5 + 1) * 4 * k);
    c.globalCompositeOperation = 'destination-out';
    open.forEach(function (p, i) {
      var r = R * k * (anim[p.id] === undefined ? 1 : anim[p.id]) * (1 + 0.04 * Math.sin(s * 0.9 + i * 1.7));   // 邊緣輕輕起伏
      if (r <= 0) return;
      var x = p.x * k, y = p.y * k, rg = c.createRadialGradient(x, y, r * 0.35, x, y, r);
      rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = rg; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    });
  }
  /** 動畫迴圈：看不到（背景、捲走、霧散了）就停，回來再開 */
  function moving() { return !still && !cleared && seen && !document.hidden && W > 0; }
  function loop() {
    if (raf || !(moving() || Object.keys(anim).length)) return;
    raf = requestAnimationFrame(function tick(now) {
      raf = 0;
      if (now - last >= 1000 / FPS - 2 || Object.keys(anim).length) { last = now; draw(now); api.frames++; }
      loop();
    });
  }
  document.addEventListener('visibilitychange', loop);
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { seen = es[es.length - 1].isIntersecting; loop(); }).observe(wrap);
  function pin(p, cls) {
    return h('div', { class: 'fm-pin ' + (cls || ''), style: { left: (p.x / 10) + '%', top: (p.y / 7) + '%' } }, h('span', { class: 'fm-dot' }), h('span', { class: 'fm-lb' }, p.name));
  }
  var api = {
    el: wrap, frames: 0,
    /** 全部過關：整片霧散掉（之後不用再動，省電） */
    clearAll: function (on) { cleared = !!on; wrap.classList.toggle('fm-clear', cleared); if (!cleared) loop(); },
    set: function (list, extra) {
      var had = {}; open.forEach(function (p) { had[p.id] = 1; });
      open = list.slice();
      clear(pins);
      list.forEach(function (p) {
        pins.appendChild(pin(p, p.cls));
        if (!had[p.id] && api.ready) {   // 新解開的：霧慢慢散開
          var a0 = performance.now();
          anim[p.id] = 0;
          var step = function (t) { var f = Math.min(1, (t - a0) / 1400); anim[p.id] = 1 - Math.pow(1 - f, 3); if (f < 1) requestAnimationFrame(step); else delete anim[p.id]; if (still || !moving()) draw(t); };
          requestAnimationFrame(step);
        }
      });
      (extra || []).forEach(function (p) { pins.appendChild(pin(p, p.cls)); });
      api.ready = true;
      draw(performance.now()); loop();
    }
  };
  img.addEventListener('load', size);
  window.addEventListener('resize', size);
  setTimeout(size, 0);
  return api;
}

/* ---------------- 學員 ---------------- */
function student(el, host, h, D, stamps, byId) {
  var sq = host.me.squad;
  if (!sq) { el.appendChild(h('div', { class: 'card fm-card' }, h('h2', null, '還沒有分小隊'), h('p', { class: 'muted' }, '分好小隊後重新打開這一頁。'))); return; }
  var ch = host.ch('sq' + sq + '-fog'), got = {}, mine = host.load('got', {});
  Object.keys(mine).forEach(function (k) { got[k] = mine[k]; });   // 先用這支手機記得的畫，伺服器回來再更新

  var head = h('div', { class: 'fm-head' }), map = fogMap(host, D), fin = h('div', { class: 'fm-fin card' }), list = h('div', { class: 'fm-list' });
  var code = h('input', { class: 'input fm-code', placeholder: '例如 S1-ABCD2345', autocapitalize: 'characters', autocomplete: 'off' });
  var claimBox = h('div', { class: 'card fm-card' }, h('div', { class: 'fm-t' }, '輸入關主密鑰'),
    h('div', { class: 'small muted' }, '找到關主、完成關卡後，按「📷 掃描」掃關主的 QR code（不要用手機的相機 App，會跑到別的瀏覽器），或在這裡輸入代碼。'),
    h('button', { class: 'btn primary fm-scan', style: { marginTop: '8px', width: '100%' }, onclick: function () { host.scan('掃描關主的 QR code').then(function (t) { if (t) claim(t); }); } }, '📷 掃描關主 QR code'),
    h('div', { class: 'row', style: { gap: '8px', marginTop: '8px' } }, code, h('button', { class: 'btn', onclick: function () { claim(code.value); } }, '解開')));
  el.appendChild(head); el.appendChild(map.el); el.appendChild(fin); el.appendChild(claimBox); el.appendChild(list);

  /** 現在看得到的關卡：一般關卡＋已經出現（時間到）或已經解開的隱藏關卡 */
  function visible() { return stamps.filter(function (s) { return !s.hidden || got[s.id] || revealed(host, D, s); }); }
  function num(s) { return s.id.replace(/\D/g, ''); }
  function render() {
    var vis = visible(), n = vis.filter(function (s) { return got[s.id]; }).length;
    clear(head).appendChild(h('div', { class: 'fm-hd' }, h('div', null, h('div', { class: 'fm-name' }, host.pack.name), h('div', { class: 'small muted' }, '第 ' + sq + ' 小隊・' + host.me.name)),
      h('div', { class: 'fm-count' }, h('b', null, n), ' / ' + vis.length)));
    // 解開的關卡：霧散開、標地名；出現了還沒解開的隱藏關卡：霧散開、金色的點（集合的地方）
    var openList = vis.filter(function (s) { return got[s.id] || s.hidden; }).map(function (s) { return { id: s.id, x: s.x, y: s.y, name: got[s.id] ? s.name : '第 ' + num(s) + ' 關', cls: s.hidden ? 'fin' : '' }; });
    map.set(openList);
    clear(list);
    vis.forEach(function (s) {
      var g = got[s.id];
      list.appendChild(h('div', { class: 'fm-item' + (g ? ' got' : '') + (s.hidden ? ' hid' : '') }, h('span', { class: 'fm-st' }, g ? '✓' : s.hidden ? '★' : '?'),
        h('div', { class: 'grow' }, h('div', { class: 'fm-it' }, g ? s.name : '第 ' + num(s) + ' 關', s.hidden ? h('span', { class: 'fm-tag' }, '隱藏關卡') : null),
          h('div', { class: 'small muted' }, g ? (g.at ? when(g.at) + ' 解開' : '已解開') + (g.master ? '・關主記錄' : '') : s.hint + (s.hidden ? '（地圖上金色的點）' : '')))));
    });
    renderFin(vis);
    // 全部過關（包含隱藏關卡）：霧全部散掉；第一次全過放慶祝動畫
    var all = n === stamps.length && n > 0;
    map.clearAll(all);
    if (all && !host.load('allDone', false)) { host.save('allDone', true); celebrate(); }
    if (!all && host.load('allDone', false)) host.save('allDone', false);
  }
  function celebrate() {
    var box = h('div', { class: 'fm-party', role: 'status' }), colors = ['#e0a35e', '#2f7d55', '#3b4f8c', '#d9534f', '#f2c94c', '#56ccf2'];
    var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!still) for (var i = 0; i < 48; i++) box.appendChild(h('i', { style: { left: (Math.random() * 100) + '%', background: colors[i % colors.length], animationDelay: (Math.random() * 0.8) + 's', animationDuration: (1.8 + Math.random() * 1.4) + 's', transform: 'rotate(' + Math.round(Math.random() * 360) + 'deg)' } }));
    box.appendChild(h('div', { class: 'fm-party-card' }, h('div', { class: 'fm-party-big' }, '🎉 全部過關！'), h('div', null, '整張地圖都解開了，第 ' + sq + ' 小隊太強了')));
    map.el.appendChild(box);
    if (navigator.vibrate) navigator.vibrate([80, 60, 120]);
    box.addEventListener('click', function () { box.remove(); });
    setTimeout(function () { box.classList.add('out'); setTimeout(function () { box.remove(); }, 600); }, 4500);
  }
  // 隱藏關卡出現時：上面跳一條提示（之前完全不顯示，也不倒數）
  function renderFin(vis) {
    var hid = vis.filter(function (s) { return s.hidden && !got[s.id]; });
    fin.style.display = hid.length ? '' : 'none'; clear(fin);
    hid.forEach(function (s) { fin.appendChild(h('div', null, h('b', null, '★ 隱藏關卡出現了：'), '第 ' + num(s) + ' 關，地圖上金色的點')); });
  }
  // 時間到才出現：每秒看一下，出現的那一刻重畫＋提示（照伺服器時間，改手機時間沒用）
  function timeOpen() { return stamps.filter(function (s) { return s.hidden && revealed(host, D, s); }).length; }
  var wasOpen = timeOpen();
  setInterval(function () {
    var o = timeOpen(); if (o === wasOpen) return;
    var more = o > wasOpen; wasOpen = o; render();
    // 自己先用密鑰解開的不用再提示
    if (more && stamps.some(function (s) { return s.hidden && revealed(host, D, s) && !got[s.id]; })) { host.toast('★ 隱藏關卡出現了！看看地圖上金色的點'); if (navigator.vibrate) navigator.vibrate([60, 40, 60]); }
  }, 1000);

  /** 跟小隊頻道對一下：伺服器說了算（補上隊友、關主記錄的；伺服器刪掉的資料，手機上也拿掉）。
   *  只有自己解開、還排在手機裡沒送出去的（斷網時）先保留，送出去後伺服器就有了 */
  function refresh() {
    var waiting = {}, mark = function () { host.queued(ch).forEach(function (d) { if (d && d.stamp && !d.revoke) waiting[d.stamp] = 1; }); };
    mark();   // 讀伺服器前後各看一次，中間剛好送出去的也算
    return host.inbox(ch, 0).then(function (r) {
      mark();
      var st = teamState(host, D, byId, r.items, sq), next = st.got;
      Object.keys(got).forEach(function (k) { if (!next[k] && waiting[k] && !(st.revokedAt[k] > (got[k].at || 0))) next[k] = got[k]; });
      got = next; host.save('got', got); render();
    }, function () {});
  }
  // 大部分靠手機本地：解開馬上畫；隊友（或關主記錄）解開的，偶爾同步一次補上（不會一直連線）
  var sync = host.sync(ch, { onEvents: function () { refresh(); }, fast: 20000, slow: 120000 });

  function parse(v) {
    v = String(v || '').toUpperCase().replace(/[\s]/g, '');
    var m = v.match(/^([A-Z0-9]+?)-?([A-Z2-9]{8})$/);
    return m && byId[m[1]] ? { id: m[1], sig: m[2] } : null;
  }
  function claim(v) {
    // 掃到的是關主 QR code 的網址（…&k=S1-XXXX）：取出代碼
    var m = String(v || '').match(/[?&]k=([^&#]+)/);
    if (m) { try { v = decodeURIComponent(m[1]); } catch (e) { v = m[1]; } }
    var p = parse(v);
    if (!p) { host.toast('代碼格式不對（例如 S1-ABCD2345）', true); return; }
    // 密鑰在手機上驗（寫死在資源包裡），不用等網路
    if (!keyOk(host, D, p.id, p.sig, sq)) {
      host.toast('這個密鑰不對，或不是給你們小隊的', true);
      host.submit(ch, { stamp: p.id, key: p.sig }).catch(function () {});   // 錯誤次數給關主看
      return;
    }
    if (got[p.id]) { host.toast('這一關已經解開了'); return; }
    got[p.id] = { at: host.now() }; host.save('got', got);
    code.value = ''; render();
    host.toast('解開「' + byId[p.id].name + '」！');
    // 送到小隊頻道讓隊友補上（沒網路先存手機，連上自動送）
    host.submit(ch, { stamp: p.id, key: p.sig }).then(function () { sync.send({ unlock: p.id }); }, function () {});
  }
  render();
  refresh();
  setInterval(refresh, 180000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  // 用相機掃 QR code 進來的：網址帶 k
  var k = host.param('k');
  if (k) { try { history.replaceState(null, '', host.link({})); } catch (e) {} claim(k); }
}

/* ---------------- 工作人員（關主） ---------------- */
function stName(s) { return s.id + ' ' + s.name + (s.hidden ? '（隱藏關卡）' : ''); }
/** 關主：一個人顧一關。第一次進來先選負責哪一關（存在這支手機），之後畫面只要換小隊；真的要換關卡按「換關卡」 */
function worker(el, host, h, D, stamps) {
  var byId = {}; stamps.forEach(function (s) { byId[s.id] = s; });
  var station = host.load('station', '');
  if (!byId[station]) {
    var grid = h('div', { class: 'fm-stgrid' }, stamps.map(function (s) {
      return h('button', { class: 'btn fm-stbtn', onclick: function () { host.save('station', s.id); clear(el); worker(el, host, h, D, stamps); } },
        h('b', null, s.id), h('span', null, s.name + (s.hidden ? '（隱藏關卡）' : '')));
    }));
    el.appendChild(h('div', { class: 'card fm-card' }, h('div', { class: 'fm-name' }, host.pack.name + '・關主'), h('div', { class: 'small muted' }, host.me.name),
      h('div', { class: 'fm-t', style: { marginTop: '10px' } }, '你負責哪一關？'),
      h('div', { class: 'small muted', style: { marginBottom: '8px' } }, '選一次就好，這支手機會記住；之後只要選小隊。'), grid));
    return;
  }
  var nSq = Number(D.squads) || 8, sqOpts = [];
  for (var i = 1; i <= nSq; i++) sqOpts.push(String(i));
  var stSel = { value: station }, sqSel = { value: '' };
  var stLabel = h('b', null, stName(byId[station]));
  /** 換關卡（少用）：跳出清單選，選了就換，下面的 QR code 收起來 */
  function changeStation() {
    var m = host.modal({ title: '換負責的關卡', body: h('div', { class: 'fm-stgrid' }, stamps.map(function (s) {
      return h('button', { class: 'btn fm-stbtn' + (s.id === stSel.value ? ' on' : ''), onclick: function () {
        stSel.value = s.id; host.save('station', s.id); stLabel.textContent = stName(s); collapse(); m.close();
      } }, h('b', null, s.id), h('span', null, s.name + (s.hidden ? '（隱藏關卡）' : '')));
    })), actions: [{ text: '取消' }] });
  }
  /** 換小隊或關卡時：上一隊的 QR code 收起來（不然會以為已經產生了新的） */
  function collapse() { clear(out); }
  var sqBtns = h('div', { class: 'fm-sqgrid' });
  sqOpts.concat(['*']).forEach(function (n) {
    var b = h('button', { class: 'btn fm-sqbtn' + (n === '*' ? ' any' : ''), 'data-sq': n, onclick: function () {
      if (sqSel.value === n) return;
      sqSel.value = n; collapse();
      Array.prototype.forEach.call(sqBtns.children, function (x) { x.classList.toggle('on', x === b); });
    } }, n === '*' ? '不限小隊' : '第 ' + n + ' 隊');
    sqBtns.appendChild(b);
  });
  var out = h('div', { class: 'fm-out' }), board = h('div', { class: 'fm-board' });
  var gen = h('button', { class: 'btn primary' }, '產生密鑰');
  // 過關分數：預設照活動設定的每關分數，可以臨場改（例如表現好加分）
  var pts = h('input', { class: 'input', type: 'number', inputmode: 'numeric', value: String(Number(D.pointsPerStamp) || 100) });
  /** 記錄這一隊完成這一關（或撤回）：送到那一隊的頻道，隊員同步時補上；沒網路先存著 */
  function record(stId, team, revoke) {
    var d = { stamp: stId, key: keyOf(host, D, stId, team), master: 1 };
    if (revoke) d.revoke = 1;
    var me = board_[team] || (board_[team] = {});
    if (revoke) delete me[stId]; else me[stId] = { at: host.now(), master: true };
    renderLog();
    host.submit(host.ch('sq' + team + '-fog'), d).then(function () { load(); }, function () {});
    return Promise.resolve();
  }
  function queueScore(st, team, n) {
    var q = host.load('scoreQ', []).filter(function (y) { return !(y.stage === st.id && y.team === Number(team)); });
    q.push({ stage: st.id, stageName: st.name, team: Number(team), score: n }); host.save('scoreQ', q);
    // 沒網路不等：分數排著，連上再補傳（按鈕不會卡住）
    if (navigator.onLine === false) return Promise.resolve(1);
    return Promise.race([flushScores(), new Promise(function (ok) { setTimeout(function () { ok(host.load('scoreQ', []).length); }, 5000); })]);
  }
  /** 分數：先排在手機裡，送得出去才拿掉（同一隊同一關只留最新的；沒網路時連上再補送） */
  var upMsg = h('div', { class: 'small muted' });
  function flushScores() {
    var q = host.load('scoreQ', []); if (!q.length || flushScores.busy || navigator.onLine === false) return Promise.resolve(q.length);
    flushScores.busy = true;
    var x = q[0];
    return host.score(x).then(function (r) {
      flushScores.updated = !!(r && r.updated);
      host.save('scoreQ', host.load('scoreQ', []).filter(function (y) { return !(y.stage === x.stage && y.team === x.team && y.score === x.score); }));
      flushScores.busy = false;
      if (!host.load('scoreQ', []).length) upMsg.textContent = upMsg.textContent.replace('（沒網路，分數連上後自動上傳）', '（分數已補上傳）');
      return flushScores();
    }, function (e) {
      flushScores.busy = false;
      if (e && e.code === 'NET') return q.length;
      host.save('scoreQ', host.load('scoreQ', []).filter(function (y) { return y !== x && !(y.stage === x.stage && y.team === x.team); }));
      host.toast('第 ' + x.team + ' 小隊「' + x.stageName + '」分數沒上傳成功：' + (e && e.message || ''), true);
      return flushScores();
    });
  }
  window.addEventListener('online', function () { flushScores(); });
  setInterval(flushScores, 60000);
  flushScores();
  var up = h('button', { class: 'btn' }, '✓ 過關（記錄完成＋上傳分數）');
  if (!host.activity) up.textContent = '✓ 記錄這隊完成這關';
  up.onclick = function () {
    if (!sqSel.value || sqSel.value === '*') { host.toast('先選一個小隊', true); return; }
    pass(stSel.value, sqSel.value, up).catch(function () {});
  };
  /** 過關：記錄這隊完成這關＋上傳分數（產生密鑰後的詢問也用這個） */
  function pass(stId, team, btn) {
    var st = stamps.filter(function (s) { return s.id === stId; })[0], n = Number(pts.value);
    if (host.activity && (!isFinite(n) || pts.value === '')) { host.toast('請填分數', true); return Promise.reject(new Error('請填分數')); }
    return busy(btn, function () {
      return record(st.id, team).then(function () { return host.activity ? queueScore(st, team, n) : -1; });
    }).then(function (left) {
      var t = '第 ' + team + ' 小隊「' + st.name + '」';
      if (left === -1) upMsg.textContent = '✓ 已記錄' + t + '完成，隊員同步時會自動補上';
      else upMsg.textContent = '✓ ' + t + '過關：已記錄完成，' + n + ' 分' + (left ? '（沒網路，分數連上後自動上傳）' : '已上傳' + (flushScores.updated ? '（已更新這一關的分數）' : ''));
      host.toast(upMsg.textContent.slice(2));
      return upMsg.textContent;
    });
  }
  gen.onclick = function () { if (!sqSel.value) { host.toast('先選小隊', true); return; } show(stSel.value, sqSel.value, true); };
  /** 顯示密鑰（QR code＋代碼）；log：記到「產生過的密鑰」 */
  function show(stId, team, log) {
    var st = byId[stId];
    if (log) {
      var lg = host.load('issued', []).filter(function (x) { return !(x.st === stId && x.team === team); });
      lg.unshift({ st: stId, team: team, at: host.now() }); host.save('issued', lg.slice(0, 200)); renderLog();
    }
    (function () {
      var codeText = stId + '-' + keyOf(host, D, stId, team), qr = h('div', { class: 'fm-qr' });
      // 防呆：產生密鑰時順便問要不要標示這隊完成（關主常常給完密鑰就忘了按過關）
      var ask = team === '*' || (board_[team] && board_[team][stId]) ? null : h('div', { class: 'fm-ask' });
      if (ask) {
        var yes = h('button', { class: 'btn primary' }, '✓ 標示完成'), no = h('button', { class: 'btn' }, '先不要');
        ask.appendChild(h('div', null, '第 ' + team + ' 小隊「' + st.name + '」完成了嗎？要一起標示完成' + (host.activity ? '並上傳 ' + (pts.value || 0) + ' 分' : '') + '？'));
        ask.appendChild(h('div', { class: 'row', style: { gap: '8px', marginTop: '8px' } }, yes, no));
        yes.onclick = function () { no.disabled = true; pass(stId, team, yes).then(function (t) { clear(ask).appendChild(h('div', null, t)); ask.classList.add('done'); }, function () { no.disabled = false; }); };
        no.onclick = function () { ask.remove(); };
      }
      clear(out).appendChild(h('div', { class: 'col', style: { alignItems: 'center', gap: '8px' } }, qr,
        h('div', { class: 'fm-bigcode' }, codeText), h('div', { class: 'small muted' }, (team === '*' ? '任何小隊' : '只有第 ' + team + ' 小隊') + '可以用；學員用遊戲裡的「📷 掃描」掃，或在遊戲頁輸入代碼'), ask));
      host.qr(qr, host.link({ k: codeText, s: 'student' }), 220);
      out.scrollIntoView && out.scrollIntoView({ block: 'nearest' });
    })();
  }
  // 密鑰寫死在資源包裡：產生、驗證都不用網路；QR code 的程式先載好
  var keyMsg = h('div', { class: 'small fm-keys ok' }, '✓ 密鑰寫在遊戲裡，沒網路也能產生，學員也是在手機上驗');
  host.qr(h('div'), 'x', 40);

  /* ---- 產生過的密鑰：可以撤回（取消這隊這關完成）或補標完成 ---- */
  var board_ = {}, logBox = h('div', { class: 'fm-log' });
  function renderLog() {
    var lg = host.load('issued', []);
    clear(logBox);
    if (!lg.length) { logBox.appendChild(h('div', { class: 'small muted' }, '還沒有產生過密鑰')); return; }
    lg.forEach(function (x) {
      var st = byId[x.st]; if (!st) return;
      var done = x.team !== '*' && board_[x.team] && board_[x.team][x.st];
      var btns = h('div', { class: 'row', style: { gap: '6px', flex: 'none' } });
      btns.appendChild(h('button', { class: 'btn sm', onclick: function () { show(x.st, x.team, false); } }, '顯示'));
      if (x.team !== '*') {
        if (done) btns.appendChild(h('button', { class: 'btn sm', onclick: function () {
          if (!window.confirm('撤回第 ' + x.team + ' 小隊「' + st.name + '」的完成？' + (host.activity ? '這一關的分數會改成 0。' : ''))) return;
          record(x.st, x.team, true);
          if (host.activity) queueScore(st, x.team, 0);
          host.toast('已撤回第 ' + x.team + ' 小隊「' + st.name + '」');
        } }, '撤回'));
        else { var b = h('button', { class: 'btn sm primary' }, '標示完成'); b.onclick = function () { pass(x.st, x.team, b).catch(function () {}); }; btns.appendChild(b); }
      }
      logBox.appendChild(h('div', { class: 'fm-logrow' + (done ? ' done' : '') },
        h('div', { class: 'grow' }, h('div', null, h('b', null, x.st + ' ' + st.name), '・' + (x.team === '*' ? '不限小隊' : '第 ' + x.team + ' 小隊')),
          h('div', { class: 'small muted' }, when(x.at) + ' 產生・' + (x.team === '*' ? '任何小隊都能用' : done ? '✓ 已完成' : '還沒標示完成'))), btns));
    });
  }
  el.appendChild(h('div', { class: 'card fm-card' }, h('div', { class: 'fm-name' }, host.pack.name + '・關主'), h('div', { class: 'small muted' }, host.me.name),
    h('div', { class: 'fm-station' }, h('span', null, '你負責：', stLabel), h('button', { class: 'btn sm ghost', onclick: changeStation }, '換關卡')),
    h('div', { class: 'fm-t', style: { marginTop: '10px' } }, '選小隊'),
    sqBtns,
    h('div', { class: 'col', style: { gap: '8px', marginTop: '10px' } }, gen, keyMsg), out,
    h('div', { class: 'fm-t', style: { marginTop: '14px' } }, '過關'),
    h('div', { class: 'col', style: { gap: '8px' } }, host.activity ? h('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, h('span', { class: 'small', style: { flex: 'none', whiteSpace: 'nowrap' } }, '這一關分數'), pts) : null, up, upMsg,
      h('div', { class: 'small muted' }, '選好上面的小隊，這一隊過關時按一下：記錄這隊完成（隊員忘了輸入也會自動解開）' + (host.activity ? '，同時上傳團隊計分；同一關再按一次是改分數，不會重複加。沒網路也可以按，連上後自動補傳。' : '。要從活動卡片的「開始遊戲」進來，才會連到團隊計分。')))));
  el.appendChild(h('div', { class: 'card fm-card' }, h('div', { class: 'fm-t' }, '產生過的密鑰'),
    h('div', { class: 'small muted', style: { marginBottom: '6px' } }, '給錯或還沒過關就給了：按「撤回」取消這隊這關的完成；給過但忘了按過關：按「標示完成」。'), logBox));
  renderLog();
  var rf = h('button', { class: 'btn sm' }, '重新整理');
  el.appendChild(h('div', { class: 'card fm-card' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('div', { class: 'fm-t' }, '各小隊進度'), rf), board));
  function load() {
    return Promise.all(sqOpts.map(function (n) { return host.inbox(host.ch('sq' + n + '-fog'), 0); })).then(function (rs) {
      clear(board);
      rs.forEach(function (r, i) {
        var ts = teamState(host, D, byId, r.items, sqOpts[i]), have = ts.got, bad = ts.bad;
        board_[sqOpts[i]] = have;
        board.appendChild(h('div', { class: 'fm-row' }, h('span', { class: 'fm-sq' }, '第 ' + sqOpts[i] + ' 小隊'),
          h('span', { class: 'fm-dots' }, stamps.map(function (s) { return h('i', { class: have[s.id] ? 'on' : '', title: s.name }); })),
          h('span', { class: 'small muted' }, Object.keys(have).length + '/' + stamps.length + (bad ? '・錯誤密鑰 ' + bad : ''))));
      });
      renderLog();
    });
  }
  rf.onclick = function () { busy(rf, load); };
  load();
}
