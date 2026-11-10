/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 測試資源包「幸運樂透」：賭場之夜用的線上樂透簽注單＋投影開獎。
 *   學員：選號碼＋特別號填簽注單（每期最多幾注），送出後等開獎；開獎時手機上的球跟投影同步一顆一顆出現，
 *         自己的號碼中了就亮起來，全部開完立刻在手機上對獎，依獎項放不同的動畫（頭獎、大獎、小獎、沒中）。
 *   工作人員（主持人）：停止下注、開獎、開下一期；「開獎投影畫面」（view=show）用投影給大家一起看；
 *         看本期幾注、對獎結果、中獎名單，和每支手機收到開獎花了多久（即時性檢查）。
 *   測試模式：可以先寫好要開出的號碼（預設號碼），也可以直接隨機開。
 *
 * 資料：
 *   簽注  host.submit(in-lotto)  { r: 第幾期, n: [號碼…], s: 特別號, k: 手機上的編號 }（學員看不到別人的）
 *   狀態  同步頻道 lotto:範圍（工作人員寫，學員只看不加入）{ v, round, phase: open|closed|draw, closedAt, draw: { n, s, at, gap, pushed } }
 *         每次改變也送一份到 w-lotto（收件），快取被清掉時用來補回
 *   回報  同步頻道 in-lack:範圍（學員只送）{ ack: 期別鍵, dl: 從按開獎到收到幾毫秒, late: 收到時比開始揭曉晚幾毫秒, tiers: [每注的獎項] }
 * 開獎號碼在主持人按下「開獎」時就決定好，連同「幾點開始揭曉」一起送出；每支手機照伺服器時間自己播，
 * 所以只要在倒數結束前收到，大家看到的進度都一樣（倒數時間＝留給手機收到的時間）。
 */
CampGame.register({
  mount: function (el, host) {
    var D = ltCfg(host.data);
    if (host.mode === 'master') { if (host.param('view') === 'show') ltShow(el, host, D); else ltPanel(el, host, D); }
    else ltPlayer(el, host, D);
  }
});

/* ---------------- 設定與對獎（純計算，壓力測試腳本也用這幾個函式） ---------------- */
function ltInt(v, d, lo, hi) { v = Math.round(Number(v)); if (!isFinite(v)) v = d; return Math.max(lo, Math.min(hi, v)); }
function ltCfg(data) {
  data = data || {};
  var pick = ltInt(data.pick, 6, 1, 10), max = ltInt(data.max, 38, pick + 1, 99), spMax = ltInt(data.spMax, 8, 0, 99);
  return {
    pick: pick, max: max, spMax: spMax, maxTickets: ltInt(data.maxTickets, 5, 1, 20),
    prizes: ltPrizes(data.prizes, spMax > 0), preset: String(data.preset || ''),
    countdown: ltInt(data.countdown, 10, 3, 60), gap: ltInt(data.gap, 3, 1, 10), title: String(data.title || '幸運樂透')
  };
}
/** 獎項：一行一個「中幾個+特別號(1/0/*) 獎名」，例如「6+1 頭獎」「3+0 玖獎」「4 參獎」（沒寫特別號＝不管特別號）。照順序對，先符合的算。 */
function ltPrizes(text, hasSp) {
  var out = [];
  String(text || '').split(/\n/).forEach(function (line) {
    var m = /^\s*(\d{1,2})\s*(?:\+\s*([01*]))?\s+(.+?)\s*$/.exec(line);
    if (!m) return;
    out.push({ m: Number(m[1]), s: !hasSp || !m[2] || m[2] === '*' ? null : Number(m[2]), name: m[3].slice(0, 12) });
  });
  if (!out.length) out = [{ m: 6, s: hasSp ? 1 : null, name: '頭獎' }, { m: 6, s: null, name: '貳獎' }, { m: 5, s: null, name: '參獎' }, { m: 4, s: null, name: '肆獎' }, { m: 3, s: null, name: '伍獎' }];
  out.forEach(function (p, i) { p.lv = i === 0 ? 'jackpot' : i <= 2 ? 'big' : 'small'; });
  return out;
}
/** 一注中了哪個獎：回傳獎項的位置，沒中是 -1 */
function ltTier(t, dr, D) {
  if (!t || !dr || !Array.isArray(t.n) || !Array.isArray(dr.n)) return -1;
  var m = t.n.filter(function (x) { return dr.n.indexOf(Number(x)) >= 0; }).length;
  var s = D.spMax > 0 && Number(t.s) === Number(dr.s) ? 1 : 0;
  for (var i = 0; i < D.prizes.length; i++) { var p = D.prizes[i]; if (p.m === m && (p.s === null || p.s === s)) return i; }
  return -1;
}
function ltMatch(t, dr) { return t.n.filter(function (x) { return dr.n.indexOf(Number(x)) >= 0; }).length; }
/** 一注是否有效：號碼個數、範圍、不重複 */
function ltValid(t, D) {
  if (!t || !Array.isArray(t.n) || t.n.length !== D.pick) return false;
  var seen = {};
  for (var i = 0; i < t.n.length; i++) { var x = Number(t.n[i]); if (!(x >= 1 && x <= D.max) || x !== Math.floor(x) || seen[x]) return false; seen[x] = 1; }
  return D.spMax > 0 ? Number(t.s) >= 1 && Number(t.s) <= D.spMax : true;
}
/** 預設號碼「3 8 15 22 29 36 + 5」→ { n, s }；不對回傳錯誤字串 */
function ltParse(text, D) {
  var parts = String(text || '').split('+'), n = (parts[0].match(/\d+/g) || []).map(Number), s = parts[1] ? Number((parts[1].match(/\d+/) || [])[0]) : null;
  if (n.length !== D.pick) return '要剛好 ' + D.pick + ' 個號碼（現在 ' + n.length + ' 個）';
  var t = { n: n, s: D.spMax > 0 ? s : null };
  if (D.spMax > 0 && !(s >= 1 && s <= D.spMax)) return '特別號要在 1～' + D.spMax + '（寫在 + 後面）';
  if (!ltValid(t, D)) return '號碼要在 1～' + D.max + '，不能重複';
  return t;
}
function ltRand(k, max) {
  var pool = [], out = [];
  for (var i = 1; i <= max; i++) pool.push(i);
  for (var j = 0; j < k; j++) {
    var r = new Uint32Array(1); (window.crypto || window.msCrypto).getRandomValues(r);
    out.push(pool.splice(r[0] % pool.length, 1)[0]);
  }
  return out;
}
function ltRandDraw(D) { return { n: ltRand(D.pick, D.max), s: D.spMax > 0 ? ltRand(1, D.spMax)[0] : null }; }
/** 揭曉時間表：第 i 顆在 at + i×gap 出現；特別號接在後面；全部開完再多 1.5 秒算「開完」 */
function ltTimes(dr) {
  var g = (dr.gap || 3) * 1000, k = dr.n.length, sp = dr.s !== null && dr.s !== undefined;
  return { ball: function (i) { return dr.at + i * g; }, sp: sp ? dr.at + k * g : null, done: dr.at + (k + (sp ? 1 : 0)) * g + 1500 };
}
/** 現在開到第幾顆（不含特別號）、特別號開了沒、是否全部開完 */
function ltProgress(dr, now) {
  if (!dr) return null;
  var T = ltTimes(dr), k = 0;
  while (k < dr.n.length && now >= T.ball(k)) k++;
  return { k: k, sp: T.sp !== null && now >= T.sp, done: now >= T.done, before: now < dr.at, left: Math.ceil((dr.at - now) / 1000) };
}
function ltKey(st) { return st && st.draw ? st.round + ':' + st.draw.at : ''; }
function ltSort(a) { return a.slice().sort(function (x, y) { return x - y; }); }
function ltBallCls(x, sp) { return 'lt-ball ' + (sp ? 'sp' : 'c' + Math.min(4, Math.floor((Number(x) - 1) / 10))); }
function ltPad(x) { return (x < 10 ? '0' : '') + x; }
var LT_PHASE = { open: '下注中', closed: '已停止下注', draw: '開獎' };

