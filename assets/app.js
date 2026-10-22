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
  var S = { boot: null, env: null, cur: '', stack: [], live: {}, timer: null, offline: false, night: false };

  root.classList.toggle('worker', side === 'worker');

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
    if (!store(TK)) { side === 'worker' ? workerLogin() : msgScreen('請從學員專區進入', '打開報名系統的「學員專區」，按「進入營隊互動」就會自動登入。'); return; }
    boot();
  }

  function workerLogin() {
    var name = inp('', { autocomplete: 'name' }), dept = inp('', { placeholder: '例如：輔導、活動、總務' }), pass = inp('', { type: 'password' });
    var err = h('div', { class: 'err' }), title = h('h1', null, '工作人員登入');
    api('campPublicInfo', camp).then(function (c) { title.textContent = c.name; }, function () {});
    var btn = h('button', { class: 'btn primary' }, '登入');
    var go = function () {
      err.textContent = '';
      busy(btn, function () { return api('workerLogin', camp, name.value, dept.value, pass.value); }).then(function (r) {
        store(TK, r.token, true);
        boot();
      }, function (e) { err.textContent = e.message; });
    };
    btn.addEventListener('click', go);
    pass.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    screen(h('div', { class: 'login-wrap' }, h('div', { class: 'card login-card col' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, '營'), '工作人員端'), title,
      field('姓名', name), field('股別', dept), field('營隊通行碼', pass, '通行碼由籌辦團隊提供'), err, btn)));
  }

  function boot() {
    if (!preview) IA.token = store(TK);
    var ver = '';
    if (preview === 'draft') ver = 'draft';
    else if (!preview) { try { ver = sessionStorage.getItem(VK) || ''; } catch (e) {} }
    api('frontBoot', camp, side, ver).then(function (b) {
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

  function logoutBtn() {
    if (preview) return null;
    return h('button', { class: 'btn sm', onclick: function () { api('logout').catch(function () {}); store(TK, null); jset(BK, null); try { sessionStorage.removeItem(VK); } catch (e) {} start(); } }, side === 'worker' ? '登出' : '離開');
  }

  function roots() {
    return S.boot.snapshot.pages.filter(function (p) { return p.fixed && !p.parent; }).sort(function (a, b) { return a.ord - b.ord; });
  }

  function show(b) {
    S.boot = b;
    var snap = b.snapshot;
    S.env = { pages: snap.pages, blocks: snap.blocks.slice(), packages: snap.packages || {}, live: S.live, side: side, me: b.me, preview: !!preview, nav: nav,
      action: function (pkg, name, data) { return op('front.action', { camp: camp, target: { pkg: pkg, action: name, side: side }, data: data }); } };
    var em = b.ext && b.ext.emergency;
    S.nightCfg = em || null;
    S.night = !!(em && em.night);
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
    var t = taipei().hm;
    return c.nightStart < c.nightEnd ? (t >= c.nightStart && t < c.nightEnd) : (t >= c.nightStart || t < c.nightEnd);
  }

  function tick() {
    if (document.hidden) return;
    var n = nightNow();
    if (n !== S.night) { S.night = n; render(); return; }
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
      logoutBtn());
    var banners = [];
    if (preview) banners.push(h('div', { class: 'recall-banner' }, preview === 'draft' ? '預覽：目前的草稿（還沒發布）' : '預覽：目前發布的第 ' + b.snapshot.ver + ' 版'));
    if (b.recall) banners.push(h('div', { class: 'recall-banner' }, '營隊已結束，這裡是回憶模式：內容保留，不會再更新。'));
    if (S.offline) banners.push(h('div', { class: 'recall-banner' }, '目前離線，顯示上次載入的內容。'));
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

  function loadLive() {
    if (S.offline || !S.env) return;
    var list = Front.liveBlocks(S.env, S.cur);
    if (!list.length) return;
    var pid = S.cur;
    api('frontLive', camp, side, list).then(function (r) {
      // 只換掉資料有變的區塊，正在填的表單不會被洗掉
      var changed = Object.keys(r.live).filter(function (k) { return JSON.stringify(S.live[k]) !== JSON.stringify(r.live[k]); });
      changed.forEach(function (k) { S.live[k] = r.live[k]; });
      if (pid !== S.cur || !body) return;
      changed.forEach(function (k) {
        var old = body.querySelector('[data-bid="' + k + '"]'), b = S.env.blocks.filter(function (x) { return x.id === k; })[0];
        if (!old || !b) return;
        var n = Front.block(b, S.env);
        if (n) { n.dataset.bid = k; old.replaceWith(n); } else old.remove();
      });
    }, function (e) { if (e.code !== 'NET') fail(e); });
  }

  start();
})();
