/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 測試資源包「搶答問答」：全場一起玩的問答（像 Kahoot）。
 *   學員：主持人出題後，手機倒數、同時出現題目和選項，選一個（選了不能改）；時間到公布答案、各選項人數、小隊排名。
 *         越快答對分數越高（可關）。計時從「自己手機出現題目」開始算，晚幾秒收到的手機不吃虧。
 *   主持人（工作人員）：開始第 N 題、（時間到自動）公布答案、下一題、結束公布排名、把各隊分數送進團隊計分；「投影畫面」（view=show）。
 * 資料：
 *   作答  host.submit(in-quiz) { q: 第幾題(0 起), a: 選第幾個(0 起), ms: 花了幾毫秒, o: 這一題的開始時間 }（學員看不到別人的；每人每題第一筆算）
 *   狀態  host.stage('quiz') { v, q, phase: lobby|ask|reveal|end, ats: [每題開始時間], tally: [這題各選項人數], n, top: [[小隊, 分數]…] }
 * 小隊分數＝每一題「隊上有作答的人的平均得分」加總（人多的隊不會佔便宜）。
 * 注意：正確答案寫在資源包設定裡（手機上對答案才不用等連線），很懂技術的學員找得到；要嚴格防偷看的比賽請改用關主人工計分。
 */
CampGame.register({
  mount: function (el, host) {
    var D = qzCfg(host.data);
    el.classList.add('qz-root');
    if (host.mode === 'master') { if (host.param('view') === 'show') qzShow(el, host, D); else qzPanel(el, host, D); }
    else qzPlayer(el, host, D);
  }
});

