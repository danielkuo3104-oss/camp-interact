/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 測試資源包「級聯封鎖」（密室逃脫）：手機就是研究站壞掉的主控 AI。
 *   學員（小隊共用進度）：
 *     ・畫面最上面是「級聯封鎖」倒數；越接近時間特效越強（30 分鐘轉橘、10 分鐘轉紅＋故障、最後 1 分鐘震動）
 *     ・每解開一關，AI 完整度上升、畫面故障變少，AI 說出修復台詞和下一關的任務
 *     ・卡在同一關太久，AI 自動推送線索（hintAfter 分鐘）；關主給的「喚醒碼」讓 AI 清醒，給最明顯的提示
 *     ・解法兩種：小隊自己解出的密碼（answer），或關主給的密鑰（QR code／代碼，綁小隊）
 *   關主：選小隊看這關的密鑰／QR code、喚醒碼、自己的台詞；「✓ 過關」記錄完成並上傳分數（斷網先存、連上補送）；
 *         看每隊進度、逃出時間；逃出的隊伍可以上傳「剩餘時間加分」。
 * 密鑰、喚醒碼都用 host.key 在手機上算（關卡＋小隊＋活動範圍），不用連線。進度送到小隊頻道 sqN-esc，隊友互相補齊。
 */
CampGame.register({
  mount: function (el, host) {
    var D = host.data, stages = (Array.isArray(D.stages) ? D.stages : []).filter(function (s) { return s && s.id; });
    var byId = {};
    stages.forEach(function (s, i) { s.no = i + 1; byId[s.id] = s; });
    if (!stages.length) { el.appendChild(host.h('div', { class: 'card' }, '這個活動還沒有設定關卡')); return; }
    if (host.mode === 'player') player(el, host, D, stages, byId); else master(el, host, D, stages, byId);

    // 即時分數榜（平台 host.api 2 才有）：玩家畫面最下面
    if (host.mode === 'player' && host.activity && host.scoreboard) { var bd = host.h('div', { class: 'gb-card' }); (el.querySelector('.le-root') || el).appendChild(bd); host.scoreboard(bd); }
  }
});

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
function hm(t) { var d = new Date(Number(t) + 8 * 3600000); return pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()); }
function clock(ms) { ms = Math.max(0, ms); var s = Math.floor(ms / 1000); var hh = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60; return (hh ? hh + ':' + pad2(mm) : pad2(mm)) + ':' + pad2(ss); }
function norm(v) { return String(v || '').toUpperCase().replace(/[\s\-_.,，。]/g, ''); }

/* ---------------- 密鑰 ---------------- */
function salt(D) { return D.keySalt || 'labescape'; }
function stageKey(host, D, id, sq) { return host.key('esc|' + salt(D) + '|' + host.scope + '|' + id + '|' + sq, 8); }
function wakeKey(host, D, sq, n) { return host.key('wake|' + salt(D) + '|' + host.scope + '|' + sq + '|' + n, 6); }
function stageCode(host, D, id, sq) { return id + '-' + stageKey(host, D, id, sq); }
function wakeCode(host, D, sq, n) { return 'W' + n + '-' + wakeKey(host, D, sq, n); }

/** 時間：封鎖完成時間 endAt，全長 minutes 分鐘。沒設、或測試模式已經過了 → 練習計時（從這支手機第一次打開算起） */
function timing(host, D) {
  var len = (Number(D.minutes) || 150) * 60000, end = host.time(D.endAt), practice = false;
  if (end === null || (host.activity && host.activity.test && host.now() > end) || host.trial) {
    var o = host.load('practice0', 0); if (!o) { o = host.now(); host.save('practice0', o); }
    end = o + len; practice = true;
  }
  return { start: end - len, end: end, len: len, practice: practice };
}

/** 小隊頻道 → 狀態：解開了哪些關（最早的時間）、用過哪些喚醒碼；密鑰／密碼在手機上驗，撤回照時間 */
function teamState(host, D, stages, byId, items, sq) {
  var got = {}, wakes = {};
  items.slice().sort(function (a, b) { return (a.t || 0) - (b.t || 0); }).forEach(function (x) {
    var d = x.d || {}, at = Number(d.at) || x.t;
    if (d.stage && byId[d.stage]) {
      var s = byId[d.stage];
      var ok = d.key ? (norm(d.key) === stageKey(host, D, s.id, sq) || norm(d.key) === stageKey(host, D, s.id, '*')) : (d.ans !== undefined && s.answer && norm(d.ans) === norm(s.answer));
      if (!ok) return;
      if (d.revoke) delete got[s.id];
      else if (!got[s.id] || at < got[s.id].at) got[s.id] = { at: at, master: !!d.master };
    } else if (d.wake && norm(d.key) === wakeKey(host, D, sq, d.wake)) {
      if (!wakes[d.wake]) wakes[d.wake] = { at: at, stage: d.on || '' };
    }
  });
  return { got: got, wakes: wakes };
}
function firstOpen(stages, got) { for (var i = 0; i < stages.length; i++) if (!got[stages[i].id]) return stages[i]; return null; }

