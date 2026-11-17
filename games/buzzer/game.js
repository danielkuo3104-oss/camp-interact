/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 測試資源包「搶答鈴」：主持人口頭出題（或看投影），手機當搶答鈴。
 *   學員：主持人按「下一題」後按鈕進入「預備」，主持人喊「搶答」（投影同時閃「搶答！」）才按。
 *         手機記下「按下去的伺服器時間」送出；主持人開放之前就按的算偷跑，這一題不能搶。
 *         這樣就算有些手機比較晚才收到「開放」，也不吃虧（比的是按下去的時間，不是誰先收到）。
 *   主持人（工作人員）：下一題（預備）、開放搶答、答對（加分）、答錯（換下一位，沒有下一位就重新開放）、這題作廢；
 *         手動加減各隊分數；把分數送進團隊計分；「投影畫面」（view=show）。
 * 資料：
 *   按鈴  同步頻道 in-buzz（學員只能送、看不到別人的）事件 { r: 第幾題, n: 這題第幾次開放, t: 按下去的伺服器時間, sq: 小隊 }
 *   狀態  host.stage('buzz') { v, r, n, phase: idle|armed|open|won, at: 開放的時間, win: { c, name, sq, ms }, list: [[c, name, sq, ms]…前 5 名], early: 偷跑人數, out: [答錯的小隊], sc: { 小隊: 分數 } }
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
function bzCfg(d) { d = d || {}; return { title: String(d.title || '搶答'), points: bzInt(d.points, 10, 0, 100000), penalty: bzInt(d.penalty, 0, 0, 100000) }; }
/** 這題這次開放收到的按鈴 → { list: 照按下去的時間排好 [[誰, 名字, 小隊, 開放後幾毫秒]…], early: 偷跑的人數 }
 *  每人只算第一次；開放前按的是偷跑（不算，也不能再按）；答錯的小隊不算。主持人、壓力測試都用這個 */
