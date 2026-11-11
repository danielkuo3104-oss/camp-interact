/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 測試資源包「賭馬」：賭場之夜用，讓每個隊員都能用手機下注（郭老師：賭馬線上下注）。
 *   學員：每人一份籌碼（purse）。每一輪選一匹馬、押多少（不超過 maxBet），停止下注前可以改；
 *         主持人開跑後，手機上的賽道跟投影同步跑同一場比賽（名次在開跑時就決定好，每支手機照伺服器時間自己播），
 *         跑完立刻結算：押中第一名拿回 押注 × 賠率。
 *   主持人（工作人員）：開放下注、停止下注、開跑、下一輪；看每匹馬被押多少、每隊這一輪贏多少（給銀行兌換玩具鈔）；
 *         「投影畫面」（view=show）。測試模式可以照「預設名次」跑。
 * 資料：
 *   下注  host.submit(in-horse) { r: 第幾輪, h: 馬的編號(0 起), amt, k }（學員看不到別人的；同一輪最後一筆算）
 *   狀態  同步頻道 horse:範圍（工作人員寫，學員只看）{ v, round, phase: open|closed|race, race: { at, order }, hist: { 輪: order } }
 */
CampGame.register({
  mount: function (el, host) {
    var D = hrCfg(host.data);
    if (host.mode === 'master') { if (host.param('view') === 'show') hrShow(el, host, D); else hrPanel(el, host, D); }
    else hrPlayer(el, host, D);
  }
});

function hrInt(v, d, lo, hi) { v = Math.round(Number(v)); if (!isFinite(v)) v = d; return Math.max(lo, Math.min(hi, v)); }
function hrCfg(d) {
  d = d || {};
  var horses = String(d.horses || '').split(/\n/).map(function (l) { var x = l.split('|'); return { name: String(x[0] || '').trim(), odds: Math.max(1, Number(x[1]) || 2) }; }).filter(function (x) { return x.name; }).slice(0, 12);
  if (horses.length < 2) horses = [{ name: '一號馬', odds: 2 }, { name: '二號馬', odds: 3 }];
  return { title: String(d.title || '賽馬場'), horses: horses, purse: hrInt(d.purse, 1000, 0, 1e7), maxBet: hrInt(d.maxBet, 500, 1, 1e7), rounds: hrInt(d.rounds, 3, 1, 20),
    countdown: hrInt(d.countdown, 8, 3, 60), race: hrInt(d.raceSeconds, 16, 5, 60), preset: String(d.preset || '') };
}
var HR_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22', '#1abc9c', '#ec407a', '#795548', '#607d8b', '#8bc34a', '#00bcd4'];
function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
function stateCh(host) { return host.scope ? 'horse:' + host.scope : 'horse'; }   // 試玩也看正式的比賽
/** 主持人狀態：只認工作人員、編輯者寫的，版本最新的 */
function hrWatch(host, opts, cb) {
  var cur = null;
  var s = host.sync(stateCh(host), Object.assign({ fast: 1500, slow: 6000 }, opts, {
    onStates: function (m) {
      var ch = false;
      Object.keys(m).forEach(function (c) { if (!/^[wu]/.test(c)) return; var st = m[c].st; if (st && st.round && (!cur || Number(st.v) > Number(cur.v))) { cur = st; ch = true; } });
      if (ch) cb(cur);
    }
  }));
  return { sync: s, get: function () { return cur; }, put: function (st) { cur = st; } };
}
/** 比賽怎麼跑（每支手機算出來一樣）：名次 order 決定每匹馬幾秒到終點，中間加上照 seed 的起伏，前段會互相超越 */
function hrPos(order, seed, k) {
  var n = order.length, out = [];
  for (var i = 0; i < n; i++) {
    var rank = order.indexOf(i), T = 0.8 + 0.2 * rank / Math.max(1, n - 1);   // 第一名 0.8 就到，最後一名 1.0
    var x = Math.min(1, k / T), ph = ((seed * (i + 3)) % 628) / 100, w = 0.09 * Math.sin(ph + x * 9.4) * x * (1 - x) * 4;
    out.push(Math.max(0, Math.min(1, x + w * (1 - x))));
  }
  return out;
}
/** 賽道（學員、投影共用） */
function hrTrack(host, D, big) {
  var h = host.h, lanes = [], box = h('div', { class: 'hr-track' + (big ? ' big' : '') });
  D.horses.forEach(function (x, i) {
    var horse = h('div', { class: 'hr-horse' }, h('span', { class: 'hr-emo' }, '🏇'), h('b', { style: { background: HR_COLORS[i % 12] } }, String(i + 1)));
    var lane = h('div', { class: 'hr-lane' }, h('div', { class: 'hr-lname' }, (i + 1) + ' ' + x.name), horse, h('div', { class: 'hr-rank' }));
    lanes.push({ lane: lane, horse: horse }); box.appendChild(lane);
  });
  box.appendChild(h('div', { class: 'hr-finish' }));
  var raf = 0;
  return {
    el: box,
    set: function (pos, ranks) {
      lanes.forEach(function (l, i) {
        l.horse.style.left = 'calc(' + (pos[i] * 100) + '% - ' + (pos[i] * 54) + 'px)';
        l.horse.classList.toggle('run', pos[i] > 0 && pos[i] < 1);
        var r = l.lane.querySelector('.hr-rank'); r.textContent = ranks && ranks[i] ? ranks[i] : '';
        l.lane.classList.toggle('win', !!(ranks && ranks[i] === '🥇'));
      });
    },
    /** 從 at 開始播 race 秒，結束時 done() */
    play: function (st, done) {
      cancelAnimationFrame(raf);
      var at = st.race.at, len = D.race * 1000, order = st.race.order, me = this, ended = false;
      var step = function () {
        var k = (host.now() - at) / len;
        if (k < 0) { me.set(D.horses.map(function () { return 0; })); raf = requestAnimationFrame(step); return; }
        if (k >= 1) { me.set(D.horses.map(function () { return 1; }), medals(order)); if (!ended) { ended = true; done && done(); } return; }
        me.set(hrPos(order, at % 997, k)); raf = requestAnimationFrame(step);
      };
      step();
    },
    stop: function () { cancelAnimationFrame(raf); }
  };
}
function medals(order) { var m = {}; ['🥇', '🥈', '🥉'].forEach(function (x, i) { if (order[i] !== undefined) m[order[i]] = x; }); order.slice(3).forEach(function (hh, i) { m[hh] = String(i + 4); }); return m; }
/** 下注 → 每輪最後一筆；結算 */
function hrBets(items) { var by = {}; items.slice().sort(function (a, b) { return (a.t || 0) - (b.t || 0); }).forEach(function (x) { var d = x.d || {}; if (!d.r) return; by[d.r] = { h: Number(d.h), amt: Number(d.amt) || 0, t: x.t, name: x.name, squad: x.squad }; }); return by; }
function hrPay(D, bet, order) { return order && bet && order[0] === bet.h ? Math.round(bet.amt * D.horses[bet.h].odds) : 0; }

