/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 學員端／工作人員端：app.html?c=營隊ID&s=student|worker
 *   學員：從報名系統學員專區按「營隊互動」進來（網址 #t= 帶一張 5 分鐘、只能用一次的入場券）
 *   工作人員：姓名＋股別＋營隊通行碼登入
 *   編輯者預覽：&preview=draft（草稿）或 &preview=pub（目前發布版），用管理端的登入
 * 這次使用期間固定用進來時的發布版本（Session 版本鎖定）；重新進入才換新版。
 * 斷線時顯示上次載入的內容。
 */

(function () {
  var camp = param('c'), side = param('s') === 'worker' ? 'worker' : 'student', preview = param('preview');
  var root = $('#root');
  var TK = 'ia_f_' + camp + '_' + side, VK = 'ia_ver_' + camp + '_' + side, BK = 'ia_boot_' + camp + '_' + side;
  var S = { t0: Date.now(), flipAt: Date.now() + 30000, boot: null, env: null, cur: '', stack: [], live: {}, timer: null, offline: false, night: false, scrolled: {} };
  var LK = 'ia_live_' + camp + '_' + side;
  SIM_OK_ = !!preview;

  root.classList.toggle('worker', side === 'worker');
  // 工作人員端換靛藍色，和學員端分開（彈出視窗掛在 body 上，所以加在 html）
  document.documentElement.classList.toggle('side-worker', side === 'worker');
  if (side === 'worker') { var tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.content = '#3b4f8c'; }

  function screen(node) { clear(root); root.appendChild(node); }
  document.addEventListener('touchstart', function () {}, { passive: true });   // iPhone 要有這行，按下去的 :active 回饋才會出現
  /** 載入畫面中間的圖（營隊設定的主視覺），記在手機上，下次一打開就用 */
  var GK = 'ia_logo_' + camp;
  function logoNode() {
    var u = jget(GK, '');
    if (!/^https:\/\//.test(u)) return h('span', { class: 'brand-mark' }, '營');
    var im = h('img', { class: 'wait-img', src: u, alt: '' });
    im.addEventListener('error', function () { im.replaceWith(h('span', { class: 'brand-mark' }, '營')); });
    return im;
  }
  function rememberLogo(u) { u = u || ''; if (u !== jget(GK, '')) { jset(GK, u || null); if (u) new Image().src = u; } }
  /** 等待畫面：標誌外面一圈在轉，下面三個點跳動（驗證入場券、登入後載入） */
  function waitScreen(title, sub) {
    screen(h('div', { class: 'wait-wrap', role: 'status' }, h('div', { class: 'wait-logo' }, h('span', { class: 'wait-ring' }), logoNode()),
      h('div', { class: 'wait-t' }, title), sub ? h('div', { class: 'wait-s' }, sub) : null, h('div', { class: 'wait-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'))));
  }
  function msgScreen(title, text, extra) {
    screen(h('div', { class: 'login-wrap' }, h('div', { class: 'card login-card col' }, h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, '營'), '營隊互動'), h('h1', null, title), text ? h('p', { class: 'muted', style: { margin: 0 } }, text) : null, extra || null)));
  }

  IA.onAuth = function () {
    if (preview) { location.href = 'index.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search); return; }
    store(TK, null);
    try { sessionStorage.removeItem(VK); } catch (e) {}
    start();
  };

  function start() {
    if (camp && root.querySelector('.wait-wrap') && jget(GK, '')) waitScreen('載入中…', '');
    if (!camp) { msgScreen('網址不完整', '請從報名系統的學員專區，或籌辦團隊給你的連結進入。'); return; }
    var m = location.hash.match(/[#&]t=([^&]+)/);
    if (m && side === 'student' && !preview) {
      history.replaceState(null, '', location.pathname + location.search);
      waitScreen('正在驗證身分…', '從報名系統帶你進來，請稍等一下');
      api('studentEnter', decodeURIComponent(m[1])).then(function (r) {
        store(TK, r.token, true);
        try { sessionStorage.removeItem(VK); } catch (e) {}
        boot();
      }, function (e) {
        msgScreen('無法進入', e.message, store(TK) ? h('button', { class: 'btn primary', onclick: boot }, '用上次的登入繼續') : null);
      });
      return;
    }
    if (preview) { IA.token = store('ia_token'); if (!IA.token) { IA.onAuth(); return; } boot(); return; }
    if (!store(TK)) { side === 'worker' ? workerLogin() : studentLogin(); return; }
    boot();
  }

  /** 學員：營隊中掃 QR code 進來，輸入姓名＋身分證字號（或報名時的 Email）直接登入，不用先去學員專區 */
  function studentLogin() {
    var name = inp('', { autocomplete: 'name', maxlength: 40 }), idk = inp('', { autocomplete: 'off', placeholder: '例如：A123456789', maxlength: 80 });
    // 身分證：看起來是身分證（字母＋數字）才轉大寫、最多 10 碼；Email 也放在這格，打字中不動它
    function idNorm(v) { return v.indexOf('@') >= 0 ? v.trim() : v.toUpperCase().replace(/[^A-Z0-9]/g, ''); }
    idk.addEventListener('blur', function () { var v = idNorm(idk.value); if (v !== idk.value) idk.value = v; });
    idk.addEventListener('input', function () {
      if (!/^[A-Za-z][A-Za-z]?[0-9][0-9\s]*$/.test(idk.value.trim())) return;
      var v = idNorm(idk.value).slice(0, 10);
      if (v !== idk.value) idk.value = v;
    });
    var err = h('div', { class: 'err' }), title = h('h1', null, '學員登入'), btn = h('button', { class: 'btn primary' }, '進入');
    var note = h('p', { class: 'small muted', style: { margin: 0 } }, '用報名時填的姓名和身分證字號登入（沒有填身分證的營隊，請改填報名時的 Email）。也可以從報名系統的「學員專區」按「進入營隊互動」。');
    api('campPublicInfo', camp).then(function (c) {
      rememberLogo(c.loadImg);
      title.textContent = c.name; setAppName(c.name);
      if (!c.studentLogin) { clear(note).appendChild(document.createTextNode('這個營隊還沒有開放直接登入，請打開報名系統的「學員專區」，按「進入營隊互動」。')); name.disabled = idk.disabled = btn.disabled = true; }
    }, function () {});
    var go = function () {
      err.textContent = '';
      if (!name.value.trim() || !idk.value.trim()) { err.textContent = '請填姓名與身分證字號'; return; }
      idk.value = idNorm(idk.value);
      if (idk.value.indexOf('@') < 0 && !/^[A-Z][A-Z0-9][0-9]{8}$/.test(idk.value)) { err.textContent = '身分證字號是 10 碼：英文字母開頭，例如 A123456789'; return; }
      busy(btn, function () { return api('studentLogin', camp, name.value, idk.value); }).then(function (r) {
        loggedIn(btn, [name, idk]);
        store(TK, r.token, true);
        try { sessionStorage.removeItem(VK); } catch (e) {}
        if (r.nameNotice) toast(r.nameNotice);
        boot();
      }, function (e) { err.textContent = e.message; });
    };
    btn.addEventListener('click', go);
    [name, idk].forEach(function (x) { x.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); }); });
    screen(h('div', { class: 'login-wrap' }, h('div', { class: 'card login-card col' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, '營'), '學員端'), title,
      field('姓名', name), field('身分證字號', idk), err, btn, note, installTip())));
  }

  /** 登入成功：按鈕維持不能按，等畫面載入（不要又亮起來讓人再按一次） */
  function loggedIn(btn, inputs) {
    btn.disabled = true; btn.textContent = '登入成功，載入中…'; btn.classList.add('btn-ok');
    (inputs || []).forEach(function (x) { x.disabled = true; });
  }

  function workerLogin() {
    var name = inp('', { autocomplete: 'name' }), pass = inp('', { type: 'password' });
    // 股別：用選的（清單來自工作人員名單）；打好姓名自動帶出
    var dept = h('select', { class: 'input' }, h('option', { value: '' }, '請選擇股別'));
    var deptTx = inp('', { placeholder: '例如：輔導、活動、總務' }), deptF = field('股別', dept), deptHint = h('span', { class: 'hint' });
    deptF.appendChild(deptHint);
    var useText = function () { dept.replaceWith(deptTx); dept = deptTx; };
    var err = h('div', { class: 'err' }), title = h('h1', null, '工作人員登入');
    var passF = field('營隊通行碼', pass, '通行碼由籌辦團隊提供');
    api('campPublicInfo', camp).then(function (c) {
      rememberLogo(c.loadImg);
      title.textContent = c.name; setAppName(c.name); if (c.noPass) passF.classList.add('hidden');
      if (!(c.depts || []).length) { useText(); return; }
      c.depts.forEach(function (d) { dept.appendChild(h('option', { value: d }, d)); });
    }, function () { useText(); });
    var lastName = '';
    var detect = function () {
      var n = name.value.trim();
      if (!n || n === lastName || dept.tagName !== 'SELECT') return;
      lastName = n;
      api('workerDepts', camp, n).then(function (ds) {
        if (name.value.trim() !== n) return;
        if (ds.length === 1) { dept.value = ds[0]; deptHint.textContent = '已自動帶出你的股別'; }
        else if (ds.length > 1) deptHint.textContent = '你在 ' + ds.join('、') + '，請選要登入的股別';
        else deptHint.textContent = '名單裡找不到這個名字，請確認姓名';
      }, function () {});
    };
    name.addEventListener('change', detect); name.addEventListener('blur', detect);
    var btn = h('button', { class: 'btn primary' }, '登入');
    var go = function () {
      err.textContent = '';
      if (!dept.value.trim()) { err.textContent = '請選擇股別'; return; }
      busy(btn, function () { return api('workerLogin', camp, name.value, dept.value, pass.value); }).then(function (r) {
        loggedIn(btn, [name, dept, pass]);
        store(TK, r.token, true);
        boot();
      }, function (e) { err.textContent = e.message; });
    };
    btn.addEventListener('click', go);
    [name, deptTx, pass].forEach(function (x) { x.addEventListener('keydown', function (e) { if (e.key === 'Enter') { if (x === name) detect(); go(); } }); });
    screen(h('div', { class: 'login-wrap' }, h('div', { class: 'card login-card col' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, '營'), '工作人員端'), title,
      field('姓名', name), deptF, passF, err, btn, installTip())));
  }

  /* ---------- 加到主畫面（安裝成 App） ---------- */
  var IK = 'ia_install_off_' + camp + '_' + side, deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredPrompt = e; if (S.boot) render(); });
  window.addEventListener('appinstalled', function () { deferredPrompt = null; store(IK, '1', true); if (S.boot) render(); });
  /** 加到主畫面後的名稱：圖示都一樣，所以名稱先寫學員／工作人員，再接營隊名稱（iPhone 大約只顯示前 12 個字） */
  function setAppName(campName) { document.title = homeName(side === 'worker' ? '工人' : '學員', campName) + (preview ? '（預覽）' : ''); }
  setAppName('');
  function standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  function isIos() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1); }
  function inAppBrowser() { return /Line\/|FBAN|FBAV|Instagram|MicroMessenger/i.test(navigator.userAgent); }
  function canInstall() { return !standalone() && (!!deferredPrompt || isIos() || /Android/.test(navigator.userAgent)); }
  function doInstall() {
    if (deferredPrompt) { var e = deferredPrompt; deferredPrompt = null; e.prompt(); (e.userChoice || Promise.resolve()).then(function (c) { if (c && c.outcome === 'accepted') store(IK, '1', true); if (S.boot) render(); }); return; }
    var steps = inAppBrowser() ? ['先點右上角（或右下角）的選單，選「用預設瀏覽器開啟」或「用 Safari 開啟」', '再照下面的步驟加到主畫面']
      : isIos() ? ['點 Safari 下方（或網址列旁）的分享按鈕（方框加箭頭）', '往下滑，選「加入主畫面」', '右上角按「加入」']
      : ['點瀏覽器右上角的選單（⋮）', '選「加到主畫面」或「安裝應用程式」', '按「安裝」或「新增」'];
    modal({ title: '加到主畫面', body: h('div', { class: 'col', style: { gap: '10px' } },
      h('ol', { class: 'install-steps' }, steps.map(function (t) { return h('li', null, t); })),
      h('p', { class: 'small muted', style: { margin: 0 } }, '主畫面上的名稱會是「' + document.title.replace('（預覽）', '') + '」，加的時候也可以自己改。之後從主畫面打開，就像 App 一樣。' + (isIos() ? 'iPhone 從主畫面打開時要再登入一次。' : ''))) });
  }
  function installBanner() {
    var bn = h('div', { class: 'install-banner' }, h('span', { class: 'brand-mark' }, '營'),
      h('div', { class: 'grow' }, h('b', null, '加到主畫面'), h('div', { class: 'small muted' }, '之後一鍵打開，不用再找連結')),
      h('button', { class: 'btn primary sm', onclick: doInstall }, '加入'),
      h('button', { class: 'btn ghost sm', 'aria-label': '不要再顯示', onclick: function () { store(IK, '1', true); bn.remove(); } }, '✕'));
    return bn;
  }
  /** 登入畫面的小提示：iPhone 主畫面的 App 和 Safari 分開登入，所以建議先加再登入 */
  function installTip() {
    if (!canInstall()) return null;
    return h('button', { class: 'btn ghost sm install-tip', type: 'button', onclick: doInstall }, '＋ 加到主畫面' + (isIos() ? '（建議先加，再從主畫面打開登入）' : ''));
  }

  function boot() {
    if (!preview) IA.token = store(TK);
    var ver = '';
    if (preview === 'draft') ver = 'draft';
    else if (!preview) { try { ver = sessionStorage.getItem(VK) || ''; } catch (e) {} }
    if (!S.boot && !root.querySelector('.login-card')) waitScreen('載入中…', '');
    // live：打開時順便把所有動態區塊的資料一起拿回來（少一次請求，很多人同時打開時不用排那麼久）
    api('frontBoot', camp, side, ver, simNow(), { live: true }).then(function (b) {
      S.offline = false;
      if (b.camp) rememberLogo(b.camp.loadImg);
      if (!b.snapshot) { msgScreen(b.camp.name, side === 'student' ? '學員端還沒有發布內容，晚點再來看看。' : '工作人員端還沒有發布內容。', logoutBtn()); return; }
      if (b.live) {
        Object.keys(b.live).forEach(function (k) { S.live[k] = b.live[k]; });
        S.freshAt = Date.now(); S.prefetched = true;
        if (!preview) jset(LK, S.live);
      }
      if (!preview) { try { sessionStorage.setItem(VK, b.snapshot.ver); } catch (e) {} jset(BK, Object.assign({}, b, { live: null })); }
      show(b);
    }, function (e) {
      var cached = !preview && jget(BK, null);
      if (e.code === 'NET' && cached) { S.offline = true; show(cached); return; }
      msgScreen('無法載入', e.message, h('button', { class: 'btn primary', onclick: boot }, '重試'));
    });
  }

  /** 重新整理：拿最新發布的版本和資料（不用整頁重新載入） */
  function refresh() {
    try { sessionStorage.removeItem(VK); } catch (e) {}
    S.prefetched = false; S.scrolled = {}; S.flipNext = true;
    Object.keys(S.live).forEach(function (k) { delete S.live[k]; });
    var rb = root.querySelector('.refresh-btn'); if (rb) rb.classList.add('spinning');
    toast('重新整理中…');
    boot();
  }
  function logoutBtn() {
    if (preview) return null;
    return h('button', { class: 'btn sm', onclick: function () {
      api('logout').catch(function () {}); store(TK, null); jset(BK, null); try { sessionStorage.removeItem(VK); } catch (e) {}
      // 共用手機：上一個人的區塊資料也清掉，下一個人登入不會先看到
      jset(LK, null); Object.keys(S.live).forEach(function (k) { delete S.live[k]; });
      start();
    } }, side === 'worker' ? '登出' : '離開');
  }

  function roots() {
    return S.boot.snapshot.pages.filter(function (p) { return p.fixed && !p.parent; }).sort(function (a, b) { return a.ord - b.ord; });
  }

  function show(b) {
    S.boot = b;
    setAppName(b.camp && b.camp.name);
    // 上次載入過的區塊資料先拿來用（打開馬上有內容），背景再更新
    if (!preview && !Object.keys(S.live).length) { var cl = jget(LK, null); if (cl) Object.keys(cl).forEach(function (k) { S.live[k] = cl[k]; }); }
    var snap = b.snapshot;
    S.env = { pages: snap.pages, blocks: snap.blocks.slice(), packages: snap.packages || {}, live: S.live, side: side, me: b.me, preview: !!preview, nav: nav,
      action: function (pkg, name, data) { return op('front.action', { camp: camp, target: { pkg: pkg, action: name, side: side }, data: data }); },
      reload: function () { loadLive(); } };
    var em = b.ext && b.ext.emergency;
    S.nightCfg = em || null;
    S.night = em && em.nightStart ? nightNow() : !!(em && em.night);
    S.env.night = S.night;
    S.env.fx = fx();
    rowFlipTimers();
    var start = (location.hash.match(/#p=([\w]+)/) || [])[1];
    var home = roots()[0];
    S.cur = start && Front.pageById(S.env, start) ? start : (home ? home.id : '');
    window.onhashchange = function () { var p = (location.hash.match(/#p=([\w]+)/) || [])[1]; if (p && p !== S.cur && Front.pageById(S.env, p)) { S.cur = p; render(); } else if (!p && home) { S.cur = home.id; render(); } };
    render();
    // 大約每分鐘更新一次，每個人隨機錯開（50～70 秒），不會所有手機在同一秒一起問伺服器
    clearTimeout(S.timer);
    var loop = function () { tick(); S.timer = setTimeout(loop, 50000 + Math.random() * 20000); };
    S.timer = setTimeout(loop, 50000 + Math.random() * 20000);
  }

  function nav(pid) {
    if (!Front.pageById(S.env, pid)) { toast('這一頁目前看不到'); return; }
    location.hash = 'p=' + pid;
  }

  function nightNow() {
    var c = S.nightCfg;
    if (!c || !/^\d\d:\d\d$/.test(c.nightStart || '') || !/^\d\d:\d\d$/.test(c.nightEnd || '') || c.nightStart === c.nightEnd) return false;
    var tp = taipei(), t = tp.hm;
    if (!(c.nightStart < c.nightEnd ? (t >= c.nightStart && t < c.nightEnd) : (t >= c.nightStart || t < c.nightEnd))) return false;
    // 只在營期內的晚上：凌晨（夜間結束前）算前一天晚上
    if (c.campStart && c.campEnd) { var nd = t < c.nightEnd && c.nightStart > c.nightEnd ? taipei(new Date(nowDate().getTime() - 86400000)).ymd : tp.ymd; if (nd < c.campStart || nd >= c.campEnd) return false; }
    return true;
  }

  function tick() {
    if (document.hidden) return;
    var n = nightNow();
    if (n !== S.night) { S.night = n; S.env.night = n; render(); return; }
    loadLive();
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.env) setTimeout(loadLive, Math.random() * 2000); });
  // 整分鐘：現在線往下走、時間 +1（不用等下一次向伺服器拿資料）
  onMinute(function () { if (body && !document.hidden) Front.markNow(body); });   // 很多人一起打開手機時錯開一點

  /** 夜間模式：學員首頁最上面放緊急聯絡與明日行程（夜間不是鎖死其他資訊） */
  function nightBlocks(pid) {
    var home = roots()[0];
    if (!S.night || side !== 'student' || !home || pid !== home.id) return [];
    var hasEm = S.env.packages.emergency && !S.env.packages.emergency.missing;
    var out = [];
    if (hasEm || S.boot.ext.emergency) out.push({ id: 'zzNightEm', page: pid, ord: -2, type: 'pkg', data: { pkg: 'emergency', view: 'student' } });
    if (S.env.packages.studentflow && !S.env.packages.studentflow.missing) out.push({ id: 'zzNightTm', page: pid, ord: -1, type: 'pkg', data: { pkg: 'studentflow', view: 'tomorrow' } });
    return out;
  }

  /** 緊急聯絡的區塊加上 calm（不播任何動畫）；回傳這頁有沒有緊急聯絡 */
  function calmMark(box) {
    var any = false;
    S.env.blocks.forEach(function (b) {
      if (b.type !== 'pkg' || !b.data || b.data.pkg !== 'emergency') return;
      var n = box.querySelector('[data-bid="' + b.id + '"]');
      if (n) { n.classList.add('calm'); if (b.id.indexOf('zzNight') !== 0) any = true; }
    });
    return any;
  }
  /** 動畫管理（管理端「動畫管理」）的設定；舊後端沒有就全部照預設 */
  var FX_DFLT = { cardFlip: true, slide: true, rowFlip: true, rowDelay: 30, rowEvery: 3, dayBg: true, dawnEnd: '08:00', morningEnd: '11:00', noonEnd: '13:00', nightSky: true, tierFx: true, firstDeco: true };
  function fx() { var f = (S.boot && S.boot.camp && S.boot.camp.fx) || {}, o = {}; Object.keys(FX_DFLT).forEach(function (k) { o[k] = f[k] === undefined ? FX_DFLT[k] : f[k]; }); o.tiers = f.tiers || [{ min: 0, name: '起步' }, { min: 100, name: '加溫' }, { min: 200, name: '火熱' }, { min: 350, name: '閃耀' }, { min: 500, name: '傳奇' }]; return o; }
  /** 翻牌（只有學員端）：打開 30 秒後，時程、小隊分數像時刻表一樣一列一列翻一次，之後每 3 分鐘再翻一輪；
   *  內容有變（下一項、名次、分數）就翻那一塊。一開始不翻，免得還沒看清楚就在動；緊急聯絡不翻 */
  var FLIP_SEL = '.sched > .it, .sched > .day, .board .r, .sb-mini';
  /** 這張卡片是流程或分數（翻牌）；其他卡片用滑的 */
  function isFlipCard(c) { return c.classList.contains('sb-mini') || !!c.querySelector('.sched, .board, .sb-mini'); }
  function flipRows(box) {
    if (side !== 'student' || !box || !motionOk() || !fx().rowFlip || Date.now() < S.flipAt) return false;
    var rows = $all(FLIP_SEL, box).filter(function (el) { return !el.closest('.calm') && el.offsetParent; });
    if (!rows.length) return false;
    // 先全部拿掉、只強制排版一次，再一起加上（每列各排一次版會卡）
    rows.forEach(function (el) { el.classList.remove('flip'); });
    void box.offsetWidth;
    rows.forEach(function (el, i) { el.style.setProperty('--fi', Math.min(i, 12)); el.classList.add('flip'); });
    setTimeout(function () { rows.forEach(function (el) { el.classList.remove('flip'); }); }, 750 + Math.min(rows.length - 1, 12) * 70);
    return true;
  }
  /** 定時翻列：打開幾秒後翻第一輪，之後每幾分鐘一輪（秒數、間隔在動畫管理設定） */
  function rowFlipTimers() {
    if (side !== 'student' || S.rowTimers) return;
    var f = fx(), wait = Math.max(0, f.rowDelay * 1000 - (Date.now() - S.t0));
    S.flipAt = S.t0 + f.rowDelay * 1000;
    S.rowTimers = setTimeout(function tick() { if (body && !document.hidden) flipRows(body); S.rowTimers = setTimeout(tick, Math.max(1, fx().rowEvery) * 60000); }, wait);
  }
  /** 夜間的星空：隨機位置的星星一閃一閃，偶爾劃過流星（只建一次，換頁沿用） */
  function skyLayer() {
    var sky = h('div', { class: 'sky', 'aria-hidden': 'true' });
    for (var i = 0; i < 46; i++) {
      var s = 1 + Math.random() * 2.2;
      sky.appendChild(h('i', { style: { left: (Math.random() * 100).toFixed(1) + '%', top: (Math.random() * 70).toFixed(1) + '%', width: s.toFixed(1) + 'px', height: s.toFixed(1) + 'px', animationDelay: (Math.random() * 5).toFixed(2) + 's', animationDuration: (2.5 + Math.random() * 3).toFixed(2) + 's' } }));
    }
    sky.appendChild(h('b', { class: 'meteor' })); sky.appendChild(h('b', { class: 'meteor m2' }));
    return sky;
  }
  /** 白天分四種背景：清晨、早上、中午、午後（到夜間模式）；分界時間在管理端「動畫管理」設定，預設 08:00／11:00／13:00 */
  function dayPart() {
    var hm = taipei().hm, c = fx();
    return hm < c.dawnEnd ? 'dawn' : hm < c.morningEnd ? 'morning' : hm < c.noonEnd ? 'noon' : 'afternoon';
  }
  function dayTone() { if (S.amb) { var t = dayPart(); if (S.amb.dataset.tod !== t) { S.amb.className = 'amb tod-' + t; S.amb.dataset.tod = t; } } }
  onMinute(dayTone);
  /** 白天的背景：慢慢飄的光暈、右上角呼吸的陽光、兩朵飄過的雲、往上飄的小光點（只建一次，換頁沿用） */
  function dayLayer() {
    var t0 = dayPart(), amb = h('div', { class: 'amb tod-' + t0, 'data-tod': t0, 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('b', { class: 'sun' }), h('b', { class: 'cloud' }), h('b', { class: 'cloud c2' }));
    var cols = ['63, 122, 128', '200, 128, 58', '119, 112, 138', '224, 163, 94'];
    for (var i = 0; i < 16; i++) {
      var sz = 5 + Math.random() * 8, dur = 16 + Math.random() * 14;
      amb.appendChild(h('span', { class: 'pt', style: { left: (Math.random() * 100).toFixed(1) + '%', width: sz.toFixed(1) + 'px', height: sz.toFixed(1) + 'px', background: 'rgba(' + cols[i % cols.length] + ', .4)', animationDuration: dur.toFixed(1) + 's', animationDelay: '-' + (Math.random() * dur).toFixed(1) + 's' } }));
    }
    return amb;
  }
  var body;
  function render() {
    var b = S.boot, rs = roots();
    S.env.blocks = b.snapshot.blocks.filter(function (x) { return x.id.indexOf('zzNight') !== 0; }).concat(nightBlocks(S.cur));
    root.classList.toggle('night', S.night && side === 'student');
    var cur = Front.pageById(S.env, S.cur);
    var rootOf = cur;
    while (rootOf && rootOf.parent) rootOf = Front.pageById(S.env, rootOf.parent);
    var head = h('div', { class: 'app-head' },
      cur && cur.parent ? h('button', { class: 'btn ghost sm', onclick: function () { history.back(); }, 'aria-label': '返回' }, icon('back')) : h('span', { class: 'brand-mark' }, '營'),
      h('div', { class: 'grow' }, h('div', { class: 'small muted' }, b.camp.name + (b.me && b.me.name ? ' · ' + b.me.name : '')), h('h1', null, cur ? cur.title : '')),
      h('button', { class: 'btn ghost sm refresh-btn', title: '重新整理（拿最新內容）', 'aria-label': '重新整理', onclick: refresh }, h('span', { class: 'rf-ic', 'aria-hidden': 'true' }, icon('refresh', 18)), h('span', { class: 'rf-tx' }, '重新整理')),
      logoutBtn());
    var banners = [];
    if (preview) banners.push(h('div', { class: 'recall-banner row wrap', style: { gap: '8px' } }, h('span', { class: 'grow' }, preview === 'draft' ? '預覽：目前的草稿（還沒發布）' : '預覽：目前發布的第 ' + b.snapshot.ver + ' 版'), simBox()));
    if (b.recall) banners.push(h('div', { class: 'recall-banner' }, '營隊已結束，這裡是回憶模式：內容保留，不會再更新。'));
    if (S.offline) banners.push(h('div', { class: 'recall-banner' }, '目前離線，顯示上次載入的內容。'));
    if (!preview && rs[0] && S.cur === rs[0].id && canInstall() && !store(IK)) banners.push(installBanner());
    if (S.night && side === 'worker') banners.push(h('div', { class: 'night-banner' }, icon('moon'), '夜間時段：學員端已切換為夜間模式'));
    body = h('div', { class: 'app-body' }, banners);
    var content = h('div', { class: 'col page-content', style: { gap: '12px' } });
    body.appendChild(content);
    Front.page(content, S.cur, S.env);
    // 緊急聯絡維持不動；其他頁背景有慢慢飄的光暈，夜間模式是星空和流星
    var hasEm = calmMark(content);
    var F = fx();
    var deco = side !== 'student' ? null : S.night ? (F.nightSky ? (S.sky = S.sky || skyLayer()) : null) : hasEm || !F.dayBg ? null : (S.amb = S.amb || dayLayer());
    // 換頁動畫：區塊一個接一個淡入；切到右邊的分頁或往下一層從右邊滑進來，反過來從左邊
    var prev = S.shown, enter = prev !== S.cur;
    S.shown = S.cur;
    var flipIn = S.flipNext && side === 'student'; S.flipNext = false;
    if ((enter || flipIn) && motionOk() && (F.slide || (F.cardFlip && side === 'student'))) {
      // 換頁、重新整理：卡片一張接一張滑進來（切到右邊的分頁或往下一層從右邊，反過來從左邊）；學員端的流程和分數卡片改成翻牌
      var pi = -1, ni = -1, pp = prev && Front.pageById(S.env, prev);
      rs.forEach(function (p, i) { if (pp && (p.id === prev || p.id === (pp.parent || ''))) pi = i; if (rootOf && p.id === rootOf.id) ni = i; });
      var dir = !enter || !prev ? '' : cur && cur.parent === prev ? 'from-r' : pp && pp.parent === S.cur ? 'from-l' : pi >= 0 && ni >= 0 && pi !== ni ? (ni > pi ? 'from-r' : 'from-l') : '';
      $all(':scope > *', content).forEach(function (c, i) {
        c.style.setProperty('--i', Math.min(i, 8));
        if (!F.cardFlip || side !== 'student' || c.classList.contains('calm') || !isFlipCard(c)) return;
        c.style.setProperty('--fi', Math.min(i, 8));
        c.classList.add('flip');
        setTimeout(function () { c.classList.remove('flip'); }, 750 + Math.min(i, 8) * 70);
      });
      if (F.slide) content.classList.add('pg-in');
      if (F.slide && dir) content.classList.add(dir);
      setTimeout(function () { content.classList.remove('pg-in', 'from-r', 'from-l'); }, 1000);
      $all('[data-count]', content).forEach(function (x) { countUp(x, 0, Number(x.dataset.count)); });
    }
    var navEl;
    if (side === 'student') {
      navEl = h('nav', { class: 'app-tabs', 'aria-label': '主選單' }, rs.map(function (p) {
        return h('button', { class: rootOf && rootOf.id === p.id ? 'on' : '', onclick: function () { nav(p.id); } }, icon(p.icon || 'page'), p.title);
      }));
      if (enter && rootOf && S.tabRoot !== rootOf.id) navEl.classList.add('moved');
      S.tabRoot = rootOf && rootOf.id;
      screen(h('div', { style: { display: 'contents' } }, deco, head, body, navEl));
    } else {
      navEl = h('nav', { class: 'wk-menu', 'aria-label': '主選單' }, rs.map(function (p) {
        return h('button', { class: rootOf && rootOf.id === p.id ? 'on' : '', onclick: function () { nav(p.id); } }, p.title);
      }));
      screen(h('div', { style: { display: 'contents' } }, head, navEl, body));
    }
    window.scrollTo(0, 0);
    loadLive();
  }

  /** 預覽可以設定模擬時間：看某個時間點的「現在主題」、目前時程、夜間模式 */
  function simBox() {
    var v = simNow(), inp2 = h('input', { type: 'datetime-local', class: 'input', style: { width: '200px', height: '32px' } });
    if (v) { var t = taipei(new Date(v)); inp2.value = t.ymd + 'T' + t.hm; }
    var apply = function (iso) { try { if (iso) sessionStorage.setItem('ia_sim', iso); else sessionStorage.removeItem('ia_sim'); } catch (e) {} S.scrolled = {}; S.prefetched = false; Object.keys(S.live).forEach(function (k) { delete S.live[k]; }); boot(); };
    inp2.addEventListener('change', function () { if (inp2.value) apply(new Date(inp2.value + ':00+08:00').toISOString()); });
    return h('span', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'small' }, '模擬時間'), inp2, v ? h('button', { class: 'btn sm', onclick: function () { apply(''); } }, '回到現在') : null);
  }
  /** 拿到的區塊資料：有變的才重畫（正在填的表單不會被洗掉） */
  function applyLive(r) {
    var changed = Object.keys(r.live).filter(function (k) { return JSON.stringify(S.live[k]) !== JSON.stringify(r.live[k]); });
    var first = {};
    changed.forEach(function (k) { first[k] = S.live[k] === undefined; S.live[k] = r.live[k]; });
    if (!preview) jset(LK, S.live);
    if (!body) return;
    changed.forEach(function (k) {
      var old = body.querySelector('[data-bid="' + k + '"]'), b = S.env.blocks.filter(function (x) { return x.id === k; })[0];
      if (!old || !b) return;
      var n = Front.block(b, S.env);
      if (!n) { old.remove(); return; }
      n.dataset.bid = k;
      // 第一次拿到資料：淡入；之後內容有變：閃一下，分數從舊的數字跳到新的
      var olds = $all('[data-count]', old).map(function (x) { return Number(x.dataset.count); });
      var i = old.style.getPropertyValue('--i'); if (i) n.style.setProperty('--i', i);
      if (old.classList.contains('calm')) n.classList.add('calm');
      old.replaceWith(n);
      if (n.classList.contains('calm')) return;
      if (!motionOk()) return;
      if (first[k] || !flipRows(n)) n.classList.add(first[k] ? 'live-in' : 'live-upd');
      $all('[data-count]', n).forEach(function (x, j) { countUp(x, first[k] ? 0 : (olds[j] === undefined ? Number(x.dataset.count) : olds[j]), Number(x.dataset.count)); });
    });
    afterDraw();
  }
  /** 標出現在的時程；時程清單的小視窗第一次畫好時把現在捲到中間（之後可以自己捲，不會被拉回去） */
  function afterDraw() {
    if (!body) return;
    Front.markNow(body);
    setTimeout(function () { Front.centerNow(body); }, 0);
  }
  /** 背景先把其他頁的資料抓好：首頁、緊急聯絡優先，切過去就不用等 */
  function prefetch() {
    if (S.offline || !S.env || S.prefetched) return;
    S.prefetched = true;
    var rs = roots(), first = [], rest = [];
    var emPages = {};
    S.env.blocks.forEach(function (b) { if (b.type === 'pkg' && b.data && b.data.pkg === 'emergency') emPages[b.page] = 1; });
    S.env.pages.forEach(function (p) { if (p.id === S.cur) return; ((rs[0] && p.id === rs[0].id) || emPages[p.id] ? first : rest).push(p.id); });
    var all = [];
    first.concat(rest).forEach(function (pid) { Front.liveBlocks(S.env, pid).forEach(function (b) { if (!all.some(function (x) { return x.id === b.id; })) all.push(b); }); });
    var chunks = [];
    for (var i = 0; i < all.length; i += 20) chunks.push(all.slice(i, i + 20));
    chunks.reduce(function (p, list) { return p.then(function () { return api('frontLive', camp, side, list, simNow()).then(applyLive, function () {}); }); }, Promise.resolve());
  }

  function loadLive() {
    if (S.offline || !S.env) return;
    var list = Front.liveBlocks(S.env, S.cur);
    // 剛打開時已經一起拿到了：20 秒內只補還沒有的（例如夜間模式加的區塊）
    if (S.freshAt && Date.now() - S.freshAt < 20000) list = list.filter(function (b) { return S.live[b.id] === undefined; });
    if (!list.length) { afterDraw(); prefetch(); return; }
    api('frontLive', camp, side, list, simNow()).then(function (r) {
      applyLive(r);
      S.liveFail = 0;
      prefetch();
    }, function (e) {
      if (e.code !== 'NET') { fail(e); return; }
      // 連線不穩：不要等一分鐘，5 秒、15 秒後再試；還在「載入中」的區塊改成提示
      S.liveFail = (S.liveFail || 0) + 1;
      if (body) list.forEach(function (b) { var el = body.querySelector('[data-bid="' + b.id + '"]'); if (el && S.live[b.id] === undefined) el.textContent = '連線不穩，正在重試…'; });
      if (S.liveFail <= 3) { clearTimeout(S.liveT); S.liveT = setTimeout(loadLive, S.liveFail === 1 ? 5000 : 15000); }
    });
  }

  start();
})();
