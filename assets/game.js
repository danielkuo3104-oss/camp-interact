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
 *   host.mode                        'player'（學員、工作人員試玩）或 'master'（工作人員／關主）；host.trial 工作人員試玩（頻道、存檔另外放，host.me.squad 是選的小隊）
 *   host.activity                    { id, name, test }（從活動進來才有；test：管理端開了測試模式，資料結束後歸零）
 *   host.ch(name)                    頻道名稱加上活動（同一個資源包用在兩個活動時，進度分開）；host.scope 活動 ID 或 ''
 *   host.time(v)                     設定裡的時間（'2027-07-10T17:00' 或含時區）→ 毫秒，沒填回 null；測試模式日期當作今天（時間照設定）
 *   host.now()                       伺服器時間（毫秒；倒數、定時公布用，學員改手機時間沒用）
 *   host.sync(ch, opts)              即時同步（gameSync），頻道範圍見 core.js
 *   host.submit(ch, d)               要留下來的結果（gameSubmit，斷網會補送）→ Promise { id, sigOk }
 *   host.inbox(ch, since)            讀送出的結果（工作人員全部；學員自己的，小隊頻道 sqN… 讀同小隊的）
 *   host.sign(text, squad)           工作人員產生關主密鑰（綁小隊，'*' 不限；從活動進來也綁活動）→ Promise { sig }；先存好的不用連線
 *   host.signAll(texts, squads)      有網路時一次拿好所有關卡×小隊的密鑰存在手機，之後 host.sign 離線也能用
 *   關主登入：活動設了關主通行碼時，工作人員進來會先輸入一次（存在手機），host.sign、host.score 自動帶關主證明
 *   host.score({ stage, stageName, team, score })  關主端：這一隊過了這一關，分數送進「團隊計分」（從活動進來才能用）
 *                                    每個活動一個 Game（名稱＝活動名稱），每隊每關一筆，同一關重送是更新
 *   host.load(key) / host.save(key, v)  這台手機、這個人、這個資源包自己的存檔
 *   host.qr(el, text)                畫 QR code
 *   host.scan(title)                 遊戲裡開相機掃 QR code（不會跑到別的瀏覽器）→ Promise 掃到的文字，取消是 null
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

  // 從主畫面捷徑按進來的：網址 #h= 是一次性的交接碼，換回 App 的登入（瀏覽器和捷徑的登入是分開的）
  var hm = location.hash.match(/[#&]h=([0-9a-f]{40})/);
  if (hm) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    msg('登入中…', '帶入營隊互動 App 的登入');
    api('gameHandoffUse', hm[1], camp).then(function (r) { store('ia_f_' + camp + '_' + r.side, r.token, true); location.replace(location.pathname + location.search); },
      function () { location.replace(location.pathname + location.search); });
    return;
  }

  // 登入：用營隊互動 App 的登入（學員優先；網址指定 s=worker 就用工作人員的）
  var sides = want === 'worker' ? ['worker'] : want === 'student' ? ['student'] : ['student', 'worker'], side = null;
  for (var i = 0; i < sides.length && !side; i++) if (store('ia_f_' + camp + '_' + sides[i])) side = sides[i];
  function needLogin() {
    var s = want === 'worker' ? 'worker' : 'student';
    msg('請先登入', '這個瀏覽器還沒登入營隊互動（' + (s === 'worker' ? '工作人員端' : '學員端') + '）。登入後會自動回到遊戲。下次請用遊戲裡的「📷 掃描」，就不會跑到別的瀏覽器。',
      h('a', { class: 'btn primary', href: 'app.html?c=' + encodeURIComponent(camp) + '&s=' + s + '&back=' + encodeURIComponent(location.pathname.split('/').pop() + location.search) }, '前往登入'));
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

  /** 相機權限被擋時教怎麼打開：iPhone（Safari）／Android（Chrome）各自的步驟 */
  function camHelp() {
    var ua = navigator.userAgent, ios = isIos_(), android = /Android/i.test(ua);
    var steps = ios ? ['打開手機的「設定」App', '往下找到「App」→「Safari」（舊版 iOS 直接在設定裡找「Safari」）', '在「網站設定」裡點「相機」，改成「允許」', '回到這一頁，重新整理後再按一次掃描']
      : android ? ['點網址列左邊的圖示（鎖頭或「⚙」）→「權限」→「相機」，改成「允許」', '如果那裡沒有：Chrome 右上「⋮」→「設定」→「網站設定」→「相機」，把這個網站從「已封鎖」改成「允許」', '還是不行：打開手機的「設定」→「應用程式」→「Chrome」→「權限」→「相機」，改成「允許」', '回到這一頁，重新整理後再按一次掃描']
      : ['點網址列左邊的圖示，把「相機」改成「允許」', '回到這一頁，重新整理後再按一次掃描'];
    return h('div', null, h('b', null, ios ? 'iPhone 打開相機權限' : android ? 'Android 打開相機權限' : '打開相機權限'),
      h('ol', null, steps.map(function (t) { return h('li', null, t); })),
      h('div', { class: 'small muted' }, '打不開也沒關係：關掉這個視窗，直接輸入關主給的代碼。'));
  }
  /* 遊戲裡的 QR code 掃描：不用手機相機 App（相機 App 會用別的瀏覽器打開、又要登入一次）
   * 有 BarcodeDetector（Android Chrome）用內建的；沒有（iPhone）就載入 jsQR 一張一張解。回傳 Promise 掃到的文字（取消是 null） */
  var JSQR = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js', JSQR_SRI = 'sha384-b5Ya4Bq3qCyz39m2ISh+4DxjAIljdeFwK/BsXLuj9gugaNwAcj/ia15fxNZL9Nlx';
  var jsqrP = null;
  function loadJsQR() {
    if (window.jsQR) return Promise.resolve(window.jsQR);
    return jsqrP || (jsqrP = new Promise(function (ok, bad) {
      var sc = document.createElement('script'); sc.src = JSQR; sc.integrity = JSQR_SRI; sc.crossOrigin = 'anonymous';
      sc.onload = function () { ok(window.jsQR); }; sc.onerror = function () { jsqrP = null; bad(new Error('掃描元件載入失敗，請檢查網路，或改輸入代碼')); };
      document.head.appendChild(sc);
    }));
  }
  function scanQR(title) {
    return new Promise(function (done) {
      var md = navigator.mediaDevices;
      if (!md || !md.getUserMedia) { toast('這個瀏覽器不能開相機，請改輸入代碼'); done(null); return; }
      var video = h('video', { class: 'scan-video', playsinline: '', muted: '', autoplay: '' }), status = h('div', { class: 'scan-status' }, '開啟相機中…');
      var stream = null, over = false, timer = null, canvas = document.createElement('canvas'), cx = canvas.getContext('2d', { willReadFrequently: true });
      video.muted = true; video.setAttribute('playsinline', '');
      var stop = function () { over = true; clearTimeout(timer); if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); };
      var help = h('div', { class: 'cam-help', style: { display: 'none' } });
      var m = modal({ title: title || '掃描 QR code', body: h('div', null, h('div', { class: 'scan-box' }, video, h('div', { class: 'scan-frame' }), status), help), actions: [{ text: '取消' }], onClose: function () { stop(); done(null); } });
      var found = function (text) { if (over || !text) return; stop(); if (navigator.vibrate) navigator.vibrate(60); done(text); m.close(); };
      var fail2 = function (e) {
        var n = e && e.name;
        if (n === 'NotAllowedError' || n === 'SecurityError') { clear(help).appendChild(camHelp()); help.style.display = ''; }
        status.textContent = n === 'NotAllowedError' || n === 'SecurityError' ? '沒有相機權限：照下面的步驟打開，或改輸入代碼' : n === 'NotFoundError' ? '找不到相機，請改輸入代碼' : (e && e.message) || '相機打不開，請改輸入代碼';
        status.classList.add('bad');
      };
      md.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then(function (st) {
        if (over) { st.getTracks().forEach(function (t) { t.stop(); }); return; }
        stream = st; video.srcObject = st;
        return video.play().then(function () {
          status.textContent = '把 QR code 放進框裡';
          var det = null;
          try { if ('BarcodeDetector' in window) det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { det = null; }
          var viaJs = function (jsQR) {
            var tick = function () {
              if (over) return;
              var w = video.videoWidth, hh = video.videoHeight;
              if (w && hh) {
                var k = Math.min(1, 640 / Math.max(w, hh)); canvas.width = Math.round(w * k); canvas.height = Math.round(hh * k);
                cx.drawImage(video, 0, 0, canvas.width, canvas.height);
                var r = jsQR(cx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
                if (r && r.data) { found(r.data); return; }
              }
              timer = setTimeout(tick, 180);
            };
            tick();
          };
          if (det) {
            var tick2 = function () {
              if (over) return;
              det.detect(video).then(function (codes) { if (codes && codes[0] && codes[0].rawValue) found(codes[0].rawValue); else timer = setTimeout(tick2, 150); },
                function () { loadJsQR().then(viaJs, fail2); });
            };
            tick2();
          } else loadJsQR().then(viaJs, fail2);
        });
      }).catch(fail2);
    });
  }
  CampGame.scan = scanQR;

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
  // 工作人員試玩：用玩家身分玩（先選一個小隊），資料放在「活動範圍-p」，跟正式分開
  var trial = side === 'worker' && param('as') === 'player' && !!actId, TQ = 'ia_gp_' + camp + '_' + actId;
  function pickSquad(info) {
    var cfg = Object.assign({}, manifest.data || {}, info.activity.cfg || {}), n = Number(cfg.squads) || 8, have = store(TQ);
    if (have && Number(have) >= 1 && Number(have) <= n) return Promise.resolve(have);
    return new Promise(function (done) {
      var grid = h('div', { class: 'game-sq' });
      for (var i = 1; i <= n; i++) (function (q) { grid.appendChild(h('button', { class: 'btn', onclick: function () { store(TQ, String(q)); done(String(q)); } }, '第 ' + q + ' 小隊')); })(i);
      msg('🎮 試玩「' + info.activity.name + '」', '用玩家身分試玩：選一個小隊。試玩的資料跟正式分開，不會影響學員。', h('div', { class: 'col', style: { gap: '10px' } }, grid,
        h('a', { class: 'btn ghost', href: 'app.html?c=' + encodeURIComponent(camp) + '&s=' + side }, '‹ 回營隊互動')));
    });
  }
  var trialSq = '';
  Promise.all([getManifest(), api('gameMe', camp, actId || '', ticket)]).then(function (res) {
    manifest = res[0].m;
    var info = res[1];
    if (info.activity && info.activity.pack !== g) throw new Error('這個活動連的是另一個遊戲（' + info.activity.pack + '）');
    var m = !trial && info.activity && info.activity.master;
    if (m && !m.ok) { store(MK, null); ticket = ''; }
    var gate = trial ? pickSquad(info).then(function (q) { trialSq = q; }) : m && !m.ok ? masterLogin(info) : Promise.resolve(info);
    return gate.then(function () { return install(manifest, res[0].fresh); }).then(function (got) {
      var entry = clean(manifest.entry || 'game.js'), css = manifest.css ? clean(manifest.css) : '';
      if (got) got.files.forEach(function (f, i) { blobs[f] = URL.createObjectURL(got.blobs[i]); });
      if (css) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = blobs[css] || base + css; document.head.appendChild(l); }
      return loadScript(blobs[entry] || base + entry).then(function () { return CampGame._wait(); }).then(function (d) { start(d, info); });
    });
  }).catch(function (e) { msg('遊戲打不開', e.message, h('button', { class: 'btn', onclick: function () { location.reload(); } }, '重新整理')); });

  function start(d, info) {
    document.title = manifest.name || '營隊遊戲';
    var me = trial ? Object.assign({}, info.me, { squad: trialSq }) : info.me, who = me.sid ? 's' + me.sid : me.wid ? 'w' + me.wid : 'u';
    gameSubmit.who = me.sid ? 's' + me.sid : me.wid ? 'w' + me.wid : '';
    var act = info.activity, scope = act ? act.scope || act.id : '';   // 測試模式：範圍是 活動ID-t第幾次，結束測試後換新的，等於歸零
    var chScope = trial ? scope + '-p' : scope;   // 試玩的資料（頻道、存檔）另外放；關主密鑰還是照活動範圍（host.scope）
    var saveKey = 'ia_g_' + camp + '_' + g + (chScope ? '_' + chScope : '') + '_' + who;
    var signKey = 'ia_gk_' + camp + '_' + g + (scope ? '_' + scope : '');   // 關主密鑰（照活動範圍：測試模式換一次就是新的）
    var DAY = 86400000, TW = 8 * 3600000;
    var data = Object.assign({}, manifest.data || {}, act ? act.cfg || {} : {});
    var host = {
      camp: info.camp, me: me, pack: manifest, data: data, side: side,
      activity: act ? { id: act.id, name: act.name, test: !!act.test } : null, scope: scope,
      mode: side === 'worker' && !trial ? 'master' : 'player', trial: trial,
      ch: function (name) { return chScope ? name + ':' + chScope : name; },
      time: function (v) {
        v = String(v || '').trim(); if (!v) return null;
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) v += (v.length === 16 ? ':00' : '') + '+08:00';   // 沒寫時區當台灣時間
        var t = Date.parse(v); if (!isFinite(t)) return null;
        // 測試模式：設定裡的日期換成今天（時間照設定），例如正式 7/10 17:00 → 測試時今天 17:00
        if (act && act.test) { var today = Math.floor((host.now() + TW) / DAY) * DAY - TW; t = today + ((t + TW) % DAY + DAY) % DAY; }
        return t;
      },
      now: function () { return Date.now() + CLOCK_.off; },
      sync: function (ch, o) { return gameSync(camp, ch, o); },
      submit: function (ch, data) { return gameSubmit(camp, ch, data); },
      inbox: function (ch, since) { return api('gameInbox', camp, ch, since || 0); },
      // 密鑰先存在手機（signAll），產生時不用連線；沒存到的才連線拿
      sign: function (text, squad) {
        var all = jget(signKey, {}) || {}, have = all[text] && all[text][squad];
        if (have) return Promise.resolve({ sig: have, squad: squad, local: true });
        return api('gameSign', camp, text, squad, act ? act.id : '', ticket).then(function (r) {
          all = jget(signKey, {}) || {}; (all[text] = all[text] || {})[squad] = r.sig; jset(signKey, all); return r;
        });
      },
      signAll: function (texts, squads) {
        return api('gameSign', camp, texts, squads, act ? act.id : '', ticket).then(function (r) {
          var all = jget(signKey, {}) || {};
          Object.keys(r.sigs || {}).forEach(function (t) { all[t] = Object.assign(all[t] || {}, r.sigs[t]); });
          jset(signKey, all); return all;
        });
      },
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
      scan: function (title) { return scanQR(title); },
      param: param, h: h, toast: toast, modal: modal, fail: fail
    };
    var el = h('div', { class: 'game-root' });
    var back = h('a', { class: 'game-back', href: 'app.html?c=' + encodeURIComponent(camp) + '&s=' + side }, '‹ 回營隊互動');
    screen(h('div', null, h('div', { class: 'game-bar' }, back, act ? h('span', { class: 'game-act' }, act.name) : null),
      act && act.test ? h('div', { class: 'game-testbar' }, '🧪 測試模式：跟正式一樣（日期當作今天），結束測試後全部歸零') : null,
      trial ? h('div', { class: 'game-testbar' }, '🎮 試玩：第 ' + trialSq + ' 小隊（資料跟正式分開）　', h('a', { href: '#', onclick: function (ev) { ev.preventDefault(); store(TQ, null); location.reload(); } }, '換小隊')) : null, el));
    try { d.mount(el, host); } catch (e) { msg('遊戲出錯了', e.message); return; }
    setTimeout(function () { gameSubmit.flush(); }, 2000);   // 上次沒送出的補送
  }
})();
