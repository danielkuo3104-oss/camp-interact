/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 示範資源包「霧之校園」（測試用）：定向越野＋集章。
 *   學員：地圖一開始整片是霧，提示只給謎語不給地點；找到關主、拿到密鑰（掃 QR code 或輸入代碼）後，那一關附近的霧散開。
 *         同一小隊共用進度（集章存在伺服器的小隊頻道 sqN-fog，隊友即時收到通知）。終點在結束前 N 分鐘自動公布（照伺服器時間）。
 *   工作人員：選關卡＋小隊產生關主密鑰（QR code／代碼，綁小隊：A 隊拿去給 B 隊用驗不過），看各小隊進度；
 *             這一隊過關時按「過關，上傳分數」，分數送進團隊計分（每隊每關一筆，重送是更新）。
 * 計算（霧、倒數、進度）都在手機上；只有集章送到伺服器，斷網會先存手機、連上自動補送。
 */
CampGame.register({
  mount: function (el, host) {
    var h = host.h, D = host.data, stamps = D.stamps || [], byId = {};
    stamps.forEach(function (s) { byId[s.id] = s; });
    if (host.mode ? host.mode === 'player' : host.me.kind === 'student') student(el, host, h, D, stamps, byId);   // 工作人員試玩也是玩家畫面
    else worker(el, host, h, D, stamps);
  }
});

/** 解開的時間（台灣時間 月/日 時:分） */
function when(t) { var d = new Date(Number(t) + 8 * 3600000); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()); }

