/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 示範資源包「霧之校園」（測試用）：定向越野＋集章。
 *   學員：地圖一開始整片是霧，提示只給謎語不給地點；找到關主、拿到密鑰（掃 QR code 或輸入代碼）後，那一關附近的霧散開。
 *         同一小隊共用進度（集章存在伺服器的小隊頻道 sqN-fog，隊友即時收到通知）。終點在結束前 N 分鐘自動公布（照伺服器時間）。
 *   工作人員：選關卡＋小隊產生關主密鑰（QR code／代碼，綁小隊：A 隊拿去給 B 隊用驗不過），看各小隊進度。
 * 計算（霧、倒數、進度）都在手機上；只有集章送到伺服器，斷網會先存手機、連上自動補送。
 */
CampGame.register({
  mount: function (el, host) {
    var h = host.h, D = host.data, stamps = D.stamps || [], byId = {};
    stamps.forEach(function (s) { byId[s.id] = s; });
    if (host.me.kind === 'student') student(el, host, h, D, stamps, byId);
    else worker(el, host, h, D, stamps);
  }
});

/* ---------------- 地圖＋霧 ---------------- */
function fogMap(host, D, onReady) {
  var h = host.h, wrap = h('div', { class: 'fm-map' }), img = h('img', { class: 'fm-img', src: host.asset(D.map), alt: '校園地圖' });
  var cv = h('canvas', { class: 'fm-fog' }), pins = h('div', { class: 'fm-pins' });
  wrap.appendChild(img); wrap.appendChild(cv); wrap.appendChild(pins);
  var open = [], anim = {}, W = 0, H = 0, R = D.radius || 120;
  function size() {
    var w = wrap.clientWidth; if (!w) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    W = w; H = Math.round(w * 0.7);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
    cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  function draw() {
    if (!W) return;
    var c = cv.getContext('2d'), k = W / 1000;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, W, H);
    var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, 'rgba(70,80,96,.94)'); g.addColorStop(1, 'rgba(40,48,62,.96)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // 霧的紋理：固定亂數，畫一些淡淡的雲
    var seed = 7; var rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (var i = 0; i < 40; i++) { c.fillStyle = 'rgba(255,255,255,' + (0.03 + rnd() * 0.04) + ')'; c.beginPath(); c.arc(rnd() * W, rnd() * H, (30 + rnd() * 90) * k, 0, 7); c.fill(); }
    c.globalCompositeOperation = 'destination-out';
    open.forEach(function (p) {
      var r = R * k * (anim[p.id] === undefined ? 1 : anim[p.id]);
      if (r <= 0) return;
      var x = p.x * k, y = p.y * k, rg = c.createRadialGradient(x, y, r * 0.35, x, y, r);
      rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = rg; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    });
  }
  function pin(p, cls) {
    return h('div', { class: 'fm-pin ' + (cls || ''), style: { left: (p.x / 10) + '%', top: (p.y / 7) + '%' } }, h('span', { class: 'fm-dot' }), h('span', { class: 'fm-lb' }, p.name));
  }
  var api = {
    el: wrap,
    set: function (list, extra) {
      var had = {}; open.forEach(function (p) { had[p.id] = 1; });
      open = list.slice();
      clear(pins);
      list.forEach(function (p) {
        pins.appendChild(pin(p, p.cls));
        if (!had[p.id] && api.ready) {   // 新解開的：霧慢慢散開
          var t0 = performance.now();
          anim[p.id] = 0;
          var step = function (t) { var f = Math.min(1, (t - t0) / 1400); anim[p.id] = 1 - Math.pow(1 - f, 3); draw(); if (f < 1) requestAnimationFrame(step); else delete anim[p.id]; };
          requestAnimationFrame(step);
        }
      });
      (extra || []).forEach(function (p) { pins.appendChild(pin(p, p.cls)); });
      api.ready = true;
      draw();
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
  var ch = 'sq' + sq + '-fog', got = {}, mine = host.load('got', {});
  Object.keys(mine).forEach(function (k) { got[k] = mine[k]; });   // 先用這支手機記得的畫，伺服器回來再更新

  var head = h('div', { class: 'fm-head' }), map = fogMap(host, D), fin = h('div', { class: 'fm-fin card' }), list = h('div', { class: 'fm-list' });
  var code = h('input', { class: 'input fm-code', placeholder: '例如 S1-ABCD2345', autocapitalize: 'characters', autocomplete: 'off' });
  var claimBox = h('div', { class: 'card fm-card' }, h('div', { class: 'fm-t' }, '輸入關主密鑰'),
    h('div', { class: 'small muted' }, '找到關主、完成關卡後，用手機相機掃關主的 QR code，或在這裡輸入代碼。'),
    h('div', { class: 'row', style: { gap: '8px', marginTop: '8px' } }, code, h('button', { class: 'btn primary', onclick: function () { claim(code.value); } }, '解開')));
  el.appendChild(head); el.appendChild(map.el); el.appendChild(fin); el.appendChild(claimBox); el.appendChild(list);

  function render() {
    var n = Object.keys(got).length;
    clear(head).appendChild(h('div', { class: 'fm-hd' }, h('div', null, h('div', { class: 'fm-name' }, host.pack.name), h('div', { class: 'small muted' }, '第 ' + sq + ' 小隊・' + host.me.name)),
      h('div', { class: 'fm-count' }, h('b', null, n), ' / ' + stamps.length)));
    var openList = stamps.filter(function (s) { return got[s.id]; }).map(function (s) { return { id: s.id, x: s.x, y: s.y, name: s.name }; });
    var extra = [], f = D.finale;
    if (f && finaleOpen()) { openList.push({ id: '_fin', x: f.x, y: f.y, name: f.name, cls: 'fin' }); }
    map.set(openList, extra);
    clear(list);
    stamps.forEach(function (s) {
      var g = got[s.id];
      list.appendChild(h('div', { class: 'fm-item' + (g ? ' got' : '') }, h('span', { class: 'fm-st' }, g ? '✓' : '?'),
        h('div', { class: 'grow' }, h('div', { class: 'fm-it' }, g ? s.name : '第 ' + s.id.replace(/\D/g, '') + ' 關'), h('div', { class: 'small muted' }, g ? (g.by ? g.by + ' 解開' : '已解開') : s.hint))));
    });
    renderFin();
  }
  function finaleAt() { var f = D.finale, t = f && Date.parse(f.endAt); return f && isFinite(t) ? t - (f.revealMinutesBefore || 30) * 60000 : null; }
  function finaleOpen() { var t = finaleAt(); return t !== null && host.now() >= t; }
  function renderFin() {
    var f = D.finale; if (!f) { fin.style.display = 'none'; return; }
    var t = finaleAt(); clear(fin);
    if (t === null) { fin.appendChild(h('div', null, '終點會在結束前 ' + (f.revealMinutesBefore || 30) + ' 分鐘公布')); return; }
    var left = t - host.now();
    if (left <= 0) fin.appendChild(h('div', null, h('b', null, '終點公布：'), f.name, '（地圖上金色的點）'));
    else {
      var s = Math.floor(left / 1000), hh = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60;
      fin.appendChild(h('div', null, '終點公布倒數 ', h('b', { class: 'fm-cd' }, (hh ? hh + ':' : '') + pad2(mm) + ':' + pad2(ss))));
    }
  }
  var wasOpen = finaleOpen();
  setInterval(function () { var o = finaleOpen(); if (o !== wasOpen) { wasOpen = o; render(); } else renderFin(); }, 1000);

  /** 伺服器上的小隊集章（驗過簽章的才算） */
  function refresh() {
    return host.inbox(ch, 0).then(function (r) {
      var next = {};
      r.items.forEach(function (x) { if (x.ok && x.d && byId[x.d.stamp] && !next[x.d.stamp]) next[x.d.stamp] = { by: x.name, at: x.t }; });
      Object.keys(got).forEach(function (k) { if (!next[k] && got[k].pending) next[k] = got[k]; });   // 還在手機上等著送的保留
      got = next; host.save('got', got); render();
    }, function () {});
  }
  var sync = host.sync(ch, { onEvents: function () { refresh(); }, fast: 3000, slow: 15000 });

  function parse(v) {
    v = String(v || '').toUpperCase().replace(/[\s]/g, '');
    var m = v.match(/^([A-Z0-9]+?)-?([A-Z2-9]{8})$/);
    return m && byId[m[1]] ? { id: m[1], sig: m[2] } : null;
  }
  function claim(v) {
    var p = parse(v);
    if (!p) { host.toast('代碼格式不對（例如 S1-ABCD2345）', true); return; }
    if (got[p.id] && !got[p.id].pending) { host.toast('這一關已經解開了'); return; }
    var done = false;
    setTimeout(function () { if (!done) host.toast('網路不穩：密鑰已存在手機，連上網路會自動送出'); }, 6000);
    host.submit(ch, { stamp: p.id, signed: 'fog|' + p.id, sig: p.sig }).then(function (r) {
      done = true;
      if (r.sigOk) {
        got[p.id] = { by: host.me.name, at: host.now() }; host.save('got', got);
        code.value = ''; render();
        host.toast('解開「' + byId[p.id].name + '」！');
        sync.send({ unlock: p.id });
      } else host.toast('這個密鑰不對，或不是給你們小隊的', true);
    }, function (e) { done = true; host.fail(e); });
  }
  render();
  refresh();
  setInterval(refresh, 60000);
  // 用相機掃 QR code 進來的：網址帶 k
  var k = host.param('k');
  if (k) { try { history.replaceState(null, '', host.link({})); } catch (e) {} claim(k); }
}

/* ---------------- 工作人員（關主） ---------------- */
function worker(el, host, h, D, stamps) {
  var nSq = D.squads || 8, sqOpts = [];
  for (var i = 1; i <= nSq; i++) sqOpts.push(String(i));
  var stSel = h('select', { class: 'input' }, stamps.map(function (s) { return h('option', { value: s.id }, s.id + ' ' + s.name); }));
  var sqSel = h('select', { class: 'input' }, sqOpts.map(function (n) { return h('option', { value: n }, '第 ' + n + ' 小隊'); }).concat([h('option', { value: '*' }, '不限小隊')]));
  var out = h('div', { class: 'fm-out' }), board = h('div', { class: 'fm-board' });
  var gen = h('button', { class: 'btn primary' }, '產生密鑰');
  gen.onclick = function () {
    busy(gen, function () { return host.sign('fog|' + stSel.value, sqSel.value); }).then(function (r) {
      var codeText = stSel.value + '-' + r.sig, qr = h('div', { class: 'fm-qr' });
      clear(out).appendChild(h('div', { class: 'col', style: { alignItems: 'center', gap: '8px' } }, qr,
        h('div', { class: 'fm-bigcode' }, codeText), h('div', { class: 'small muted' }, (sqSel.value === '*' ? '任何小隊' : '只有第 ' + sqSel.value + ' 小隊') + '可以用；學員用手機相機掃，或在遊戲頁輸入代碼')));
      host.qr(qr, host.link({ k: codeText, s: 'student' }), 220);
    }, function () {});
  };
  el.appendChild(h('div', { class: 'card fm-card' }, h('div', { class: 'fm-name' }, host.pack.name + '・關主'), h('div', { class: 'small muted' }, host.me.name),
    h('div', { class: 'fm-t', style: { marginTop: '10px' } }, '產生關主密鑰'),
    h('div', { class: 'col', style: { gap: '8px' } }, stSel, sqSel, gen), out));
  var rf = h('button', { class: 'btn sm' }, '重新整理');
  el.appendChild(h('div', { class: 'card fm-card' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('div', { class: 'fm-t' }, '各小隊進度'), rf), board));
  function load() {
    return Promise.all(sqOpts.map(function (n) { return host.inbox('sq' + n + '-fog', 0); })).then(function (rs) {
      clear(board);
      rs.forEach(function (r, i) {
        var have = {}; r.items.forEach(function (x) { if (x.ok && x.d) have[x.d.stamp] = 1; });
        var bad = r.items.filter(function (x) { return x.ok === false; }).length;
        board.appendChild(h('div', { class: 'fm-row' }, h('span', { class: 'fm-sq' }, '第 ' + sqOpts[i] + ' 小隊'),
          h('span', { class: 'fm-dots' }, stamps.map(function (s) { return h('i', { class: have[s.id] ? 'on' : '', title: s.name }); })),
          h('span', { class: 'small muted' }, Object.keys(have).length + '/' + stamps.length + (bad ? '・錯誤密鑰 ' + bad : ''))));
      });
    });
  }
  rf.onclick = function () { busy(rf, load); };
  load();
}