/* ---------------- 同步：主持人的狀態（學員只看） ---------------- */
function ltStateCh(host) { return host.scope ? 'lotto:' + host.scope : 'lotto'; }   // 工作人員試玩也看正式的開獎（簽注另外放）
/** 讀主持人狀態：只認工作人員、編輯者寫的（學員代號 s 開頭的不算），取版本最新的 */
function ltWatch(host, opts, onState) {
  var cur = null;
  var s = host.sync(ltStateCh(host), Object.assign({ fast: 1500, slow: 6000 }, opts, {
    onStates: function (m) {
      var changed = false;
      Object.keys(m).forEach(function (c) {
        if (!/^[wu]/.test(c)) return;
        var st = m[c].st;
        if (st && st.round && (!cur || Number(st.v) > Number(cur.v))) { cur = st; changed = true; }
      });
      if (changed) onState(cur, Date.now());
    }
  }));
  return { sync: s, get: function () { return cur; }, put: function (st) { cur = st; } };
}

/* ---------------- 學員：簽注單 ---------------- */
function ltPlayer(el, host, D) {
  var h = host.h, chT = host.ch('in-lotto'), state = { v: 0, round: 1, phase: 'open' }, gotAt = {}, server = [], fxDone = host.load('fx', {}) || {};
  var local = host.load('tk', []) || [];
  var sel = [], sp = null;
  var head = h('div', { class: 'card lt-card' }), drawBox = h('div', { class: 'card lt-card lt-drawbox', style: { display: 'none' } });
  var form = h('div', { class: 'card lt-card' }), mine = h('div', { class: 'card lt-card' });
  el.classList.add('lt-root');
  el.appendChild(head); el.appendChild(drawBox); el.appendChild(form); el.appendChild(mine);
  var acked = host.load('ack', {}) || {};

  var serverAt = 0;
  ltWatch(host, { peek: true }, function (st) {
    var k = ltKey(st), phaseChanged = st.phase !== state.phase || st.round !== state.round;
    if (k && !gotAt[k]) gotAt[k] = host.now();
    state = st; renderAll();
    if (phaseChanged && st.phase !== 'open') setTimeout(refresh, 2500);   // 截止了：確認自己的簽注都有送到
  });

  function roundTickets() {
    var byK = {};
    server.forEach(function (x) { if (x.d && x.d.k) byK[x.d.k] = x; });
    var q = {}; host.queued(chT).forEach(function (d) { if (d && d.k) q[d.k] = 1; });
    return local.filter(function (t) { return t.r === state.round; }).map(function (t) {
      var sv = byK[t.k], cut = state.closedAt ? state.closedAt + 2000 : Infinity;
      var st = sv ? (sv.t <= cut ? 'ok' : 'late') : q[t.k] ? 'queued' : 'sending';
      if (!sv && state.phase !== 'open') st = serverAt > cut ? 'lost' : 'checking';
      return { t: t, st: st, at: sv ? sv.t : null };
    });
  }
  function renderHead() {
    clear(head);
    head.appendChild(h('div', { class: 'lt-hd' }, h('div', null, h('div', { class: 'lt-name' }, '🎱 ' + D.title), h('div', { class: 'small' }, '第 ' + state.round + ' 期 · ' + (host.me.name || ''))),
      h('span', { class: 'lt-phase ' + state.phase }, state.phase === 'draw' ? (ltProgress(state.draw, host.now()).done ? '已開獎' : '開獎中') : LT_PHASE[state.phase] || '')));
    head.appendChild(h('div', { class: 'small muted' }, '選 ' + D.pick + ' 個號碼（1～' + D.max + '）' + (D.spMax ? '＋1 個特別號（1～' + D.spMax + '）' : '') + '，每期最多 ' + D.maxTickets + ' 注。開獎時手機會跟投影一起開，馬上對獎。'));
  }
  function renderForm() {
    clear(form);
    var rt = roundTickets();
    if (state.phase !== 'open') { form.appendChild(h('div', { class: 'lt-closed' }, state.phase === 'closed' ? '⏸ 已停止下注，等主持人開獎' : '🎬 本期已截止，等下一期開放')); return; }
    if (rt.length >= D.maxTickets) { form.appendChild(h('div', { class: 'lt-closed' }, '這一期已經填滿 ' + D.maxTickets + ' 注，等開獎吧！')); return; }
    var cnt = h('b', null, sel.length + '/' + D.pick);
    form.appendChild(h('div', { class: 'lt-t' }, '第 ' + (rt.length + 1) + ' 注　', h('span', { class: 'small' }, '已選 ', cnt)));
    var grid = h('div', { class: 'lt-grid' });
    for (var i = 1; i <= D.max; i++) (function (x) {
      grid.appendChild(h('button', { class: 'lt-num' + (sel.indexOf(x) >= 0 ? ' on' : ''), 'data-n': x, type: 'button', onclick: function () {
        var p = sel.indexOf(x);
        if (p >= 0) sel.splice(p, 1); else if (sel.length < D.pick) sel.push(x); else { host.toast('最多選 ' + D.pick + ' 個，先取消一個'); return; }
        renderForm();
      } }, ltPad(x)));
    })(i);
    form.appendChild(grid);
    if (D.spMax) {
      form.appendChild(h('div', { class: 'lt-t', style: { marginTop: '10px' } }, '特別號'));
      var g2 = h('div', { class: 'lt-grid sp' });
      for (var j = 1; j <= D.spMax; j++) (function (x) {
        g2.appendChild(h('button', { class: 'lt-num sp' + (sp === x ? ' on' : ''), 'data-s': x, type: 'button', onclick: function () { sp = sp === x ? null : x; renderForm(); } }, ltPad(x)));
      })(j);
      form.appendChild(g2);
    }
    var ready = sel.length === D.pick && (!D.spMax || sp);
    form.appendChild(h('div', { class: 'row lt-actions' },
      h('button', { class: 'btn', type: 'button', onclick: function () { var r = ltRandDraw(D); sel = r.n; sp = r.s; renderForm(); } }, '🎲 快選'),
      h('button', { class: 'btn ghost', type: 'button', onclick: function () { sel = []; sp = null; renderForm(); } }, '清除'),
      h('button', { class: 'btn primary lt-go', type: 'button', disabled: !ready, onclick: submit }, '送出這一注')));
  }
  function submit() {
    if (state.phase !== 'open') { host.toast('已停止下注'); return; }
    var t = { r: state.round, n: ltSort(sel), s: D.spMax ? sp : null };
    if (!ltValid(t, D)) { host.toast('號碼不完整'); return; }
    var dup = roundTickets().some(function (x) { return x.t.n.join(',') === t.n.join(',') && x.t.s === t.s; });
    if (dup) { host.toast('這一注已經填過了'); return; }
    t.k = 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    t.at = host.now();
    local.push(t); host.save('tk', local.slice(-60));
    sel = []; sp = null;
    host.submit(chT, { r: t.r, n: t.n, s: t.s, k: t.k }).then(function () { refresh(); }, function () {});
    host.toast('已送出，祝你好運！');
    renderAll();
  }
  function ticketEl(x, dr, pr) {
    var t = x.t, row = h('div', { class: 'lt-tk ' + x.st });
    var balls = h('div', { class: 'lt-balls sm' });
    t.n.forEach(function (n) {
      var hit = dr && pr && dr.n.slice(0, pr.k).indexOf(n) >= 0;
      balls.appendChild(h('span', { class: 'lt-ball mine' + (hit ? ' hit' : '') }, ltPad(n)));
    });
    if (t.s !== null && t.s !== undefined) balls.appendChild(h('span', { class: 'lt-ball mine spm' + (dr && pr && pr.sp && Number(dr.s) === Number(t.s) ? ' hit' : '') }, ltPad(t.s)));
    var tag = x.st === 'ok' ? '已送出' : x.st === 'queued' ? '等網路，連上會自動送出' : x.st === 'late' ? '截止後才送到，不列入' : x.st === 'lost' ? '截止前沒有送到，不列入' : x.st === 'checking' ? '確認中…' : '送出中…';
    if (dr && pr && pr.done && x.st === 'ok') {
      var ti = ltTier(t, dr, D);
      tag = ti >= 0 ? '🎉 ' + D.prizes[ti].name : '沒中（' + ltMatch(t, dr) + ' 個號碼' + (D.spMax && Number(t.s) === Number(dr.s) ? '＋特別號' : '') + '）';
      row.classList.add(ti >= 0 ? 'win' : 'miss'); if (ti >= 0) row.classList.add(D.prizes[ti].lv);
    }
    row.appendChild(balls); row.appendChild(h('div', { class: 'lt-tag' }, tag));
    return row;
  }
  var lastSig = '';
  function renderDraw() {
    var dr = state.phase === 'draw' ? state.draw : null, now = host.now();
    if (!dr) { drawBox.style.display = 'none'; return null; }
    var pr = ltProgress(dr, now), sig = ltKey(state) + '|' + pr.k + '|' + pr.sp + '|' + pr.done + '|' + (pr.before ? pr.left : '');
    drawBox.style.display = '';
    if (sig === lastSig) return pr;
    lastSig = sig;
    clear(drawBox);
    drawBox.appendChild(h('div', { class: 'lt-t' }, '第 ' + state.round + ' 期開獎號碼'));
    if (pr.before) drawBox.appendChild(h('div', { class: 'lt-cd' }, '倒數 ', h('b', null, String(Math.max(0, pr.left))), ' 秒'));
    var row = h('div', { class: 'lt-balls' });
    for (var i = 0; i < dr.n.length; i++) row.appendChild(i < pr.k ? h('span', { class: ltBallCls(dr.n[i]) + ' pop' }, ltPad(dr.n[i])) : h('span', { class: 'lt-ball wait' }, '?'));
    if (dr.s !== null && dr.s !== undefined) { row.appendChild(h('span', { class: 'lt-plus' }, '+')); row.appendChild(pr.sp ? h('span', { class: ltBallCls(dr.s, true) + ' pop' }, ltPad(dr.s)) : h('span', { class: 'lt-ball wait sp' }, '?')); }
    drawBox.appendChild(row);
    if (pr.done) drawBox.appendChild(h('div', { class: 'small muted' }, '照號碼排：' + ltSort(dr.n).map(ltPad).join('、') + (dr.s !== null && dr.s !== undefined ? '　特別號 ' + ltPad(dr.s) : '')));
    return pr;
  }
  function renderMine(pr) {
    clear(mine);
    var rt = roundTickets(), dr = state.phase === 'draw' ? state.draw : null;
    mine.appendChild(h('div', { class: 'lt-t' }, '我的簽注（第 ' + state.round + ' 期）'));
    if (!rt.length) { mine.appendChild(h('div', { class: 'small muted' }, state.phase === 'open' ? '還沒填，選好號碼按「送出這一注」。' : '這一期沒有簽注。')); return; }
    rt.forEach(function (x) { mine.appendChild(ticketEl(x, dr, pr)); });
  }
  var lastMine = '';
  function renderAll() {
    renderHead();
    var pr = renderDraw();
    var rt = roundTickets(), sig = ltKey(state) + '|' + state.phase + '|' + rt.map(function (x) { return x.t.k + x.st; }).join(',') + '|' + (pr ? pr.k + '' + pr.sp + pr.done : '');
    if (sig !== lastMine) { lastMine = sig; renderMine(pr); renderForm(); }
    if (pr && pr.done) finish(pr);
  }
  /** 開完：放動畫（每期一次）＋回報收到時間與對獎結果 */
  function finish(pr) {
    var k = ltKey(state), dr = state.draw;
    var valid = roundTickets().filter(function (x) { return x.st === 'ok'; });
    var tiers = valid.map(function (x) { return ltTier(x.t, dr, D); });
    if (!fxDone[k]) {
      fxDone[k] = 1; host.save('fx', fxDone);
      var best = tiers.filter(function (x) { return x >= 0; }).sort(function (a, b) { return a - b; })[0];
      if (!valid.length) { /* 沒下注就不放動畫 */ }
      else if (best === undefined) ltFx(host, 'miss', '沒有中獎', '再接再厲，下一期加油！');
      else { var p = D.prizes[best], n = tiers.filter(function (x) { return x >= 0; }).length; ltFx(host, p.lv, '🎉 ' + p.name + '！', n > 1 ? '你這期中了 ' + n + ' 注' : '恭喜中獎'); }
    }
    if (!acked[k] && gotAt[k] && gotAt[k] <= ltTimes(dr).done) {   // 開獎時有開著畫面才回報（之後才打開的不算延遲）
      acked[k] = 1; host.save('ack', acked);
      var ack = host.sync(host.ch('in-lack'), { fast: 2000, slow: 8000 });
      ack.send({ ack: k, dl: gotAt[k] - (dr.pushed || dr.at), late: gotAt[k] - dr.at, tiers: tiers, tk: valid.length });
      setTimeout(function () { ack.stop(); }, 25000);
    }
  }
  function refresh() {
    var t0 = host.now();
    return host.inbox(chT, 0).then(function (r) { server = r.items || []; serverAt = t0; lastMine = ''; renderAll(); }, function () {});
  }
  renderAll(); refresh();
  setInterval(renderAll, 250);
  setInterval(refresh, 60000);
  window.addEventListener('online', refresh);
}

