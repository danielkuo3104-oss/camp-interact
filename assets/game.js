/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 遊戲資源包的載入頁：game.html?c=營隊ID&g=資源包ID[&a=活動ID][&s=student|worker][&k=關主密鑰]
 *   從活動卡片的「開始遊戲」進來會帶 a：用那個活動在管理端填的設定（覆蓋 manifest.data 的預設），學員要等活動公開才能玩。
 *
 * 資源包放在 games/<資源包ID>/（完整說明見 games/README.md）：
 *   manifest.json  { id, name, version, summary, entry: 'game.js', css?: 'game.css', data: {…預設設定}, config: [{key, label, type, hint, dflt}] }
 *                  config 是管理端「遊戲資源包」分頁每個活動可以改的欄位（type：text、number、datetime、textarea）
 *   game.js        呼叫 CampGame.register({ mount: function (el, host) {} })
 *   其他素材（圖片、音效、地圖）列在 manifest.files，用 host.asset('檔名') 拿網址
 *   進遊戲前會把 entry、css、files 全部下載到手機（Cache Storage，有下載動畫），同版本不重下載；改了檔案要把 version 加一
 *
 * 遊戲拿到的 host（遊戲只透過它和系統溝通，不用改核心程式）：
 *   host.camp { campId, name }、host.me { kind: 'student'|'worker'|'staff', name, squad, sid, wid }、host.pack（manifest）
 *   host.data                        設定：manifest.data ＋ 這個活動在管理端填的（活動的優先）
 *   host.activity                    { id, name, test }（從活動進來才有；test：管理端開了測試模式，資料結束後歸零）
 *   host.ch(name)                    頻道名稱加上活動（同一個資源包用在兩個活動時，進度分開）；host.scope 活動 ID 或 ''
 *   host.time(v)                     設定裡的時間（'2027-07-10T17:00' 或含時區）→ 毫秒，沒填回 null
 *   host.now()                       伺服器時間（毫秒；倒數、定時公布用，學員改手機時間沒用）
 *   host.sync(ch, opts)              即時同步（gameSync），頻道範圍見 core.js
 *   host.submit(ch, d)               要留下來的結果（gameSubmit，斷網會補送）→ Promise { id, sigOk }
 *   host.inbox(ch, since)            讀送出的結果（工作人員全部；學員自己的，小隊頻道 sqN… 讀同小隊的）
 *   host.sign(text, squad)           工作人員產生關主密鑰（綁小隊，'*' 不限；從活動進來也綁活動）→ Promise { sig }
 *   關主登入：活動設了關主通行碼時，工作人員進來會先輸入一次（存在手機），host.sign、host.score 自動帶關主證明
 *   host.score({ stage, stageName, team, score })  關主端：這一隊過了這一關，分數送進「團隊計分」（從活動進來才能用）
 *                                    每個活動一個 Game（名稱＝活動名稱），每隊每關一筆，同一關重送是更新
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
  var camp = param('c'), g = param('g'), want = param('s'), actId = param('a');
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
  var blobs = {};   // 已下載到手機的檔案 → blob 網址（host.asset、遊戲程式都從這裡拿，斷網也能開）
  var CK = 'ia-game-' + g, VK = 'ia_gv_' + g;
  var hasCache = typeof caches !== 'undefined' && window.isSecureContext !== false;
  function loadScript(src) {
    return new Promise(function (ok, bad) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { bad(new Error('載入失敗')); }; document.head.appendChild(s); });
  }
  function clean(p) { return String(p || '').replace(/^\/+/, '').replace(/\.\.\//g, ''); }

  // 下載畫面：圓環進度＋百分比＋正在下載的檔案，完成打勾後淡出進遊戲
  var dl = null;
  function dlScreen(name, note, upd) {
    var R = 52, C = 2 * Math.PI * R;
    var ring = svgEl('circle', { class: 'gd-bar', cx: 60, cy: 60, r: R, 'stroke-dasharray': C, 'stroke-dashoffset': C });
    var svg = svgEl('svg', { class: 'gd-ring', viewBox: '0 0 120 120' }, [svgEl('circle', { class: 'gd-track', cx: 60, cy: 60, r: R }), ring]);
    var pct = h('div', { class: 'gd-pct' }, '0%'), status = h('div', { class: 'gd-note' }, note || '下載遊戲到手機…'), file = h('div', { class: 'gd-file muted' }, '');
    var box = h('div', { class: 'gd' }, h('div', { class: 'gd-icon' }, '🎮'), h('div', { class: 'gd-name' }, name),
      h('div', { class: 'gd-wrap' }, svg, pct), status, file);
    screen(h('div', { class: 'login-wrap' }, h('div', { class: 'card login-card col' }, box)));
    dl = {
      set: function (f, label) { f = Math.max(0, Math.min(1, f)); ring.setAttribute('stroke-dashoffset', String(C * (1 - f))); pct.textContent = Math.floor(f * 100) + '%'; if (label) file.textContent = label; },
      done: function () {
        dl.set(1); status.textContent = upd ? '更新完成' : '下載完成'; file.textContent = ''; box.classList.add('ok'); pct.textContent = '✓';
        return new Promise(function (ok) { setTimeout(function () { box.classList.add('out'); setTimeout(ok, 350); }, 650); });
      }
    };
    return dl;
  }
  function svgEl(tag, attrs, kids) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (k) { e.appendChild(k); });
    return e;
  }

  // 一個檔案邊下載邊回報進度（有 Content-Length 才算得出比例）
  function grab(path, onPart) {
    return fetch(base + path, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('下載失敗：' + path + '（' + r.status + '）');
      var type = r.headers.get('Content-Type') || '', len = +r.headers.get('Content-Length') || 0;
      if (!r.body || !r.body.getReader || !len) return r.blob().then(function (b) { onPart(1); return { b: b, type: type }; });
      var rd = r.body.getReader(), parts = [], got = 0;
      function pump() {
        return rd.read().then(function (x) {
          if (x.done) { onPart(1); return { b: new Blob(parts, { type: type }), type: type }; }
          parts.push(x.value); got += x.value.length; onPart(Math.min(1, got / len)); return pump();
        });
      }
      return pump();
    });
  }
  function fileList(m) {
    var list = [m.entry || 'game.js'];
    if (m.css) list.push(m.css);
    (m.files || []).forEach(function (f) { list.push(f); });
    return list.map(clean).filter(function (f, i, a) { return f && a.indexOf(f) === i; });
  }
  // 下載整個資源包到手機（Cache Storage）；同版本、檔案都在就不用再下載
  function install(m, fresh) {
    var files = fileList(m), ver = String(m.version || '0');
    if (!hasCache) return Promise.resolve(null);   // 瀏覽器不支援：直接從網路載入
    return caches.open(CK).then(function (cache) {
      return Promise.all(files.map(function (f) { return cache.match(base + f); })).then(function (have) {
        var ok = store(VK) === ver && have.every(Boolean);
        if (ok || !fresh) {
          if (!have.every(Boolean)) throw new Error('沒有網路，而且這個遊戲還沒下載到手機');
          return Promise.all(have.map(function (r) { return r.blob(); })).then(function (bs) { return { files: files, blobs: bs, cached: true }; });
        }
        var old = store(VK);
        var upd = !!(old && old !== ver), ui = dlScreen(m.name || g, upd ? '有新版本，更新中…' : '下載遊戲到手機…', upd);
        var n = files.length, done = 0, out = [];
        var seq = files.reduce(function (p, f, i) {
          return p.then(function () {
            ui.set(done / n, f);
            return grab(f, function (part) { ui.set((done + part) / n); }).then(function (x) {
              out[i] = x.b; done++;
              return cache.put(base + f, new Response(x.b, { headers: { 'Content-Type': x.type || x.b.type || 'application/octet-stream' } }));
            });
          });
        }, Promise.resolve());
        return seq.then(function () { store(VK, ver, true); return ui.done(); }).then(function () { return { files: files, blobs: out, cached: false }; });
      });
    });
  }
  // 清單先上網拿最新的；沒網路就用手機裡的那份
  function getManifest() {
    return fetch(base + 'manifest.json', { cache: 'no-cache' }).then(function (r) {
      if (r.status === 404) throw new Error('找不到這個遊戲（' + g + '）');
      if (!r.ok) throw new Error('伺服器忙線（' + r.status + '）');
      return r.clone().json().then(function (m) {
        if (hasCache) caches.open(CK).then(function (c) { return c.put(base + 'manifest.json', r); }).catch(function () {});
        return { m: m, fresh: true };
      });
    }).catch(function (e) {
      if (!hasCache || /找不到/.test(e.message)) throw e;
      return caches.match(base + 'manifest.json').then(function (r) { if (!r) throw e; return r.json().then(function (m) { return { m: m, fresh: false }; }); });
    });
  }

  var manifest;
  msg('載入中…');
  // 關主證明：活動有關主通行碼時，輸入一次後存在這支手機（改通行碼後要重新輸入）
  var MK = 'ia_gm_' + camp + '_' + (actId || ''), ticket = store(MK) || '';
  function masterLogin(info) {
    var act = info.activity;
    return new Promise(function (done) {
      var pass = h('input', { class: 'input', type: 'password', placeholder: '關主通行碼', autocomplete: 'off' }), err = h('div', { class: 'small', style: { color: 'var(--bad)', minHeight: '1.2em' } });
      var go = h('button', { class: 'btn primary', type: 'submit' }, '進入關主');
      var form = h('form', { class: 'col', style: { gap: '10px' } }, pass, err, go);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (!pass.value.trim()) { err.textContent = '請輸入關主通行碼'; return; }
        go.disabled = true; err.textContent = '';
        api('gameMaster', camp, act.id, pass.value.trim()).then(function (r) {
          ticket = r.ticket; store(MK, ticket, true); act.master.ok = true; done(info);
        }, function (e) { go.disabled = false; err.textContent = e.message; pass.select(); });
      });
      msg('🎯 關主登入', '「' + act.name + '」需要關主通行碼（問活動負責人）。', h('div', { class: 'col', style: { gap: '10px' } }, form,
        h('a', { class: 'btn', href: 'app.html?c=' + encodeURIComponent(camp) + '&s=' + side }, '‹ 回營隊互動')));
      setTimeout(function () { pass.focus(); }, 50);
    });
  }
  Promise.all([getManifest(), api('gameMe', camp, actId || '', ticket)]).then(function (res) {
    manifest = res[0].m;
    var info = res[1];
    if (info.activity && info.activity.pack !== g) throw new Error('這個活動連的是另一個遊戲（' + info.activity.pack + '）');
    var m = info.activity && info.activity.master;
    if (m && !m.ok) { store(MK, null); ticket = ''; }
    return (m && !m.ok ? masterLogin(info) : Promise.resolve(info)).then(function () { return install(manifest, res[0].fresh); }).then(function (got) {
      var entry = clean(manifest.entry || 'game.js'), css = manifest.css ? clean(manifest.css) : '';
      if (got) got.files.forEach(function (f, i) { blobs[f] = URL.createObjectURL(got.blobs[i]); });
      if (css) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = blobs[css] || base + css; document.head.appendChild(l); }
      return loadScript(blobs[entry] || base + entry).then(function () { return CampGame._wait(); }).then(function (d) { start(d, info); });
    });
  }).catch(function (e) { msg('遊戲打不開', e.message, h('button', { class: 'btn', onclick: function () { location.reload(); } }, '重新整理')); });

  function start(d, info) {
    document.title = manifest.name || '營隊遊戲';
    var me = info.me, who = me.sid ? 's' + me.sid : me.wid ? 'w' + me.wid : 'u';
    gameSubmit.who = me.sid ? 's' + me.sid : me.wid ? 'w' + me.wid : '';
    var act = info.activity, scope = act ? act.scope || act.id : '';   // 測試模式：範圍是 活動ID-t第幾次，結束測試後換新的，等於歸零
    var saveKey = 'ia_g_' + camp + '_' + g + (scope ? '_' + scope : '') + '_' + who;
    var data = Object.assign({}, manifest.data || {}, act ? act.cfg || {} : {});
    var host = {
      camp: info.camp, me: me, pack: manifest, data: data, side: side,
      activity: act ? { id: act.id, name: act.name, test: !!act.test } : null, scope: scope,
      ch: function (name) { return scope ? name + ':' + scope : name; },
      time: function (v) {
        v = String(v || '').trim(); if (!v) return null;
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) v += (v.length === 16 ? ':00' : '') + '+08:00';   // 沒寫時區當台灣時間
        var t = Date.parse(v); return isFinite(t) ? t : null;
      },
      now: function () { return Date.now() + CLOCK_.off; },
      sync: function (ch, o) { return gameSync(camp, ch, o); },
      submit: function (ch, data) { return gameSubmit(camp, ch, data); },
      inbox: function (ch, since) { return api('gameInbox', camp, ch, since || 0); },
      sign: function (text, squad) { return api('gameSign', camp, text, squad, act ? act.id : '', ticket); },
      score: function (o) {
        if (!act) return Promise.reject(new Error('要從活動的「開始遊戲」進來才能上傳分數'));
        return op('front.action', { camp: camp, target: { pkg: 'scoreboard', action: 'game.stage', side: side }, data: Object.assign({ act: act.id }, o || {}, { ticket: ticket }) });
      },
      load: function (k, dflt) { var all = jget(saveKey, {}) || {}; return k in all ? all[k] : dflt; },
      save: function (k, v) { var all = jget(saveKey, {}) || {}; all[k] = v; jset(saveKey, all); },
      asset: function (p) { p = clean(p); return blobs[p] || base + p; },
      qr: function (el, text, size) {
        var draw = function () { clear(el); new QRCode(el, { text: text, width: size || 240, height: size || 240, correctLevel: QRCode.CorrectLevel.M }); };
        if (window.QRCode) { draw(); return; }
        var s = document.createElement('script'); s.src = 'assets/qrcode.min.js'; s.onload = draw; document.head.appendChild(s);
      },
      link: function (params) {
        var u = new URL(location.href.split('#')[0]);
        ['k'].forEach(function (k) { u.searchParams.delete(k); });   // a（活動）、s（端）保留
        Object.keys(params || {}).forEach(function (k) { u.searchParams.set(k, params[k]); });
        return u.href;
      },
      param: param, h: h, toast: toast, modal: modal, fail: fail
    };
    var el = h('div', { class: 'game-root' });
    var back = h('a', { class: 'game-back', href: 'app.html?c=' + encodeURIComponent(camp) + '&s=' + side }, '‹ 回營隊互動');
    screen(h('div', null, h('div', { class: 'game-bar' }, back, act ? h('span', { class: 'game-act' }, act.name) : null),
      act && act.test ? h('div', { class: 'game-testbar' }, '🧪 測試模式：跟正式一樣，結束測試後全部歸零') : null, el));
    try { d.mount(el, host); } catch (e) { msg('遊戲出錯了', e.message); return; }
    setTimeout(function () { gameSubmit.flush(); }, 2000);   // 上次沒送出的補送
  }
})();
