/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 測試資源包「搶答鈴」：主持人口頭出題（或看投影），手機當搶答鈴。
 *   學員：主持人開放後大按鈕亮起，按下去送出「我按了、反應花了幾毫秒」。反應時間從「按鈕在自己手機亮起」開始算，
 *         晚一點收到的手機不吃虧。有人搶到後全場手機顯示是誰；答錯的小隊這一題不能再搶。
 *   主持人（工作人員）：開放搶答、答對（加分）、答錯（換下一位，沒有下一位就重新開放）、這題作廢；手動加減各隊分數；
 *         把分數送進團隊計分；「投影畫面」（view=show）。
 * 資料：
 *   按鈴  同步頻道 in-buzz（學員只能送、看不到別人的）事件 { r: 第幾題, o: 這次開放的時間, ms: 反應毫秒, sq: 小隊 }
 *   狀態  host.stage('buzz') { v, r, phase: idle|open|won, at, win: { c, name, sq, ms }, list: [[c, name, sq, ms]…前 5 名], out: [答錯的小隊], sc: { 小隊: 分數 } }
 */
CampGame.register({
  mount: function (el, host) {
    var D = bzCfg(host.data);
    el.classList.add('bz-root');
    if (host.mode === 'master') { if (host.param('view') === 'show') bzShow(el, host, D); else bzPanel(el, host, D); }
    else bzPlayer(el, host, D);
  }
});

var BZ_SETTLE = 1500;   // 第一個人按了以後再等多久才決定是誰（讓同時按、但比較慢送到的也算進來）
function bzInt(v, d, lo, hi) { v = Math.round(Number(v)); if (!isFinite(v)) v = d; return Math.max(lo, Math.min(hi, v)); }
function bzClear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
function bzCfg(d) { d = d || {}; return { title: String(d.title || '搶答'), points: bzInt(d.points, 10, 0, 100000), penalty: bzInt(d.penalty, 0, 0, 100000), lead: bzInt(d.lead, 5, 1, 20) }; }
/** 這次開放收到的按鈴 → 照反應時間排好（每人只算第一次；答錯的小隊不算）。主持人、壓力測試都用這個 */
function bzOrder(events, st) {
  var seen = {}, out = (st.out || []).map(String), list = [];
  (events || []).forEach(function (e) {
    var d = e.d || {}, who = String(e.c).split('.')[0], ms = Number(d.ms);
    if (Number(d.r) !== Number(st.r) || Number(d.o) !== Number(st.at) || !(ms >= 0) || ms > 600000 || seen[who]) return;
    seen[who] = 1;
    var sq = String(d.sq === undefined || d.sq === null ? '' : d.sq);
    if (sq && out.indexOf(sq) >= 0) return;
    list.push([who, String(e.name || '').slice(0, 20), sq, Math.round(ms)]);
  });
  return list.sort(function (a, b) { return a[3] - b[3]; });
}
function bzScores(host, sc, mine, big) {
  var h = host.h, keys = Object.keys(sc || {}).sort(function (a, b) { return sc[b] - sc[a] || Number(a) - Number(b); });
  if (!keys.length) return h('div', { class: 'small muted' }, '還沒有分數');
  return h('div', { class: 'bz-scores' + (big ? ' big' : '') }, keys.map(function (k, i) {
    return h('div', { class: 'bz-sc' + (String(k) === String(mine) ? ' me' : '') + (i === 0 && sc[k] > 0 ? ' top' : '') }, h('small', null, '第 ' + k + ' 小隊'), h('b', null, String(sc[k])));
  }));
}

