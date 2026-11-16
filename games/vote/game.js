/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 測試資源包「即時投票」：晚會票選、選宵夜、課程回饋、表決都能用。不計分。
 *   學員：主持人開始投票後，手機出現問題和選項，選一個（結束前可以改，最後一次算）；結束後看到各選項票數。
 *   主持人（工作人員）：從準備好的題目選一題、或當場打一題，開始投票；即時看票數；結束並公布；「投影畫面」（view=show，長條圖即時長高）。
 * 資料：
 *   投票  host.submit(in-vote) { k: 這次投票的代號, a: 選第幾個(0 起) }（學員看不到別人的；每人最後一筆算）
 *   狀態  host.stage('vote') { v, k, q, opts: [...], phase: open|closed, tally: [...], n }（題目直接放在狀態裡，所以可以當場出題）
 */
CampGame.register({
  mount: function (el, host) {
    var D = vtCfg(host.data);
    el.classList.add('vt-root');
    if (host.mode === 'master') { if (host.param('view') === 'show') vtShow(el, host, D); else vtPanel(el, host, D); }
    else vtPlayer(el, host, D);
  }
});

var VT_COLORS = ['#1e88e5', '#e53935', '#43a047', '#f9a825', '#8e24aa', '#00897b'];
function vtClear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
function vtPoll(line) {
  var x = String(line || '').replace(/｜/g, '|').split('|').map(function (s) { return String(s).trim(); }), opts = x.slice(1).filter(Boolean).slice(0, 6).map(function (s) { return s.slice(0, 40); });
  return x[0] && opts.length >= 2 ? { q: x[0].slice(0, 200), opts: opts } : null;
}
function vtCfg(d) {
  d = d || {};
  return { title: String(d.title || '投票'), polls: String(d.polls || '').split(/\n/).map(vtPoll).filter(Boolean).slice(0, 30), anon: !/^(0|否|no|false)$/i.test(String(d.anon === undefined ? '1' : d.anon).trim()) };
}
/** 收件 → 這次投票各選項票數（每人最後一筆算）。主持人、投影、壓力測試都用這個 */
function vtTally(items, k, nOpts) {
  var last = {}, tally = [], who = [];
  for (var i = 0; i < nOpts; i++) { tally.push(0); who.push([]); }
  (items || []).slice().sort(function (a, b) { return (a.t || 0) - (b.t || 0); }).forEach(function (x) { var d = x.d || {}; if (String(d.k) !== String(k) || !(Number(d.a) >= 0 && Number(d.a) < nOpts)) return; last[x.c] = { a: Number(d.a), name: x.name, squad: x.squad }; });
  Object.keys(last).forEach(function (c) { tally[last[c].a]++; who[last[c].a].push((last[c].squad ? last[c].squad + ' 隊 ' : '') + last[c].name); });
  return { tally: tally, n: Object.keys(last).length, who: who };
}
/** 長條圖（學員結果、主持人、投影共用）；set(tally, done) 更新，長條會動、數字會跳 */
function vtBars(host, opts, o) {
  var h = host.h, rows = [], prev = [];
  var box = h('div', { class: 'vt-bars' + (o.big ? ' big' : '') }, opts.map(function (t, i) {
    var fill = h('i', { style: { background: VT_COLORS[i % 6] } }), num = h('b', null, '0'), pct = h('small', null, '');
    var row = h(o.pick ? 'button' : 'div', { class: 'vt-row', type: o.pick ? 'button' : null, onclick: o.pick ? function () { o.pick(i, row); } : null },
      h('div', { class: 'vt-label' }, h('span', { class: 'vt-dot', style: { background: VT_COLORS[i % 6] } }), h('span', { class: 'vt-otext' }, t), pct, num), h('div', { class: 'vt-track' }, fill));
    rows.push({ row: row, fill: fill, num: num, pct: pct });
    return row;
  }));
  return {
    el: box, rows: rows,
    mine: function (i) { rows.forEach(function (r, j) { r.row.classList.toggle('on', j === i); }); },
    lock: function () { rows.forEach(function (r) { if (o.pick) r.row.disabled = true; }); },
    set: function (tally, done) {
      var sum = 0, max = 0; (tally || []).forEach(function (n) { sum += n; if (n > max) max = n; });
      box.classList.add('shown');
      rows.forEach(function (r, i) {
        var n = (tally && tally[i]) || 0;
        r.fill.style.width = (max ? n / max * 100 : 0) + '%';
        if (prev[i] !== n) host.fx.count(r.num, prev[i] || 0, n, 600);
        prev[i] = n;
        r.pct.textContent = sum ? Math.round(n / sum * 100) + '%' : '';
        r.row.classList.toggle('win', !!done && max > 0 && n === max);
      });
    }
  };
}