/** 密鑰簽的內容：關卡＋活動（同一個資源包用在別的活動，密鑰不能通用） */
function sigText(host, stampId) { return 'fog|' + stampId + (host.scope ? '|' + host.scope : ''); }

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
  var ch = host.ch('sq' + sq + '-fog'), got = {}, mine = host.load('got', {});
  Object.keys(mine).forEach(function (k) { got[k] = mine[k]; });   // 先用這支手機記得的畫，伺服器回來再更新

  var head = h('div', { class: 'fm-head' }), map = fogMap(host, D), fin = h('div', { class: 'fm-fin card' }), list = h('div', { class: 'fm-list' });
  var code = h('input', { class: 'input fm-code', placeholder: '例如 S1-ABCD2345', autocapitalize: 'characters', autocomplete: 'off' });
  var claimBox = h('div', { class: 'card fm-card' }, h('div', { class: 'fm-t' }, '輸入關主密鑰'),
    h('div', { class: 'small muted' }, '找到關主、完成關卡後，按「📷 掃描」掃關主的 QR code（不要用手機的相機 App，會跑到別的瀏覽器），或在這裡輸入代碼。'),
    h('button', { class: 'btn primary fm-scan', style: { marginTop: '8px', width: '100%' }, onclick: function () { host.scan('掃描關主的 QR code').then(function (t) { if (t) claim(t); }); } }, '📷 掃描關主 QR code'),
    h('div', { class: 'row', style: { gap: '8px', marginTop: '8px' } }, code, h('button', { class: 'btn', onclick: function () { claim(code.value); } }, '解開')));
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
        h('div', { class: 'grow' }, h('div', { class: 'fm-it' }, g ? s.name : '第 ' + s.id.replace(/\D/g, '') + ' 關'), h('div', { class: 'small muted' }, g ? (g.at ? when(g.at) + ' 解開' : '已解開') + (g.master ? '・關主記錄' : '') + (g.pending ? '・等網路確認' : '') : s.hint))));
    });
    renderFin();
  }
  // 終點：活動設定的 endAt／revealMinutesBefore 優先（管理端填），沒有就用 manifest 的 finale
  function finaleAt() { var f = D.finale, t = f && host.time(D.endAt || f.endAt); return f && t !== null ? t - (Number(D.revealMinutesBefore) || f.revealMinutesBefore || 30) * 60000 : null; }
  function finaleOpen() { var t = finaleAt(); return t !== null && host.now() >= t; }
  function renderFin() {
    var f = D.finale; if (!f) { fin.style.display = 'none'; return; }
    var t = finaleAt(); clear(fin);
    if (t === null) { fin.appendChild(h('div', null, '終點會在結束前 ' + (Number(D.revealMinutesBefore) || f.revealMinutesBefore || 30) + ' 分鐘公布')); return; }
    var left = t - host.now();
    if (left <= 0) fin.appendChild(h('div', null, h('b', null, '終點公布：'), f.name, '（地圖上金色的點）'));
    else {
      var s = Math.floor(left / 1000), dd = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60;
      // 超過一天：顯示「幾天幾小時」；一天內：時:分:秒
      var cd = dd ? dd + ' 天 ' + hh + ' 小時' : (hh ? hh + ':' : '') + pad2(mm) + ':' + pad2(ss);
      fin.appendChild(h('div', null, '終點公布倒數 ', h('b', { class: 'fm-cd' }, cd)));
    }
  }
  var wasOpen = finaleOpen();
  setInterval(function () { var o = finaleOpen(); if (o !== wasOpen) { wasOpen = o; render(); } else renderFin(); }, 1000);

  /** 伺服器上的小隊集章（驗過簽章的才算） */
  function refresh() {
    return host.inbox(ch, 0).then(function (r) {
      var next = {};
      r.items.forEach(function (x) { if (x.ok && x.d && byId[x.d.stamp] && !next[x.d.stamp]) next[x.d.stamp] = { at: x.t, master: !!x.d.master }; });
      Object.keys(got).forEach(function (k) { if (!next[k] && got[k].pending) next[k] = got[k]; });   // 還在手機上等著送的保留
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
    if (got[p.id] && !got[p.id].pending) { host.toast('這一關已經解開了'); return; }
    // 先在手機上解開（沒網路也行），密鑰存著，連上網路時送伺服器確認；確認不對才收回
    got[p.id] = { at: host.now(), pending: true }; host.save('got', got);
    code.value = ''; render();
    host.toast('解開「' + byId[p.id].name + '」！');
    host.submit(ch, { stamp: p.id, signed: sigText(host, p.id), sig: p.sig }).then(function (r) {
      if (r.sigOk) {
        if (got[p.id]) delete got[p.id].pending;
        host.save('got', got); render();
        sync.send({ unlock: p.id });
      } else {
        if (got[p.id] && got[p.id].pending) delete got[p.id];
        host.save('got', got); render();
        host.toast('「' + p.id + '」的密鑰不對，或不是給你們小隊的，已收回', true);
      }
    }, function (e) { if (got[p.id] && got[p.id].pending) { delete got[p.id]; host.save('got', got); render(); } host.fail(e); });
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
function worker(el, host, h, D, stamps) {
  var nSq = Number(D.squads) || 8, sqOpts = [];
  for (var i = 1; i <= nSq; i++) sqOpts.push(String(i));
  var stSel = h('select', { class: 'input' }, stamps.map(function (s) { return h('option', { value: s.id }, s.id + ' ' + s.name); }));
  var sqSel = h('select', { class: 'input' }, sqOpts.map(function (n) { return h('option', { value: n }, '第 ' + n + ' 小隊'); }).concat([h('option', { value: '*' }, '不限小隊')]));
  var out = h('div', { class: 'fm-out' }), board = h('div', { class: 'fm-board' });
  var gen = h('button', { class: 'btn primary' }, '產生密鑰');
  // 過關分數：預設照活動設定的每關分數，可以臨場改（例如表現好加分）
  var pts = h('input', { class: 'input', type: 'number', inputmode: 'numeric', value: String(Number(D.pointsPerStamp) || 100) });
  var up = h('button', { class: 'btn' }, '過關，上傳分數'), upMsg = h('div', { class: 'small muted' });
  up.onclick = function () {
    if (sqSel.value === '*') { host.toast('上傳分數要選一個小隊', true); return; }
    var st = stamps.filter(function (s) { return s.id === stSel.value; })[0], n = Number(pts.value);
    if (!isFinite(n) || pts.value === '') { host.toast('請填分數', true); return; }
    busy(up, function () { return host.score({ stage: st.id, stageName: st.name, team: Number(sqSel.value), score: n }); }).then(function (r) {
      var t = '第 ' + sqSel.value + ' 小隊「' + st.name + '」' + n + ' 分' + (r && r.updated ? '（已更新這一關的分數）' : '');
      upMsg.textContent = '✓ 已上傳：' + t + '，也記錄這隊完成這關'; host.toast('已上傳團隊計分：' + t);
      record(st.id, sqSel.value).catch(function () {});
    }, function () {});
  };
  /** 記錄這一隊完成這一關：隊員就算忘了輸入，下次同步會自動補上 */
  function record(stId, team) {
    return host.sign(sigText(host, stId), team).then(function (r) {
      host.submit(host.ch('sq' + team + '-fog'), { stamp: stId, signed: sigText(host, stId), sig: r.sig, master: 1 }).then(function () { load(); }, function () {});
    });
  }
  var rec = h('button', { class: 'btn' }, '✓ 記錄這隊完成這關'), recMsg = h('div', { class: 'small muted' });
  rec.onclick = function () {
    if (sqSel.value === '*') { host.toast('要選一個小隊', true); return; }
    var st = stamps.filter(function (s) { return s.id === stSel.value; })[0], team = sqSel.value;
    busy(rec, function () { return record(st.id, team); }).then(function () {
      recMsg.textContent = '✓ 已記錄第 ' + team + ' 小隊完成「' + st.name + '」，隊員同步時會自動補上' + (navigator.onLine === false ? '（現在沒網路，連上後送出）' : '');
    }, function () {});
  };
  gen.onclick = function () {
    busy(gen, function () { return host.sign(sigText(host, stSel.value), sqSel.value); }).then(function (r) {
      var codeText = stSel.value + '-' + r.sig, qr = h('div', { class: 'fm-qr' });
      clear(out).appendChild(h('div', { class: 'col', style: { alignItems: 'center', gap: '8px' } }, qr,
        h('div', { class: 'fm-bigcode' }, codeText), h('div', { class: 'small muted' }, (sqSel.value === '*' ? '任何小隊' : '只有第 ' + sqSel.value + ' 小隊') + '可以用；學員用遊戲裡的「📷 掃描」掃，或在遊戲頁輸入代碼')));
      host.qr(qr, host.link({ k: codeText, s: 'student' }), 220);
    }, function () {});
  };
  // 密鑰事先寫好：一進來（有網路）就把每一關×每一隊的密鑰存在手機，到現場沒網路也能產生；QR code 的程式也先載好
  var keyMsg = h('div', { class: 'small muted fm-keys' }, '正在把密鑰存到手機…');
  host.qr(h('div'), 'x', 40);
  if (host.signAll) host.signAll(stamps.map(function (s) { return sigText(host, s.id); }), sqOpts.concat(['*'])).then(function () {
    keyMsg.textContent = '✓ ' + stamps.length + ' 關 × ' + (nSq + 1) + ' 種小隊的密鑰都存在手機了，沒網路也能產生';
    keyMsg.className = 'small fm-keys ok';
  }, function () { keyMsg.textContent = '密鑰還沒存到手機（需要網路），產生時會連線'; keyMsg.className = 'small fm-keys bad'; });
  else keyMsg.textContent = '';
  el.appendChild(h('div', { class: 'card fm-card' }, h('div', { class: 'fm-name' }, host.pack.name + '・關主'), h('div', { class: 'small muted' }, host.me.name),
    h('div', { class: 'fm-t', style: { marginTop: '10px' } }, '產生關主密鑰'),
    h('div', { class: 'col', style: { gap: '8px' } }, stSel, sqSel, gen, keyMsg), out,
    h('div', { class: 'col', style: { gap: '6px', marginTop: '10px' } }, rec, recMsg,
      h('div', { class: 'small muted' }, '隊員忘了輸入密鑰也沒關係：記錄後，那一隊的手機同步時（幾分鐘內）會自動解開。')),
    h('div', { class: 'fm-t', style: { marginTop: '14px' } }, '過關分數（團隊計分）'),
    host.activity ? h('div', { class: 'col', style: { gap: '8px' } }, h('div', { class: 'row', style: { gap: '8px' } }, pts, up), upMsg,
      h('div', { class: 'small muted' }, '選好上面的關卡和小隊，這一隊過關時按一下；同一關再按一次是改分數，不會重複加。'))
      : h('div', { class: 'small muted' }, '要從活動卡片的「開始遊戲」進來，才會連到團隊計分。')));
  var rf = h('button', { class: 'btn sm' }, '重新整理');
  el.appendChild(h('div', { class: 'card fm-card' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('div', { class: 'fm-t' }, '各小隊進度'), rf), board));
  function load() {
    return Promise.all(sqOpts.map(function (n) { return host.inbox(host.ch('sq' + n + '-fog'), 0); })).then(function (rs) {
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
