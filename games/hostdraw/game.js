/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 測試資源包「現場抽獎」：主持人（工作人員）輸入獎項、人數，按抽獎；
 * 打開遊戲的人都在同一個「房間」裡，大家手機（和投影）上看到所有人的名字，燈號跑一陣子後停在被抽到的人身上，
 * 被抽到的人的名字亮起來，自己的手機放中獎動畫。
 *
 * 資料（只用一個同步頻道，每支手機一次同步就同時拿到名單和抽獎）：
 *   房間  同步頻道 room:範圍，每個人一格：
 *         學員的狀態 { kind: 'here', sq }，每 25 秒更新一次；75 秒沒更新＝離開。名字由伺服器依登入填，改不了
 *         主持人的狀態 { kind: 'draws', v, draws: [{ id, p: 獎項, k: 人數, n: 參加人數, at: 揭曉時間, pushed, w: [[代號, 名字, 小隊]…] }] }
 *         抽獎只認工作人員、編輯者寫的（學員代號 s 開頭的不算）
 *   回報  同步頻道 in-room:範圍（學員只送）：收到抽獎時送 { ack: 抽獎ID, dl: 從按抽獎到收到幾毫秒, late: 比揭曉晚幾毫秒, win }
 *   紀錄  每次抽獎也送一份到 w-room（收件），快取被清掉時用來補回
 * 中獎的人在按下「抽獎」時就決定好（只抽現在在房間裡的人），連同「幾點揭曉」一起送出；
 * 每支手機照伺服器時間跑燈、同時揭曉，所以只要在揭曉前收到，大家看到的是同一刻（等待時間＝留給手機收到的時間）。
 */
CampGame.register({
  mount: function (el, host) {
    var D = hdCfg(host.data);
    if (host.mode === 'master') { if (host.param('view') === 'show') hdShow(el, host, D); else hdPanel(el, host, D); }
    else hdPlayer(el, host, D);
  }
});

function hdInt(v, d, lo, hi) { v = Math.round(Number(v)); if (!isFinite(v)) v = d; return Math.max(lo, Math.min(hi, v)); }
function hdCfg(data) {
  data = data || {};
  return { title: String(data.title || '現場抽獎'), lead: hdInt(data.lead, 10, 3, 30), away: hdInt(data.away, 75, 30, 600), prizes: String(data.prizes || '').split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean) };
}
var HD_ALIVE = 25000;   // 在房間：每 25 秒更新一次
function hdBase(host) { return host.scope ? ':' + host.scope : ''; }   // 工作人員試玩也進正式的房間（測試時方便湊人數）
function hdWho(c) { return String(c || '').split('.')[0]; }
function hdMe(host) { return host.me.sid ? 's' + host.me.sid : host.me.wid ? 'w' + host.me.wid : ''; }
function hdClean(s, n) { return String(s || '').replace(/[~|]/g, ' ').slice(0, n || 8); }
/** 公平抽：crypto 亂數，從候選裡抽 k 個不重複 */
function hdPick(cands, k) {
  var pool = cands.slice(), out = [];
  while (out.length < k && pool.length) { var r = new Uint32Array(1); (window.crypto || window.msCrypto).getRandomValues(r); out.push(pool.splice(r[0] % pool.length, 1)[0]); }
  return out;
}
function hdFill(el) { clear(el); for (var i = 1; i < arguments.length; i++) if (arguments[i]) el.appendChild(arguments[i]); return el; }
function hdSec(ms) { return (ms / 1000).toFixed(1) + ' 秒'; }

/**
 * 房間頻道：每個人一格。學員、試玩的工作人員寫 { kind: 'here' }（在房間）；主持人寫 { kind: 'draws' }。
 * 抽獎只認工作人員、編輯者寫的，照 id 合併（主持人畫面、投影都可以抽）；名單＝最近 away 秒內有更新的人。
 * opts.here：自己也進房間（學員），每 25 秒更新一次；分頁切到背景就不更新。
 */