/* ---------------- 主持人：控制 ---------------- */
function ltControl(host, D, onChange) {
  var W = ltWatch(host, {}, function () { onChange(); }), restoreTried = false;
  // 快取被清掉（或換一台裝置）時：從 w-lotto 收件拿最後一份狀態補回去
  setTimeout(function () {
    if (W.get() || restoreTried) return;
    restoreTried = true;
    host.inbox(host.ch('w-lotto'), 0).then(function (r) {
      if (W.get()) return;
      var last = (r.items || []).filter(function (x) { return x.d && x.d.round; }).sort(function (a, b) { return a.t - b.t; }).pop();
      if (last) { W.put(last.d); W.sync.setState(last.d); onChange(); }
    }, function () {});
  }, 5000);
  function cur() { return W.get() || { v: 0, round: 1, phase: 'open' }; }
  function set(patch) {
    var c = cur(), st = Object.assign({}, c, patch, { v: Math.max(host.now(), Number(c.v) + 1) });
    W.put(st); W.sync.setState(st);
    host.submit(host.ch('w-lotto'), st).catch(function () {});
    onChange();
    return st;
  }
  return {
    cur: cur,
    close: function () { var c = cur(); return set({ phase: 'closed', closedAt: c.closedAt && c.phase !== 'open' ? c.closedAt : host.now() }); },
    reopen: function () { return set({ phase: 'open', closedAt: null }); },
    next: function () { return set({ round: cur().round + 1, phase: 'open', closedAt: null, draw: null }); },
    draw: function (nums) {
      var c = cur(), now = host.now(), dr = nums || ltRandDraw(D);
      return set({ phase: 'draw', closedAt: c.phase === 'open' || !c.closedAt ? now : c.closedAt, draw: { n: dr.n.slice(), s: dr.s, at: now + D.countdown * 1000, gap: D.gap, pushed: now } });
    }
  };
}
/** 本期簽注與對獎（從收件算）：有效＝這一期、截止前（+2 秒）送到、號碼正確；同一人同號碼只算一注 */
function ltTally(items, st, D) {
  var out = { tickets: [], players: {}, late: 0, bad: 0, byTier: D.prizes.map(function () { return []; }), none: 0 };
  var cut = st.closedAt ? st.closedAt + 2000 : Infinity, dr = st.phase === 'draw' ? st.draw : null, seen = {};
  items.forEach(function (x) {
    var d = x.d; if (!d || d.r !== st.round) return;
    if (!ltValid(d, D)) { out.bad++; return; }
    if (x.t > cut) { out.late++; return; }
    var key = x.c + '|' + ltSort(d.n).join(',') + '|' + d.s; if (seen[key]) return; seen[key] = 1;
    var tk = { c: x.c, name: x.name, squad: x.squad, n: d.n, s: d.s, t: x.t, tier: dr ? ltTier(d, dr, D) : -1 };
    out.tickets.push(tk); out.players[x.c] = (out.players[x.c] || 0) + 1;
    if (dr) { if (tk.tier >= 0) out.byTier[tk.tier].push(tk); else out.none++; }
  });
  return out;
}
/** 手機回報（in-lack）：每支手機收到開獎花多久、手機對獎和後台算的一不一樣 */
function ltAcks(host, onAck) {
  var acks = {};
  host.sync(host.ch('in-lack'), { peek: true, fast: 2000, slow: 5000, onEvents: function (list) {
    list.forEach(function (e) { var d = e.d; if (!d || !d.ack) return; var who = String(e.c).split('.')[0]; (acks[d.ack] = acks[d.ack] || {})[who] = d; });
    onAck();
  } });
  return acks;
}
function ltAckSummary(acks, k, tally) {
  var a = acks[k] || {}, who = Object.keys(a), dl = who.map(function (w) { return a[w].dl; }).filter(isFinite).sort(function (x, y) { return x - y; });
  if (!who.length) return null;
  var before = who.filter(function (w) { return a[w].late <= 0; }).length, same = 0, cmp = 0;
  if (tally) who.forEach(function (w) {
    var mine = tally.tickets.filter(function (t) { return t.c === w; }).map(function (t) { return t.tier; }).sort().join(',');
    cmp++; if (mine === (a[w].tiers || []).slice().sort().join(',')) same++;
  });
  var q = function (p) { return dl[Math.min(dl.length - 1, Math.floor(dl.length * p))]; };
  return { n: who.length, p50: q(0.5), p90: q(0.9), max: dl[dl.length - 1], before: before, same: same, cmp: cmp };
}
function ltSec(ms) { return (ms / 1000).toFixed(1) + ' 秒'; }