var QZ_GRACE = 15000;   // 作答時間結束後，還在路上的答案多久內送到都算
var QZ_MARK = ['▲', '◆', '●', '■'];
function qzInt(v, d, lo, hi) { v = Math.round(Number(v)); if (!isFinite(v)) v = d; return Math.max(lo, Math.min(hi, v)); }
function qzClear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
function qzCfg(d) {
  d = d || {};
  var qs = String(d.questions || '').replace(/｜/g, '|').split(/\n/).map(function (l) {
    var x = l.split('|').map(function (s) { return String(s).trim(); });
    if (x.length < 4) return null;
    var ans = x[x.length - 1], opts = x.slice(1, -1).filter(Boolean).slice(0, 4);
    var a = /^[A-Da-d]$/.test(ans) ? ans.toUpperCase().charCodeAt(0) - 65 : Number(ans) - 1;
    if (!x[0] || opts.length < 2 || !(a >= 0 && a < opts.length)) return null;
    return { q: x[0], opts: opts, a: a };
  }).filter(Boolean).slice(0, 40);
  return { title: String(d.title || '問答'), qs: qs, seconds: qzInt(d.seconds, 20, 5, 120), points: qzInt(d.points, 100, 1, 100000),
    speed: !/^(0|否|no|false|)$/i.test(String(d.speed === undefined ? '1' : d.speed).trim()), lead: qzInt(d.lead, 8, 2, 30) };
}
/** 答對拿幾分：比速度時，馬上答拿滿分、最後一秒拿一半 */
function qzPts(D, ms) {
  if (!D.speed) return D.points;
  var k = Math.max(0, Math.min(1, Number(ms) / (D.seconds * 1000)));
  return Math.round(D.points * (1 - 0.5 * k));
}
/** 收件 → 每題各選項人數、每個人的分數、小隊排名（主持人、投影、壓力測試都用這個算） */
function qzTally(D, items, ats) {
  var seen = {}, per = {}, tally = D.qs.map(function (q) { return q.opts.map(function () { return 0; }); }), sqq = {}, n = D.qs.map(function () { return 0; });
  (items || []).slice().sort(function (a, b) { return (a.t || 0) - (b.t || 0); }).forEach(function (x) {
    var d = x.d || {}, q = Number(d.q), Q = D.qs[q];
    if (!Q || !ats || !ats[q] || Number(d.o) !== Number(ats[q])) return;   // 不是這一輪的這一題
    var k = x.c + '|' + q, a = Number(d.a), ms = Number(d.ms);
    if (seen[k]) return;
    seen[k] = 1;
    if (!(a >= 0 && a < Q.opts.length) || !(ms >= 0) || ms > D.seconds * 1000 + 500 || x.t > Number(ats[q]) + D.seconds * 1000 + QZ_GRACE) return;
    tally[q][a]++; n[q]++;
    var pts = a === Q.a ? qzPts(D, ms) : 0;
    var p = per[x.c] = per[x.c] || { name: x.name, squad: String(x.squad === undefined || x.squad === null ? '' : x.squad), pts: 0, right: 0, n: 0 };
    p.pts += pts; p.n++; if (a === Q.a) p.right++;
    if (p.squad) { var s = sqq[p.squad + '|' + q] = sqq[p.squad + '|' + q] || { sum: 0, n: 0 }; s.sum += pts; s.n++; }
  });
  var sq = {};
  Object.keys(sqq).forEach(function (k) { var s = k.split('|')[0]; sq[s] = (sq[s] || 0) + sqq[k].sum / sqq[k].n; });
  var top = Object.keys(sq).map(function (s) { return [s, Math.round(sq[s])]; }).sort(function (a, b) { return b[1] - a[1] || Number(a[0]) - Number(b[0]); });
  return { per: per, tally: tally, n: n, top: top };
}
/** 題目＋選項（學員、投影、主持人共用）。o.pick(i) 有給就是可以按的 */
function qzQuestion(host, D, qi, o) {
  var h = host.h, Q = D.qs[qi], btns = [];
  var grid = h('div', { class: 'qz-opts' }, Q.opts.map(function (t, i) {
    var bar = h('i', { class: 'qz-bar' }), cnt = h('em', { class: 'qz-cnt' });
    var b = h(o.pick ? 'button' : 'div', { class: 'qz-opt c' + i, type: o.pick ? 'button' : null, onclick: o.pick ? function () { o.pick(i, b); } : null }, bar, h('span', { class: 'qz-mark' }, QZ_MARK[i]), h('span', { class: 'qz-otext' }, t), cnt);
    btns.push({ b: b, bar: bar, cnt: cnt });
    return b;
  }));
  var fill = h('i'), timer = h('div', { class: 'qz-timer' }, fill);
  var box = h('div', { class: 'qz-q' + (o.big ? ' big' : '') }, h('div', { class: 'qz-no' }, '第 ' + (qi + 1) + ' / ' + D.qs.length + ' 題'), h('div', { class: 'qz-text' }, Q.q), timer, grid);
  return {
    el: box, btns: btns,
    time: function (k) { fill.style.width = Math.max(0, Math.min(1, k)) * 100 + '%'; timer.classList.toggle('hurry', k < 0.25); },
    chosen: function (i) { btns.forEach(function (x, j) { x.b.classList.toggle('on', j === i); x.b.classList.toggle('dim', i !== null && i !== undefined && j !== i); if (o.pick) x.b.disabled = i !== null && i !== undefined; }); },
    lock: function () { btns.forEach(function (x) { if (o.pick) x.b.disabled = true; }); },
    /** 公布：正確答案亮起來、其他變暗，各選項人數長條 */
    reveal: function (tally) {
      var max = Math.max.apply(null, (tally || []).concat([1]));
      timer.style.visibility = 'hidden';
      btns.forEach(function (x, j) {
        x.b.classList.add('done'); x.b.classList.toggle('right', j === Q.a); x.b.classList.toggle('wrong', j !== Q.a); if (o.pick) x.b.disabled = true;
        if (tally) { x.bar.style.width = (tally[j] || 0) / max * 100 + '%'; x.cnt.textContent = String(tally[j] || 0); }
      });
    }
  };
}
function qzRank(host, top, mine, big) {
  var h = host.h, max = Math.max.apply(null, (top || []).map(function (x) { return x[1]; }).concat([1]));
  return h('div', { class: 'qz-rank' + (big ? ' big' : '') }, (top || []).slice(0, big ? 8 : 12).map(function (x, i) {
    var sc = h('b', null, String(x[1]));
    return h('div', { class: 'qz-rrow' + (String(x[0]) === String(mine) ? ' me' : '') + (i < 3 && x[1] > 0 ? ' r' + (i + 1) : '') },
      h('span', { class: 'qz-rk' }, i < 3 && x[1] > 0 ? ['🥇', '🥈', '🥉'][i] : String(i + 1)), h('span', { class: 'qz-rn' }, '第 ' + x[0] + ' 小隊' + (String(x[0]) === String(mine) ? '（我們）' : '')),
      h('span', { class: 'qz-rbar' }, h('i', { style: { width: Math.max(0, x[1]) / max * 100 + '%' } })), sc);
  }));
}