function hdRoom(host, D, opts, onChange) {
  var draws = {}, seen = {}, me = hdMe(host);
  var s = host.sync('room' + hdBase(host), Object.assign({ fast: 5000, slow: 5000 }, opts.sync, {
    onStates: function (m) {
      Object.keys(m).forEach(function (c) {
        var x = m[c], st = x.st, who = hdWho(c); if (!st) return;
        if (st.kind === 'draws' && /^[wu]/.test(c)) (st.draws || []).forEach(function (d) { if (d && d.id && !draws[d.id]) draws[d.id] = d; });
        if (st.kind === 'here' && /^[sw]/.test(who) && (!seen[who] || x.at >= seen[who].at)) seen[who] = { who: who, name: x.name, sq: st.sq ? String(st.sq) : '', at: x.at };
      });
      onChange();
    }
  }));
  if (opts.here) {
    var hb = 0, beat = function () { if (!document.hidden) s.setState({ kind: 'here', sq: host.me.squad || '', hb: ++hb }); };
    beat(); setInterval(beat, HD_ALIVE);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) beat(); });
  }
  return {
    sync: s, draws: draws,
    list: function () { return Object.keys(draws).map(function (k) { return draws[k]; }).sort(function (a, b) { return a.at - b.at; }); },
    present: function () {
      var now = host.now(), out = Object.keys(seen).map(function (k) { return seen[k]; }).filter(function (p) { return now - p.at < D.away * 1000; });
      if (opts.here && me && !out.some(function (p) { return p.who === me; })) out.push({ who: me, name: host.me.name || '我', sq: host.me.squad ? String(host.me.squad) : '', at: now });   // 自己一定在
      return out.sort(function (a, b) { return (Number(a.sq) || 99) - (Number(b.sq) || 99) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); });
    }
  };
}

/* ---------------- 主持人共用：抽獎、回報 ---------------- */
function hdHost(host, D, onChange) {
  var acks = {}, base = hdBase(host);
  var room = hdRoom(host, D, { sync: { fast: 2000, slow: 4000 } }, onChange);
  // 手機回報收到的時間
  host.sync('in-room' + base, { peek: true, fast: 2000, slow: 5000,
    onEvents: function (list) { list.forEach(function (e) { var d = e.d; if (d && d.ack) (acks[d.ack] = acks[d.ack] || {})[hdWho(e.c)] = d; }); onChange(); }
  });
  // 抽獎紀錄（收件）：快取被清掉時補回
  host.inbox('w-room' + base, 0).then(function (r) { (r.items || []).forEach(function (x) { var d = x.d; if (d && d.id && !room.draws[d.id]) room.draws[d.id] = d; }); onChange(); }, function () {});
  function publishDraws() {
    var list = room.list().slice(-8), st;
    while (true) { st = { kind: 'draws', v: host.now(), draws: list }; if (JSON.stringify(st).length <= 1900 || list.length <= 1) break; list = list.slice(1); }
    room.sync.setState(st);
  }
  return {
    room: room, present: room.present, acks: acks,
    winners: function () { var w = {}; room.list().forEach(function (d) { d.w.forEach(function (x) { w[x[0]] = (w[x[0]] || 0) + 1; }); }); return w; },
    draw: function (prize, k, exclude) {
      var won = this.winners(), cands = room.present().filter(function (p) { return !exclude || !won[p.who]; });
      if (!cands.length) return { err: exclude ? '房間裡的人都抽過了' : '房間裡還沒有人' };
      var now = host.now(), picked = hdPick(cands, k);
      var d = { id: 'd' + now.toString(36), p: hdClean(prize, 20) || '獎品', k: k, at: now + D.lead * 1000, pushed: now, n: cands.length, w: picked.map(function (p) { return [p.who, hdClean(p.name), hdClean(p.sq, 3)]; }) };
      room.draws[d.id] = d;
      publishDraws();
      host.submit('w-room' + base, d).catch(function () {});
      onChange();
      return { d: d, short: picked.length < k };
    },
    ackSummary: function (id) {
      var a = acks[id] || {}, who = Object.keys(a), dl = who.map(function (w) { return a[w].dl; }).filter(isFinite).sort(function (x, y) { return x - y; });
      if (!who.length) return null;
      var q = function (p) { return dl[Math.min(dl.length - 1, Math.floor(dl.length * p))]; };
      return { n: who.length, p50: q(0.5), p90: q(0.9), max: dl[dl.length - 1], before: who.filter(function (w) { return a[w].late <= 0; }).length };
    }
  };
}
function hdAckText(a) { return a ? '📶 ' + a.n + ' 支手機收到：從按抽獎到收到中位數 ' + hdSec(a.p50) + '、90% 在 ' + hdSec(a.p90) + ' 內、最慢 ' + hdSec(a.max) + '；揭曉前收到 ' + a.before + '/' + a.n : '📶 等手機回報…'; }

