/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 遊戲資源包的載入頁：game.html?c=營隊ID&g=資源包ID[&s=student|worker][&k=關主密鑰]
 *
 * 資源包放在 games/<資源包ID>/：
 *   manifest.json  { id, name, version, entry: 'game.js', css?: 'game.css', data: {…遊戲自己的設定} }
 *   game.js        呼叫 CampGame.register({ mount: function (el, host) {} })
 *   其他素材（圖片、音效、地圖）用 host.asset('檔名') 拿網址
 *
 * 遊戲拿到的 host（遊戲只透過它和系統溝通，不用改核心程式）：
 *   host.camp { campId, name }、host.me { kind: 'student'|'worker'|'staff', name, squad, sid, wid }、host.pack（manifest）、host.data（manifest.data）
 *   host.now()                       伺服器時間（毫秒；倒數、定時公布用，學員改手機時間沒用）
 *   host.sync(ch, opts)              即時同步（gameSync），頻道範圍見 core.js
 *   host.submit(ch, d)               要留下來的結果（gameSubmit，斷網會補送）→ Promise { id, sigOk }
 *   host.inbox(ch, since)            讀送出的結果（工作人員全部；學員自己的，小隊頻道 sqN… 讀同小隊的）
 *   host.sign(text, squad)           工作人員產生關主密鑰（綁小隊，'*' 不限）→ Promise { sig }
 *   host.load(key) / host.save(key, v)  這台手機、這個人、這個資源包自己的存檔
 *   host.qr(el, text)                畫 QR code
 *   host.link(params)                這個遊戲頁的網址（加參數，例如給 QR code 用）
 *   host.param(k)、host.h、host.toast、host.modal、host.fail
 * 學員、工作人員要先在營隊互動 App 登入過（同一支手機、同一個瀏覽器）。
 */
var CampGame = (function () {
  var def = null, waiting = null;
  return {
    register: function (d) { def = d; if (waiting) { var w = waiting; waiting = null; w(d); } },
    _wait: function () { return def ? Promise.resolve(def) : new Promise(function (ok) { waiting = ok; }); }
  };
})();

(function () {
  var camp = param('c'), g = param('g'), want = param('s');
  var root = $('#root');
  function screen(node) { clear(root); root.appendChild(node); }
  function msg(title, text, extra) {
    screen(h('div', { class: 'login-wrap' }, h('div', { class: 'card login-card col' }, h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, '營'), '營隊遊戲'),
      h('h1', null, title), text ? h('p', { class: 'muted', style: { margin: 0 } }, text) : null, extra || null)));
  }
  if (!camp || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(g)) { msg('網址不完整', '請用籌辦團隊給的連結或 QR code 打開。'); return; }

  // 登入：用營隊互動 App 的登入（學員優先；網址指定 s=worker 就用工作人員的）
  var sides = want === 'worker' ? ['worker'] : want === 'student' ? ['student'] : ['student', 'worker'], side = null;
  for (var i = 0; i < sides.length && !side; i++) if (store('ia_f_' + camp + '_' + sides[i])) side = sides[i];
  function needLogin() {
    var s = want === 'worker' ? 'worker' : 'student';
    msg('請先登入', '先在營隊互動 App 登入（' + (s === 'worker' ? '工作人員端' : '學員端') + '），再回來打開這個連結。',
      h('a', { class: 'btn primary', href: 'app.html?c=' + encodeURIComponent(camp) + '&s=' + s }, '前往登入'));
  }
  if (!side) { needLogin(); return; }
  var TK = 'ia_f_' + camp + '_' + side;
  IA.token = store(TK);
  IA.onAuth = function () { store(TK, null); needLogin(); };
  root.classList.toggle('worker', side === 'worker');
  document.documentElement.classList.toggle('side-worker', side === 'worker');

  var base = 'games/' + g + '/';
  function loadScript(src) {
    return new Promise(function (ok, bad) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { bad(new Error('載入失敗：' + src)); }; document.head.appendChild(s); });
  }
  var manifest;
  Promise.all([
    fetch(base + 'manifest.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('找不到這個遊戲（' + g + '）'); return r.json(); }),
    api('gameMe', camp)
  ]).then(function (res) {
    manifest = res[0];
    var info = res[1];
    if (manifest.css) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = base + manifest.css; document.head.appendChild(l); }
    return loadScript(base + (manifest.entry || 'game.js')).then(function () { return CampGame._wait(); }).then(function (d) { start(d, info); });
  }).catch(function (e) { msg('遊戲打不開', e.message, h('button', { class: 'btn', onclick: function () { location.reload(); } }, '重新整理')); });

  function start(d, info) {
    document.title = manifest.name || '營隊遊戲';
    var me = info.me, who = me.sid ? 's' + me.sid : me.wid ? 'w' + me.wid : 'u';
    gameSubmit.who = me.sid ? 's' + me.sid : me.wid ? 'w' + me.wid : '';
    var saveKey = 'ia_g_' + camp + '_' + g + '_' + who;
    var host = {
      camp: info.camp, me: me, pack: manifest, data: manifest.data || {}, side: side,
      now: function () { return Date.now() + CLOCK_.off; },
      sync: function (ch, o) { return gameSync(camp, ch, o); },
      submit: function (ch, data) { return gameSubmit(camp, ch, data); },
      inbox: function (ch, since) { return api('gameInbox', camp, ch, since || 0); },
      sign: function (text, squad) { return api('gameSign', camp, text, squad); },
      load: function (k, dflt) { var all = jget(saveKey, {}) || {}; return k in all ? all[k] : dflt; },
      save: function (k, v) { var all = jget(saveKey, {}) || {}; all[k] = v; jset(saveKey, all); },
      asset: function (p) { return base + String(p).replace(/^\/+/, ''); },
      qr: function (el, text, size) {
        var draw = function () { clear(el); new QRCode(el, { text: text, width: size || 240, height: size || 240, correctLevel: QRCode.CorrectLevel.M }); };
        if (window.QRCode) { draw(); return; }
        var s = document.createElement('script'); s.src = 'assets/qrcode.min.js'; s.onload = draw; document.head.appendChild(s);
      },
      link: function (params) {
        var u = new URL(location.href.split('#')[0]);
        ['k'].forEach(function (k) { u.searchParams.delete(k); });
        Object.keys(params || {}).forEach(function (k) { u.searchParams.set(k, params[k]); });
        return u.href;
      },
      param: param, h: h, toast: toast, modal: modal, fail: fail
    };
    var el = h('div', { class: 'game-root' });
    screen(el);
    try { d.mount(el, host); } catch (e) { msg('遊戲出錯了', e.message); return; }
    setTimeout(function () { gameSubmit.flush(); }, 2000);   // 上次沒送出的補送
  }
})();