function bzOrder(events, st) {
  var seen = {}, out = (st.out || []).map(String), list = [], early = 0, at = Number(st.at) || 0;
  (events || []).forEach(function (e) {
    var d = e.d || {}, who = String(e.c).split('.')[0], t = Number(d.t);
    if (Number(d.r) !== Number(st.r) || Number(d.n) !== Number(st.n) || !(t > 0) || seen[who]) return;
    seen[who] = 1;
    if (!at || t < at) { early++; return; }
    var sq = String(d.sq === undefined || d.sq === null ? '' : d.sq);
    if (sq && out.indexOf(sq) >= 0) return;
    list.push([who, String(e.name || '').slice(0, 20), sq, Math.round(t - at)]);
  });
  list.sort(function (a, b) { return a[3] - b[3]; });
  return { list: list, early: early };
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
  var h = host.h, st = null, key = '', pressed = host.load('pressed', null), sender = null;
  var squad = String(host.me && host.me.squad !== undefined && host.me.squad !== null ? host.me.squad : ''), myId = host.load('cid', '') || (host.me.sid ? 's' + host.me.sid : host.me.wid ? 'w' + host.me.wid : 'u');   // 自己在同步頻道裡的代號（送出按鈴時伺服器會告訴我）
  var head = h('div', { class: 'bz-head' }), btn = h('button', { class: 'bz-btn', type: 'button' }, h('span', { class: 'bz-btxt' }, '等待')), note = h('div', { class: 'bz-note' }), scores = h('div', { class: 'card bz-card' });
  el.appendChild(head); el.appendChild(h('div', { class: 'bz-stage' }, btn)); el.appendChild(note); el.appendChild(scores);
  head.appendChild(h('div', { class: 'bz-title' }, '🔔 ' + D.title)); head.appendChild(h('div', { class: 'small bz-sub' }, (host.me.name || '') + (squad ? '・第 ' + squad + ' 小隊' : '')));
  function mine() { return pressed && st && pressed.r === st.r && pressed.n === st.n ? pressed : null; }
  function isOut() { return (st.out || []).map(String).indexOf(squad) >= 0; }
  function press() {
    if (!st || (st.phase !== 'armed' && st.phase !== 'open') || mine() || isOut()) return;
    var d = { r: st.r, n: st.n, t: Math.round(host.now()), sq: squad };
    pressed = d; host.save('pressed', d);
    host.fx.buzz(80); host.fx.sound('buzz');
    // 用同步頻道送（比送出收件快很多）；送到了就收掉這條連線，不佔頻道
    if (sender) sender.stop();
    var mySender = sender = host.sync(host.ch('in-buzz'), { fast: 600, slow: 3000, onOk: function (r, batch) { if (r && r.me) { myId = String(r.me).split('.')[0]; host.save('cid', myId); } if (batch && batch.length) { mySender.stop(); if (sender === mySender) sender = null; } } });
    mySender.send(d);
    key = ''; tick();
  }
  btn.addEventListener('click', press);
  function set(cls, text, n) { btn.className = 'bz-btn ' + cls; btn.firstChild.textContent = text; btn.disabled = cls !== 'go' && cls !== 'ready'; note.textContent = n || ''; }
  function tick() {
    var k, m = st && mine();
    if (!st || st.phase === 'idle') k = 'idle:' + (st ? st.v : 0);
    else if (st.phase === 'armed' || st.phase === 'open') k = st.phase + ':' + st.v + ':' + (isOut() ? 'out' : m ? 'sent' : 'can');
    else k = 'won:' + st.v;
    if (k === key) return;
    key = k;
    var kind = k.split(':')[0], sub = k.split(':')[2];
    if (kind === 'idle') set('idle', '等待', '等主持人出下一題');
    else if (sub === 'out') set('out', '✗', '你們小隊這題答錯了，等下一題');
    else if (sub === 'sent') set('sent', '已按！', kind === 'open' && m.t < st.at ? '太早按了（偷跑），這題不能搶' : '等主持人公布是誰搶到…');
    else if (kind === 'armed') { set('ready', '預備', '主持人喊「搶答」才按！太早按這題就不能搶'); host.fx.pop(btn); }
    else { set('go', '搶答！', ''); host.fx.buzz(30); host.fx.sound('tick'); host.fx.pop(btn); }
    if (kind === 'won') {
      var w = st.win || {}, fresh = host.now() - st.v < 12000;
      if (w.c === myId) { set('win', '搶到了！', '🎉 你搶到了，請回答！'); if (fresh) { host.fx.fireworks({ n: 4 }); host.fx.sound('win'); host.fx.buzz([100, 60, 160]); } }
      else if (w.sq && String(w.sq) === squad) { set('win', '我們隊！', '第 ' + w.sq + ' 小隊 ' + w.name + ' 搶到了'); if (fresh) host.fx.confetti({ n: 40 }); }
      else set('lost', w.sq ? '第 ' + w.sq + ' 隊' : '有人搶到', (w.sq ? '第 ' + w.sq + ' 小隊 ' : '') + (w.name || '') + ' 搶到了' + (m ? m.t < st.at ? '（你太早按，偷跑了）' : '（你慢了 ' + Math.max(0, (m.t - st.at - w.ms) / 1000).toFixed(2) + ' 秒）' : ''));
    }
    bzClear(scores).appendChild(h('div', { class: 'bz-t' }, '各隊分數')); scores.appendChild(bzScores(host, st && st.sc, squad));
  }
  host.stage('buzz', { fast: 1000, slow: 4000 }).on(function (s) { st = s; tick(); });
  tick();
}