/* ---------------- 跑燈：名字一個一個亮，越來越慢，揭曉時停在中獎的人 ---------------- */
function hdRoll(getChips, d, now0, nowFn, onDone) {
  var start = now0, cur = null, stopped = false;
  function step() {
    if (stopped) return;
    var now = nowFn(), left = d.at - now;
    if (cur) cur.classList.remove('hl');
    var chips = getChips(), keys = Object.keys(chips);
    if (left <= 0) { onDone(); return; }
    var p = Math.min(1, 1 - left / Math.max(1, d.at - start));
    cur = keys.length ? chips[keys[Math.floor(Math.random() * keys.length)]] : null; if (cur) cur.classList.add('hl');
    setTimeout(step, Math.min(left, 60 + 380 * p * p));
  }
  step();
  return function () { stopped = true; if (cur) cur.classList.remove('hl'); };
}
function hdChip(h, p, me) { return h('span', { class: 'hd-chip' + (p.who === me ? ' me' : ''), 'data-who': p.who }, p.name, p.sq ? h('i', null, p.sq) : null); }

/** 畫一個舞台：名單＋目前抽獎的橫幅＋中獎名單；學員手機、投影都用這個 */
function hdStage(host, D, opts) {
  var h = host.h, me = opts.me || '', played = host.load(opts.saveKey || 'played', {}) || {};
  var banner = h('div', { class: 'hd-banner' }), grid = h('div', { class: 'hd-grid' }), wins = h('div', { class: 'hd-wins' });
  var root = h('div', { class: 'hd-stage' + (opts.big ? ' big' : '') }, banner, grid, wins);
  var chips = {}, rosterSig = '', active = null, stopRoll = null, lastRoster = [];
  function setRoster(list, d) {
    var all = list.slice();
    if (d) d.w.forEach(function (x) { if (!all.some(function (p) { return p.who === x[0]; })) all.push({ who: x[0], name: x[1], sq: x[2] }); });
    var sig = all.map(function (p) { return p.who + p.name + p.sq; }).join(',');
    if (sig === rosterSig) return;
    rosterSig = sig; lastRoster = all; clear(grid); chips = {};
    var n = all.length; grid.className = 'hd-grid' + (n > 160 ? ' xs' : n > 80 ? ' s' : '');
    all.forEach(function (p) { chips[p.who] = grid.appendChild(hdChip(h, p, me)); });
    if (!n) grid.appendChild(h('div', { class: 'hd-empty' }, '房間裡還沒有人'));
    markWins();
  }
  function markWins() { Object.keys(chips).forEach(function (w) { chips[w].classList.remove('win'); }); if (active && host.now() >= active.at) active.w.forEach(function (x) { if (chips[x[0]]) chips[x[0]].classList.add('win'); }); }
  function showWinners(d) {
    clear(wins);
    wins.appendChild(h('div', { class: 'hd-wins-t' }, '🏆 ' + d.p + ' 得主'));
    var row = h('div', { class: 'hd-wins-list' });
    d.w.forEach(function (x, i) { row.appendChild(h('span', { class: 'hd-winner' + (x[0] === me ? ' me' : ''), style: { animationDelay: (i * 0.12) + 's' } }, x[1], x[2] ? h('i', null, x[2] + ' 隊') : null)); });
    wins.appendChild(row);
  }
  function play(d, gotAt) {
    active = d;
    if (stopRoll) { stopRoll(); stopRoll = null; }
    setRoster(lastRoster, d);
    clear(wins); grid.classList.remove('done');
    var now = host.now();
    hdFill(banner, h('div', { class: 'hd-prize' }, '🎁 ' + d.p), h('div', { class: 'hd-sub' }, '抽 ' + d.w.length + ' 位' + (d.n ? '（' + d.n + ' 人參加）' : '')));
    function reveal(late) {
      markWins(); grid.classList.add('done'); showWinners(d);
      var mine = d.w.some(function (x) { return x[0] === me; });
      hdFill(banner, h('div', { class: 'hd-prize' }, '🎁 ' + d.p), h('div', { class: 'hd-sub' }, mine ? '🎉 你被抽中了！' : opts.big ? '恭喜以下得主！' : '這次沒抽到，下次加油'));
      if (opts.onReveal) opts.onReveal(d, mine, late);
    }
    if (now < d.at) {
      var cd = h('div', { class: 'hd-cd' });
      banner.appendChild(cd);
      var tick = setInterval(function () { var l = Math.ceil((d.at - host.now()) / 1000); if (l <= 0 || active !== d) { clearInterval(tick); return; } cd.textContent = '抽獎中… ' + l; }, 200);
      stopRoll = hdRoll(function () { return chips; }, d, Math.min(now, gotAt || now), function () { return host.now(); }, function () { clearInterval(tick); if (active === d) reveal(false); });
    } else reveal(true);
    played[d.id] = 1; host.save(opts.saveKey || 'played', played);
  }
  return {
    el: root,
    roster: function (list) { setRoster(list, active); },
    /** 有新的抽獎：沒播過的、而且還沒揭曉太久的才播；其他的直接顯示最後一個結果 */
    draws: function (list, gotAt) {
      if (!list.length) { if (!active) { hdFill(banner, h('div', { class: 'hd-prize' }, opts.big ? '🎁 ' + D.title : '🎁 等主持人抽獎')); clear(wins); } return; }
      var last = list[list.length - 1];
      if (active && active.id === last.id) return;
      if (!played[last.id] && host.now() < last.at + 30000) play(last, gotAt);
      else { active = last; setRoster(lastRoster, last); markWins(); grid.classList.add('done'); showWinners(last); hdFill(banner, h('div', { class: 'hd-prize' }, '🎁 ' + last.p), h('div', { class: 'hd-sub' }, last.w.some(function (x) { return x[0] === me; }) ? '🎉 你被抽中了！' : '上一輪結果')); }
    },
    active: function () { return active; }
  };
}