/* ---------------- 學員 ---------------- */
function hrPlayer(el, host, D) {
  var h = host.h, ch = host.ch('in-horse'), st = { v: 0, round: 1, phase: 'open', hist: {} }, mine = host.load('bets', {}) || {};
  var head = h('div', { class: 'card hr-card hr-head' }), track = hrTrack(host, D), form = h('div', { class: 'card hr-card' }), res = h('div', { class: 'card hr-card' });
  var cd = h('div', { class: 'hr-cd' });
  el.classList.add('hr-root');
  el.appendChild(head); el.appendChild(h('div', { class: 'card hr-card' }, cd, track.el)); el.appendChild(form); el.appendChild(res);
  var pick = null, amt = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: '1', placeholder: '押多少' });
  function purse() {
    var p = D.purse;
    Object.keys(mine).forEach(function (r) { p -= mine[r].amt; p += hrPay(D, mine[r], (st.hist || {})[r] || (st.race && Number(r) === st.round && st.phase === 'race' && host.now() >= st.race.at + D.race * 1000 ? st.race.order : null)); });
    return p;
  }
  function renderHead() {
    clear(head).appendChild(h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'center' } }, h('div', null, h('div', { class: 'hr-title' }, '🏇 ' + D.title), h('div', { class: 'small muted' }, '第 ' + st.round + ' / ' + D.rounds + ' 輪・' + ({ open: '下注中', closed: '停止下注', race: '比賽中' })[st.phase])),
      h('div', { class: 'hr-purse' }, h('small', null, '我的籌碼'), h('b', null, String(purse())))));
  }
  function renderForm() {
    clear(form);
    var b = mine[st.round], open = st.phase === 'open';
    form.appendChild(h('div', { class: 'hr-t' }, open ? '選一匹馬下注' : b ? '這一輪押了' : '這一輪沒有下注'));
    if (b) form.appendChild(h('div', { class: 'hr-my' }, h('b', { style: { background: HR_COLORS[b.h % 12] } }, String(b.h + 1)), D.horses[b.h].name + '　押 ' + b.amt + '（中了拿 ' + Math.round(b.amt * D.horses[b.h].odds) + '）'));
    if (!open) return;
    var grid = h('div', { class: 'hr-pick' });
    D.horses.forEach(function (x, i) {
      grid.appendChild(h('button', { class: 'hr-pbtn' + (pick === i ? ' on' : ''), style: { '--hc': HR_COLORS[i % 12] }, onclick: function () { pick = i; renderForm(); } }, h('b', null, String(i + 1)), h('span', null, x.name), h('i', null, '× ' + x.odds)));
    });
    form.appendChild(grid);
    var max = Math.min(D.maxBet, purse() + (b ? b.amt : 0));
    form.appendChild(h('div', { class: 'row', style: { gap: '8px', marginTop: '10px' } }, amt, h('button', { class: 'btn primary', onclick: bet }, b ? '改押' : '下注')));
    form.appendChild(h('div', { class: 'small muted', style: { marginTop: '4px' } }, '最多押 ' + max + '；停止下注前可以改，最後一次算數。'));
  }
  function bet() {
    var a = Math.round(Number(amt.value)), old = mine[st.round], max = Math.min(D.maxBet, purse() + (old ? old.amt : 0));
    if (pick === null) return host.toast('先選一匹馬', true);
    if (!(a > 0)) return host.toast('押多少？', true);
    if (a > max) return host.toast('最多押 ' + max, true);
    if (st.phase !== 'open') return host.toast('已經停止下注了', true);
    mine[st.round] = { h: pick, amt: a, t: host.now() }; host.save('bets', mine);
    host.submit(ch, { r: st.round, h: pick, amt: a, k: Math.random().toString(36).slice(2, 8) }).catch(function () {});
    host.fx.pop(form); host.fx.buzz(40); amt.value = '';
    renderAll();
  }
  var played = '';
  function renderRace() {
    if (st.phase === 'race' && st.race) {
      var key = st.round + ':' + st.race.at;
      if (played !== key) {
        played = key;
        track.play(st, function () { settle(); });
      }
    } else { track.stop(); track.set(D.horses.map(function () { return 0; })); played = ''; }
  }
  /** 倒數 */
  setInterval(function () {
    if (st.phase === 'race' && st.race) {
      var left = st.race.at - host.now();
      cd.textContent = left > 0 ? '⏱ ' + Math.ceil(left / 1000) + ' 秒後開跑' : host.now() < st.race.at + D.race * 1000 ? '🏁 比賽中' : '🏁 比賽結束';
      cd.classList.toggle('go', left > 0 && left < 3500);
    } else cd.textContent = st.phase === 'open' ? '下注中，等主持人開跑' : '停止下注，準備開跑';
  }, 250);
  function settle() {
    var b = mine[st.round], pay = hrPay(D, b, st.race.order);
    clear(res).appendChild(h('div', null, h('div', { class: 'hr-t' }, '第 ' + st.round + ' 輪結果'), h('div', { class: 'hr-podium' }, st.race.order.slice(0, 3).map(function (x, i) { return h('div', { class: 'hr-pod p' + (i + 1) }, h('span', null, ['🥇', '🥈', '🥉'][i]), h('b', null, (x + 1) + ' ' + D.horses[x].name)); })),
      h('div', { class: 'hr-pay ' + (pay ? 'win' : b ? 'lose' : '') }, pay ? '🎉 押中了！拿回 ' + pay : b ? '沒押中（' + (b.h + 1) + ' ' + D.horses[b.h].name + '）' : '這一輪沒有下注')));
    var fresh = host.now() - (st.race.at + D.race * 1000) < 15000;   // 重新整理時不再放一次煙火
    if (fresh && pay) { host.fx.confetti(); host.fx.banner('🎉 +' + pay); host.fx.buzz([80, 50, 120]); } else if (fresh && b) host.fx.shake(res);
    renderHead();
  }
  function renderAll() { renderHead(); renderForm(); renderRace(); }
  hrWatch(host, { peek: true }, function (s) { var newRound = s.round !== st.round; st = s; if (newRound) { pick = null; clear(res); } renderAll(); });
  // 伺服器上的下注（換手機找得回來）
  function refresh() {
    return host.inbox(ch, 0).then(function (r) {
      var srv = hrBets(r.items || []), wait = {};
      host.queued(ch).forEach(function (d) { if (d && d.r) wait[d.r] = 1; });
      Object.keys(mine).forEach(function (k) { if (wait[k]) srv[k] = mine[k]; });
      mine = {}; Object.keys(srv).forEach(function (k) { mine[k] = { h: srv[k].h, amt: srv[k].amt, t: srv[k].t }; });
      host.save('bets', mine); renderHead(); renderForm();
    }, function () {});
  }
  renderAll(); refresh();
}