/* ---------------- 主持人 ---------------- */
function bzPanel(el, host, D) {
  var h = host.h, stage = host.stage('buzz'), events = [], settle = 0;
  var top = h('div', { class: 'card bz-card' }), mid = h('div', { class: 'card bz-card' }), score = h('div', { class: 'card bz-card' });
  el.appendChild(top); el.appendChild(mid); el.appendChild(score);
  function cur() { return stage.get() || { r: 0, phase: 'idle', out: [], sc: {} }; }
  function put(p) { var st = Object.assign({}, cur(), p); clearTimeout(settle); settle = 0; stage.set(st); render(); }
  function arm() { var st = cur(); events = []; put({ r: (st.r || 0) + 1, n: 1, phase: 'armed', at: 0, win: null, list: [], early: 0, out: [] }); }
  function open() { put({ phase: 'open', at: host.now(), win: null, list: [], early: 0 }); host.fx.sound('tick'); watch(); }
  function decide() {
    settle = 0;
    var st = cur(); if (st.phase !== 'open') return;
    var o = bzOrder(events, st); if (!o.list.length) return;
    var w = o.list[0];
    put({ phase: 'won', win: { c: w[0], name: w[1], sq: w[2], ms: w[3] }, list: o.list.slice(0, 5), early: o.early });
    host.fx.sound('ok');
  }
  /** 開放中：有人（不是偷跑的）按了就開始等 BZ_SETTLE，再決定是誰 */
  function watch() { var st = cur(); if (st.phase === 'open' && !settle && bzOrder(events, st).list.length) settle = setTimeout(decide, BZ_SETTLE); }
  function add(sq, n) { var sc = Object.assign({}, cur().sc || {}); sc[sq] = (Number(sc[sq]) || 0) + n; return sc; }
  function right() { var st = cur(), w = st.win; put({ phase: 'idle', sc: w.sq ? add(w.sq, D.points) : st.sc }); host.fx.confetti({ n: 40 }); }
  function wrong() {
    var st = cur(), w = st.win, out = (st.out || []).concat(w.sq ? [w.sq] : []), sc = w.sq && D.penalty ? add(w.sq, -D.penalty) : st.sc;
    var rest = (st.list || []).filter(function (x) { return x[0] !== w.c && out.map(String).indexOf(String(x[2])) < 0; });
    if (rest.length) put({ win: { c: rest[0][0], name: rest[0][1], sq: rest[0][2], ms: rest[0][3] }, list: rest, out: out, sc: sc });   // 換下一位
    else { events = []; put({ n: (st.n || 1) + 1, phase: 'open', at: host.now(), win: null, list: [], early: 0, out: out, sc: sc }); }   // 沒有下一位：其他隊重新搶
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
    var early = ph === 'won' ? st.early || 0 : bzOrder(events, st).early;
    bzClear(top).appendChild(h('div', null, h('div', { class: 'bz-title dark' }, '🔔 ' + D.title + '・主持人'),
      h('div', { class: 'small muted' }, (st.r ? '第 ' + st.r + ' 題・' : '') + ({ idle: '等下一題', armed: '預備中（唸題目）', open: '開放搶答中', won: '有人搶到了' })[ph] + ((st.out || []).length && ph !== 'idle' ? '（第 ' + st.out.join('、') + ' 小隊這題不能搶）' : '') + (early ? '・' + early + ' 人偷跑' : ''))));
    if (ph === 'idle') row.appendChild(h('button', { class: 'btn primary', onclick: arm }, '▶ 下一題（手機預備）'));
    if (ph === 'armed') row.appendChild(h('button', { class: 'btn primary bz-openbtn', onclick: open }, '🔔 開放搶答！'));
    if (ph === 'armed' || ph === 'open') row.appendChild(h('button', { class: 'btn', onclick: function () { put({ phase: 'idle' }); } }, '這題作廢'));
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
    } else mid.appendChild(h('div', { class: 'small muted' }, ph === 'open' ? '等第一個人按下去…' : ph === 'armed' ? '唸題目，唸完按「開放搶答」同時喊「搶答」。在這之前按的人算偷跑，這題不能搶。' : '按「下一題」讓大家的手機進入預備，再開始唸題目。'));
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
    evs.forEach(function (e) { events.push(e); });
    if (events.length > 600) events = events.slice(-600);
    watch();
    if (cur().phase === 'armed') render();   // 偷跑人數
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
    var now = host.now(), k = !st || st.phase === 'idle' ? 'idle:' + (st ? st.v : 0) : st.phase + ':' + st.v;
    if (k === key) return;
    key = k; bzClear(box);
    var kind = k.split(':')[0];
    box.appendChild(h('div', { class: 'bz-showtitle' }, '🔔 ' + D.title + (st && st.r ? '　第 ' + st.r + ' 題' : '')));
    if (kind === 'idle') box.appendChild(h('div', { class: 'bz-showbig' }, '準備下一題'));
    else if (kind === 'armed') box.appendChild(h('div', { class: 'bz-showbig' }, '聽題目…'));
    else if (kind === 'open') { box.appendChild(h('div', { class: 'bz-showbig go' }, '搶答！')); if (now - st.v < 5000) { host.fx.flash('#ffeb3b'); host.fx.sound('tick'); } }
    else {
      var w = st.win || {};
      box.appendChild(h('div', { class: 'bz-showwin' }, h('small', null, '搶到的是'), h('b', null, (w.sq ? '第 ' + w.sq + ' 小隊' : '')), h('span', null, w.name || '')));
      if (now - st.v < 12000) { host.fx.fireworks({ n: 5 }); host.fx.sound('win'); }
    }
    if (st && st.sc && Object.keys(st.sc).length) box.appendChild(bzScores(host, st.sc, null, true));
  }
  host.stage('buzz', { fast: 500, slow: 1500 }).on(function (s) { st = s; tick(); });
  tick();
}