/* ---------------- 學員（以及工作人員試玩） ---------------- */
function hdPlayer(el, host, D) {
  var h = host.h, me = hdMe(host), base = hdBase(host), acked = host.load('acked', {}) || {}, gotAt = {}, ackS = null, ackT = null;
  el.classList.add('hd-root');
  var head = h('div', { class: 'card hd-card' }), hist = h('div', { class: 'card hd-card' });
  var stage = hdStage(host, D, { me: me, onReveal: function (d, mine) {
    if (mine) hdFx(host, 'win', '🎉 你抽中了！', d.p);
    renderHist();
  } });
  el.appendChild(head); el.appendChild(h('div', { class: 'card hd-card' }, stage.el)); el.appendChild(hist);
  // 回報收到的時間（揭曉後 30 秒內收到的才算，之後才打開的不算延遲）：臨時開一個只送的頻道，送完就關
  function ack(d) {
    if (acked[d.id] || gotAt[d.id] > d.at + 30000) return;
    acked[d.id] = 1; host.save('acked', acked);
    ackS = ackS || host.sync('in-room' + base, { fast: 2000, slow: 8000 });
    ackS.send({ ack: d.id, dl: gotAt[d.id] - (d.pushed || d.at), late: gotAt[d.id] - d.at, win: d.w.some(function (x) { return x[0] === me; }) });
    clearTimeout(ackT); ackT = setTimeout(function () { ackS.stop(); ackS = null; }, 25000);
  }
  var room = hdRoom(host, D, { here: true }, function () {
    var now = host.now(), list = room.list();
    list.forEach(function (d) { if (!gotAt[d.id]) gotAt[d.id] = now; ack(d); });
    stage.roster(room.present());
    stage.draws(list, list.length ? gotAt[list[list.length - 1].id] : 0);
    renderHead(); renderHist();
  });
  var headSig = '';
  function renderHead() {
    var n = room.present().length, sig = String(n);
    if (sig === headSig) return; headSig = sig;
    clear(head).appendChild(h('div', { class: 'hd-hd' }, h('div', null, h('div', { class: 'hd-name' }, '🎁 ' + D.title), h('div', { class: 'small muted' }, (host.me.name || '') + (host.me.squad ? '・第 ' + host.me.squad + ' 小隊' : ''))),
      h('span', { class: 'hd-in' }, '● 在房間裡（' + n + ' 人）')));
    head.appendChild(h('div', { class: 'small muted' }, '畫面開著就算在房間裡，主持人抽獎時被抽到名字會亮起來。切到別的 App 太久會離開房間。'));
  }
  var histSig = '';
  function renderHist() {
    var list = room.list().filter(function (d) { return host.now() >= d.at; }), sig = list.map(function (d) { return d.id; }).join();
    if (sig === histSig) return; histSig = sig;
    clear(hist).appendChild(h('div', { class: 'hd-t' }, '抽獎紀錄'));
    if (!list.length) { hist.appendChild(h('div', { class: 'small muted' }, '還沒有抽獎')); return; }
    list.slice().reverse().forEach(function (d) {
      var mine = d.w.some(function (x) { return x[0] === me; });
      hist.appendChild(h('div', { class: 'hd-hrow' + (mine ? ' me' : '') }, h('b', null, d.p), h('span', { class: 'small' }, d.w.map(function (x) { return x[1]; }).join('、')), mine ? h('span', { class: 'hd-mine' }, '🎉 我') : null));
    });
  }
  renderHead(); renderHist(); stage.roster(room.present()); stage.draws([], 0);
  setInterval(function () { stage.roster(room.present()); renderHead(); renderHist(); }, 5000);
}