function ltPanel(el, host, D) {
  var h = host.h, chT = host.ch('in-lotto'), items = [], ctl = ltControl(host, D, render), acks = ltAcks(host, render), last = '';
  el.classList.add('lt-root');
  var box = h('div', { class: 'col', style: { gap: '12px' } });
  el.appendChild(box);
  function load() { return host.inbox(chT, 0).then(function (r) { items = r.items || []; last = ''; render(); }, function () {}); }
  function confirmDraw(nums) {
    var c = ctl.cur();
    host.modal({ title: '開第 ' + c.round + ' 期', body: h('p', null, (nums ? '照預設號碼 ' + nums.n.map(ltPad).join(' ') + (nums.s ? ' + ' + ltPad(nums.s) : '') : '隨機開出號碼') + '。按下後停止下注，倒數 ' + D.countdown + ' 秒開始揭曉（投影和每支手機同步）。'),
      actions: [{ text: '取消' }, { text: '開獎', cls: 'primary', onClick: function () { ctl.draw(nums); setTimeout(load, (D.countdown + 2) * 1000); } }] });
  }
  function render() {
    var c = ctl.cur(), tally = ltTally(items, c, D), dr = c.phase === 'draw' ? c.draw : null, pr = dr ? ltProgress(dr, host.now()) : null;
    var sig = JSON.stringify(c) + '|' + items.length + '|' + (pr ? pr.done : '') + '|' + JSON.stringify(ltAckSummary(acks, ltKey(c), tally));
    if (sig === last) return; last = sig;
    clear(box);
    var show = host.link({ view: 'show' });
    box.appendChild(h('div', { class: 'card lt-card' },
      h('div', { class: 'lt-hd' }, h('div', null, h('div', { class: 'lt-name' }, '🎱 ' + D.title + '（主持人）'), h('div', { class: 'small' }, '第 ' + c.round + ' 期')), h('span', { class: 'lt-phase ' + c.phase }, dr ? (pr.done ? '已開獎' : '開獎中') : LT_PHASE[c.phase])),
      h('div', { class: 'row lt-actions' },
        h('a', { class: 'btn primary', href: show, target: '_blank', rel: 'noopener' }, '📽 開獎投影畫面'),
        h('button', { class: 'btn ghost', type: 'button', onclick: function () { (navigator.clipboard ? navigator.clipboard.writeText(show) : Promise.reject()).then(function () { host.toast('已複製連結'); }, function () { host.toast(show); }); } }, '複製連結')),
      h('div', { class: 'small muted' }, '投影畫面用工作人員登入的電腦打開，按 F 或「全螢幕」。開獎可以在這裡按，也可以在投影畫面按。')));
    var ctrl = h('div', { class: 'card lt-card' }, h('div', { class: 'lt-t' }, '控制'));
    var row = h('div', { class: 'row lt-actions' });
    if (c.phase === 'open') row.appendChild(h('button', { class: 'btn', type: 'button', onclick: function () { ctl.close(); } }, '⏸ 停止下注'));
    if (c.phase === 'closed') row.appendChild(h('button', { class: 'btn', type: 'button', onclick: function () { ctl.reopen(); } }, '▶ 重新開放下注'));
    if (c.phase !== 'draw') row.appendChild(h('button', { class: 'btn primary lt-draw', type: 'button', onclick: function () { confirmDraw(null); } }, '🎲 隨機開獎'));
    if (c.phase === 'draw') row.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { ctl.next(); load(); } }, '➡ 開下一期（第 ' + (c.round + 1) + ' 期）'));
    if (c.phase === 'draw' && host.activity && host.activity.test) row.appendChild(h('button', { class: 'btn ghost', type: 'button', onclick: function () { confirmDraw(null); } }, '🧪 同一期重開'));
    ctrl.appendChild(row);
    if (host.activity && host.activity.test) {
      var inp = h('input', { class: 'input lt-preset', value: D.preset, placeholder: '例如 3 8 15 22 29 36 + 5' });
      ctrl.appendChild(h('div', { class: 'lt-test' }, h('div', { class: 'small' }, '🧪 測試模式：先寫好要開出的號碼（' + D.pick + ' 個' + (D.spMax ? '，+ 後面是特別號' : '') + '）'),
        h('div', { class: 'row', style: { gap: '8px' } }, inp, h('button', { class: 'btn', type: 'button', onclick: function () { var r = ltParse(inp.value, D); if (typeof r === 'string') { host.toast(r, true); return; } confirmDraw(r); } }, '照這組開獎'))));
    }
    box.appendChild(ctrl);
    var st = h('div', { class: 'card lt-card' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('div', { class: 'lt-t' }, '本期簽注'), h('button', { class: 'btn ghost sm', type: 'button', onclick: load }, '重新整理')),
      h('div', { class: 'lt-stat' }, h('b', null, String(tally.tickets.length)), ' 注（', String(Object.keys(tally.players).length), ' 人）', tally.late ? '　截止後送到 ' + tally.late + ' 注不列入' : ''));
    if (dr && pr.done) {
      st.appendChild(h('div', { class: 'lt-balls sm', style: { margin: '8px 0' } }, dr.n.map(function (x) { return h('span', { class: ltBallCls(x) }, ltPad(x)); }), dr.s !== null && dr.s !== undefined ? h('span', { class: ltBallCls(dr.s, true) }, ltPad(dr.s)) : null));
      var tb = h('div', { class: 'lt-tally' });
      D.prizes.forEach(function (p, i) {
        var w = tally.byTier[i];
        tb.appendChild(h('div', { class: 'lt-trow' + (w.length ? ' has' : '') }, h('b', null, p.name), h('span', { class: 'small muted' }, p.m + (p.s === 1 ? '+特' : p.s === 0 ? '+0' : '') ), h('span', null, w.length + ' 注'),
          h('span', { class: 'small' }, w.map(function (t) { return t.name + (t.squad ? '（' + t.squad + '隊）' : ''); }).join('、'))));
      });
      tb.appendChild(h('div', { class: 'lt-trow' }, h('b', null, '沒中'), h('span'), h('span', null, tally.none + ' 注'), h('span')));
      st.appendChild(tb);
      var a = ltAckSummary(acks, ltKey(c), tally);
      st.appendChild(h('div', { class: 'lt-ack' }, a ? ['📶 ', h('b', null, a.n + ' 支手機'), ' 回報收到開獎：從按開獎到收到中位數 ' + ltSec(a.p50) + '、90% 在 ' + ltSec(a.p90) + ' 內、最慢 ' + ltSec(a.max) + '；倒數結束前收到 ' + a.before + '/' + a.n + '；手機對獎和後台一致 ' + a.same + '/' + a.cmp] : '📶 等手機回報收到開獎的時間…'));
    }
    box.appendChild(st);
  }
  load(); render();
  setInterval(render, 1000);
  setInterval(load, 20000);
}

