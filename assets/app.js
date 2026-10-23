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
  var S = { boot: null, env: null, cur: '', stack: [], live: {}, timer: null, offline: false, night: false, scrolled: {} };
  var LK = 'ia_live_' + camp + '_' + side;
  SIM_OK_ = !!preview;

  root.classList.toggle('worker', side === 'worker');
  // 工作人員端換靛藍色，和學員端分開（彈出視窗掛在 body 上，所以加在 html）
  document.documentElement.classList.toggle('side-worker', side === 'worker');
  if (side === 'worker') { var tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.content = '#3b4f8c'; }

  function screen(node) { clear(root); root.appendChild(node); }
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
    if (!camp) { msgScreen('網址不完整', '請從報名系統的學員專區，或籌辦團隊給你的連結進入。'); return; }
    var m = location.hash.match(/[#&]t=([^&]+)/);
    if (m && side === 'student' && !preview) {
      history.replaceState(null, '', location.pathname + location.search);
      msgScreen('正在進入…', '');
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
    var name = inp('', { autocomplete: 'name' }), idk = inp('', { autocomplete: 'off', placeholder: '例如：A123456789' });
    var err = h('div', { class: 'err' }), title = h('h1', null, '學員登入'), btn = h('button', { class: 'btn primary' }, '進入');
    var note = h('p', { class: 'small muted', style: { margin: 0 } }, '用報名時填的姓名和身分證字號登入（沒有填身分證的營隊，請改填報名時的 Email）。也可以從報名系統的「學員專區」按「進入營隊互動」。');
    api('campPublicInfo', camp).then(function (c) {
      title.textContent = c.name; setAppName(c.name);
      if (!c.studentLogin) { clear(note).appendChild(document.createTextNode('這個營隊還沒有開放直接登入，請打開報名系統的「學員專區」，按「進入營隊互動」。')); name.disabled = idk.disabled = btn.disabled = true; }
    }, function () {});
    var go = function () {
      err.textContent = '';
      if (!name.value.trim() || !idk.value.trim()) { err.textContent = '請填姓名與身分證字號'; return; }
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
    btn.disabled = true; btn.textContent = '登入成功，載入中…';
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
  function setAppName(campName) { document.title = homeName(side === 'worker' ? '工作' : '學員', campName) + (preview ? '（預覽）' : ''); }
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
    api('frontBoot', camp, side, ver, simNow()).then(function (b) {
      S.offline = false;
      if (!b.snapshot) { msgScreen(b.camp.name, side === 'student' ? '學員端還沒有發布內容，晚點再來看看。' : '工作人員端還沒有發布內容。', logoutBtn()); return; }
      if (!preview) { try { sessionStorage.setItem(VK, b.snapshot.ver); } catch (e) {} jset(BK, b); }
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
    S.prefetched = false; S.scrolled = {};
    Object.keys(S.live).forEach(function (k) { delete S.live[k]; });
    toast('重新整理中…');
    boot();
  }
  function logoutBtn() {
    if (preview) return null;
    return h('button', { class: 'btn sm', onclick: function () { api('logout').catch(function () {}); store(TK, null); jset(BK, null); try { sessionStorage.removeItem(VK); } catch (e) {} start(); } }, side === 'worker' ? '登出' : '離開');
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
      action: function (pkg, name, data) { return op('front.action', { camp: camp, target: { pkg: pkg, action: name, side: side }, data: data }); } };
    var em = b.ext && b.ext.emergency;
    S.nightCfg = em || null;
    S.night = em && em.nightStart ? nightNow() : !!(em && em.night);
    S.env.night = S.night;
    var start = (location.hash.match(/#p=([\w]+)/) || [])[1];
    var home = roots()[0];
    S.cur = start && Front.pageById(S.env, start) ? start : (home ? home.id : '');
    window.onhashchange = function () { var p = (location.hash.match(/#p=([\w]+)/) || [])[1]; if (p && p !== S.cur && Front.pageById(S.env, p)) { S.cur = p; render(); } else if (!p && home) { S.cur = home.id; render(); } };
    render();
    clearInterval(S.timer);
    S.timer = setInterval(tick, 60000);
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
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.env) loadLive(); });

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
      h('button', { class: 'btn ghost sm refresh-btn', title: '重新整理（拿最新內容）', 'aria-label': '重新整理', onclick: refresh }, h('span', { class: 'rf-ic', 'aria-hidden': 'true' }, '⟳'), h('span', { class: 'rf-tx' }, '重新整理')),
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
    var navEl;
    if (side === 'student') {
      navEl = h('nav', { class: 'app-tabs', 'aria-label': '主選單' }, rs.map(function (p) {
        return h('button', { class: rootOf && rootOf.id === p.id ? 'on' : '', onclick: function () { nav(p.id); } }, icon(p.icon || 'page'), p.title);
      }));
      screen(h('div', { style: { display: 'contents' } }, head, body, navEl));
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
    changed.forEach(function (k) { S.live[k] = r.live[k]; });
    if (!preview) jset(LK, S.live);
    if (!body) return;
    changed.forEach(function (k) {
      var old = body.querySelector('[data-bid="' + k + '"]'), b = S.env.blocks.filter(function (x) { return x.id === k; })[0];
      if (!old || !b) return;
      var n = Front.block(b, S.env);
      if (n) { n.dataset.bid = k; old.replaceWith(n); } else old.remove();
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