/* ---------------- 學員 ---------------- */
function bzPlayer(el, host, D) {
  var h = host.h, st = null, key = '', pressed = host.load('pressed', null), lit = host.load('lit', null), sender = null;
  var squad = String(host.me && host.me.squad !== undefined && host.me.squad !== null ? host.me.squad : ''), myId = host.me.sid ? 's' + host.me.sid : host.me.wid ? 'w' + host.me.wid : 'u';
  var head = h('div', { class: 'bz-head' }), btn = h('button', { class: 'bz-btn', type: 'button' }, h('span', { class: 'bz-btxt' }, '等待')), note = h('div', { class: 'bz-note' }), scores = h('div', { class: 'card bz-card' });
  el.appendChild(head); el.appendChild(h('div', { class: 'bz-stage' }, btn)); el.appendChild(note); el.appendChild(scores);
  head.appendChild(h('div', { class: 'bz-title' }, '🔔 ' + D.title)); head.appendChild(h('div', { class: 'small bz-sub' }, (host.me.name || '') + (squad ? '・第 ' + squad + ' 小隊' : '')));
  function mine() { return pressed && st && pressed.r === st.r && pressed.o === st.at ? pressed : null; }
  function press() {
    if (!st || st.phase !== 'open' || mine() || host.now() < st.at || (st.out || []).map(String).indexOf(squad) >= 0) return;
    var t0 = lit && lit.o === st.at ? lit.t : st.at, d = { r: st.r, o: st.at, ms: Math.max(0, Math.round(host.now() - t0)), sq: squad };
    pressed = d; host.save('pressed', d);
    host.fx.buzz(80); host.fx.sound('buzz');
    // 用同步頻道送（比送出收件快很多）；送到了就收掉這條連線，不佔頻道
    if (sender) sender.stop();
    var mySender = sender = host.sync(host.ch('in-buzz'), { fast: 600, slow: 3000, onOk: function (r, batch) { if (batch && batch.length) { mySender.stop(); if (sender === mySender) sender = null; } } });
    mySender.send(d);
    key = ''; tick();
  }
  btn.addEventListener('click', press);
  function set(cls, text, n) { btn.className = 'bz-btn ' + cls; btn.firstChild.textContent = text; btn.disabled = cls !== 'go'; note.textContent = n || ''; }
  function tick() {
    var k, now = host.now();
    if (!st || st.phase === 'idle') k = 'idle:' + (st ? st.v : 0);
    else if (st.phase === 'open') k = 'open:' + st.at + ':' + ((st.out || []).map(String).indexOf(squad) >= 0 ? 'out' : mine() ? 'sent' : now < st.at ? 'pre' : 'go');
    else k = 'won:' + st.v;
    if (k === key) return;
    key = k;
    var kind = k.split(':')[0], sub = k.split(':')[2];
    if (kind === 'idle') set('idle', '等待', '主持人開放後按鈕會亮起來');
    else if (kind === 'open' && sub === 'out') set('out', '✗', '你們小隊這題答錯了，等下一題');
    else if (kind === 'open' && sub === 'sent') set('sent', '已按！', '等主持人公布是誰搶到…');
    else if (kind === 'open' && sub === 'pre') set('ready', '準備…', '按鈕亮起來就按！');
    else if (kind === 'open') {
      if (!lit || lit.o !== st.at) { lit = { o: st.at, t: Math.max(st.at, now) }; host.save('lit', lit); }   // 按鈕在這支手機亮起的時間
      set('go', '搶答！', '');
      host.fx.buzz(30); host.fx.sound('tick'); host.fx.pop(btn);
    } else {
      var w = st.win || {}, fresh = now - st.v < 12000;
      if (w.c === myId) { set('win', '搶到了！', '🎉 你搶到了，請回答！'); if (fresh) { host.fx.fireworks({ n: 4 }); host.fx.sound('win'); host.fx.buzz([100, 60, 160]); } }
      else if (w.sq && String(w.sq) === squad) { set('win', '我們隊！', '第 ' + w.sq + ' 小隊 ' + w.name + ' 搶到了'); if (fresh) host.fx.confetti({ n: 40 }); }
      else set('lost', w.sq ? '第 ' + w.sq + ' 隊' : '有人搶到', (w.sq ? '第 ' + w.sq + ' 小隊 ' : '') + (w.name || '') + ' 搶到了' + (mine() ? '（你慢了 ' + ((mine().ms - w.ms) / 1000).toFixed(2) + ' 秒）' : ''));
    }
    bzClear(scores).appendChild(h('div', { class: 'bz-t' }, '各隊分數')); scores.appendChild(bzScores(host, st && st.sc, squad));
  }
  host.stage('buzz', { fast: 1000, slow: 4000 }).on(function (s) { st = s; tick(); });
  setInterval(tick, 100);
  tick();
}

