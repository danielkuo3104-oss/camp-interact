/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 遊戲資源包的載入頁：game.html?c=營隊ID&g=資源包ID[&a=活動ID][&s=student|worker][&k=關主密鑰]
 *   從活動卡片的「開始遊戲」進來會帶 a：用那個活動在管理端填的設定（覆蓋 manifest.data 的預設），學員要等活動公開才能玩。
 *
 * 資源包放在 games/<資源包ID>/（完整說明見 games/README.md）：
 *   manifest.json  { id, name, version, summary, entry: 'game.js', css?: 'game.css', data: {…預設設定}, config: [{key, label, type, hint, dflt}] }
 *                  config 是管理端「遊戲資源包」分頁每個活動可以改的欄位（type：text、number、datetime、textarea、bool、select、json）
 *                  scoring: true 會計分（活動連上就自動有團隊計分 Game）；presets: [{ name, hint, cfg }] 管理端「套用預設」
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
 *   host.queued(ch)                  這個頻道還排在手機裡沒送出去的結果 [d, …]（伺服器還沒有的，不要當成被刪掉）
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
 *   host.api = 2；host.key(text, n) 手機上算密鑰（cyrb53）；host.every(ms, fn) 背景自動暫停的定時器
 *   host.scoreSafe(o) 斷網先存手機、連上補送的 host.score；host.scorePending() 還沒送出的筆數
 *   host.fx 共用動畫（confetti、flash、shake、pop、buzz、banner、glitch、count；減少動態效果時自動安靜）
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
    var again = location.pathname + location.search;
    var useCode = function (tries) {
      api('gameHandoffUse', hm[1], camp).then(function (r) { store('ia_f_' + camp + '_' + r.side, r.token, true); location.replace(again); }, function (e) {
        if (e && e.code === 'NET' && tries < 2) { setTimeout(function () { useCode(tries + 1); }, 1500); return; }   // 網路不穩：再試
        // 這個瀏覽器之前登入過：照樣進遊戲；沒有：說清楚是連結過期（回 App 再按一次就好，不用在這裡登入）
        if (store('ia_f_' + camp + '_student') || store('ia_f_' + camp + '_worker')) { location.replace(again); return; }
        msg('登入連結過期了', '回到主畫面的營隊互動 App，再按一次遊戲按鈕就會自動登入。也可以直接在這個瀏覽器登入（之後就不用再登入）。',
          h('a', { class: 'btn', href: 'app.html?c=' + encodeURIComponent(camp) + '&s=' + (want === 'worker' ? 'worker' : 'student') + '&back=' + encodeURIComponent(again.split('/').pop()) }, '在這裡登入'));
      });
    };
    useCode(0);
    return;
  }

  // 登入：用營隊互動 App 的登入（學員優先；網址指定 s=worker 就用工作人員的）
  var sides = want === 'worker' ? ['worker'] : want === 'student' ? ['student'] : ['student', 'worker'], side = null;
  for (var i = 0; i < sides.length && !side; i++) if (store('ia_f_' + camp + '_' + sides[i])) side = sides[i];
  function needLogin() {
    var s = want === 'worker' ? 'worker' : 'student';
    msg('請先登入', '這個瀏覽器還沒登入營隊互動（' + (s === 'worker' ? '工作人員端' : '學員端') + '）。登入後會自動回到遊戲。下次請用遊戲裡的「📷 掃描」，就不會跑到別的瀏覽器。',
      h('div', { class: 'col', style: { gap: '8px' } },
        h('a', { class: 'btn primary', href: 'app.html?c=' + encodeURIComponent(camp) + '&s=' + s + '&back=' + encodeURIComponent(location.pathname.split('/').pop() + location.search) }, '前往登入'),
        // 編輯者（管理端帳號）：用管理端登入，登入後直接回到這個遊戲（關主連結是關主畫面，其他是試玩）
        h('a', { class: 'btn ghost', href: 'index.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search) }, '我是編輯者：用管理端帳號登入')));
  }
  // 編輯者（管理端帳號）在同一個瀏覽器登入過：直接用管理端的登入，不用再登入一次學員端／工作人員端
  if (!side && store('ia_token')) side = 'staff';
  if (!side) { needLogin(); return; }
  var TK = side === 'staff' ? 'ia_token' : 'ia_f_' + camp + '_' + side;
  var crew = side !== 'student';   // 工作人員或編輯者：關主畫面
  // 遊戲裡開新分頁的連結（投影畫面、投影分數榜）改用 window.open：新分頁帶得到編輯者的登入（sessionStorage），「結束投影」也關得掉
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[target=_blank]') : null;
    if (!a || !/(^|\/)game\.html\?/.test(a.getAttribute('href') || '') || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
    var w = window.open(a.href, '_blank');
    if (w) ev.preventDefault();
  });
  /** 回到哪裡：編輯者回管理端，其他回營隊互動 App（同一端，不用重新登入） */
  var homeHref = side === 'staff' ? 'admin.html?c=' + encodeURIComponent(camp) : 'app.html?c=' + encodeURIComponent(camp) + '&s=' + side;
  var homeText = side === 'staff' ? '‹ 回管理端' : '‹ 回營隊互動';
  IA.token = store(TK);
  IA.onAuth = function () { store(TK, null); needLogin(); };
  root.classList.toggle('worker', crew);
  document.documentElement.classList.toggle('side-worker', crew);

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
        h('a', { class: 'btn', href: homeHref }, homeText)));
      setTimeout(function () { pass.focus(); }, 50);
    });
  }
  // 工作人員試玩：用玩家身分玩（先選一個小隊），資料放在「活動範圍-p」，跟正式分開
  var trial = !!actId && ((side === 'worker' && param('as') === 'player') || (side === 'staff' && (param('as') === 'player' || want !== 'worker'))), TQ = 'ia_gp_' + camp + '_' + actId;
  function pickSquad(info) {
    var cfg = Object.assign({}, manifest.data || {}, info.activity.cfg || {}), n = Number(cfg.squads) || 8, have = store(TQ);
    if (have && Number(have) >= 1 && Number(have) <= n) return Promise.resolve(have);
    return new Promise(function (done) {
      var grid = h('div', { class: 'game-sq' });
      for (var i = 1; i <= n; i++) (function (q) { grid.appendChild(h('button', { class: 'btn', onclick: function () { store(TQ, String(q)); done(String(q)); } }, '第 ' + q + ' 小隊')); })(i);
      msg('🎮 試玩「' + info.activity.name + '」', '用玩家身分試玩：選一個小隊。試玩的資料跟正式分開，不會影響學員。', h('div', { class: 'col', style: { gap: '10px' } }, grid,
        h('a', { class: 'btn ghost', href: homeHref }, homeText)));
    });
  }
  var trialSq = '';
  // 我的身分與活動設定：存在手機，斷網（或網路很慢）時用上次的，遊戲照樣打得開（只認同一個登入）
  var MEK = 'ia_gme_' + camp + '_' + g + '_' + (actId || '') + '_' + side + '_' + String(IA.token || '').slice(-12);
  function getMe() {
    var saved = jget(MEK, null);
    var p = api('gameMe', camp, actId || '', ticket).then(function (r) { jset(MEK, r); return r; });
    if (!saved) return p;
    return new Promise(function (ok, bad) {
      var t = setTimeout(function () { ok(saved); }, navigator.onLine === false ? 0 : 5000);
      p.then(function (r) { clearTimeout(t); ok(r); }, function (e) { clearTimeout(t); if (e.code === 'NET') ok(saved); else bad(e); });
    });
  }
  Promise.all([getManifest(), getMe()]).then(function (res) {
    manifest = res[0].m;
    var info = res[1];
    if (info.activity && info.activity.pack !== g) throw new Error('這個活動連的是另一個遊戲（' + info.activity.pack + '）');
    var m = !trial && info.activity && info.activity.master;
    if (m && !m.ok) { store(MK, null); ticket = ''; }
    var gate = trial ? pickSquad(info).then(function (q) { trialSq = q; }) : m && !m.ok ? masterLogin(info) : Promise.resolve(info);
    return gate.then(function () { if (m && !trial) jset(MEK, info); return install(manifest, res[0].fresh); }).then(function (got) {
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
      mode: crew && !trial ? 'master' : 'player', trial: trial,
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
      // 這個頻道還排在手機裡、還沒送出去的結果（斷網時送的）→ [d, …]
      queued: function (ch) { var q = jget(GS_KEY_, []); return (Array.isArray(q) ? q : []).filter(function (x) { return x.camp === camp && x.ch === ch; }).map(function (x) { return x.d; }); },
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
        return op('front.action', { camp: camp, target: { pkg: 'scoreboard', action: 'game.stage', side: side === 'staff' ? 'worker' : side }, data: Object.assign({ act: act.id }, o || {}, { ticket: ticket }) });
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
    /* ---- 共用工具（host.api = 2）：新資源包直接用，不用每包自己寫一份 ---- */
    host.api = 2;
    host.key = gameKey;   // host.key('任何文字', 8) → 8 個好輸入的字（沒有 0/O、1/I），同樣的文字每支手機算出來一樣
    host.every = function (ms, fn, o) { return gameEvery(ms, fn, o); };
    host.fx = GameFx;
    /** 關主上傳分數（不怕斷網）：先存在手機，送得出去才拿掉；同隊同關只留最新。回傳 Promise { sent, queued } */
    var SQK = 'ia_gsc_' + camp + '_' + g + '_' + scope;
    var scoreFlush = function () {
      var q = jget(SQK, []) || [];
      if (!q.length || scoreFlush.busy) return Promise.resolve({ sent: 0, queued: q.length });
      scoreFlush.busy = true;
      var sent = 0;
      var next = function () {
        var cur = jget(SQK, []) || [];
        if (!cur.length) return Promise.resolve();
        var x = cur[0];
        return host.score(x).then(function () {
          var now = jget(SQK, []) || [];
          now = now.filter(function (y) { return !(y.team === x.team && y.stage === x.stage && y.qt === x.qt); });
          jset(SQK, now.length ? now : null); sent++;
          return next();
        }, function (e) {
          if (e && e.code !== 'NET' && !/忙碌|網路|逾時|timeout/i.test(String(e.message))) {   // 伺服器明確拒絕（例如沒有這個隊伍）：拿掉，不要一直重送
            var now = (jget(SQK, []) || []).filter(function (y) { return y.qt !== x.qt; }); jset(SQK, now.length ? now : null);
            toast('分數沒送出：' + e.message, true);
            return next();
          }
        });
      };
      return next().then(function () { scoreFlush.busy = false; return { sent: sent, queued: (jget(SQK, []) || []).length }; }, function () { scoreFlush.busy = false; return { sent: sent, queued: (jget(SQK, []) || []).length }; });
    };
    host.scoreSafe = function (o) {
      var q = (jget(SQK, []) || []).filter(function (y) { return !(String(y.team) === String(o.team) && y.stage === o.stage); });
      q.push(Object.assign({}, o, { qt: Date.now() }));
      jset(SQK, q);
      return scoreFlush();
    };
    host.scorePending = function () { return jget(SQK, []) || []; };
    if (act && crew) { setTimeout(scoreFlush, 2500); gameEvery(60000, scoreFlush); window.addEventListener('online', function () { setTimeout(scoreFlush, 2000); }); }
    /** 即時分數榜（有計分的遊戲）：這個活動各隊的分數＋團隊計分總排名，關主一上傳就看得到 */
    host.board = function () { return act ? api('gameBoard', camp, act.id) : Promise.reject(new Error('要從活動的「開始遊戲」進來才看得到分數')); };
    host.scoreboard = function (box, o) { return gameBoardView(box, host, o || {}); };
    var scoring = !!(act && manifest.scoring);
    var view = param('view');
    var el = h('div', { class: 'game-root' });
    var back = h('a', { class: 'game-back', href: homeHref }, homeText);
    var boardBtn = scoring && view !== 'board' ? h('button', { class: 'game-chip', type: 'button', onclick: function () {
      var body = h('div'), w = host.scoreboard(body, { tabs: true });
      modal({ title: '🏆 即時分數', body: h('div', null, body, crew ? h('div', { class: 'row wrap', style: { gap: '8px', marginTop: '10px' } },
        h('a', { class: 'btn', href: host.link({ view: 'board' }), target: '_blank' }, '📺 投影分數榜')) : null), onClose: function () { w.stop(); } });
    } }, '🏆 分數') : null;
    // 投影畫面（view=show／board）：右上角直接回主持人畫面、全螢幕、結束投影，不用回主頁再從活動進來
    var showBar = view === 'show' || view === 'board' ? gameShowBar(host) : null;
    screen(h('div', null, h('div', { class: 'game-bar' }, back, act && !showBar ? h('span', { class: 'game-act' }, act.name) : null, boardBtn), showBar,
      act && act.test ? h('div', { class: 'game-testbar' }, '🧪 測試模式：跟正式一樣（日期當作今天），結束測試後全部歸零') : null,
      trial ? h('div', { class: 'game-testbar' }, '🎮 試玩：第 ' + trialSq + ' 小隊（資料跟正式分開）　', h('a', { href: '#', onclick: function (ev) { ev.preventDefault(); store(TQ, null); location.reload(); } }, '換小隊')) : null, el));
    if (view === 'board' && scoring) { document.body.classList.add('gb-showbody'); host.scoreboard(el, { big: true, tabs: true }); return; }
    try { d.mount(el, host); } catch (e) { msg('遊戲出錯了', e.message); return; }
    setTimeout(function () { gameSubmit.flush(); }, 2000);   // 上次沒送出的補送
  }
})();

/* ---------------- 投影畫面工具列 ---------------- */
function gameShowBar(host) {
  var u = new URL(host.link({})); u.searchParams.delete('view');
  var main = u.href;
  var full = h('button', { class: 'btn sm', type: 'button', onclick: function () {
    var d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else { var r = d.documentElement; (r.requestFullscreen || r.webkitRequestFullscreen || function () {}).call(r); }
  } }, '⛶ 全螢幕');
  var end = h('button', { class: 'btn sm', type: 'button', onclick: function () {
    try { window.close(); } catch (e) {}
    setTimeout(function () { location.href = main; }, 300);   // 不是用新分頁打開的（關不掉）：回主持人畫面
  } }, '✕ 結束投影');
  return h('div', { class: 'game-showbar' }, h('a', { class: 'btn sm', href: main }, '‹ 主持人畫面'), full, end);
}

/* ---------------- 即時分數榜（host.scoreboard） ----------------
 * 兩個分頁：「這個活動」（這個活動各隊得分、過了幾關）和「總排名」（團隊計分）。自己的小隊標起來，分數變了會跳動。
 * 每 o.every 毫秒（預設 20 秒，投影 10 秒）更新，畫面切到背景暫停；斷網時顯示上次的。回傳 { stop, refresh } */
function gameBoardView(box, host, o) {
  var CK = 'ia_gbd_' + (host.camp && host.camp.campId) + '_' + host.scope, last = jget(CK, null), tab = 'act', prev = {}, stopped = false;
  var mine = String(host.me && host.me.squad || '');
  box.classList.add('gb-root'); if (o.big) box.classList.add('big');
  var head = h('div', { class: 'gb-head' }), list = h('div', { class: 'gb-list' }), foot = h('div', { class: 'gb-foot' });
  clear(box); box.appendChild(head); box.appendChild(list); box.appendChild(foot);
  function tabs() {
    clear(head);
    head.appendChild(h('div', { class: 'gb-title' }, '🏆 ' + (last && last.name ? last.name : '即時分數')));
    if (o.tabs !== false) head.appendChild(h('div', { class: 'gb-tabs' },
      [['act', '這個活動'], ['total', '總排名']].map(function (t) { return h('button', { type: 'button', class: 'gb-tab' + (tab === t[0] ? ' on' : ''), onclick: function () { tab = t[0]; prev = {}; draw(); } }, t[1]); })));
  }
  function draw() {
    tabs(); clear(list);
    if (!last) { list.appendChild(h('div', { class: 'gb-empty' }, '載入中…')); return; }
    if (last.on === false) { list.appendChild(h('div', { class: 'gb-empty' }, '團隊計分還沒啟用')); return; }
    var rows = tab === 'total' ? (last.total && last.total.rows) || [] : last.rows || [];
    var max = Math.max(1, Math.max.apply(null, rows.map(function (r) { return r.score; }).concat([0])));
    rows.forEach(function (r) {
      var key = tab + r.no, old = prev[key], sc = h('b', { class: 'gb-sc' }, String(r.score));
      var medal = r.rank <= 3 && r.score > 0;   // 還沒得分的不給獎牌
      var row = h('div', { class: 'gb-row' + (String(r.no) === mine ? ' me' : '') + (medal ? ' r' + r.rank : '') },
        h('span', { class: 'gb-rk' }, medal ? ['🥇', '🥈', '🥉'][r.rank - 1] : String(r.rank)),
        h('span', { class: 'gb-nm' }, r.name + (String(r.no) === mine ? '（我們）' : ''), tab === 'act' && r.stages ? h('small', null, '　' + r.stages + ' 關') : null),
        h('span', { class: 'gb-bar' }, h('i', { style: { width: Math.max(0, r.score) / max * 100 + '%' } })), sc);
      list.appendChild(row);
      if (old !== undefined && old !== r.score) { row.classList.add('up'); GameFx.count(sc, old, r.score, 900); }
      prev[key] = r.score;
    });
    if (!rows.length) list.appendChild(h('div', { class: 'gb-empty' }, '還沒有分數'));
    foot.textContent = (tab === 'total' && last.total && last.total.provisional ? '有 Game 還沒公布，總分不含那些。' : '') + (last.at ? '更新 ' + new Date(last.at).toTimeString().slice(0, 5) : '');
  }
  function refresh() {
    if (stopped) return Promise.resolve();
    return host.board().then(function (r) { r.at = Date.now(); last = r; jset(CK, r); draw(); }, function () { draw(); });
  }
  draw();
  var t = gameEvery(o.every || (o.big ? 10000 : 20000), refresh, { now: true });
  return { stop: function () { stopped = true; t(); }, refresh: refresh };
}

/* ---------------- 共用工具（給資源包，host.key／host.every／host.fx） ---------------- */
var GAME_KEY_ABC_ = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** cyrb53 雜湊 → n 個好輸入的字（最多 12） */
function gameKey(str, n) {
  str = String(str); n = Math.min(12, Math.max(4, Number(n) || 8));
  var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (var i = 0; i < str.length; i++) { var c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  var a = h1 >>> 0, b = h2 >>> 0, out = '';
  for (var j = 0; j < n; j++) { var src = j < 4 ? a >>> (j * 6) : j < 8 ? b >>> ((j - 4) * 6) : (a ^ b) >>> ((j - 8) * 6); out += GAME_KEY_ABC_[src & 31]; }
  return out;
}
/** 定時做事，切到背景就停、回來馬上補一次（省電、省連線）；o.now 先跑一次。回傳 stop() */
function gameEvery(ms, fn, o) {
  var t = 0, stopped = false;
  var run = function () { if (stopped) return; try { fn(); } catch (e) {} };
  var arm = function () { clearInterval(t); if (!stopped && !document.hidden) t = setInterval(run, ms); };
  var vis = function () { if (document.hidden) clearInterval(t); else { run(); arm(); } };
  document.addEventListener('visibilitychange', vis);
  arm(); if (o && o.now) run();
  return function () { stopped = true; clearInterval(t); document.removeEventListener('visibilitychange', vis); };
}
/** 動畫：彩帶、閃光、震動、數字跳動、故障效果；手機設定「減少動態效果」時自動變簡單 */
var GameFx = (function () {
  var still = function () { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); };
  var css = function () {
    if (document.getElementById('gfx-css')) return;
    var st = document.createElement('style'); st.id = 'gfx-css';
    st.textContent = '.gfx-layer{position:fixed;inset:0;pointer-events:none;z-index:9000;overflow:hidden}'
      + '.gfx-c{position:absolute;top:-12px;width:9px;height:14px;border-radius:2px;animation:gfxFall linear forwards}'
      + '@keyframes gfxFall{to{transform:translate3d(var(--dx),110vh,0) rotate(var(--r));opacity:.9}}'
      + '.gfx-flash{position:fixed;inset:0;pointer-events:none;z-index:8999;animation:gfxFlash .6s ease-out forwards}'
      + '@keyframes gfxFlash{from{opacity:.75}to{opacity:0}}'
      + '.gfx-shake{animation:gfxShake .45s cubic-bezier(.36,.07,.19,.97)}'
      + '@keyframes gfxShake{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}30%,50%,70%{transform:translateX(-7px)}40%,60%{transform:translateX(7px)}}'
      + '.gfx-pop{animation:gfxPop .5s cubic-bezier(.2,1.6,.4,1)}@keyframes gfxPop{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}'
      + '.gfx-banner{position:fixed;left:50%;top:38%;transform:translate(-50%,-50%);z-index:9001;background:rgba(20,24,28,.88);color:#fff;padding:18px 26px;border-radius:18px;font-size:22px;font-weight:800;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.35);animation:gfxBan 2.6s ease forwards;pointer-events:none;max-width:86vw}'
      + '@keyframes gfxBan{0%{opacity:0;transform:translate(-50%,-40%) scale(.8)}12%{opacity:1;transform:translate(-50%,-50%) scale(1.04)}20%{transform:translate(-50%,-50%) scale(1)}85%{opacity:1}100%{opacity:0;transform:translate(-50%,-60%)}}'
      + '.gfx-glitch{position:relative}.gfx-glitch.on{animation:gfxGl 1.2s steps(2) infinite}'
      + '@keyframes gfxGl{0%,100%{text-shadow:2px 0 #f0f,-2px 0 #0ff;transform:none}23%{text-shadow:-3px 0 #f0f,3px 0 #0ff;transform:skewX(4deg)}47%{transform:translateX(-2px)}71%{text-shadow:1px 0 #f0f,-1px 0 #0ff;transform:skewX(-3deg)}}';
    document.head.appendChild(st);
  };
  return {
    still: still,
    confetti: function (o) {
      o = o || {}; css();
      if (still()) return;
      var layer = document.createElement('div'); layer.className = 'gfx-layer';
      var colors = o.colors || ['#2f8f83', '#d9623b', '#f2c14e', '#3a74b8', '#7a5bb5', '#c94f7c', '#4caf50'];
      for (var i = 0; i < (o.n || 70); i++) {
        var c = document.createElement('i'); c.className = 'gfx-c';
        c.style.left = Math.random() * 100 + '%'; c.style.background = colors[i % colors.length];
        c.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px'); c.style.setProperty('--r', (Math.random() * 900 - 450) + 'deg');
        c.style.animationDuration = (1.8 + Math.random() * 1.8) + 's'; c.style.animationDelay = Math.random() * .6 + 's';
        layer.appendChild(c);
      }
      document.body.appendChild(layer);
      setTimeout(function () { layer.remove(); }, 4500);
    },
    flash: function (color) { css(); var f = document.createElement('div'); f.className = 'gfx-flash'; f.style.background = color || '#fff'; document.body.appendChild(f); setTimeout(function () { f.remove(); }, 700); },
    shake: function (el) { css(); if (!el || still()) return; el.classList.remove('gfx-shake'); void el.offsetWidth; el.classList.add('gfx-shake'); },
    pop: function (el) { css(); if (!el || still()) return; el.classList.remove('gfx-pop'); void el.offsetWidth; el.classList.add('gfx-pop'); },
    buzz: function (ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 60); } catch (e) {} },
    banner: function (text) { css(); var b = document.createElement('div'); b.className = 'gfx-banner'; b.textContent = text; document.body.appendChild(b); setTimeout(function () { b.remove(); }, 2700); },
    glitch: function (el, on) { css(); if (!el) return; el.classList.add('gfx-glitch'); el.classList.toggle('on', !!on && !still()); },
    /** 數字從 from 跳到 to（分數、金額） */
    count: function (el, from, to, ms) {
      if (!el) return; from = Number(from) || 0; to = Number(to) || 0;
      if (still() || from === to) { el.textContent = String(to); return; }
      var t0 = performance.now(), d = ms || 700;
      var step = function (t) { var k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = String(Math.round(from + (to - from) * e)); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
  };
})();