/* ---------------- 主持人 ---------------- */
function hrPanel(el, host, D) {
  var h = host.h, w = hrWatch(host, {}, function () { render(); }), msg = h('div', { class: 'small muted' });
  var top = h('div', { class: 'card hr-card' }), track = hrTrack(host, D), stats = h('div', { class: 'card hr-card' });
  el.classList.add('hr-root');
  el.appendChild(top); el.appendChild(h('div', { class: 'card hr-card' }, track.el)); el.appendChild(stats);
  var bets = {};
  function cur() { return w.get() || { v: 0, round: 1, phase: 'closed', hist: {} }; }
  function put(st) { st.v = host.now(); w.put(st); w.sync.setState(st); host.submit(host.ch('w-horse'), { st: st }).catch(function () {}); render(); }
  function presetOrder() {
    var o = D.preset.split(/[,\s，]+/).map(function (x) { return Number(x) - 1; }).filter(function (x) { return x >= 0 && x < D.horses.length; });
    var seen = {}; o = o.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; });
    return o;
  }
  function randomOrder() {
    // 照賠率加權：賠率低（熱門）的比較容易贏
    var left = D.horses.map(function (x, i) { return i; }), out = [];
    while (left.length) { var tot = 0; left.forEach(function (i) { tot += 1 / D.horses[i].odds; }); var r = Math.random() * tot, k = 0; for (; k < left.length - 1; k++) { r -= 1 / D.horses[left[k]].odds; if (r <= 0) break; } out.push(left.splice(k, 1)[0]); }
    return out;
  }
  function act(kind) {
    var st = JSON.parse(JSON.stringify(cur()));
    st.hist = st.hist || {};
    if (kind === 'open') { st.phase = 'open'; delete st.race; }
    if (kind === 'close') st.phase = 'closed';
    if (kind === 'race') {
      var o = host.activity && host.activity.test ? presetOrder() : [];
      if (o.length) D.horses.forEach(function (x, i) { if (o.indexOf(i) < 0) o.push(i); }); else o = randomOrder();
      st.phase = 'race'; st.race = { at: host.now() + D.countdown * 1000, order: o };
      st.hist[st.round] = o;
    }
    if (kind === 'next') { st.round = Math.min(D.rounds, st.round + 1); st.phase = 'open'; delete st.race; }
    put(st);
  }
  function render() {
    var st = cur(), ph = st.phase;
    clear(top).appendChild(h('div', null, h('div', { class: 'hr-title' }, '🏇 ' + D.title + '・主持人'), h('div', { class: 'small muted' }, '第 ' + st.round + ' / ' + D.rounds + ' 輪・' + ({ open: '下注中', closed: '停止下注', race: '比賽' })[ph] + (host.activity && host.activity.test && D.preset ? '・🧪 會照預設名次 ' + D.preset : ''))));
    var row = h('div', { class: 'row wrap', style: { gap: '8px', marginTop: '10px' } });
    if (!w.get()) row.appendChild(h('button', { class: 'btn primary', onclick: function () { act('open'); } }, '開放第 1 輪下注'));
    else {
      if (ph === 'open') row.appendChild(h('button', { class: 'btn primary', onclick: function () { act('close'); } }, '停止下注'));
      if (ph === 'closed') row.appendChild(h('button', { class: 'btn primary', onclick: function () { act('race'); } }, '🏁 開跑（' + D.countdown + ' 秒後）'));
      if (ph === 'closed') row.appendChild(h('button', { class: 'btn', onclick: function () { act('open'); } }, '重新開放下注'));
      if (ph === 'race' && st.round < D.rounds) row.appendChild(h('button', { class: 'btn primary', onclick: function () { act('next'); } }, '下一輪（第 ' + (st.round + 1) + ' 輪）'));
    }
    row.appendChild(h('a', { class: 'btn', href: host.link({ view: 'show' }), target: '_blank' }, '📺 投影畫面'));
    top.appendChild(row); top.appendChild(msg);
    if (ph === 'race' && st.race) track.play(st, function () { load(); }); else { track.stop(); track.set(D.horses.map(function () { return 0; })); }
    drawStats();
  }
  function drawStats() {
    var st = cur(), r = st.round, per = D.horses.map(function () { return { n: 0, amt: 0 }; }), sq = {}, people = 0;
    Object.keys(bets).forEach(function (c) { var b = bets[c][r]; if (!b || !per[b.h]) return; people++; per[b.h].n++; per[b.h].amt += b.amt; var p = hrPay(D, b, (st.hist || {})[r]); var s = sq[b.squad || '?'] = sq[b.squad || '?'] || { bet: 0, pay: 0 }; s.bet += b.amt; s.pay += p; });
    clear(stats).appendChild(h('div', { class: 'hr-t' }, '第 ' + r + ' 輪：' + people + ' 人下注'));
    D.horses.forEach(function (x, i) { stats.appendChild(h('div', { class: 'hr-srow' }, h('b', { style: { background: HR_COLORS[i % 12] } }, String(i + 1)), h('span', { class: 'grow' }, x.name + ' ×' + x.odds), h('span', { class: 'small' }, per[i].n + ' 人・' + per[i].amt))); });
    if ((st.hist || {})[r] && st.phase === 'race' && host.now() >= st.race.at + D.race * 1000) {
      stats.appendChild(h('div', { class: 'hr-t', style: { marginTop: '12px' } }, '各隊這一輪（給銀行兌換）'));
      Object.keys(sq).sort(function (a, b) { return Number(a) - Number(b); }).forEach(function (k) { var s = sq[k]; stats.appendChild(h('div', { class: 'hr-srow' }, h('span', { class: 'grow' }, '第 ' + k + ' 小隊'), h('span', { class: 'small' }, '押 ' + s.bet + '・贏回 ' + s.pay + '・淨 ' + (s.pay - s.bet >= 0 ? '+' : '') + (s.pay - s.bet)))); });
    }
  }
  function load() {
    return host.inbox(host.ch('in-horse'), 0).then(function (res) {
      var by = {};
      (res.items || []).forEach(function (x) { (by[x.c] = by[x.c] || []).push(x); });
      bets = {}; Object.keys(by).forEach(function (c) { bets[c] = hrBets(by[c]); });
      drawStats();
    }, function () {});
  }
  // 同步快取被清掉時，用 w-horse 收件補回最後的狀態
  host.inbox(host.ch('w-horse'), 0).then(function (r) { var last = (r.items || []).slice(-1)[0]; if (last && last.d && last.d.st && !w.get()) { w.put(last.d.st); w.sync.setState(last.d.st); render(); } }, function () {});
  render();
  host.every(8000, load, { now: true });
}