/* ---------------- 學員 ---------------- */
function vtPlayer(el, host, D) {
  var h = host.h, ch = host.ch('in-vote'), mine = host.load('votes', {}) || {}, st = null, key = '', bars = null;
  var head = h('div', { class: 'card vt-head' }, h('div', { class: 'vt-title' }, '🗳️ ' + D.title)), body = h('div', { class: 'card vt-card' });
  el.appendChild(head); el.appendChild(body);
  function pick(i, row) {
    if (!st || st.phase !== 'open') return;
    if (mine[st.k] === i) return;
    mine = {}; mine[st.k] = i; host.save('votes', mine);
    host.submit(ch, { k: st.k, a: i }).catch(function () {});
    host.fx.buzz(40); host.fx.sound('pop'); host.fx.pop(row);
    bars.mine(i); note();
  }
  var noteEl = h('div', { class: 'vt-note' });
  function note() { noteEl.textContent = st.phase === 'open' ? (mine[st.k] >= 0 ? '已投給「' + st.opts[mine[st.k]] + '」，結束前可以改' : '選一個') : '投票結束，共 ' + (st.n || 0) + ' 票' + (mine[st.k] >= 0 ? '・你投的是「' + st.opts[mine[st.k]] + '」' : ''); }
  function draw() {
    var k = !st || !st.k ? 'idle' : st.k + ':' + st.phase + ':' + st.v;
    if (k === key) return;
    key = k; vtClear(body);
    if (k === 'idle') { body.appendChild(h('div', { class: 'vt-wait' }, h('div', { class: 'vt-wicon' }, '🗳️'), h('div', { class: 'vt-wt' }, '等主持人開始投票'))); return; }
    bars = vtBars(host, st.opts, { pick: st.phase === 'open' ? pick : null });
    body.appendChild(h('div', { class: 'vt-q' }, st.q)); body.appendChild(bars.el); body.appendChild(noteEl);
    if (mine[st.k] >= 0) bars.mine(mine[st.k]);
    if (st.phase === 'closed') {
      bars.set(st.tally, true);
      var max = Math.max.apply(null, (st.tally || []).concat([0]));
      if (host.now() - st.v < 15000) { host.fx.sound('ok'); if (mine[st.k] >= 0 && max > 0 && st.tally[mine[st.k]] === max) host.fx.confetti({ n: 40 }); }
    }
    note();
  }
  host.stage('vote', { fast: 1500, slow: 6000 }).on(function (s) { st = s; draw(); });
  draw();
}