/* ---------------- 學員：壞掉的 AI ---------------- */
function player(el, host, D, stages, byId) {
  var h = host.h, sq = host.me.squad;
  if (!sq) { el.appendChild(h('div', { class: 'card' }, '你還沒有小隊，請找隊輔')); return; }
  var ch = host.ch('sq' + sq + '-esc'), T = timing(host, D);
  var st = { got: host.load('got', {}) || {}, wakes: host.load('wakes', {}) || {} };
  var seen = host.load('seen', {}) || {};
  var root = h('div', { class: 'le-root le-calm' });
  var cd = h('div', { class: 'le-cd' }), cdSub = h('div', { class: 'le-cdsub' });
  var ring = h('div', { class: 'le-ring' }, h('b'), h('span', null, 'AI 完整度'));
  var aiName = h('div', { class: 'le-ai' }, D.aiName || 'AI');
  var face = h('div', { class: 'le-face' }, h('i'), h('i'), h('u'));
  var logBox = h('div', { class: 'le-log' });
  var nodes = h('div', { class: 'le-nodes' });
  var task = h('div', { class: 'le-task' });
  var code = h('input', { class: 'input le-code', placeholder: '輸入密碼、關主密鑰或喚醒碼', autocomplete: 'off', autocapitalize: 'characters' });
  code.addEventListener('keydown', function (e) { if (e.key === 'Enter') enter(code.value); });
  root.appendChild(h('div', { class: 'le-alarm' }, h('div', { class: 'le-lbl' }, '⚠ 級聯封鎖倒數' + (T.practice ? '（練習計時）' : '')), cd, cdSub));
  root.appendChild(h('div', { class: 'le-core' }, face, h('div', { class: 'grow' }, aiName, h('div', { class: 'small le-dim' }, '主控 AI・第 ' + sq + ' 小隊緊急應變組')), ring));
  root.appendChild(nodes);
  root.appendChild(task);
  root.appendChild(h('div', { class: 'le-input' },
    h('div', { class: 'row', style: { gap: '8px' } }, code, h('button', { class: 'btn primary', onclick: function () { enter(code.value); } }, '送出')),
    h('button', { class: 'btn le-scan', onclick: function () { host.scan('掃描關主給的 QR code').then(function (t) { if (t) enter(t); }); } }, '📷 掃描 QR code')));
  root.appendChild(h('div', { class: 'le-sec' }, 'AI 訊息'));
  root.appendChild(logBox);
  el.appendChild(root);

  function solvedN() { return stages.filter(function (s) { return st.got[s.id]; }).length; }
  function curStage() { return firstOpen(stages, st.got); }
  /** 這一關開始的時間：上一關解開的時間，或封鎖開始 */
  function stageStart(s) {
    var i = stages.indexOf(s), t = T.start;
    for (var j = 0; j < i; j++) if (st.got[stages[j].id]) t = Math.max(t, st.got[stages[j].id].at);
    return Math.min(t, host.now());
  }
  /** 現在這一關已經推送的線索（照卡關時間），加上喚醒碼換到的最後一個線索 */
  function hintsFor(s) {
    var out = [], hs = s.hints || [], af = s.hintAfter || [], t0 = stageStart(s), now = host.now();
    hs.forEach(function (x, j) {
      var a = Number(af[j]) || 0;
      if (a > 0 && now - t0 >= a * 60000) out.push({ j: j, text: x, at: t0 + a * 60000, auto: true });
    });
    Object.keys(st.wakes).forEach(function (n) {
      var w = st.wakes[n]; if (w.stage !== s.id) return;
      var last = hs.length - 1;
      if (last >= 0 && !out.some(function (y) { return y.j === last; })) out.push({ j: last, text: hs[last], at: w.at, wake: true });
    });
    return out.sort(function (a, b) { return a.at - b.at; });
  }
  function msgs() {
    var out = [{ at: T.start, who: 'sys', text: D.intro || '' }];
    stages.forEach(function (s) {
      if (st.got[s.id]) out.push({ at: st.got[s.id].at, who: 'ai', text: '【' + s.name + '】完成。' + (s.restore || '') });
    });
    var c = curStage();
    if (c) hintsFor(c).forEach(function (x) { out.push({ at: x.at, who: x.wake ? 'wake' : 'hint', text: (x.wake ? '……我醒了一下。聽好：' : '偵測到卡關，推送線索：') + x.text, key: c.id + ':' + x.j }); });
    return out.filter(function (m) { return m.text; }).sort(function (a, b) { return b.at - a.at; });
  }
  var lastSolved = -1, lastMsgKey = '';
  function render() {
    var n = solvedN(), pct = Math.round(n / stages.length * 100), c = curStage();
    ring.firstChild.textContent = pct + '%';
    ring.style.setProperty('--p', pct);
    root.classList.remove('g0', 'g1', 'g2', 'g3');
    root.classList.add(pct >= 100 ? 'g0' : pct >= 60 ? 'g1' : pct >= 30 ? 'g2' : 'g3');   // AI 越壞，故障越多
    host.fx.glitch(aiName, pct < 100);
    clear(nodes);
    stages.forEach(function (s) {
      var g = st.got[s.id];
      nodes.appendChild(h('div', { class: 'le-node' + (g ? ' ok' : s === c ? ' cur' : ''), title: s.name }, h('b', null, g ? '✓' : String(s.no)), h('span', null, g ? s.name : s === c ? s.name : '？？？')));
    });
    clear(task);
    if (c) {
      task.appendChild(h('div', { class: 'le-tt' }, '第 ' + c.no + ' 關・' + c.name));
      task.appendChild(h('div', null, c.brief || ''));
      task.appendChild(h('div', { class: 'small le-dim' }, '關主：' + (c.role || '—') + '　・　已經卡 ' + Math.floor((host.now() - stageStart(c)) / 60000) + ' 分鐘'));
    } else {
      var last = Math.max.apply(null, stages.map(function (s) { return st.got[s.id].at; }));
      task.appendChild(h('div', { class: 'le-tt' }, '🔓 封鎖解除'));
      task.appendChild(h('div', null, '逃出時間 ' + hm(last) + (last <= T.end ? '，比封鎖早了 ' + Math.floor((T.end - last) / 60000) + ' 分鐘' : '（超過封鎖時間）')));
    }
    clear(logBox);
    var ms = msgs(), newest = ms[0];
    ms.forEach(function (m, i) { logBox.appendChild(h('div', { class: 'le-msg ' + m.who + (i === 0 ? ' new' : '') }, h('span', { class: 'le-t' }, hm(m.at)), h('span', null, m.text))); });
    // 新的推送線索：跳出來＋震動（只通知一次）
    ms.forEach(function (m) {
      if (!m.key || seen[m.key]) return;
      seen[m.key] = 1; host.save('seen', seen);
      if (m !== newest) return;
      host.fx.banner(m.who === 'wake' ? '🔆 AI 清醒了' : '📡 AI 推送線索');
      host.fx.buzz([80, 60, 80]);
    });
    if (lastSolved >= 0 && n > lastSolved) {
      host.fx.flash(n === stages.length ? '#7fffd4' : '#b9f6ca'); host.fx.buzz(120);
      if (n === stages.length) { escaped(); } else host.fx.banner('✓ 修復 ' + pct + '%');
    }
    lastSolved = n;
    if (newest) lastMsgKey = newest.at;
  }
  function escaped() {
    host.fx.confetti({ colors: ['#7fffd4', '#9ef0ff', '#ffffff', '#59d39b'] });
    if (host.load('escShown', 0)) return;
    host.save('escShown', 1);
    var box = h('div', { class: 'le-free' }, h('div', { class: 'le-free-card' }, h('div', { class: 'le-free-big' }, '級聯封鎖解除'), h('div', null, '出口已開啟。你們救了所有人。'), h('div', { class: 'small', style: { marginTop: '10px', opacity: .7 } }, '點一下關閉')));
    box.onclick = function () { box.remove(); };
    document.body.appendChild(box);
  }
  /** 倒數＋特效（每秒）；越接近時間越強烈 */
  var level = '';
  function tick() {
    var now = host.now(), left = T.end - now, done = !curStage();
    if (now < T.start && !T.practice) { cd.textContent = clock(T.start - now); cdSub.textContent = '封鎖將於 ' + hm(T.start) + ' 啟動'; setLevel('calm'); return; }
    cd.textContent = done ? '解除' : clock(left);
    cdSub.textContent = done ? '封鎖已解除' : left > 0 ? '封鎖完成 ' + hm(T.end) : '封鎖已完成——但還有希望，繼續解';
    if (done) { setLevel('safe'); return; }
    var lv = left <= 0 ? 'over' : left <= 60000 ? 'crit' : left <= 600000 ? 'danger' : left <= 1800000 ? 'warn' : 'calm';
    setLevel(lv);
    if (lv === 'crit' && Math.floor(left / 1000) % 10 === 0) { host.fx.shake(root); host.fx.buzz(40); }
  }
  function setLevel(lv) {
    if (lv === level) return;
    var prev = level; level = lv;
    ['calm', 'warn', 'danger', 'crit', 'over', 'safe'].forEach(function (k) { root.classList.toggle('le-' + k, k === lv); });
    host.fx.glitch(cd, lv === 'danger' || lv === 'crit' || lv === 'over');
    if (prev && prev !== 'safe' && (lv === 'warn' || lv === 'danger' || lv === 'crit')) { host.fx.banner(lv === 'warn' ? '⚠ 剩 30 分鐘' : lv === 'danger' ? '⚠ 剩 10 分鐘' : '‼ 最後 1 分鐘'); host.fx.buzz([200, 100, 200]); }
  }
  /** 輸入：網址（掃 QR）／關主密鑰 L3-XXXXXXXX／喚醒碼 W2-XXXXXX／這一關的答案 */
  function enter(v) {
    var raw = String(v || ''), m = raw.match(/[?&]k=([^&#]+)/);
    if (m) { try { raw = decodeURIComponent(m[1]); } catch (e) { raw = m[1]; } }
    var x = norm(raw);
    if (!x) return;
    code.value = '';
    var mw = x.match(/^W(\d{1,2})([A-Z2-9]{6})$/);
    if (mw) {
      var n = Number(mw[1]);
      if (n < 1 || n > (Number(D.wakeMax) || 3) || mw[2] !== wakeKey(host, D, sq, n)) return wrong('喚醒碼不對（或不是你們小隊的）');
      if (st.wakes[n]) return host.toast('這組喚醒碼用過了');
      var c0 = curStage(); if (!c0) return host.toast('封鎖已經解除了');
      st.wakes[n] = { at: host.now(), stage: c0.id }; host.save('wakes', st.wakes);
      host.submit(ch, { wake: n, key: mw[2], on: c0.id, at: st.wakes[n].at }).catch(function () {});
      render(); return;
    }
    var mk = x.match(/^([A-Z0-9]+?)([A-Z2-9]{8})$/);
    if (mk && byId[mk[1]]) {
      var s = byId[mk[1]];
      if (mk[2] !== stageKey(host, D, s.id, sq) && mk[2] !== stageKey(host, D, s.id, '*')) return wrong('這個密鑰不對（或不是你們小隊的）');
      return unlock(s, { key: mk[2] });
    }
    // 答案：先比現在這一關，再比其他還沒解的
    var cands = stages.filter(function (s) { return !st.got[s.id] && s.answer && norm(s.answer) === x; });
    var cur = curStage();
    if (cands.length) return unlock(cands.indexOf(cur) >= 0 ? cur : cands[0], { ans: x });
    wrong('密碼錯誤');
  }
  function wrong(t) { host.toast(t, true); host.fx.shake(root); host.fx.buzz([50, 40, 50]); }
  function unlock(s, d) {
    if (st.got[s.id]) return host.toast('「' + s.name + '」已經解開了');
    var at = host.now();
    st.got[s.id] = { at: at }; host.save('got', st.got);
    host.submit(ch, Object.assign({ stage: s.id, at: at }, d)).catch(function () {});
    render();
  }
  function refresh() {
    return host.inbox(ch, 0).then(function (r) {
      var srv = teamState(host, D, stages, byId, r.items || [], sq), wait = {};
      host.queued(ch).forEach(function (d) { if (d && d.stage) wait[d.stage] = 1; if (d && d.wake) wait['w' + d.wake] = 1; });
      Object.keys(st.got).forEach(function (k) { if (!srv.got[k] && wait[k]) srv.got[k] = st.got[k]; });
      Object.keys(st.wakes).forEach(function (k) { if (!srv.wakes[k] && wait['w' + k]) srv.wakes[k] = st.wakes[k]; });
      st = srv; host.save('got', st.got); host.save('wakes', st.wakes);
      render();
    }, function () {});
  }
  render(); tick();
  setInterval(tick, 1000);
  setInterval(function () { if (curStage()) render(); }, 30000);   // 卡關分鐘數、自動推送線索
  host.every(18000 + Math.floor(Math.random() * 6000), refresh, { now: true });
  window.addEventListener('online', function () { setTimeout(refresh, 2000); });
  var k = host.param('k');
  if (k) { try { history.replaceState(null, '', host.link({})); } catch (e) {} setTimeout(function () { enter(k); }, 400); }
}

/* ---------------- 關主 ---------------- */
function master(el, host, D, stages, byId) {
  var h = host.h, nSq = Math.max(1, Number(D.squads) || 8), T = timing(host, D);
  var sqSel = host.load('sq', '1'), stSel = host.load('st', stages[0].id);
  if (!byId[stSel]) stSel = stages[0].id;
  var sqBox = h('div', { class: 'le-sqs' }), stBox = h('div', { class: 'le-sts' }), keyBox = h('div', { class: 'le-keyout' }), script = h('div', { class: 'le-script' });
  var pts = h('input', { class: 'input', type: 'number', inputmode: 'numeric', value: String(Number(D.pointsPerStage) || 100), style: { width: '90px' } });
  var msg = h('div', { class: 'small le-dim' });
  var pass = h('button', { class: 'btn primary' }, host.activity ? '✓ 過關（記錄＋上傳分數）' : '✓ 記錄過關');
  var board = h('div', { class: 'le-board' }), wakeBox = h('div', { class: 'le-wakes' });
  el.appendChild(h('div', { class: 'card le-mcard' }, h('div', { class: 'le-mtitle' }, (D.title || '級聯封鎖') + '・關主'), h('div', { class: 'small le-dim' }, host.me.name + (T.practice ? '　（練習計時）' : '　封鎖完成 ' + hm(T.end))),
    h('div', { class: 'le-sec' }, '關卡'), stBox, h('div', { class: 'le-sec' }, '小隊'), sqBox, keyBox,
    h('div', { class: 'row wrap', style: { gap: '8px', marginTop: '10px', alignItems: 'center' } }, h('span', null, '分數'), pts, pass), msg));
  el.appendChild(h('div', { class: 'card le-mcard' }, h('div', { class: 'le-sec' }, '🎭 你的角色與台詞'), script));
  el.appendChild(h('div', { class: 'card le-mcard' }, h('div', { class: 'le-sec' }, '🔆 喚醒碼（讓 AI 清醒，給最明顯的線索）'), h('div', { class: 'small le-dim' }, '每隊 ' + (Number(D.wakeMax) || 3) + ' 組、各用一次、只有那一隊能用。'), wakeBox));
  var rf = h('button', { class: 'btn sm' }, '重新整理');
  el.appendChild(h('div', { class: 'card le-mcard' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('div', { class: 'le-sec' }, '各隊進度'), rf), board));
  host.qr(h('div'), 'x', 40);   // QR 程式先載好

  function drawPickers() {
    clear(stBox); clear(sqBox);
    stages.forEach(function (s) { stBox.appendChild(h('button', { class: 'btn sm' + (s.id === stSel ? ' on' : ''), onclick: function () { stSel = s.id; host.save('st', s.id); drawPickers(); } }, s.no + ' ' + s.name)); });
    for (var i = 1; i <= nSq; i++) (function (n) { sqBox.appendChild(h('button', { class: 'btn sm' + (n === sqSel ? ' on' : ''), onclick: function () { sqSel = n; host.save('sq', n); drawPickers(); } }, '第 ' + n + ' 隊')); })(String(i));
    var s = byId[stSel], qr = h('div', { class: 'le-qr' }), c = stageCode(host, D, s.id, sqSel);
    clear(keyBox).appendChild(h('div', { class: 'col', style: { alignItems: 'center', gap: '6px' } }, qr, h('div', { class: 'le-big' }, c),
      h('div', { class: 'small le-dim' }, '只有第 ' + sqSel + ' 隊能用。' + (s.answer ? '小隊自己解出密碼「' + s.answer + '」也會過關。' : '這關沒有設密碼，要用這個密鑰過關。'))));
    host.qr(qr, host.link({ k: c, s: 'student' }), 200);
    clear(script).appendChild(h('div', null, h('div', null, h('b', null, s.role || '關主'), '　第 ' + s.no + ' 關「' + s.name + '」'),
      h('div', { class: 'le-line' }, s.line || '（沒有寫台詞）'), h('div', { class: 'small le-dim' }, '任務：' + (s.brief || '')),
      h('div', { class: 'small', style: { marginTop: '6px' } }, '線索（AI 會照時間自動推送）：'),
      h('ol', { class: 'small' }, (s.hints || []).map(function (x, j) { var a = Number((s.hintAfter || [])[j]) || 0; return h('li', null, x + (a ? '（卡 ' + a + ' 分鐘）' : '（喚醒碼才給）')); }))));
    clear(wakeBox);
    for (var w = 1; w <= (Number(D.wakeMax) || 3); w++) wakeBox.appendChild(h('div', { class: 'le-wake' }, h('b', null, wakeCode(host, D, sqSel, w)), h('button', { class: 'btn sm', onclick: (function (wc) { return function () { var q = h('div', { class: 'le-qr' }); host.modal({ title: '第 ' + sqSel + ' 隊喚醒碼', body: h('div', { class: 'col', style: { alignItems: 'center', gap: '8px' } }, q, h('div', { class: 'le-big' }, wc)) }); host.qr(q, host.link({ k: wc, s: 'student' }), 220); }; })(wakeCode(host, D, sqSel, w)) }, 'QR')));
  }
  pass.onclick = function () {
    var s = byId[stSel], team = sqSel, n = Number(pts.value);
    if (host.activity && !isFinite(n)) return host.toast('請填分數', true);
    pass.disabled = true;
    host.submit(host.ch('sq' + team + '-esc'), { stage: s.id, key: stageKey(host, D, s.id, team), master: 1, at: host.now() }).catch(function () {});
    (host.activity ? host.scoreSafe({ stage: s.id, stageName: s.name, team: Number(team), score: n }) : Promise.resolve({ queued: 0 })).then(function (r) {
      msg.textContent = '✓ 第 ' + team + ' 隊「' + s.name + '」過關' + (host.activity ? (r.queued ? '（沒網路，分數連上後自動上傳）' : '，' + n + ' 分已上傳') : '');
      host.toast(msg.textContent.slice(2)); pass.disabled = false; setTimeout(load, 1500);
    });
  };
  /** 每隊進度（讀每個小隊頻道） */
  var data = {};
  function load() {
    var jobs = [];
    for (var i = 1; i <= nSq; i++) (function (n) {
      jobs.push(host.inbox(host.ch('sq' + n + '-esc'), 0).then(function (r) { data[n] = teamState(host, D, stages, byId, r.items || [], String(n)); }, function () {}));
    })(i);
    return Promise.all(jobs).then(drawBoard);
  }
  function drawBoard() {
    clear(board);
    for (var n = 1; n <= nSq; n++) {
      var s = data[n] || { got: {}, wakes: {} }, k = stages.filter(function (x) { return s.got[x.id]; }).length;
      var fin = k === stages.length ? Math.max.apply(null, stages.map(function (x) { return s.got[x.id].at; })) : 0;
      var left = fin ? Math.max(0, Math.floor((T.end - fin) / 60000)) : 0;
      var row = h('div', { class: 'le-brow' }, h('b', { class: 'le-bsq' }, '第 ' + n + ' 隊'),
        h('span', { class: 'le-dots' }, stages.map(function (x) { return h('i', { class: s.got[x.id] ? 'on' : '', title: x.name + (s.got[x.id] ? ' ' + hm(s.got[x.id].at) : '') }); })),
        h('span', { class: 'small le-dim grow' }, fin ? '🔓 ' + hm(fin) + ' 逃出（剩 ' + left + ' 分）' : k + '/' + stages.length + (Object.keys(s.wakes).length ? '・喚醒 ' + Object.keys(s.wakes).length : '')));
      if (fin && host.activity && Number(D.timeBonusPerMin)) (function (team, bonus) {
        row.appendChild(h('button', { class: 'btn sm', onclick: function (e) { e.target.disabled = true; host.scoreSafe({ stage: 'ESC', stageName: '逃出剩餘時間', team: team, score: bonus }).then(function (r) { host.toast('第 ' + team + ' 隊逃出加分 ' + bonus + (r.queued ? '（連上後上傳）' : ' 已上傳')); }); } }, '上傳逃出加分 ' + bonus));
      })(n, left * Number(D.timeBonusPerMin));
      board.appendChild(row);
    }
  }
  rf.onclick = function () { rf.disabled = true; load().then(function () { rf.disabled = false; }); };
  drawPickers(); drawBoard();
  host.every(30000, load, { now: true });
}