/* ---------------- 主持人畫面 ---------------- */
function hdPanel(el, host, D) {
  var h = host.h, last = '', H = hdHost(host, D, function () { render(); });
  el.classList.add('hd-root');
  var top = h('div', { class: 'card hd-card' }), form = h('div', { class: 'card hd-card' }), people = h('div', { class: 'card hd-card' }), hist = h('div', { class: 'card hd-card' });
  el.appendChild(top); el.appendChild(form); el.appendChild(people); el.appendChild(hist);
  var show = host.link({ view: 'show' });
  top.appendChild(h('div', { class: 'hd-hd' }, h('div', { class: 'hd-name' }, '🎁 ' + D.title + '（主持人）')));
  top.appendChild(h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
    h('a', { class: 'btn primary', href: show, target: '_blank', rel: 'noopener' }, '📽 投影畫面'),
    h('button', { class: 'btn ghost', type: 'button', onclick: function () { (navigator.clipboard ? navigator.clipboard.writeText(show) : Promise.reject()).then(function () { host.toast('已複製連結'); }, function () { host.toast(show); }); } }, '複製連結')));
  top.appendChild(h('div', { class: 'small muted', style: { marginTop: '6px' } }, '學員打開這個活動的遊戲就會進房間。按「抽獎」後 ' + D.lead + ' 秒揭曉，這段時間大家的手機和投影一起跑燈。'));
  hdForm(host, D, H, form);
  function render() {
    var ps = H.present(), list = H.room.list(), sig = ps.map(function (p) { return p.who; }).join() + '|' + list.map(function (d) { return d.id + JSON.stringify(H.ackSummary(d.id)); }).join();
    if (sig === last) return; last = sig;
    clear(people).appendChild(h('div', { class: 'hd-t' }, '房間裡 ', h('b', { class: 'hd-count' }, String(ps.length)), ' 人'));
    var g = h('div', { class: 'hd-grid s' }); ps.forEach(function (p) { g.appendChild(hdChip(h, p, '')); }); people.appendChild(g);
    clear(hist).appendChild(h('div', { class: 'hd-t' }, '抽獎紀錄'));
    if (!list.length) hist.appendChild(h('div', { class: 'small muted' }, '還沒有抽獎'));
    list.slice().reverse().forEach(function (d) {
      hist.appendChild(h('div', { class: 'hd-hrow col' }, h('div', null, h('b', null, d.p), ' ', h('span', { class: 'small muted' }, d.w.length + ' 位（' + (d.n || '?') + ' 人參加）')),
        h('div', { class: 'small' }, d.w.map(function (x) { return x[1] + (x[2] ? '（' + x[2] + '隊）' : ''); }).join('、')),
        h('div', { class: 'hd-ack' }, hdAckText(H.ackSummary(d.id)))));
    });
  }
  render(); setInterval(render, 2000);
}
/** 抽獎表單（主持人畫面、投影畫面共用） */
function hdForm(host, D, H, box, compact) {
  var h = host.h, saved = host.load('form', {}) || {};
  var prize = h('input', { class: 'input hd-prize-in', value: saved.p || D.prizes[0] || '', placeholder: '獎項，例如 飲料券', list: 'hd-prizes' });
  var dl = h('datalist', { id: 'hd-prizes' }); D.prizes.forEach(function (p) { dl.appendChild(h('option', { value: p })); });
  var cnt = h('input', { class: 'input hd-cnt', type: 'number', min: 1, max: 50, value: saved.k || 1 });
  var ex = h('input', { type: 'checkbox', checked: saved.ex !== false });
  var go = h('button', { class: 'btn primary hd-go', type: 'button', onclick: function () {
    var k = Math.max(1, Math.min(50, Math.round(Number(cnt.value) || 1)));
    host.save('form', { p: prize.value, k: k, ex: ex.checked });
    var r = H.draw(prize.value, k, ex.checked);
    if (r.err) { host.toast(r.err, true); return; }
    host.toast(r.short ? '人數不夠，只抽到 ' + r.d.w.length + ' 位' : '抽好了！' + D.lead + ' 秒後揭曉');
    go.disabled = true; setTimeout(function () { go.disabled = false; }, D.lead * 1000);
  } }, '🎲 抽獎');
  clear(box);
  if (!compact) box.appendChild(h('div', { class: 'hd-t' }, '抽獎'));
  box.appendChild(h('div', { class: 'hd-form' + (compact ? ' compact' : '') }, dl,
    h('label', { class: 'field' }, h('span', null, '獎項'), prize),
    h('label', { class: 'field hd-cntf' }, h('span', null, '幾位'), cnt),
    h('label', { class: 'hd-ex' }, ex, ' 抽過的人不再抽'), go));
}