/* ---------------- 學員 ---------------- */
function qzPlayer(el, host, D) {
  var h = host.h, ch = host.ch('in-quiz'), mine = host.load('ans', {}) || {}, st = null, key = '', view = null, t0 = 0, cdFor = '';
  var head = h('div', { class: 'card qz-head' }), body = h('div', { class: 'qz-body' });
  el.appendChild(head); el.appendChild(body);
  if (!D.qs.length) { body.appendChild(h('div', { class: 'card qz-card' }, '還沒有題目，請籌辦團隊在活動設定裡填題目。')); return; }
  var squad = host.me && host.me.squad;
  function my(q) { var m = mine[q]; return m && st && st.ats && Number(m.o) === Number(st.ats[q]) ? m : null; }
  function total() { var s = 0; D.qs.forEach(function (Q, i) { var m = my(i); if (m && m.a === Q.a) s += qzPts(D, m.ms); }); return s; }
  function drawHead() {
    qzClear(head).appendChild(h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'center' } },
      h('div', null, h('div', { class: 'qz-title' }, '🧠 ' + D.title), h('div', { class: 'small qz-sub' }, (host.me.name || '') + (squad ? '・第 ' + squad + ' 小隊' : ''))),
      h('div', { class: 'qz-my' }, h('small', null, '我的分數'), h('b', null, String(total())))));
  }
  function wait(text, sub) { qzClear(body).appendChild(h('div', { class: 'card qz-card qz-wait' }, h('div', { class: 'qz-dots' }, h('i'), h('i'), h('i')), h('div', { class: 'qz-wt' }, text), sub ? h('div', { class: 'small muted' }, sub) : null)); }
  function pick(i, btn) {
    var q = st.q;
    if (my(q) || st.phase !== 'ask') return;
    var ms = Math.max(0, Math.round(host.now() - t0));
    if (ms > D.seconds * 1000) return;
    mine[q] = { a: i, ms: ms, o: st.ats[q] }; host.save('ans', mine);
    host.submit(ch, { q: q, a: i, ms: ms, o: st.ats[q] }).catch(function () {});
    host.fx.buzz(40); host.fx.sound('pop'); host.fx.pop(btn);
    key = ''; tick();
  }
  /** 現在該顯示哪個畫面（變了才重畫，倒數條每次更新） */
  function tick() {
    drawTimer();
    var k;
    if (!st || st.phase === 'lobby' || st.q < 0) k = 'lobby';
    else if (st.phase === 'end') k = 'end:' + st.v;
    else {
      var at = st.ats[st.q], now = host.now(), m = my(st.q);
      if (st.phase === 'ask') {
        if (!t0 || t0 < at) {                                              // 題目出現在這支手機上的時間（晚收到的不吃虧；重新整理不會重新計時）
          var sv = host.load('t0', null), tk = st.q + ':' + at;
          if (sv && sv.k === tk) t0 = sv.t; else { t0 = Math.max(at, now); host.save('t0', { k: tk, t: t0 }); }
        }
        k = 'ask:' + st.q + ':' + at + ':' + (now < at ? 'pre' : m ? 'done' + m.a : now > t0 + D.seconds * 1000 ? 'over' : 'open');
      } else k = 'reveal:' + st.q + ':' + st.v;
    }
    if (k === key) return;
    key = k; draw(k.split(':')[0], k);
  }
  function drawTimer() { if (view && st && st.phase === 'ask' && t0) view.time(1 - (host.now() - t0) / (D.seconds * 1000)); }
  function draw(kind, k) {
    drawHead(); view = null;
    if (kind === 'lobby') { wait('等主持人出題', '共 ' + D.qs.length + ' 題，每題 ' + D.seconds + ' 秒' + (D.speed ? '，越快答對分數越高' : '')); return; }
    if (kind === 'end') {
      var win = st.top && st.top[0] && String(st.top[0][0]) === String(squad) && st.top[0][1] > 0;
      qzClear(body).appendChild(h('div', { class: 'card qz-card' }, h('div', { class: 'qz-t' }, '🏁 問答結束'), h('div', { class: 'qz-final' }, '我的總分 ', h('b', null, String(total()))),
        h('div', { class: 'qz-t', style: { marginTop: '12px' } }, '小隊排名'), qzRank(host, st.top, squad)));
      if (host.now() - st.v < 20000) { if (win) { host.fx.fireworks(); host.fx.sound('win'); host.fx.banner('🏆 我們是第一名！'); } else host.fx.confetti({ n: 40 }); }
      return;
    }
    var q = st.q, at = st.ats[q], m = my(q), Q = D.qs[q];
    if (kind === 'ask' && /:pre$/.test(k)) {
      wait('準備好！第 ' + (q + 1) + ' 題要來了');
      if (cdFor !== q + ':' + at) { cdFor = q + ':' + at; host.fx.countdown(Math.min(3, Math.ceil((at - host.now()) / 1000)), { until: at, now: host.now }); }
      return;
    }
    view = qzQuestion(host, D, q, { pick: pick });
    var note = h('div', { class: 'qz-note' });
    qzClear(body).appendChild(h('div', { class: 'card qz-card' }, view.el, note));
    if (kind === 'ask') {
      if (m) { view.chosen(m.a); note.textContent = '已送出，等時間到公布答案'; }
      else if (/:over$/.test(k)) { view.lock(); note.textContent = '⏰ 時間到，這題沒有作答'; }
      drawTimer(); return;
    }
    // 公布答案
    if (m) view.chosen(m.a);
    view.reveal(st.tally);
    var right = m && m.a === Q.a, pts = right ? qzPts(D, m.ms) : 0, fresh = host.now() - st.v < 15000;
    note.className = 'qz-note ' + (right ? 'ok' : 'no');
    note.textContent = right ? '✓ 答對了！+' + pts + ' 分' : m ? '✗ 答錯了，正確答案是「' + Q.opts[Q.a] + '」' : '這題沒有作答，正確答案是「' + Q.opts[Q.a] + '」';
    if (fresh && right) { host.fx.confetti({ n: 50 }); host.fx.sound('ok'); host.fx.buzz([60, 40, 90]); host.fx.float(head.querySelector('.qz-my b'), '+' + pts); }
    else if (fresh && m) { host.fx.shake(view.el); host.fx.sound('bad'); }
    if (st.top && st.top.length) body.appendChild(h('div', { class: 'card qz-card' }, h('div', { class: 'qz-t' }, '小隊排名'), qzRank(host, st.top, squad)));
  }
  host.stage('quiz', { fast: 1200, slow: 5000 }).on(function (s) { st = s; if (s.phase !== 'ask') t0 = 0; tick(); });
  setInterval(tick, 200);
  tick();
  // 換手機、清掉瀏覽器：從伺服器找回自己答過的（第一筆算）
  host.inbox(ch, 0).then(function (r) {
    var wait = {}; host.queued(ch).forEach(function (d) { if (d) wait[d.q + '|' + d.o] = 1; });
    (r.items || []).slice().sort(function (a, b) { return b.t - a.t; }).forEach(function (x) { var d = x.d || {}; if (d.q >= 0 && !wait[d.q + '|' + d.o]) { var old = mine[d.q]; if (!old || Number(old.o) <= Number(d.o)) mine[d.q] = { a: Number(d.a), ms: Number(d.ms), o: d.o }; } });
    host.save('ans', mine); key = ''; tick();
  }, function () {});
}