/* ---------------- 投影畫面 ---------------- */
function ltShow(el, host, D) {
  var h = host.h, chT = host.ch('in-lotto'), items = [], ctl = ltControl(host, D, function () { last = ''; }), acks = ltAcks(host, function () { last = ''; });
  document.body.classList.add('lt-showing');
  el.classList.add('lt-stage');
  var title = h('div', { class: 'lt-s-title' }), status = h('div', { class: 'lt-s-status' });
  var cv = h('canvas', { class: 'lt-drum', width: 520, height: 520 }), tray = h('div', { class: 'lt-s-tray' }), cd = h('div', { class: 'lt-s-cd' });
  var res = h('div', { class: 'lt-s-res' }), info = h('div', { class: 'lt-s-info' });
  var sound = host.load('sound', true) !== false, audio = null;
  var tools = h('div', { class: 'lt-s-tools' });
  el.appendChild(h('div', { class: 'lt-s-top' }, title, status));
  el.appendChild(h('div', { class: 'lt-s-main' }, h('div', { class: 'lt-s-drumwrap' }, cv, cd), h('div', { class: 'lt-s-side' }, tray, res)));
  el.appendChild(info); el.appendChild(tools);
  function load() { return host.inbox(chT, 0).then(function (r) { items = r.items || []; last = ''; }, function () {}); }
  function beep(f, d, type) {
    if (!sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var o = audio.createOscillator(), g = audio.createGain(); o.type = type || 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + d);
      o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + d + 0.05);
    } catch (e) {}
  }
  function fanfare() { [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { beep(f, 0.35, 'square'); }, i * 160); }); }
  // 搖獎機：球在圓裡彈；開出的球拿掉
  var balls = [], R = 240, cx = 260, cy = 260;
  function resetDrum(skip) {
    balls = [];
    for (var i = 1; i <= D.max; i++) if (!skip || skip.indexOf(i) < 0) balls.push({ n: i, x: cx + (Math.random() - 0.5) * 200, y: cy + 60 + Math.random() * 120, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4 });
  }
  resetDrum();
  var COLORS = ['#f2c14e', '#3a86ff', '#e63946', '#2a9d8f', '#8e5bd6'];
  function frame() {
    var g = cv.getContext('2d'), c = ctl.cur(), dr = c.phase === 'draw' ? c.draw : null, pr = dr ? ltProgress(dr, host.now()) : null;
    var energy = dr && !pr.done ? (pr.before ? 1.6 : 1.2) : c.phase === 'open' ? 0.35 : 0.2;
    g.clearRect(0, 0, 520, 520);
    var grd = g.createRadialGradient(cx - 60, cy - 80, 40, cx, cy, R);
    grd.addColorStop(0, 'rgba(255,255,255,.22)'); grd.addColorStop(1, 'rgba(255,255,255,.04)');
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 4; g.stroke();
    balls.forEach(function (b) {
      b.vy += 0.12; b.vx += (Math.random() - 0.5) * energy; b.vy += (Math.random() - 0.62) * energy * 1.4;
      b.vx *= 0.99; b.vy *= 0.99; b.x += b.vx; b.y += b.vy;
      var dx = b.x - cx, dy = b.y - cy, d = Math.sqrt(dx * dx + dy * dy), lim = R - 22;
      if (d > lim) { var nx = dx / d, ny = dy / d, dot = b.vx * nx + b.vy * ny; b.vx -= 1.9 * dot * nx; b.vy -= 1.9 * dot * ny; b.x = cx + nx * lim; b.y = cy + ny * lim; }
      g.beginPath(); g.fillStyle = COLORS[Math.min(4, Math.floor((b.n - 1) / 10))]; g.arc(b.x, b.y, 20, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.arc(b.x, b.y, 11, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#222'; g.font = 'bold 13px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(b.n), b.x, b.y + 1);
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  var last = '', shownK = -1, shownSp = false, partyFor = '';
  function render() {
    var c = ctl.cur(), dr = c.phase === 'draw' ? c.draw : null, now = host.now(), pr = dr ? ltProgress(dr, now) : null, k = ltKey(c);
    var tally = ltTally(items, c, D), a = dr ? ltAckSummary(acks, k, tally) : null;
    var sig = JSON.stringify(c) + '|' + (pr ? [pr.k, pr.sp, pr.done, pr.left].join() : '') + '|' + items.length + '|' + JSON.stringify(a);
    if (sig === last) return; last = sig;
    el.classList.toggle('done', !!(pr && pr.done));
    clear(title).appendChild(document.createTextNode('🎱 ' + D.title + '　第 ' + c.round + ' 期'));
    clear(status).appendChild(document.createTextNode(dr ? (pr.done ? '開獎結果' : pr.before ? '即將開獎' : '開獎中…') : c.phase === 'open' ? '下注中 · 目前 ' + tally.tickets.length + ' 注（' + Object.keys(tally.players).length + ' 人）' : '已停止下注 · 共 ' + tally.tickets.length + ' 注'));
    // 倒數
    clear(cd); cd.className = 'lt-s-cd' + (pr && pr.before ? ' on' : '');
    if (pr && pr.before) { cd.appendChild(h('b', null, String(Math.max(0, pr.left)))); if (pr.left <= 3 && pr.left > 0) beep(660, 0.15); }
    // 開出的球
    var drawnK = pr ? pr.k : 0;
    if (!dr) { if (shownK !== 0) resetDrum(); shownK = 0; shownSp = false; }
    else {
      if (drawnK !== shownK) { resetDrum(dr.n.slice(0, drawnK)); if (drawnK > shownK && shownK >= 0 && !pr.done) beep(880, 0.25); shownK = drawnK; }
      if (pr.sp && !shownSp) { shownSp = true; beep(1175, 0.4); }
    }
    clear(tray);
    if (dr) {
      var row = h('div', { class: 'lt-balls big' });
      for (var i = 0; i < dr.n.length; i++) row.appendChild(i < drawnK ? h('span', { class: ltBallCls(dr.n[i]) + ' roll' }, ltPad(dr.n[i])) : h('span', { class: 'lt-ball wait' }, '?'));
      if (dr.s !== null && dr.s !== undefined) { row.appendChild(h('span', { class: 'lt-plus' }, '+')); row.appendChild(pr.sp ? h('span', { class: ltBallCls(dr.s, true) + ' roll' }, ltPad(dr.s)) : h('span', { class: 'lt-ball wait sp' }, '?')); }
      tray.appendChild(row);
      if (pr.done) tray.appendChild(h('div', { class: 'lt-s-sorted' }, '大小順序：' + ltSort(dr.n).map(ltPad).join('  ') + (dr.s !== null && dr.s !== undefined ? '　特別號 ' + ltPad(dr.s) : '')));
    } else tray.appendChild(h('div', { class: 'lt-s-wait' }, c.phase === 'open' ? '拿出手機，打開「' + (host.activity ? host.activity.name : D.title) + '」下注！' : '等主持人開獎'));
    // 結果
    clear(res);
    if (dr && pr.done) {
      if (partyFor !== k) { partyFor = k; load(); var top = tally.byTier[0] && tally.byTier[0].length; fanfare(); ltFx(host, top ? 'jackpot' : 'big', top ? '🎊 頭獎開出！' : '🎉 開獎完成', top ? tally.byTier[0].map(function (t) { return t.name; }).join('、') : ''); }
      var tb = h('div', { class: 'lt-s-tally' });
      D.prizes.forEach(function (p, i) {
        var w = tally.byTier[i];
        tb.appendChild(h('div', { class: 'lt-s-trow' + (w.length ? ' has ' + p.lv : '') }, h('b', null, p.name), h('span', null, w.length + ' 注'),
          h('span', { class: 'lt-s-names' }, w.slice(0, 12).map(function (t) { return t.name; }).join('、') + (w.length > 12 ? '…等 ' + w.length + ' 位' : ''))));
      });
      res.appendChild(tb);
    }
    clear(info);
    if (a) info.appendChild(document.createTextNode('📶 ' + a.n + ' 支手機收到開獎：中位數 ' + ltSec(a.p50) + '、最慢 ' + ltSec(a.max) + '；倒數結束前收到 ' + a.before + '/' + a.n));
  }
  function confirmDraw(nums) {
    host.modal({ title: '開第 ' + ctl.cur().round + ' 期', body: h('p', null, nums ? '照預設號碼開獎。' : '隨機開出號碼。'), actions: [{ text: '取消' }, { text: '開獎', cls: 'primary', onClick: function () { beep(440, 0.1); ctl.draw(nums); last = ''; } }] });
  }
  function renderTools() {
    var c = ctl.cur();
    clear(tools);
    tools.appendChild(h('button', { class: 'btn sm', type: 'button', onclick: function () { if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); } }, '⛶ 全螢幕'));
    tools.appendChild(h('button', { class: 'btn sm', type: 'button', onclick: function () { sound = !sound; host.save('sound', sound); renderTools(); } }, sound ? '🔊 聲音' : '🔇 靜音'));
    if (c.phase === 'open') tools.appendChild(h('button', { class: 'btn sm', type: 'button', onclick: function () { ctl.close(); renderTools(); } }, '⏸ 停止下注'));
    if (c.phase !== 'draw') tools.appendChild(h('button', { class: 'btn sm primary lt-draw', type: 'button', onclick: function () { confirmDraw(null); } }, '🎲 開獎'));
    if (c.phase !== 'draw' && host.activity && host.activity.test) tools.appendChild(h('button', { class: 'btn sm', type: 'button', onclick: function () { var r = ltParse(D.preset, D); if (typeof r === 'string') { host.toast('預設號碼：' + r, true); return; } confirmDraw(r); } }, '🧪 照預設號碼開獎'));
    if (c.phase === 'draw') tools.appendChild(h('button', { class: 'btn sm', type: 'button', onclick: function () { ctl.next(); renderTools(); } }, '➡ 下一期'));
  }
  var lastTools = '';
  setInterval(function () { render(); var s = ctl.cur().phase + ctl.cur().round; if (s !== lastTools) { lastTools = s; renderTools(); } }, 200);
  document.addEventListener('keydown', function (e) { if ((e.key === 'f' || e.key === 'F') && document.documentElement.requestFullscreen && !/INPUT|TEXTAREA/.test((e.target || {}).tagName || '')) document.documentElement.requestFullscreen(); });
  load(); setInterval(load, 15000);
}

/* ---------------- 動畫（存在資源包裡，不用下載別的東西） ----------------
 * jackpot：煙火＋金色大字；big：彩帶；small：星星；miss：灰色卡片輕輕搖一下 */
function ltFx(host, kind, big, small) {
  var h = host.h, wrap = h('div', { class: 'lt-fx ' + kind, role: 'status', 'aria-live': 'polite' }), cv = h('canvas', { class: 'lt-fx-cv' });
  var card = h('div', { class: 'lt-fx-card' }, h('div', { class: 'lt-fx-big' }, big), small ? h('div', { class: 'lt-fx-small' }, small) : null, h('div', { class: 'lt-fx-tap' }, '點一下關閉'));
  wrap.appendChild(cv); wrap.appendChild(card); document.body.appendChild(wrap);
  var W = cv.width = innerWidth, H = cv.height = innerHeight, g = cv.getContext('2d'), parts = [], t0 = performance.now(), dur = kind === 'jackpot' ? 6500 : kind === 'miss' ? 2600 : 4200, alive = true;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PAL = kind === 'jackpot' ? ['#ffd166', '#ffb703', '#fff1a8', '#ef476f', '#ffffff'] : ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#8e5bd6'];
  function burst(x, y, n, sp) { for (var i = 0; i < n; i++) { var a = Math.random() * Math.PI * 2, v = sp * (0.4 + Math.random()); parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, c: PAL[i % PAL.length], r: 2 + Math.random() * 2.5, k: 'spark' }); } }
  function confetti(n) { for (var i = 0; i < n; i++) parts.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.5, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, life: 1, c: PAL[i % PAL.length], w: 6 + Math.random() * 6, k: 'paper' }); }
  if (!reduce) {
    if (kind === 'jackpot') { confetti(140); for (var b = 0; b < 6; b++) (function (b) { setTimeout(function () { if (alive) burst(W * (0.2 + Math.random() * 0.6), H * (0.15 + Math.random() * 0.35), 70, 7); }, b * 650); })(b); }
    else if (kind === 'big') confetti(120);
    else if (kind === 'small') { burst(W / 2, H / 2, 60, 5); setTimeout(function () { if (alive) burst(W / 2, H / 2, 40, 4); }, 500); }
  }
  function step(now) {
    if (!alive) return;
    g.clearRect(0, 0, W, H);
    parts.forEach(function (p) {
      if (p.k === 'spark') { p.vy += 0.08; p.vx *= 0.985; p.vy *= 0.985; p.life -= 0.012; g.globalAlpha = Math.max(0, p.life); g.fillStyle = p.c; g.beginPath(); g.arc(p.x += p.vx, p.y += p.vy, p.r, 0, 7); g.fill(); }
      else { p.x += p.vx; p.y += p.vy; p.rot += p.vr; g.globalAlpha = 1; g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2); g.restore(); }
    });
    parts = parts.filter(function (p) { return p.k === 'spark' ? p.life > 0 : p.y < H + 30; });
    g.globalAlpha = 1;
    if (now - t0 < dur) requestAnimationFrame(step); else close();
  }
  function close() { if (!alive) return; alive = false; wrap.classList.add('out'); setTimeout(function () { wrap.remove(); }, 500); }
  wrap.addEventListener('click', close);
  requestAnimationFrame(step);
  return close;
}