/* ---------------- 投影畫面 ---------------- */
function hdShow(el, host, D) {
  var h = host.h, H = hdHost(host, D, function () { update(); }), sound = host.load('sound', true) !== false, audio = null;
  document.body.classList.add('hd-showing');
  el.classList.add('hd-proj');
  var count = h('div', { class: 'hd-p-count' }), info = h('div', { class: 'hd-p-info' }), tools = h('div', { class: 'hd-p-tools' }), formBox = h('div');
  var stage = hdStage(host, D, { big: true, saveKey: 'played-show', onReveal: function (d) { fanfare(); hdFx(host, 'show', '🎉 ' + d.p, d.w.map(function (x) { return x[1]; }).join('、')); } });
  el.appendChild(h('div', { class: 'hd-p-top' }, h('div', { class: 'hd-p-title' }, '🎁 ' + D.title), count));
  el.appendChild(stage.el); el.appendChild(info); el.appendChild(tools);
  function beep(f, d, type) {
    if (!sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var o = audio.createOscillator(), g = audio.createGain(); o.type = type || 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.2, audio.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + d);
      o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + d + 0.05);
    } catch (e) {}
  }
  function fanfare() { [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { beep(f, 0.35, 'square'); }, i * 160); }); }
  // 跑燈時「滴滴」聲：看名單上 .hl 換人
  var lastHl = null;
  setInterval(function () { var x = stage.el.querySelector('.hd-chip.hl'); if (x && x !== lastHl) beep(1200, 0.04, 'square'); lastHl = x; }, 40);
  var lastSig = '';
  function update() {
    var ps = H.present(), list = H.room.list();
    stage.roster(ps);
    stage.draws(list, host.now());
    var a = stage.active() ? H.ackSummary(stage.active().id) : null, sig = ps.length + '|' + JSON.stringify(a);
    if (sig === lastSig) return; lastSig = sig;
    count.textContent = '房間裡 ' + ps.length + ' 人';
    info.textContent = a ? hdAckText(a) : '';
  }
  clear(tools);
  tools.appendChild(formBox); hdForm(host, D, H, formBox, true);
  tools.appendChild(h('button', { class: 'btn sm', type: 'button', onclick: function () { if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); } }, '⛶ 全螢幕'));
  var sb = tools.appendChild(h('button', { class: 'btn sm', type: 'button', onclick: function () { sound = !sound; host.save('sound', sound); sb.textContent = sound ? '🔊 聲音' : '🔇 靜音'; } }, sound ? '🔊 聲音' : '🔇 靜音'));
  update(); setInterval(update, 1000);
}