/* ---------------- 主持人 ---------------- */
function qzPanel(el, host, D) {
  var h = host.h, stage = host.stage('quiz'), items = [], top = h('div', { class: 'card qz-card' }), mid = h('div'), list = h('div', { class: 'card qz-card' }), cancel = null, armed = '';
  el.appendChild(top); el.appendChild(mid); el.appendChild(list);
  if (!D.qs.length) { top.appendChild(h('div', null, '還沒有題目：到管理端「流程與活動 → 遊戲」這個活動的設定填題目（一行一題）。')); return; }
  function cur() { return stage.get() || { q: -1, phase: 'lobby', ats: [] }; }
  function load() { return host.inbox(host.ch('in-quiz'), 0).then(function (r) { items = r.items || []; render(); return items; }, function () { return items; }); }
  function ask(q) { var st = cur(), ats = (st.ats || []).slice(); ats[q] = host.now() + D.lead * 1000; stage.set({ q: q, phase: 'ask', ats: ats, top: st.top || [] }); render(); }
  function reveal() {
    var st = cur(); if (st.phase !== 'ask') return;
    load().then(function () { var st2 = cur(); if (st2.phase !== 'ask' || st2.q !== st.q) return; var T = qzTally(D, items, st2.ats); stage.set({ q: st2.q, phase: 'reveal', ats: st2.ats, tally: T.tally[st2.q], n: T.n[st2.q], top: T.top }); render(); });
  }
  function finish() { load().then(function () { var st = cur(), T = qzTally(D, items, st.ats); stage.set({ q: st.q, phase: 'end', ats: st.ats, top: T.top }); render(); }); }
  function upload(btn) {
    var T = qzTally(D, items, cur().ats); btn.disabled = true;
    Promise.all(T.top.map(function (x) { return host.scoreSafe({ stage: 'QUIZ', stageName: D.title, team: Number(x[0]), score: x[1] }); })).then(function (rs) {
      var q = rs.length ? rs[rs.length - 1].queued : 0; btn.disabled = false;
      host.toast(q ? '有 ' + q + ' 筆還沒送出，連上後自動上傳' : T.top.length + ' 隊的分數已上傳到團隊計分');
    });
  }
  function render() {
    var st = cur(), ph = st.phase, T = qzTally(D, items, st.ats), q = st.q, row = h('div', { class: 'row wrap', style: { gap: '8px', marginTop: '10px' } });
    qzClear(top).appendChild(h('div', null, h('div', { class: 'qz-title dark' }, '🧠 ' + D.title + '・主持人'),
      h('div', { class: 'small muted' }, ph === 'lobby' ? '還沒開始・共 ' + D.qs.length + ' 題' : ph === 'end' ? '已結束' : '第 ' + (q + 1) + ' / ' + D.qs.length + ' 題・' + (ph === 'ask' ? '作答中，已有 ' + T.n[q] + ' 人作答' : '已公布答案（' + T.n[q] + ' 人作答）'))));
    if (ph === 'lobby') row.appendChild(h('button', { class: 'btn primary', onclick: function () { ask(0); } }, '▶ 開始第 1 題'));
    if (ph === 'ask') row.appendChild(h('button', { class: 'btn primary', onclick: reveal }, '公布答案（時間到會自動公布）'));
    if (ph === 'reveal' && q + 1 < D.qs.length) row.appendChild(h('button', { class: 'btn primary', onclick: function () { ask(q + 1); } }, '▶ 下一題（第 ' + (q + 2) + ' 題）'));
    if (ph === 'reveal') row.appendChild(h('button', { class: 'btn' + (q + 1 < D.qs.length ? '' : ' primary'), onclick: finish }, '🏁 結束，公布排名'));
    if (ph === 'end' && host.activity) row.appendChild(h('button', { class: 'btn primary', onclick: function (e) { upload(e.currentTarget); } }, '🏆 把各隊分數送進團隊計分'));
    if (ph === 'end' || ph === 'reveal') row.appendChild(h('button', { class: 'btn', onclick: function () {
      host.modal({ title: '重新開始？', body: h('div', null, '會回到第 1 題之前，大家剛剛的作答不再計算。'), actions: [{ text: '取消' }, { text: '重新開始', cls: 'primary', onClick: function () { stage.set({ q: -1, phase: 'lobby', ats: [], top: [] }); render(); } }] });
    } }, '重新開始'));
    row.appendChild(h('a', { class: 'btn', href: host.link({ view: 'show' }), target: '_blank' }, '📺 投影畫面'));
    top.appendChild(row);
    // 時間到自動公布（多等 2.5 秒讓最後一刻的答案送到）
    var key = ph === 'ask' ? q + ':' + st.ats[q] : '';
    if (key !== armed) { if (cancel) cancel(); cancel = null; armed = key; if (key) cancel = host.at(st.ats[q] + D.seconds * 1000 + 2500, reveal); }
    qzClear(mid);
    if (q >= 0 && ph !== 'end') {
      var v = qzQuestion(host, D, q, {}); v.reveal(T.tally[q]);
      mid.appendChild(h('div', { class: 'card qz-card' }, v.el));
    }
    if (T.top.length) mid.appendChild(h('div', { class: 'card qz-card' }, h('div', { class: 'qz-t' }, '小隊排名（每題隊上作答者的平均，加總）'), qzRank(host, T.top)));
    qzClear(list).appendChild(h('div', { class: 'qz-t' }, '題目與答案'));
    D.qs.forEach(function (Q, i) { list.appendChild(h('div', { class: 'qz-li' + (i === q ? ' on' : '') }, h('b', null, (i + 1) + '. '), Q.q, h('span', { class: 'qz-ans' }, '　答：' + Q.opts[Q.a]))); });
  }
  stage.on(render);
  render();
  host.every(4000, function () { if (cur().phase === 'ask' || cur().phase === 'reveal') load(); }, { now: true });
  load();
}