/* ---------------- 投影 ---------------- */
function hrShow(el, host, D) {
  var h = host.h, track = hrTrack(host, D, true), cd = h('div', { class: 'hr-showcd' }), title = h('div', { class: 'hr-showtitle' }), pod = h('div', { class: 'hr-podium big' });
  document.body.classList.add('hr-showbody');
  el.appendChild(h('div', { class: 'hr-show' }, title, cd, track.el, pod));
  var st = null, played = '';
  hrWatch(host, { peek: true, fast: 1000, slow: 3000 }, function (s) {
    st = s; title.textContent = '🏇 ' + D.title + '　第 ' + s.round + ' 輪';
    if (s.phase === 'race' && s.race) {
      var key = s.round + ':' + s.race.at;
      if (played !== key) { played = key; clear(pod); track.play(s, function () {
        s.race.order.slice(0, 3).forEach(function (x, i) { pod.appendChild(h('div', { class: 'hr-pod p' + (i + 1) }, h('span', null, ['🥇', '🥈', '🥉'][i]), h('b', null, (x + 1) + ' ' + D.horses[x].name))); });
        host.fx.confetti({ n: 120 });
      }); }
    } else { played = ''; clear(pod); track.stop(); track.set(D.horses.map(function () { return 0; })); }
  });
  setInterval(function () {
    if (!st) { cd.textContent = '等待主持人…'; return; }
    if (st.phase === 'race' && st.race) { var left = st.race.at - host.now(); cd.textContent = left > 0 ? String(Math.ceil(left / 1000)) : host.now() < st.race.at + D.race * 1000 ? '🏁' : '比賽結束'; cd.classList.toggle('go', left > 0); }
    else cd.textContent = st.phase === 'open' ? '下注中！拿出手機押你看好的馬' : '停止下注';
  }, 200);
}