/* ---------------- 主持人 ---------------- */
function bzPanel(el, host, D) {
  var h = host.h, stage = host.stage('buzz'), events = [], settle = 0;
  var top = h('div', { class: 'card bz-card' }), mid = h('div', { class: 'card bz-card' }), score = h('div', { class: 'card bz-card' });
  el.appendChild(top); el.appendChild(mid); el.appendChild(score);
  function cur() { return stage.get() || { r: 0, phase: 'idle', out: [], sc: {} }; }
  function put(p) { var st = Object.assign({}, cur(), p); clearTimeout(settle); settle = 0; stage.set(st); render(); }
  function open(next) { var st = cur(); events = next ? [] : events; put({ r: next ? (st.r || 0) + 1 : st.r, phase: 'open', at: host.now() + D.lead * 1000, win: null, list: [], out: next ? [] : st.out || [] }); }
  function decide() {
    settle = 0;
    var st = cur(); if (st.phase !== 'open') return;
    var list = bzOrder(events, st); if (!list.length) return;
    var w = list[0];
    put({ phase: 'won', win: { c: w[0], name: w[1], sq: w[2], ms: w[3] }, list: list.slice(0, 5) });
    host.fx.sound('ok');
  }
  function add(sq, n) { var sc = Object.assign({}, cur().sc || {}); sc[sq] = (Number(sc[sq]) || 0) + n; return sc; }
  function right() { var st = cur(), w = st.win; put({ phase: 'idle', sc: w.sq ? add(w.sq, D.points) : st.sc }); host.fx.confetti({ n: 40 }); }
  function wrong() {
    var st = cur(), w = st.win, out = (st.out || []).concat(w.sq ? [w.sq] : []), sc = w.sq && D.penalty ? add(w.sq, -D.penalty) : st.sc;
    var rest = (st.list || []).filter(function (x) { return x[0] !== w.c && out.map(String).indexOf(String(x[2])) < 0; });
    if (rest.length) put({ win: { c: rest[0][0], name: rest[0][1], sq: rest[0][2], ms: rest[0][3] }, list: rest, out: out, sc: sc });   // 換下一位
    else { events = []; put({ phase: 'open', at: host.now() + D.lead * 1000, win: null, list: [], out: out, sc: sc }); }             // 沒有下一位：其他隊重新搶
  }
  function upload(btn) {
    var sc = cur().sc || {}, keys = Object.keys(sc); btn.disabled = true;
    Promise.all(keys.map(function (k) { return host.scoreSafe({ stage: 'BUZZ', stageName: D.title, team: Number(k), score: sc[k] }); })).then(function (rs) {
      btn.disabled = false; var q = rs.length ? rs[rs.length - 1].queued : 0;
      host.toast(q ? '有 ' + q + ' 筆還沒送出，連上後自動上傳' : keys.length + ' 隊的分數已上傳到團隊計分');
    });
  }
  function render() {
    var st = cur(), ph = st.phase, row = h('div', { class: 'row wrap', style: { gap: '8px', marginTop: '10px' } });
    bzClear(top).appendChild(h('div', null, h('div', { class: 'bz-title dark' }, '🔔 ' + D.title + '・主持人'),
      h('div', { class: 'small muted' }, (st.r ? '第 ' + st.r + ' 題・' : '') + ({ idle: '還沒開放', open: '開放搶答中' + ((st.out || []).length ? '（第 ' + st.out.join('、') + ' 小隊這題不能搶）' : ''), won: '有人搶到了' })[ph])));
    if (ph === 'idle') row.appendChild(h('button', { class: 'btn primary', onclick: function () { open(true); } }, '🔔 開放搶答（下一題）'));
    if (ph === 'open') row.appendChild(h('button', { class: 'btn', onclick: function () { put({ phase: 'idle' }); } }, '這題作廢'));
    if (ph === 'won') {
      row.appendChild(h('button', { class: 'btn primary', onclick: right }, '✓ 答對 +' + D.points));
      row.appendChild(h('button', { class: 'btn', onclick: wrong }, '✗ 答錯' + (D.penalty ? ' −' + D.penalty : '') + '，換下一位'));
      row.appendChild(h('button', { class: 'btn', onclick: function () { put({ phase: 'idle' }); } }, '這題作廢'));
    }
    row.appendChild(h('a', { class: 'btn', href: host.link({ view: 'show' }), target: '_blank' }, '📺 投影畫面'));
    top.appendChild(row);
    bzClear(mid);
    if (ph === 'won' && st.win) {
      mid.appendChild(h('div', { class: 'bz-winner' }, h('small', null, '搶到的是'), h('b', null, (st.win.sq ? '第 ' + st.win.sq + ' 小隊　' : '') + st.win.name), h('span', null, '反應 ' + (st.win.ms / 1000).toFixed(2) + ' 秒')));
      (st.list || []).slice(1).forEach(function (x, i) { mid.appendChild(h('div', { class: 'bz-li' }, (i + 2) + '. ' + (x[2] ? '第 ' + x[2] + ' 小隊　' : '') + x[1], h('span', { class: 'muted' }, '　' + (x[3] / 1000).toFixed(2) + ' 秒'))); });
    } else mid.appendChild(h('div', { class: 'small muted' }, ph === 'open' ? '等第一個人按下去…' : '唸完題目再按「開放搶答」。按鈕會在 ' + D.lead + ' 秒後在所有手機亮起。'));
    bzClear(score).appendChild(h('div', { class: 'bz-t' }, '各隊分數（可以手動加減）'));
    var sc = st.sc || {}, sqs = Object.keys(sc);
    sqs.sort(function (a, b) { return Number(a) - Number(b); }).forEach(function (k) {
      score.appendChild(h('div', { class: 'bz-srow' }, h('span', { class: 'grow' }, '第 ' + k + ' 小隊'),
        h('button', { class: 'btn sm', onclick: function () { put({ sc: add(k, -D.points || -1) }); } }, '−'), h('b', null, String(sc[k])), h('button', { class: 'btn sm', onclick: function () { put({ sc: add(k, D.points || 1) }); } }, '＋')));
    });
    var inp = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: '1', placeholder: '小隊編號', style: { maxWidth: '120px' } });
    score.appendChild(h('div', { class: 'row', style: { gap: '8px', marginTop: '8px' } }, inp, h('button', { class: 'btn sm', onclick: function () { var k = String(Math.round(Number(inp.value))); if (!(Number(k) > 0)) return host.toast('填小隊編號', true); put({ sc: add(k, 0) }); } }, '加一隊'),
      host.activity && sqs.length ? h('button', { class: 'btn sm primary', onclick: function (e) { upload(e.currentTarget); } }, '🏆 送進團隊計分') : null));
  }
  // 收按鈴：主持人加入頻道，快一點拉
  host.sync(host.ch('in-buzz'), { fast: 600, slow: 2500, priority: true, onEvents: function (evs) {
    var st = cur();
    evs.forEach(function (e) { events.push(e); });
    if (events.length > 600) events = events.slice(-600);
    if (st.phase === 'open' && !settle && bzOrder(events, st).length) settle = setTimeout(decide, BZ_SETTLE);
  } });
  stage.on(render);
  render();
}