/* ---------------- 投影 ---------------- */
function qzShow(el, host, D) {
  var h = host.h, box = h('div', { class: 'qz-show' }), st = null, key = '', view = null, n = 0, cnt = null;
  document.body.classList.add('qz-showbody');
  el.appendChild(box);
  function tick() {
    if (view && st && st.phase === 'ask') view.time(1 - (host.now() - st.ats[st.q]) / (D.seconds * 1000));
    if (cnt) cnt.textContent = n + ' 人已作答';
    var k = !st || st.q < 0 || st.phase === 'lobby' ? 'lobby' : st.phase === 'ask' ? 'ask:' + st.q + ':' + st.ats[st.q] + ':' + (host.now() < st.ats[st.q] ? 'pre' : 'open') : st.phase + ':' + st.v;
    if (k === key) return;
    key = k; view = null; cnt = null; qzClear(box);
    var kind = k.split(':')[0];
    if (kind === 'lobby') { box.appendChild(h('div', { class: 'qz-showtitle' }, '🧠 ' + D.title)); box.appendChild(h('div', { class: 'qz-showsub' }, '拿出手機，打開營隊互動的遊戲，準備搶答！')); return; }
    if (kind === 'end') {
      box.appendChild(h('div', { class: 'qz-showtitle' }, '🏆 最終排名')); box.appendChild(qzRank(host, st.top, null, true));
      if (host.now() - st.v < 30000) { host.fx.fireworks({ n: 9 }); host.fx.sound('win'); }
      return;
    }
    if (/:pre$/.test(k)) { n = 0; box.appendChild(h('div', { class: 'qz-showtitle' }, '第 ' + (st.q + 1) + ' 題')); host.fx.countdown(Math.min(5, Math.ceil((st.ats[st.q] - host.now()) / 1000)), { until: st.ats[st.q], now: host.now }); return; }
    view = qzQuestion(host, D, st.q, { big: true });
    box.appendChild(view.el);
    if (kind === 'ask') { cnt = h('div', { class: 'qz-showcnt' }, n + ' 人已作答'); box.appendChild(cnt); }
    else { view.reveal(st.tally); host.fx.sound('ok'); if (st.top && st.top.length) box.appendChild(qzRank(host, st.top.slice(0, 5), null, true)); }
  }
  host.stage('quiz', { fast: 1000, slow: 3000 }).on(function (s) { st = s; tick(); });
  setInterval(tick, 200);
  host.every(3000, function () {
    if (!st || st.phase !== 'ask') return;
    host.inbox(host.ch('in-quiz'), 0).then(function (r) { if (st && st.phase === 'ask') n = qzTally(D, r.items || [], st.ats).n[st.q]; }, function () {});
  });
  tick();
}