/* ---------------- 中獎動畫（存在資源包裡） ---------------- */
function hdFx(host, kind, big, small) {
  var h = host.h, wrap = h('div', { class: 'hd-fx ' + kind, role: 'status', 'aria-live': 'polite' }), cv = h('canvas', { class: 'hd-fx-cv' });
  wrap.appendChild(cv); wrap.appendChild(h('div', { class: 'hd-fx-card' }, h('div', { class: 'hd-fx-big' }, big), small ? h('div', { class: 'hd-fx-small' }, small) : null, h('div', { class: 'hd-fx-tap' }, '點一下關閉')));
  document.body.appendChild(wrap);
  var W = cv.width = innerWidth, H = cv.height = innerHeight, g = cv.getContext('2d'), parts = [], t0 = performance.now(), dur = kind === 'win' ? 6000 : 4500, alive = true;
  var PAL = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#fff1a8', '#8e5bd6'];
  if (!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    for (var i = 0; i < 150; i++) parts.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.6, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3.5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: PAL[i % PAL.length], w: 6 + Math.random() * 7 });
  }
  function step(now) {
    if (!alive) return;
    g.clearRect(0, 0, W, H);
    parts.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.rot += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2); g.restore(); });
    if (now - t0 < dur) requestAnimationFrame(step); else close();
  }
  function close() { if (!alive) return; alive = false; wrap.classList.add('out'); setTimeout(function () { wrap.remove(); }, 500); }
  wrap.addEventListener('click', close);
  requestAnimationFrame(step);
}