/* ---------------- 投影 ---------------- */
function bzShow(el, host, D) {
  var h = host.h, box = h('div', { class: 'bz-show' }), st = null, key = '';
  document.body.classList.add('bz-showbody');
  el.appendChild(box);
  function tick() {
    var now = host.now(), k = !st || st.phase === 'idle' ? 'idle:' + (st ? st.v : 0) : st.phase === 'open' ? 'open:' + st.at + ':' + (now < st.at ? 'pre' : 'go') : 'won:' + st.v;
    if (k === key) return;
    key = k; bzClear(box);
    var kind = k.split(':')[0];
    box.appendChild(h('div', { class: 'bz-showtitle' }, '🔔 ' + D.title + (st && st.r ? '　第 ' + st.r + ' 題' : '')));
    if (kind === 'idle') box.appendChild(h('div', { class: 'bz-showbig' }, '聽題目…'));
    else if (kind === 'open' && /pre$/.test(k)) box.appendChild(h('div', { class: 'bz-showbig' }, '準備…'));
    else if (kind === 'open') { box.appendChild(h('div', { class: 'bz-showbig go' }, '搶答！')); host.fx.flash('#ffeb3b'); host.fx.sound('tick'); }
    else {
      var w = st.win || {};
      box.appendChild(h('div', { class: 'bz-showwin' }, h('small', null, '搶到的是'), h('b', null, (w.sq ? '第 ' + w.sq + ' 小隊' : '')), h('span', null, w.name || '')));
      if (now - st.v < 12000) { host.fx.fireworks({ n: 5 }); host.fx.sound('win'); }
    }
    if (st && st.sc && Object.keys(st.sc).length) box.appendChild(bzScores(host, st.sc, null, true));
  }
  host.stage('buzz', { fast: 800, slow: 2500 }).on(function (s) { st = s; tick(); });
  setInterval(tick, 100);
  tick();
}