/* ---------------- 主持人 ---------------- */
function vtPanel(el, host, D) {
  var h = host.h, stage = host.stage('vote'), items = [], bars = null, barsKey = '';
  var top = h('div', { class: 'card vt-card' }), live = h('div', { class: 'card vt-card' }), list = h('div', { class: 'card vt-card' });
  el.appendChild(top); el.appendChild(live); el.appendChild(list);
  function cur() { return stage.get(); }
  function load() { return host.inbox(host.ch('in-vote'), 0).then(function (r) { items = r.items || []; drawLive(); }, function () {}); }
  function start(p) { stage.set({ k: 'v' + host.now().toString(36), q: p.q, opts: p.opts, phase: 'open', tally: [], n: 0 }); render(); }
  function close() { load().then(function () { var st = cur(); if (!st || st.phase !== 'open') return; var T = vtTally(items, st.k, st.opts.length); stage.set(Object.assign({}, st, { phase: 'closed', tally: T.tally, n: T.n })); host.fx.sound('ok'); render(); }); }
  function drawLive() {
    var st = cur();
    if (!st || !st.k) { vtClear(live).appendChild(h('div', { class: 'small muted' }, '選下面一題，或當場打一題，按「開始投票」。')); bars = null; barsKey = ''; return; }
    var T = st.phase === 'closed' ? { tally: st.tally, n: st.n, who: [] } : vtTally(items, st.k, st.opts.length);
    if (barsKey !== st.k) { barsKey = st.k; bars = vtBars(host, st.opts, {}); vtClear(live).appendChild(h('div', { class: 'vt-q' }, st.q)); live.appendChild(bars.el); live.appendChild(h('div', { class: 'vt-note' })); live.appendChild(h('div', { class: 'vt-who small muted' })); }
    bars.set(T.tally, st.phase === 'closed');
    live.querySelector('.vt-note').textContent = (st.phase === 'open' ? '投票中・' : '已結束・') + T.n + ' 票';
    var who = live.querySelector('.vt-who'); vtClear(who);
    if (!D.anon && st.phase === 'open') T.who.forEach(function (w, i) { if (w.length) who.appendChild(h('div', null, h('b', null, st.opts[i] + '：'), w.join('、'))); });
  }
  function render() {
    var st = cur(), open = st && st.phase === 'open', row = h('div', { class: 'row wrap', style: { gap: '8px', marginTop: '10px' } });
    vtClear(top).appendChild(h('div', null, h('div', { class: 'vt-title dark' }, '🗳️ ' + D.title + '・主持人'), h('div', { class: 'small muted' }, open ? '投票中' : st && st.k ? '上一題已結束' : '還沒開始' + (D.anon ? '・匿名（只看票數）' : '・記名'))));
    if (open) row.appendChild(h('button', { class: 'btn primary', onclick: close }, '結束投票並公布結果'));
    if (st && st.k && !open) row.appendChild(h('button', { class: 'btn', onclick: function () { start({ q: st.q, opts: st.opts }); } }, '同一題重投'));
    row.appendChild(h('a', { class: 'btn', href: host.link({ view: 'show' }), target: '_blank' }, '📺 投影畫面'));
    top.appendChild(row);
    drawLive();
    vtClear(list).appendChild(h('div', { class: 'vt-t' }, '準備好的題目'));
    if (!D.polls.length) list.appendChild(h('div', { class: 'small muted' }, '沒有預先準備的題目，可以在下面當場出題。'));
    D.polls.forEach(function (p) {
      list.appendChild(h('div', { class: 'vt-li' }, h('div', { class: 'grow' }, h('b', null, p.q), h('div', { class: 'small muted' }, p.opts.join('／'))), h('button', { class: 'btn sm', disabled: open, onclick: function () { start(p); } }, '開始投票')));
    });
    var q = h('input', { class: 'input', placeholder: '問題，例如：要不要加碼一場？' }), o = h('textarea', { class: 'input', rows: '3', placeholder: '選項，一行一個（2～6 個）' });
    list.appendChild(h('div', { class: 'vt-t', style: { marginTop: '14px' } }, '當場出題'));
    list.appendChild(h('div', { class: 'col', style: { gap: '8px' } }, q, o, h('button', { class: 'btn', disabled: open, onclick: function () {
      var p = vtPoll(q.value + '|' + o.value.split(/\n/).join('|'));
      if (!p) return host.toast('要有問題和至少 2 個選項', true);
      start(p);
    } }, '開始投票')));
  }
  stage.on(render);
  render();
  host.every(3000, function () { var st = cur(); if (st && st.phase === 'open') load(); }, { now: true });
}

/* ---------------- 投影 ---------------- */
function vtShow(el, host, D) {
  var h = host.h, box = h('div', { class: 'vt-show' }), st = null, key = '', bars = null, cnt = null, doneKey = '';
  document.body.classList.add('vt-showbody');
  el.appendChild(box);
  function draw() {
    var k = !st || !st.k ? 'idle' : st.k;
    if (k !== key) {
      key = k; vtClear(box); bars = null;
      if (k === 'idle') { box.appendChild(h('div', { class: 'vt-showtitle' }, '🗳️ ' + D.title)); box.appendChild(h('div', { class: 'vt-showsub' }, '拿出手機，等主持人開始投票')); return; }
      bars = vtBars(host, st.opts, { big: true }); cnt = h('div', { class: 'vt-showsub' });
      box.appendChild(h('div', { class: 'vt-showq' }, st.q)); box.appendChild(bars.el); box.appendChild(cnt);
      bars.set([], false);
    }
    if (!bars) return;
    if (st.phase === 'closed') {
      bars.set(st.tally, true); cnt.textContent = '投票結束・共 ' + (st.n || 0) + ' 票';
      if (doneKey !== st.k) { doneKey = st.k; if (host.now() - st.v < 20000) { host.fx.confetti({ n: 120 }); host.fx.sound('win'); } }
    }
  }
  host.stage('vote', { fast: 1000, slow: 3000 }).on(function (s) { st = s; draw(); });
  host.every(2500, function () {
    if (!st || st.phase !== 'open' || !bars) return;
    var k = st.k;
    host.inbox(host.ch('in-vote'), 0).then(function (r) { if (!st || st.k !== k || st.phase !== 'open' || !bars) return; var T = vtTally(r.items || [], k, st.opts.length); bars.set(T.tally, false); cnt.textContent = '投票中・' + T.n + ' 票'; }, function () {});
  });
  draw();
}
