/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 各 Package 的資料畫面（#data/<pkg>/<分頁>）。資料寫入一律走 pkg.data（Package 的 adminOps）。
 * 同一筆資料被別人先改了會回 CONFLICT，畫面會重新載入讓你看到最新內容。
 */

var PkgAdmin = (function () {
  var R = null, M = null, TAB = '', Q = {}, FLASH = '';
  /** 這個 Package 的編輯鎖：mine＝在我這個分頁；other＝別人（或我的另一個分頁）正在編輯 */
  var LK = { pkg: '', mine: false, other: false, timer: null, last: 0, hash: '' };

  var SEQ = 0;   // 每次開畫面／重新載入加一：舊的回應（例如網路慢、換了頁才回來）直接丟掉，不會蓋掉現在這頁
  function open(m, pkg, tab, q) {
    M = m; TAB = tab; Q = q || {};
    if (LK.pkg !== pkg) { lockRelease(); clearInterval(LK.timer); LK = { pkg: pkg, mine: false, other: false, timer: setInterval(ping, 60000), last: 0, hash: '' }; R = null; }
    LK.hash = location.hash;
    A.leaving = leaving;
    m.appendChild(h('div', { class: 'empty loading' }, '載入中…'));
    load(pkg, true);
  }
  /** cached：剛打開這頁時先用上次的資料（改完資料後的重新載入一定抓最新的） */
  function load(pkg, cached) {
    pkg = pkg || R.pkg;
    var seq = ++SEQ, hash = location.hash, show = function (r) {
      if (seq !== SEQ || location.hash !== hash || pkg !== LK.pkg) return;
      R = r; R.canEditReal = r.canEdit;
      var L = r.lock || {};
      LK.mine = !!L.mine; LK.other = !!(L.held && !L.mine);   // 伺服器依這個分頁算好的，不用再問一次（快取的資料和最新的不同時，馬上會再畫一次）
      render();
    };
    var p = cached ? apiCached('getPkgAdmin', [A.camp, pkg, pageTab()], show) : api('getPkgAdmin', A.camp, pkg, pageTab()).then(function (r) { apiCachePut('getPkgAdmin', [A.camp, pkg, pageTab()], r); show(r, true); });
    return p.then(null, function (e) { if (seq === SEQ && location.hash === hash) clear(M).appendChild(h('div', { class: 'card' }, h('h2', null, '無法開啟'), h('p', null, e.message))); });
  }
  function reload() { return load(R.pkg); }

  /* ---------------- 編輯鎖（每個 Package 一把，第一次改動時自動取得） ---------------- */
  document.addEventListener('input', function () { LK.last = Date.now(); }, true);
  document.addEventListener('click', function () { LK.last = Date.now(); }, true);
  function lockState(r) {
    if (!R || !r) return;
    var was = LK.other;
    LK.mine = !!r.mine;
    LK.other = !!(r.lock && r.lock.held && !r.mine);
    R.lock = r.lock;
    if (was === LK.other) { lockBar(); return; }
    // 狀態真的變了才重畫（不重新抓資料）；有沒存的改動就只換提示列，不蓋掉正在改的內容
    if (!LK.other) toast('對方已結束編輯，現在可以編輯了');
    if (dirtyAny()) { R.canEdit = R.canEditReal && !LK.other; lockBar(); }
    else render();
  }
  var PINGING = false;
  function ping() {
    if (!LK.pkg || !R || document.hidden || PINGING || navigator.onLine === false) return;
    if (!LK.mine && !LK.other) return;   // 沒有人在編輯：不用每分鐘問；有人開始改，自己取得鎖時就會知道
    PINGING = true;
    op('pkglock.ping', { camp: A.camp, data: { pkg: LK.pkg, tab: pageTab(), active: Date.now() - LK.last < 60000 } }).then(function (r) { PINGING = false; lockState(r); }, function () { PINGING = false; });
  }
  /** 開始改動：取得鎖；別人搶先了就回到唯讀 */
  function takeLock() {
    if (LK.mine || LK.taking || !R || !R.canEditReal) return;
    LK.taking = true;
    op('pkglock.ping', { camp: A.camp, data: { pkg: R.pkg, tab: pageTab(), active: true, take: true } }).then(function (r) { LK.taking = false; lockState(r); }, function (e) {
      LK.taking = false;
      if (e.code === 'LOCK') { toast(e.message, true); LK.other = true; R.canEdit = false; lockBar(); }
    });
  }
  function lockRelease() {
    if (!LK.mine || !LK.pkg) return;
    LK.mine = false;
    op('pkglock.release', { camp: A.camp, data: { pkg: LK.pkg, tab: pageTab() } }).then(null, function () {});
  }
  window.addEventListener('pagehide', function () {
    if (!LK.mine || !window.INTERACT_CONFIG) return;
    var req = { op_id: rid('op', 20), camp_id: A.camp, stage: 'lock', action: 'delete', kind: 'pkglock.release', target: {}, data: { pkg: LK.pkg, tab: pageTab() } };
    try { navigator.sendBeacon(INTERACT_CONFIG.API_URL, new Blob([JSON.stringify({ fn: 'op', args: [IA.token, req] })], { type: 'text/plain;charset=utf-8' })); } catch (e) {}
  });
  /** 離開這個畫面：有沒存的先問；離開這個 Package 就把鎖還回去 */
  function leaving() {
    var next = location.hash.slice(1).split('?')[0].split('/');
    var same = next[0] === 'data' && next[1] === LK.pkg;
    var go = function () { if (!same) { lockRelease(); clearInterval(LK.timer); LK = { pkg: '', mine: false, other: false, timer: null, last: 0, hash: '' }; } };
    if (!dirtyAny()) { go(); return; }
    return new Promise(function (ok) {
      modal({ title: '還沒儲存', sticky: true, body: h('p', { style: { margin: 0 } }, '這一頁有 ' + dirtyAny() + ' 處改動還沒儲存（橘色框），離開就會不見。'),
        actions: [{ text: '不儲存，離開', onClick: function () { go(); ok(); } },
          { text: '留在這頁', cls: 'primary', onClick: function () { history.replaceState(null, '', LK.hash); A.leaving = leaving; A.navMark(); } }] });
    });
  }
  function lockBar() {
    var el = $('#pkgLock');
    if (!el || !R) return;
    clear(el);
    var L = R.lock || {};
    el.className = 'pkg-lock' + (LK.other ? ' other' : LK.mine ? ' mine' : ' hidden');
    if (LK.other) {
      var self = L.holder === IA.user.email;
      // 自己的鎖、但那個分頁超過 2 分半沒心跳（多半已經關掉）：直接改到這個分頁
      if (self && L.seenAgo > 150 && R.canEditReal && LK.auto !== R.pkg) {
        LK.auto = R.pkg;
        A.op('pkglock.take', { data: { pkg: R.pkg, tab: pageTab() } }).then(function (r) { LK.mine = true; LK.other = false; R.lock = r.lock; reload(); }, function () {});
      }
      el.appendChild(h('span', { class: 'grow' }, self ? '🔒 你在另一個分頁正在編輯這份資料，這個分頁先只能查看。' : '🔒 ' + L.name + ' 正在編輯這份資料（' + fmt(L.active) + ' 有動作）。你現在只能查看；對方離開這個畫面或閒置 30 分鐘後就能編輯。'));
      if (R.canEditReal && (self || R.isAdmin)) el.appendChild(h('button', { class: 'btn sm', onclick: function (e) {
        var go = function () { busy(e.target, function () { return A.op('pkglock.take', { data: { pkg: R.pkg, tab: pageTab() } }); }).then(function (r) { LK.mine = true; LK.other = false; R.lock = r.lock; toast('已改由你編輯'); reload(); }, function () {}); };
        if (self) go(); else confirmBox('強制接手', L.name + ' 還沒儲存的內容會留在對方畫面上，對方之後要重新整理再改。確定要接手嗎？', '接手').then(function (ok) { if (ok) go(); });
      } }, self ? '改在這個分頁編輯' : '強制接手'));
    } else if (LK.mine) {
      el.appendChild(h('span', { class: 'grow' }, '✏️ 你正在編輯這份資料，其他人這段時間只能查看。'));
      el.appendChild(h('button', { class: 'btn sm', onclick: function () {
        if (dirtyAny()) { toast('還有沒儲存的改動（橘色框），先儲存再結束', true); return; }
        lockRelease(); lockBar(); toast('已結束編輯，其他人現在可以編輯');
      } }, '結束編輯'));
    }
  }
  /** 未儲存提示＋第一次改動時取得鎖 */
  function track(el, get, btn) { return dirtyTrack(el, get, { btn: btn, onDirty: takeLock }); }

  /** 送出 Package 操作；成功後重新載入 */
  /** 存完後伺服器一起回傳的最新資料：直接用，不用再讀一次（rerender=false 時只更新資料，不重畫正在改的畫面） */
  function applyAdmin(pkg, admin, rerender) {
    if (!admin) return false;
    apiCachePut('getPkgAdmin', [A.camp, pkg, pageTab()], admin);
    if (!R || R.pkg !== pkg || LK.pkg !== pkg) return true;
    var L = admin.lock || {};
    LK.mine = !!L.mine; LK.other = !!(L.held && !L.mine);
    admin.canEditReal = admin.canEdit;
    if (rerender) { var y = window.scrollY; SEQ++; R = admin; render(); window.scrollTo(0, y); }
    else { R = admin; R.canEdit = R.canEditReal && !LK.other; lockBar(); }
    return true;
  }
  function run(name, data, o) {
    o = o || {};
    var pkg = R.pkg;
    return A.op('pkg.data', { action: o.action || 'update', target: { pkg: pkg, op: name, tab: pageTab(), fresh: true }, data: data, ver: o.ver }).then(function (x) {
      LK.mine = name !== 'sync' || LK.mine;
      LK.other = false;
      if (o.msg !== false) toast(o.msg || '已儲存');
      if (o.flash) FLASH = o.flash;
      if (!applyAdmin(pkg, x && x._extra && x._extra.admin, true)) reload();
      setTimeout(A.poll, 3000);   // 鈴鐺的數字晚一點再更新，不跟儲存搶連線
      return x;
    }, function (e) {
      if (e.code === 'CONFLICT') { toast(e.message, true); reload(); return; }
      if (e.code === 'LOCK') { toast(e.message, true); LK.other = true; LK.mine = false; reload(); return; }
      throw e;
    });
  }
  /** 一覽表一次存很多列：list=[{op, data, ver, key}]，回傳每列結果（版本衝突的列會標出來） */
  function runBatch(list, o) {
    o = o || {};
    return run('_batch', { list: list }, { action: 'replace', msg: false, flash: o.flash }).then(function (x) {
      if (!x) return x;
      var bad = x.results.filter(function (r) { return !r.ok; });
      if (bad.length) toast('已儲存 ' + x.saved + ' 列；' + bad.length + ' 列沒存成功：' + bad[0].error + (bad.some(function (b) { return b.conflict; }) ? '（別人先改了，已重新載入）' : ''), true);
      else toast(o.msg || '已儲存 ' + x.saved + ' 列');
      return x;
    });
  }
  /* ---------------- 背景上傳：一覽表按儲存後畫面先算存好，改動排隊依序上傳 ---------------- */
  var UPQ = Promise.resolve();
  /** list=[{op,key,ver,data}]，rows={key: 列}；上傳中的列有斜線底色、暫時不能改 */
  function queueSave(list, rows, o) {
    o = o || {};
    var pkg = R.pkg, keys = Object.keys(rows);
    keys.forEach(function (k) {
      var r = rows[k];
      r.prev = r.t.accept();
      r.tr.classList.add('g-up'); r.tr.classList.remove('g-bad'); r.tr.removeAttribute('title');
      if (r.tr.contains(document.activeElement)) document.activeElement.blur();
    });
    UPLOADING_++;
    if (o.onStart) o.onStart(keys.length);
    var end = function () { UPLOADING_--; keys.forEach(function (k) { rows[k].tr.classList.remove('g-up'); }); if (o.onEnd) o.onEnd(); };
    UPQ = UPQ.then(function () {
      return A.op('pkg.data', { action: 'replace', target: { pkg: pkg, op: '_batch', tab: pageTab(), fresh: true }, data: { list: list } }).then(function (x) {
        var bad = [];
        (x.results || []).forEach(function (res) {
          var r = rows[String(res.key).split('#')[0]];
          if (!r) return;
          if (!res.ok) { if (!r.failed) { r.failed = res.error; bad.push(res); } return; }
          if (r.del) return;
          if (res.id && !String(res.key).split('#')[1]) r.id = res.id;
          if (res.ver && (!String(res.key).split('#')[1] || res.id === r.id)) r.ver = String(res.key).split('#')[1] ? Math.max(Number(r.ver) || 0, res.ver) : res.ver;
        });
        keys.forEach(function (k) {
          var r = rows[k];
          if (r.failed) { r.t.restore(r.prev); r.tr.classList.add('g-bad'); r.tr.title = '沒存成功：' + r.failed; r.failed = ''; return; }
          if (r.del) { r.tr.remove(); if (r.G) r.G.rows = r.G.rows.filter(function (y) { return y !== r; }); return; }
          r.tr.classList.add('saved'); setTimeout(function () { r.tr.classList.remove('saved'); }, 2500);
          if (r.G && r.G.o.afterSave) r.G.o.afterSave(r);
        });
        end();
        LK.mine = true;
        applyAdmin(pkg, x._extra && x._extra.admin, false);
        if (bad.length) toast(bad.length + ' 列沒存成功（紅框）：' + bad[0].error + (bad.some(function (b) { return b.conflict; }) ? '。別人先改了，重新整理後再改' : ''), true);
        if (o.done) o.done(x);
        setTimeout(A.poll, 3000);
      }, function (e) {
        keys.forEach(function (k) { var r = rows[k]; r.t.restore(r.prev); r.tr.classList.add('g-bad'); r.tr.title = '沒存成功：' + e.message; });
        end();
        if (e.code === 'LOCK') { LK.other = true; LK.mine = false; if (R && R.pkg === pkg) { R.canEdit = false; lockBar(); } }
        toast('上傳失敗，改動還在畫面上（紅框），請再按一次儲存：' + e.message, true);
      });
    });
    return Promise.resolve();
  }
  /** 一張卡（一份文件）背景儲存：畫面先算存好，排隊上傳；上傳中斜線底色，失敗變紅框、改動還在 */
  function queueDoc(el, t, opName, data, o) {
    o = o || {};
    var pkg = R.pkg, prev = t.accept();
    el.classList.add('g-up'); el.classList.remove('g-bad');
    UPLOADING_++;
    UPQ = UPQ.then(function () {
      return A.op('pkg.data', { action: o.action || 'update', target: { pkg: pkg, op: opName, tab: pageTab(), fresh: true }, data: data, ver: o.ver }).then(function (x) {
        UPLOADING_--; el.classList.remove('g-up'); el.classList.add('saved'); setTimeout(function () { el.classList.remove('saved'); }, 2500);
        LK.mine = true;
        applyAdmin(pkg, x && x._extra && x._extra.admin, false);
        if (o.done) o.done(x);
        setTimeout(A.poll, 3000);
      }, function (e) {
        UPLOADING_--; el.classList.remove('g-up'); el.classList.add('g-bad'); t.restore(prev);
        if (e.code === 'LOCK') { LK.other = true; LK.mine = false; if (R && R.pkg === pkg) { R.canEdit = false; lockBar(); } }
        toast('沒存成功，改動還在畫面上（紅框），請再按一次儲存：' + e.message, true);
      });
    });
  }
  function del(name, data, label) {
    return confirmBox('刪除', '確定要刪除「' + label + '」嗎？', '刪除', true).then(function (ok) { if (ok) return run(name, data, { action: 'delete', msg: '已刪除' }).catch(fail); });
  }
  function flashOn(el, key) { if (FLASH === key) { FLASH = ''; el.classList.add('saved'); setTimeout(function () { el.classList.remove('saved'); }, 3000); } }

  var TABS = {
    people: [['workers', '工作人員'], ['assign', '工作分配'], ['setup', '股別與活動'], ['squads', '小隊'], ['students', '學員'], ['rooms', '分房'], ['config', '設定']],
    schedule: [['items', '營期流程'], ['activities', '活動＆課程'], ['rotations', '活動細流'], ['places', '場地'], ['flows', '流程清單'], ['config', '設定']],
    studentflow: [['items', '學員行程'], ['pending', '待處理變更'], ['config', '設定']],
    emergency: [['config', '聯絡與夜間設定'], ['flow', '處理流程圖'], ['watch', '守夜人員'], ['submissions', '自我評估切結書'], ['form', '表單格式']],
    courses: [['list', '課程'], ['config', '設定']],
    scoreboard: [['board', '排行榜'], ['results', 'Game 結果'], ['adjust', '加／扣分'], ['games', 'Game 清單'], ['config', '設定']]
  };

  function render() {
    var m = clear(M), tabs = TABS[R.pkg] || [['config', '設定']];
    var tab = TAB && tabs.some(function (t) { return t[0] === TAB; }) ? TAB : tabs[0][0];
    R.canEdit = R.canEditReal && !LK.other;
    A.title(m, R.name, 'v' + R.version + (R.maintenance ? '　🔧 維護中：' + (R.reason || '') : ''), h('a', { class: 'btn sm', href: '#packages' }, 'Package 管理'));
    if (!R.canEditReal) m.appendChild(h('div', { class: 'recall-banner', style: { marginBottom: '12px' } }, '你只能查看這個 Package，沒有編輯權限。'));
    m.appendChild(h('div', { id: 'pkgLock', class: 'pkg-lock hidden' }));
    if (R.maintenance) m.appendChild(h('div', { class: 'fb-notice', style: { marginBottom: '12px' } }, '模組維護中：暫停寫入（緊急應變的切結書仍可送出）。到「Package 管理」解除維護。'));
    m.appendChild(h('div', { class: 'chips', style: { marginBottom: '14px' } }, tabs.map(function (t) {
      return h('a', { class: 'chip' + (t[0] === tab ? ' on' : ''), href: '#data/' + R.pkg + '/' + t[0], style: { textDecoration: 'none' } }, t[1]);
    })));
    if (R.pkg === 'people') m.appendChild(syncBar());
    var box = h('div');
    m.appendChild(box);
    var fn = (VIEWS[R.pkg] || {})[tab] || (tab === 'config' ? config : null);
    if (fn) fn(box, R.data); else box.appendChild(h('div', { class: 'empty' }, '沒有這個分頁'));
    lockBar();
  }

  /** 人員與分隊每個分頁上方：從報名後台同步（學員、小隊、專輔隨輔、分房），每小時也會自動同步 */
  function syncBar() {
    var I = A.info, linked = I.regUrl && I.regPrefix && I.secretSet, demo = !!R.config.demoMode;
    if (demo) return h('div', { class: 'card row wrap', style: { padding: '10px 14px', marginBottom: '12px', background: 'var(--info-soft)' } },
      h('span', { class: 'grow' }, h('b', null, '🧪 正在用測試資料'), '　工作人員、學員、小隊、房間是虛擬的，不和報名後台同步（每小時同步也會跳過）。可以放心試排程、分工、跑關。'),
      R.canEdit ? h('button', { class: 'btn', onclick: function (e) {
        confirmBox('改回報名後台名單', '會刪掉測試資料（虛擬的工作人員、學員、小隊、房間；工作分配裡的虛擬人員也會拿掉），之後恢復和報名後台同步。你自己新增的資料不會動。', '刪掉測試資料').then(function (ok) {
          if (!ok) return;
          busy(e.target, function () { return run('demo.off', {}, { action: 'run', msg: false }); }).then(function (x) { if (x) toast('已清除測試資料 ' + x.removed + ' 筆' + (linked ? '，可以按「從報名後台同步」' : '')); }, function () {});
        });
      } }, '改回報名後台名單') : null);
    var btn = R.canEdit && linked ? h('button', { class: 'btn primary', onclick: function (e) {
      busy(e.target, function () { return run('sync', {}, { action: 'run', msg: false }); }).then(function (x) {
        if (x) { toast('已同步：學員 ' + x.total + ' 位（更新 ' + x.changed + '）、專輔隨輔 ' + (x.staff || 0) + ' 位（新增 ' + (x.staffAdded || 0) + '）、房間 ' + (x.rooms || 0) + ' 間'); A.reload().then(function () { A.route(); }); }
      }, function () {});
    } }, '從報名後台同步') : null;
    var demoBtn = R.canEdit ? h('button', { class: 'btn', onclick: function (e) {
      var nw = inp(20, { type: 'number', min: 1 }), ns = inp(40, { type: 'number', min: 1 }), nq = inp(4, { type: 'number', min: 1 });
      modal({ title: '改用測試資料', body: h('div', { class: 'col' }, h('p', { style: { margin: 0 } }, '產生虛擬的工作人員、學員、小隊和房間，代替報名後台的資料；打開後不再和報名後台同步，之後可以一鍵刪掉、改回來。'),
        h('div', { class: 'grid2' }, field('工作人員（每隊兩位隊輔，其他分到活動、總務、醫護、機動）', nw), field('學員', ns)), field('小隊數', nq)),
        actions: [{ text: '取消' }, { text: '產生測試資料', cls: 'primary', onClick: function () { return run('demo.on', { workers: nw.value, students: ns.value, squads: nq.value }, { action: 'run', msg: false }).then(function (x) { if (x) toast('已產生：工作人員 ' + x.workers + ' 位、學員 ' + x.students + ' 位、' + x.squads + ' 隊、房間 ' + x.rooms + ' 間'); }); } }] });
    } }, '改用測試資料') : null;
    return h('div', { class: 'card row wrap', style: { padding: '10px 14px', marginBottom: '12px' } }, btn,
      h('span', { class: 'hint grow' }, linked ? '同步學員（小隊、房間）、各隊專輔隨輔（自動成為工作人員）、分房。每小時會自動同步，報名後台改了想馬上看到就按這裡。' + (I.lastSync ? '　上次同步 ' + fmt(I.lastSync) : '　尚未同步')
        : '還沒和報名後台串接，到「營隊設定與備份」設定後就能同步；想先試用可以「改用測試資料」。'), demoBtn);
  }

  /* ---------------- 共用小工具 ---------------- */
  function bar() { var b = h('div', { class: 'row wrap', style: { marginBottom: '10px' } }); for (var i = 0; i < arguments.length; i++) if (arguments[i]) b.appendChild(arguments[i]); return b; }
  function addBtn(text, fn) { return R.canEdit ? h('button', { class: 'btn primary', onclick: fn }, text) : null; }
  function table(heads, rows, empty) {
    if (!rows.length) return h('div', { class: 'card empty' }, empty || '還沒有資料');
    return h('div', { class: 'tbl-wrap' }, h('table', { class: 't' }, h('thead', null, h('tr', null, heads.map(function (x) { return h('th', null, x); }))), h('tbody', null, rows)));
  }
  function actions(edit, remove) {
    if (!R.canEdit) return h('td');
    return h('td', null, h('div', { class: 'row', style: { gap: '4px' } }, edit ? h('button', { class: 'btn sm', onclick: edit }, '編輯') : null, remove ? h('button', { class: 'btn sm ghost', onclick: remove }, '刪除') : null));
  }
  function form(title, fields, onSave, wide) {
    takeLock();
    modal({ title: title, wide: wide, body: h('div', { class: 'col' }, fields), actions: [{ text: '取消' }, { text: '儲存', cls: 'primary', onClick: onSave }] });
  }
  /** 選人：已選的人是可以移除的小圓片，後面打字（有自動完成）或從清單挑來加人；人很多時比整排圓片好用 */
  var PP_SEQ = 0;
  /** 複選：點格子跳出勾選清單（可以打字篩選）；free=true 時也可以直接打清單裡沒有的（例如新的場地） */
  var MP_OPEN = null;
  document.addEventListener('mousedown', function (e) { if (MP_OPEN && !MP_OPEN.el.contains(e.target) && !MP_OPEN.pop.contains(e.target)) MP_OPEN.close(); });
  window.addEventListener('hashchange', function () { if (MP_OPEN) MP_OPEN.close(); });
  function multiPicker(items, selected, o) {
    o = o || {};
    var sel_ = (selected || []).map(String), byVal = {}, byLabel = {};
    (items || []).forEach(function (it) { byVal[it.value] = it; byLabel[it.label] = it.value; if (it.short) byLabel[it.short] = byLabel[it.short] || it.value; });
    var el = h('div', { class: 'pp' + (o.compact ? ' compact' : '') }), box = h('span', { class: 'pp-list' });
    var input = h('input', { class: 'pp-in', placeholder: o.placeholder || '＋', disabled: o.disabled, autocomplete: 'off' });
    var pop = h('div', { class: 'mp-pop hidden' }), me, cbs = {}, cntEl = null, mode = 'main';
    var fire = function () { el.dispatchEvent(new Event('change', { bubbles: true })); };
    var draw = function () {
      clear(box);
      el.dataset.n = sel_.length;
      sel_.forEach(function (v, i) {
        var it = byVal[v];
        box.appendChild(h('span', { class: 'chip on pp-chip' + (it || o.free ? '' : ' gone') }, it ? (it.short || it.label) : (o.free ? v : '（已移除）'), o.disabled ? null : h('button', { class: 'pp-x', type: 'button', 'aria-label': '移除', onclick: function (e) { e.stopPropagation(); sel_.splice(i, 1); draw(); drawPop(); fire(); } }, '✕')));
      });
    };
    // 勾選只更新那一格，不重畫清單（捲到一半不會跳回最上面）
    var toggle = function (v) { var i = sel_.indexOf(v); if (i >= 0) sel_.splice(i, 1); else sel_.push(v); draw(); if (cbs[v] && !input.value) { cbs[v].forEach(function (c) { c.checked = i < 0; }); if (cntEl) cntEl.textContent = '已選 ' + sel_.length; } else drawPop(); fire(); };
    // o.alt：另一種分組（例如依工作分配的活動、工作），同一個人可以出現在好幾組
    var altGroups = function () { return typeof o.alt.groups === 'function' ? o.alt.groups() : o.alt.groups; };
    var listOf = function () {
      if (mode !== 'alt') return items || [];
      var out = [];
      altGroups().forEach(function (g, gi) { g.values.forEach(function (v) { var it = byVal[v]; if (it) out.push({ value: it.value, label: it.label, group: g.name, gkey: 'g' + gi }); }); });
      return out;
    };
    var drawPop = function () {
      if (pop.classList.contains('hidden')) return;
      var st = pop.scrollTop;
      clear(pop); cbs = {};
      var q = input.value.trim(), grp = '', all0 = listOf();
      if (o.alt) pop.appendChild(h('div', { class: 'mp-modes' }, [['main', o.mainLabel || '依股別'], ['alt', o.alt.label]].map(function (m) {
        return h('button', { type: 'button', class: 'mp-mode' + (mode === m[0] ? ' on' : ''), onmousedown: function (e) { e.preventDefault(); }, onclick: function () { mode = m[0]; pop.scrollTop = 0; drawPop(); } }, m[1]);
      })));
      if (mode === 'alt' && !altGroups().length) pop.appendChild(h('div', { class: 'small muted', style: { padding: '6px 8px' } }, o.alt.empty || '沒有資料'));
      var list = all0.filter(function (it) { return !q || it.label.indexOf(q) >= 0 || String(it.group || '').indexOf(q) >= 0; });
      if (o.free && q && !byLabel[q] && sel_.indexOf(q) < 0) pop.appendChild(h('button', { type: 'button', class: 'mp-new', onclick: function () { input.value = ''; toggle(q); input.focus(); } }, '＋ 加入「' + q + '」'));
      list.forEach(function (it) {
        var gk = it.gkey || it.group;
        if (it.group !== undefined && gk !== grp) {
          grp = gk;
          // 整組一次勾（再按一次全部取消）
          var g0 = grp, inG = all0.filter(function (y) { return (y.gkey || y.group) === g0; });
          pop.appendChild(h('div', { class: 'mp-grp' }, h('span', { class: 'grow' }, it.group || '未分組'), h('button', { type: 'button', class: 'mp-all', onmousedown: function (e) { e.preventDefault(); }, onclick: function () {
            var all = inG.every(function (y) { return sel_.indexOf(y.value) >= 0; });
            inG.forEach(function (y) { var k = sel_.indexOf(y.value); if (all && k >= 0) sel_.splice(k, 1); else if (!all && k < 0) sel_.push(y.value); });
            draw(); drawPop(); fire();
          } }, inG.every(function (y) { return sel_.indexOf(y.value) >= 0; }) ? '全部取消' : '整組勾選（' + inG.length + '）')));
        }
        var cb = h('input', { type: 'checkbox', checked: sel_.indexOf(it.value) >= 0, tabindex: -1 });
        (cbs[it.value] = cbs[it.value] || []).push(cb);
        pop.appendChild(h('label', { class: 'mp-it', onmousedown: function (e) { e.preventDefault(); }, onclick: function (e) { e.preventDefault(); toggle(it.value); } }, cb, h('span', null, it.label)));
      });
      if (!pop.firstChild) pop.appendChild(h('div', { class: 'small muted', style: { padding: '6px 8px' } }, '沒有符合的'));
      cntEl = h('span', { class: 'small muted' }, '已選 ' + sel_.length);
      pop.appendChild(h('div', { class: 'mp-foot' }, cntEl, h('button', { type: 'button', class: 'btn sm', onclick: function () { me.close(); } }, '完成')));
      pop.scrollTop = st;
    };
    var place = function () { var r = el.getBoundingClientRect(); pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 268)) + 'px'; var below = window.innerHeight - r.bottom; if (below < 260 && r.top > below) { pop.style.top = ''; pop.style.bottom = (window.innerHeight - r.top + 4) + 'px'; } else { pop.style.bottom = ''; pop.style.top = (r.bottom + 4) + 'px'; } };
    me = {
      el: el, pop: pop,
      open: function () { if (o.disabled) return; if (MP_OPEN && MP_OPEN !== me) MP_OPEN.close(); MP_OPEN = me; document.body.appendChild(pop); pop.classList.remove('hidden'); place(); drawPop(); },
      close: function () { pop.classList.add('hidden'); pop.remove(); if (MP_OPEN === me) MP_OPEN = null; input.value = ''; mode = 'main'; },
      get: function () { return sel_.slice(); }, set: function (vs) { sel_ = (vs || []).map(String); draw(); drawPop(); }, input: input
    };
    var addTyped = function () {
      var v = input.value.trim(); if (!v) return;
      var hit = byLabel[v];
      if (!hit) { var m = (items || []).filter(function (it) { return it.label.indexOf(v) >= 0; }); if (m.length === 1) hit = m[0].value; }
      if (!hit && o.free) hit = v;
      if (hit) { input.value = ''; if (sel_.indexOf(hit) < 0) toggle(hit); else drawPop(); }
    };
    input.addEventListener('focus', me.open);
    input.addEventListener('change', addTyped);
    input.addEventListener('input', function () { if (pop.classList.contains('hidden')) me.open(); else drawPop(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addTyped(); }
      else if (e.key === 'Escape' || e.key === 'Tab') me.close();
      else if (e.key === 'Backspace' && !input.value && sel_.length) { sel_.pop(); draw(); drawPop(); fire(); }
    });
    el.appendChild(box); if (!o.disabled) el.appendChild(input);
    el.addEventListener('click', function () { if (!o.disabled) { input.focus(); me.open(); } });
    window.addEventListener('scroll', function () { if (MP_OPEN === me) place(); }, true);
    draw();
    return me;
  }
  function peoplePicker(workers, selected, o) {
    o = o || {};
    var ws = (workers || []).slice().sort(function (a, b) { return String(a.data.dept || '').localeCompare(String(b.data.dept || '')); });
    return multiPicker(ws.map(function (w) { return { value: w.id, label: w.data.name + (w.data.dept ? '（' + w.data.dept + '）' : ''), short: w.data.name, group: w.data.dept || '' }; }), selected, { compact: o.compact, disabled: o.disabled, placeholder: o.placeholder || '＋ 加人', alt: o.alt });
  }
  function workerItems(list) { return (list || []).map(function (w) { return { value: w.id, label: w.data.name + (w.data.dept ? '（' + w.data.dept + '）' : '') }; }); }
  function nameOf(list, ids) { var m = {}; (list || []).forEach(function (w) { m[w.id] = w.data.name; }); return (ids || []).map(function (i) { return m[i] || '（已移除）'; }).join('、'); }
  function hl(tr, id) { if (Q.id && Q.id === id) { tr.style.background = 'var(--warn-soft)'; setTimeout(function () { tr.scrollIntoView({ block: 'center' }); }, 50); } return tr; }

  /* ---------------- 一覽表（像試算表一樣直接改，改完一次儲存） ----------------
   * cols = [{k, label, type:'text'|'number'|'date'|'time'|'check'|'people'|'select'|'calc', w(寬), list(自動完成), opts(select), fn(calc), ph}]
   * o = { rows:[{id, ver, vals}], saveOp, delOp, toData(vals, row), blank(groupKey) → vals, groupOf(vals), groupLabel(key, rows), groupOrder(keys),
   *       rowHook(row, grid)（畫完每列後；例如標出重疊）, onChange(grid), addText, empty, tools(grid) → 工具列額外的按鈕, select（左邊勾選欄） }
   * Enter 往下一列、Ctrl+S 儲存；從 Excel 複製多格貼上會自動填進去，不夠的列會自動新增。
   */
  var GRID_SEQ = 0;
  function grid(box, cols, o) {
    var G = { rows: [], cols: cols, o: o }, ro = !R.canEdit, seq = 0;
    var save = h('button', { class: 'btn', onclick: function (e) { busy(e.target, G.save).catch(function () {}); } }, '儲存變更');
    var status = h('span', { class: 'small muted' });
    var table = h('table', { class: 't grid' + (o.select ? ' sel' : '') }), body = h('tbody');
    var lists = h('div', { class: 'hidden' });
    var colList = {};
    cols.forEach(function (c) { if (c.list) { var id = 'gl' + (++GRID_SEQ); colList[c.k] = id; lists.appendChild(h('datalist', { id: id }, c.list.map(function (v) { return h('option', { value: v }); }))); } });
    table.appendChild(h('thead', null, h('tr', null, o.select ? h('th', { class: 'g-sel', style: { width: '56px' } }, h('input', { type: 'checkbox', title: '全選', onchange: function (e) { G.rows.forEach(function (r) { if (!r.tr.classList.contains('hidden')) { r.ck.checked = e.target.checked; } }); G.selChanged(); } })) : null,
      cols.map(function (c) { return h('th', { class: c.type === 'hidden' ? 'hidden' : null, style: { width: c.w || '160px' } }, c.label); }), ro && !o.rowActions ? null : h('th', { class: 'g-x', style: { width: o.rowActions ? '76px' : '44px' } }))));
    // 固定欄寬（像試算表），欄位多時整個表格可以左右捲動
    var tw = (o.select ? 56 : 0) + (ro && !o.rowActions ? 0 : o.rowActions ? 76 : 44);
    cols.forEach(function (c) { if (c.type !== 'hidden') tw += parseInt(c.w || '160', 10); });
    table.style.width = tw + 'px';
    table.appendChild(body);

    var editor = function (c, v, row) {
      var t = c.type || 'text', e = {};
      if (t === 'people') { var pp = peoplePicker(o.workers || [], v || [], { compact: true, disabled: ro, placeholder: '＋', alt: o.workGroups ? { label: '依工作分配', groups: function () { return o.workGroups(row); }, empty: '工作分配還沒有人' } : null }); e = { el: pp.el, get: pp.get, set: function (x) { pp.set(x); }, input: pp.input }; }
      else if (t === 'tags') {
        // 複選文字（例如好幾個場地）：存成「操場、禮堂」
        var split = function (x) { return Array.isArray(x) ? x : String(x || '').split(/[、,，]/).map(function (y) { return y.trim(); }).filter(String); };
        var tp = multiPicker((c.list || []).map(function (x) { return { value: x, label: x }; }), split(v), { compact: true, disabled: ro, free: true, placeholder: '＋' });
        e = { el: tp.el, get: function () { return tp.get().join('、'); }, set: function (x) { tp.set(split(x)); }, input: tp.input };
      }
      else if (t === 'switch') { var sw = h('input', { type: 'checkbox', class: 'sw', checked: !!v, disabled: ro }); e = { el: h('label', { class: 'sw-wrap' }, sw, h('span', { class: 'sw-k' })), get: function () { return sw.checked; }, set: function (x) { sw.checked = !!x && x !== '0' && x !== 'false'; }, input: sw }; }
      else if (t === 'time') {
        // 時間用一般文字格：打 930、9:30、1130、11.30 都可以，離開格子自動變成 09:30（不用點時鐘）
        var ti = h('input', { class: 'g-in g-tm', type: 'text', inputmode: 'numeric', value: v || '', placeholder: c.ph || '09:00', disabled: ro });
        ti.addEventListener('change', function () { var n = normTime(ti.value); if (n !== null) ti.value = n; });
        e = { el: ti, get: function () { var n = normTime(ti.value); return n === null ? ti.value : n; }, set: function (x) { var n = normTime(x); ti.value = n === null ? (x || '') : n; }, input: ti };
      }
      else if (t === 'check') { var cb = h('input', { type: 'checkbox', checked: !!v, disabled: ro }); e = { el: cb, get: function () { return cb.checked; }, set: function (x) { cb.checked = !!x && x !== '0' && x !== 'false'; }, input: cb }; }
      else if (t === 'select') { var s = sel(c.opts, v, { disabled: ro, class: 'g-in' }); e = { el: s, get: function () { return s.value; }, set: function (x) { s.value = x; }, input: s }; }
      else if (t === 'calc') { var sp = h('span', { class: 'g-calc' }); e = { el: sp, get: function () { return undefined; }, set: function () {}, calc: true }; }
      else if (t === 'hidden') { var hv = v; e = { el: h('span'), get: function () { return hv; }, set: function (x) { hv = x; } }; }
      else if (c.multi) {
        // 可以換行的文字格（備註、說明）：Shift+Enter 換行，Enter 照常換到下一列
        var ta = h('textarea', { class: 'g-in g-ta', rows: 1, placeholder: c.ph || '', disabled: ro });
        ta.value = v === undefined || v === null ? '' : v;
        var gr = function () { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight + 2) + 'px'; };
        ta.addEventListener('input', gr); setTimeout(gr, 0);
        e = { el: ta, get: function () { return ta.value; }, set: function (x) { ta.value = x === undefined || x === null ? '' : x; gr(); }, input: ta };
      }
      else {
        var i = h('input', { class: 'g-in', type: t === 'number' ? 'number' : t === 'date' ? 'date' : t === 'datetime' ? 'datetime-local' : 'text', value: v === undefined || v === null ? '' : v, placeholder: c.ph || '', list: colList[c.k] || null, disabled: ro, min: t === 'number' ? 0 : c.min || null, max: c.max || null });
        e = { el: i, get: function () { return t === 'number' ? (i.value === '' ? '' : Number(i.value)) : i.value; }, set: function (x) { i.value = x === undefined || x === null ? '' : x; }, input: i };
      }
      return e;
    };
    G.add = function (r, before) {
      r.key = r.key || ('r' + (++seq));
      r.ed = {};
      var tr = h('tr', { 'data-key': r.key });
      if (o.select) { r.ck = h('input', { type: 'checkbox', onchange: function () { G.selChanged(); } }); tr.appendChild(h('td', { class: 'g-sel' }, r.ck, o.drag && !ro ? h('span', { class: 'g-drag', draggable: 'true', title: '拖到別的日期', ondragstart: function (ev) { ev.dataTransfer.setData('text/plain', r.key); G.dragKey = r.key; } }, '⠿') : null)); }
      cols.forEach(function (c, ci) {
        var e = r.ed[c.k] = editor(c, r.vals[c.k], r);
        var td = h('td', { class: 'g-' + (c.type || 'text') + (c.type === 'hidden' ? ' hidden' : ''), 'data-ci': ci }, e.el);
        tr.appendChild(td);
      });
      if (!ro || o.rowActions) tr.appendChild(h('td', { class: 'g-x' }, o.rowActions ? o.rowActions(r, G) : null, ro || o.noCopy ? null : h('button', { class: 'btn sm ghost', type: 'button', title: '複製這一列（放在下面，再改）', onclick: function () { G.copy(r); } }, '⧉'), ro ? null : h('button', { class: 'btn sm ghost', type: 'button', title: r.id ? '刪除（儲存後才會真的刪）' : '拿掉這一列', onclick: function () {
        if (!r.id) { tr.remove(); G.rows = G.rows.filter(function (x) { return x !== r; }); G.changed(); return; }
        r.del = !r.del; tr.classList.toggle('g-del', r.del); tr.dispatchEvent(new Event('change', { bubbles: true }));
      } }, '✕')));
      r.tr = tr; r.G = G;
      r.read = function () { var v = {}; cols.forEach(function (c) { var x = r.ed[c.k].get(); if (x !== undefined) v[c.k] = x; }); return v; };
      r.t = track(tr, function () { return { v: r.read(), d: !!r.del }; }, save);
      if (r.fill) { Object.keys(r.fill).forEach(function (k) { if (r.ed[k]) r.ed[k].set(r.fill[k]); }); delete r.fill; setTimeout(r.t.check, 0); }
      tr.addEventListener('input', function () { G.changed(r); });
      tr.addEventListener('change', function () { G.changed(r); });
      if (before) body.insertBefore(tr, before); else body.appendChild(tr);
      G.rows.push(r);
      if (o.rowInit) o.rowInit(r, G);
      return r;
    };
    /** 複製一列放在它下面（新的一列，還沒存） */
    G.copy = function (r) {
      var v = JSON.parse(JSON.stringify(r.read())), k = o.groupOf ? o.groupOf(v) : '';
      var n = G.add({ id: '', ver: undefined, vals: o.blank ? o.blank(k) : {}, fill: v, copyOf: r }, r.tr.nextSibling);
      G.changed(n);
      var f = n.tr.querySelector('input:not([type=checkbox])'); if (f) f.focus();
      return n;
    };
    G.changed = function (r) {
      if (r) cols.forEach(function (c) { if (c.type === 'calc') { var out = c.fn(r.read(), r, G); clear(r.ed[c.k].el); if (out !== null && out !== undefined) r.ed[c.k].el.appendChild(out.nodeType ? out : document.createTextNode(String(out))); } });
      else G.rows.forEach(function (x) { G.changed(x); });
      if (r && (o.rowHook || o.onChange)) G.hooks();
      if (r && G.labels) G.labels();
      setTimeout(function () { var n = G.rows.filter(function (x) { return x.t.isDirty(); }).length; status.textContent = n ? n + ' 列還沒儲存' : ''; save.textContent = n ? '儲存變更（' + n + '）' : '儲存變更'; }, 0);
    };
    G.hooks = function () { if (o.rowHook) G.rows.forEach(function (x) { o.rowHook(x, G); }); if (o.onChange) o.onChange(G); };
    G.selected = function () { return G.rows.filter(function (r) { return r.ck && r.ck.checked && !r.tr.classList.contains('hidden'); }); };
    G.selChanged = function () { if (o.onSelect) o.onSelect(G.selected(), G); };
    /** 新的一列；blank(組, 上一列的值) 可以用上一列帶預設值（例如時間接上一列結束） */
    G.newRow = function (groupKey, before, fill) {
      var prevTr = before ? before.previousSibling : body.lastChild, prev = null;
      while (prevTr && prevTr.classList && prevTr.classList.contains('hidden')) prevTr = prevTr.previousSibling;
      if (prevTr && !prevTr.classList.contains('g-grp')) { var pr = G.rows.filter(function (x) { return x.tr === prevTr; })[0]; if (pr) prev = pr.read(); }
      return G.add({ id: '', ver: undefined, vals: o.blank ? o.blank(groupKey, null, prev) : {}, fill: fill }, before);
    };
    /** 儲存：畫面先算存好，改動排隊在背景上傳（上傳中的列有斜線底色） */
    G.save = function () {
      var list = [], rows = {};
      G.rows.forEach(function (r) {
        if (!r.t.isDirty() || r.tr.classList.contains('g-up')) return;
        if (r.del) { if (r.id) { list.push({ op: o.delOp, key: r.key, data: { id: r.id } }); rows[r.key] = r; } return; }
        var v = r.read();
        if (o.isEmpty && o.isEmpty(v)) return;
        var items = o.saveItems ? o.saveItems(v, r) : [{ op: o.saveOp, data: o.toData(v, r) }];
        items.forEach(function (it, i) { list.push({ op: it.op, key: r.key + (i ? '#' + i : ''), ver: i === 0 && r.id ? r.ver : undefined, data: it.data }); });
        if (items.length) rows[r.key] = r;
      });
      if (!list.length) { toast('沒有要儲存的改動'); return Promise.resolve(); }
      var bad = o.validate ? list.map(function (x) { return x.op !== o.delOp ? o.validate(x.data, x.op) : ''; }).filter(String) : [];
      if (bad.length) { toast(bad[0], true); return Promise.resolve(); }
      return queueSave(list, rows, {
        onStart: function (n) { upMsg.textContent = '⏳ 上傳中 ' + n + ' 列…（斜線底色的列傳完前先不要改）'; },
        onEnd: function () { upMsg.textContent = ''; G.changed(); },
        done: function (x) { upMsg.textContent = '✓ 已存 ' + x.saved + ' 列'; setTimeout(function () { if (upMsg.textContent.charAt(0) === '✓') upMsg.textContent = ''; }, 3000); if (o.done) o.done(x, G); }
      });
    };
    var upMsg = h('span', { class: 'small g-upmsg' });
    // 群組（例如依日期、依活動）
    var span = cols.length + (o.select ? 1 : 0) + (ro && !o.rowActions ? 0 : 1);
    var heads = {};
    var makeHead = function (k) {
      var lab = h('b', { class: 'grow' });
      var head = h('tr', { class: 'g-grp' }, h('td', { colspan: span }, h('div', { class: 'row' }, lab,
        ro || !o.groupActions ? null : o.groupActions(k, G),
        ro ? null : h('button', { class: 'btn sm ghost', type: 'button', onclick: function () { var r = G.newRow(k, G.groupEnd(k)); var f = r.tr.querySelector('input:not([type=checkbox])'); if (f) f.focus(); } }, o.addText || '＋ 加一列'))));
      head.dataset.g = k;
      head.lab = lab;
      if (o.drag && !ro) {
        head.addEventListener('dragover', function (ev) { ev.preventDefault(); head.classList.add('g-over'); });
        head.addEventListener('dragleave', function () { head.classList.remove('g-over'); });
        head.addEventListener('drop', function (ev) { ev.preventDefault(); head.classList.remove('g-over'); var r = G.rows.filter(function (x) { return x.key === G.dragKey; })[0]; if (r && o.onDrop) o.onDrop(r, k, G); });
      }
      heads[k] = head;
      return head;
    };
    /** 這一組最後一列的下一個節點（新列插在這裡） */
    G.groupEnd = function (k) { var hd = heads[k]; if (!hd) return null; var nx = hd.nextSibling; while (nx && !nx.classList.contains('g-grp')) nx = nx.nextSibling; return nx; };
    G.ensureGroup = function (k) {
      if (heads[k]) return heads[k];
      var keys = Object.keys(heads).concat([k]);
      if (o.groupOrder) keys = o.groupOrder(keys);
      var after = keys[keys.indexOf(k) + 1], hd = makeHead(k);
      body.insertBefore(hd, after !== undefined && heads[after] ? heads[after] : null);
      return hd;
    };
    /** 把一列搬到另一組（例如改日期） */
    G.moveTo = function (r, k) { G.ensureGroup(k); body.insertBefore(r.tr, G.groupEnd(k)); G.labels(); G.place(r); };
    /** 每組內依 o.sortKey 排好 */
    G.sort = function () {
      if (!o.sortKey) return;
      Object.keys(heads).forEach(function (k) {
        var rs = G.rows.filter(function (r) { return o.groupOf(r.read()) === k; }).sort(function (a, b) { return String(o.sortKey(a.read())).localeCompare(String(o.sortKey(b.read()))); });
        var end = G.groupEnd(k);
        rs.forEach(function (r) { body.insertBefore(r.tr, end); });
      });
    };
    /** 自動排序：改了時間，這一列自己移到同一天正確的位置（沒填時間的列不動，焦點跟著） */
    var tCol = cols.filter(function (c) { return c.type === 'time'; })[0];
    G.place = function (r) {
      if (!o.sortKey || !tCol || r.del) return;
      var v = r.read(), k = o.groupOf ? o.groupOf(v) : '';
      if (!v[tCol.k]) return;
      var me = String(o.sortKey(v));
      var timed = Array.prototype.filter.call(body.children, function (tr) { return tr.dataset.key; }).map(function (tr) { return G.rows.filter(function (x) { return x.tr === tr; })[0]; })
        .filter(function (x) { if (!x || x.del) return false; var w = x.read(); return x === r || ((o.groupOf ? o.groupOf(w) : '') === k && w[tCol.k]); });
      var i = timed.indexOf(r), pv = timed[i - 1], nv = timed[i + 1];
      if ((!pv || String(o.sortKey(pv.read())) <= me) && (!nv || String(o.sortKey(nv.read())) >= me)) return;
      var others = timed.filter(function (x) { return x !== r; }), tgt = others.filter(function (x) { return String(o.sortKey(x.read())) > me; })[0];
      var act = document.activeElement, keep = act && r.tr.contains(act) ? act : null;
      body.insertBefore(r.tr, tgt ? tgt.tr : others[others.length - 1].tr.nextSibling);
      r.tr.classList.add('g-moved'); setTimeout(function () { r.tr.classList.remove('g-moved'); }, 900);
      if (keep) try { keep.focus(); } catch (e) {}
    };
    body.addEventListener('change', function (e) {
      var td = e.target.closest && e.target.closest('td[data-ci]');
      if (!td || !tCol || cols[Number(td.dataset.ci)] !== tCol) return;
      var r = G.rows.filter(function (x) { return x.tr === td.parentNode; })[0];
      if (r) setTimeout(function () { G.place(r); }, 0);
    });
    G.labels = function () {
      if (!o.groupOf) return;
      Object.keys(heads).forEach(function (k) { var rs = G.rows.filter(function (r) { return !r.del && o.groupOf(r.read()) === k; }); clear(heads[k].lab).appendChild(document.createTextNode(o.groupLabel ? o.groupLabel(k, rs) : k)); });
    };
    G.draw = function () {
      clear(body);
      heads = {};
      var groups = {}, keys = [];
      (o.rows || []).forEach(function (r) { var k = o.groupOf ? o.groupOf(r.vals) : ''; if (!groups[k]) { groups[k] = []; keys.push(k); } groups[k].push(r); });
      (o.extraGroups || []).forEach(function (k) { if (!groups[k]) { groups[k] = []; keys.push(k); } });
      if (o.groupOrder) keys = o.groupOrder(keys);
      keys.forEach(function (k) {
        if (o.groupOf) body.appendChild(makeHead(k));
        groups[k].forEach(function (r) { G.add(Object.assign({}, r)); });
      });
      if (!keys.length && o.empty) body.appendChild(h('tr', null, h('td', { colspan: span, class: 'empty' }, o.empty)));
      G.changed();
      G.hooks();
      G.labels();
    };
    G.moveBefore = function (r, node) { body.insertBefore(r.tr, node); };
    // Enter 往下、Ctrl+S 儲存
    table.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); busy(save, G.save).catch(function () {}); return; }
      // ↑ ↓ 換列（有下拉建議的格子除外）
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.isComposing && e.target.tagName === 'INPUT' && !e.target.getAttribute('list') && !e.target.classList.contains('pp-in') && e.target.type !== 'number') {
        var td0 = e.target.closest('td'), tr0 = td0 && td0.parentNode;
        if (!td0 || !td0.dataset.ci) return;
        var sib = e.key === 'ArrowUp' ? 'previousSibling' : 'nextSibling', nx0 = tr0[sib];
        while (nx0 && (nx0.classList.contains('hidden') || nx0.classList.contains('g-grp'))) nx0 = nx0[sib];
        var t0 = nx0 && nx0.querySelector('td[data-ci="' + td0.dataset.ci + '"] input, td[data-ci="' + td0.dataset.ci + '"] select');
        if (t0) { e.preventDefault(); t0.focus(); if (t0.select) try { t0.select(); } catch (er) {} }
        return;
      }
      if (e.key !== 'Enter' || e.target.classList.contains('pp-in') || e.isComposing) return;
      if (e.shiftKey && e.target.tagName === 'TEXTAREA') return;   // Shift+Enter：格子裡換行
      var td = e.target.closest('td'), tr = td && td.parentNode;
      if (!td || !td.dataset.ci) return;
      e.preventDefault();
      if (o.enterInsert && !ro) {
        // Enter＝在這一列下面插入一列（同一天），游標停在同一欄
        var cr = G.rows.filter(function (x) { return x.tr === tr; })[0], gk3 = o.groupOf && cr ? o.groupOf(cr.read()) : '';
        if (e.target.dispatchEvent) e.target.dispatchEvent(new Event('change', { bubbles: true }));
        if (cr) G.place(cr);
        var nr = G.newRow(gk3, tr.nextSibling); G.changed(nr);
        var t3 = nr.tr.querySelector('td[data-ci="' + td.dataset.ci + '"] input, td[data-ci="' + td.dataset.ci + '"] select, td[data-ci="' + td.dataset.ci + '"] textarea') || nr.tr.querySelector('input:not([type=checkbox])');
        if (t3) t3.focus();
        return;
      }
      var nx = tr.nextSibling;
      while (nx && nx.classList.contains('hidden')) nx = nx.nextSibling;
      if ((!nx || nx.classList.contains('g-grp')) && !ro) { var cur = G.rows.filter(function (x) { return x.tr === tr; })[0], gk2 = o.groupOf && cur ? o.groupOf(cur.read()) : ''; nx = G.newRow(gk2, o.groupOf ? G.groupEnd(gk2) : null).tr; }
      var t2 = nx && nx.querySelector('td[data-ci="' + td.dataset.ci + '"] input, td[data-ci="' + td.dataset.ci + '"] select, td[data-ci="' + td.dataset.ci + '"] textarea');
      if (t2) t2.focus();
    });
    // 從 Excel／Google 試算表複製多格貼上
    table.addEventListener('paste', function (e) {
      var text = (e.clipboardData || window.clipboardData).getData('text');
      if (ro || !/[\t\n]/.test(String(text).replace(/\n$/, ''))) return;
      if (e.target.tagName === 'TEXTAREA' && !/\t/.test(text)) return;   // 可換行的格子：多行文字直接貼進去
      var td = e.target.closest('td'), tr = td && td.parentNode;
      if (!td || !td.dataset.ci) return;
      e.preventDefault();
      var lines = String(text).replace(/\r/g, '').replace(/\n+$/, '').split('\n').map(function (l) { return l.split('\t'); });
      var start = G.rows.filter(function (x) { return x.tr === tr; })[0], gk = o.groupOf && start ? o.groupOf(start.read()) : '';
      var vis = G.rows.filter(function (x) { return !x.tr.classList.contains('hidden'); });
      var ri = vis.indexOf(start), ci = Number(td.dataset.ci), made = 0;
      var anchor = tr.nextSibling; while (anchor && !anchor.classList.contains('g-grp')) anchor = anchor.nextSibling;
      lines.forEach(function (cells, k) {
        var r = vis[ri + k];
        if (!r || (o.groupOf && o.groupOf(r.read()) !== gk)) { r = G.newRow(gk, anchor); made++; }
        // 只對應到可以填的欄（跳過「結束」這類算出來的欄），和 Excel 的欄位順序一樣
        var ed = cols.map(function (c, i) { return i; }).filter(function (i) { return i >= ci && cols[i].type !== 'calc' && cols[i].type !== 'hidden' && !cols[i].nopaste; });
        cells.forEach(function (v, j) {
          var c = cols[ed[j]];
          if (!c) return;
          r.ed[c.k].set(o.parse ? o.parse(c, v.trim()) : v.trim());
        });
        r.t.check(); G.changed(r); G.place(r);
      });
      toast('已貼上 ' + lines.length + ' 列' + (made ? '（新增 ' + made + ' 列）' : '') + '，記得按「儲存變更」');
    });
    // 檢視：「展開」人員、場地全部列出；「窄」每格一行（人多時不會把列撐很高），點格子一樣可以改
    var narrowOn = false; try { narrowOn = localStorage.getItem('ia_grid_narrow') === '1'; } catch (e) {}
    var viewBtn = h('span', { class: 'seg g-view' }, [['wide', '展開'], ['narrow', '窄']].map(function (m) {
      return h('button', { type: 'button', class: 'seg-b' + ((m[0] === 'narrow') === narrowOn ? ' on' : ''), 'data-view': m[0], onclick: function () {
        narrowOn = m[0] === 'narrow'; table.classList.toggle('narrow', narrowOn);
        $all('.seg-b', viewBtn).forEach(function (b) { b.classList.toggle('on', (b.dataset.view === 'narrow') === narrowOn); });
        try { localStorage.setItem('ia_grid_narrow', narrowOn ? '1' : '0'); } catch (e) {}
      } }, m[1]);
    }));
    table.classList.toggle('narrow', narrowOn);
    G.bar = h('div', { class: 'row wrap g-bar' }, ro ? null : save, status, upMsg, o.tools ? o.tools(G) : null, h('span', { class: 'grow' }), h('span', { class: 'small muted' }, '檢視'), viewBtn);
    box.appendChild(G.bar);
    box.appendChild(h('div', { class: 'tbl-wrap g-wrap' }, table));
    box.appendChild(lists);
    if (!ro && !o.groupOf) box.appendChild(h('div', { style: { marginTop: '8px' } }, h('button', { class: 'btn sm', onclick: function () { var r = G.newRow(''); var f = r.tr.querySelector('input:not([type=checkbox])'); if (f) f.focus(); } }, o.addText || '＋ 加一列')));
    G.draw();
    return G;
  }
  /** 930、9:30、1130、11.30、9 → 09:30／11:30／09:00；看不懂回 null */
  function normTime(x) {
    x = String(x === undefined || x === null ? '' : x).trim().replace(/[：.．]/g, ':');
    if (!x) return '';
    var m = x.match(/^(\d{1,2}):(\d{1,2})$/) || x.match(/^(\d{1,2})(\d{2})$/) || (x.match(/^(\d{1,2})$/) ? [x, x, '0'] : null);
    if (!m) return null;
    var hh = Number(m[1]), mm = Number(m[2]);
    if (hh > 24 || mm > 59) return null;
    return pad2(hh) + ':' + pad2(mm);
  }
  /** 貼上時的格式整理：日期 1/27 → 2027-01-27、時間 9:00 → 09:00、人員用、或 / 分隔的名字 → ID */
  function parseCell(c, v) {
    if (c.type === 'number') { var n = parseFloat(String(v).replace(/[^\d.]/g, '')); return isFinite(n) ? n : ''; }
    if (c.type === 'time') { var m = String(v).match(/(\d{1,2})[:：](\d{2})/); return m ? pad2(Number(m[1])) + ':' + m[2] : ''; }
    if (c.type === 'date') {
      var d = String(v).match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
      if (d) return d[1] + '-' + pad2(Number(d[2])) + '-' + pad2(Number(d[3]));
      d = String(v).match(/(\d{1,2})[/.月](\d{1,2})/);
      if (d) { var y = (A.info.start || taipei().ymd).slice(0, 4); if (A.info.start && Number(d[1]) < Number(A.info.start.slice(5, 7)) - 6) y = String(Number(y) + 1); return y + '-' + pad2(Number(d[1])) + '-' + pad2(Number(d[2])); }
      return '';
    }
    if (c.type === 'check') return /^(1|v|y|yes|true|是|✓|✔|停用)$/i.test(v);
    if (c.type === 'people') {
      var ws = (R.data.workers || []), out = [];
      String(v).split(/[、,，/／\s]+/).forEach(function (nm) { nm = nm.trim(); if (!nm) return; var w = ws.filter(function (x) { return x.data.name === nm; })[0]; if (w && out.indexOf(w.id) < 0) out.push(w.id); });
      return out;
    }
    return v;
  }

  /* ---------------- 設定（各 Package 共用） ---------------- */
  function config(box) {
    var vals = {}, card = h('div', { class: 'card col' });
    if (!R.configFields.length) { box.appendChild(h('div', { class: 'card empty' }, '這個 Package 沒有可以調整的設定')); return; }
    R.configFields.forEach(function (f) {
      if (f.hidden) return;
      var v = R.config[f.key], el;
      if (f.type === 'bool') { el = h('input', { type: 'checkbox', checked: !!v, disabled: !R.canEdit }); vals[f.key] = function () { return el.checked; }; card.appendChild(h('label', { class: 'check' }, el, h('span', null, f.label))); return; }
      if (f.type === 'select') el = sel(f.options, v, { disabled: !R.canEdit });
      else if (f.type === 'textarea') el = area(v, { rows: 5, disabled: !R.canEdit });
      else if (f.type === 'json') {
        if (R.pkg === 'emergency' && f.key === 'contacts') { var ed = contactsEditor(v || []); vals[f.key] = ed.get; card.appendChild(field('其他聯絡人', ed.el)); return; }
        el = area(JSON.stringify(v, null, 1), { rows: 4, disabled: !R.canEdit });
      }
      else el = inp(v, { type: f.type === 'number' ? 'number' : f.type === 'time' ? 'time' : 'text', disabled: !R.canEdit });
      vals[f.key] = function () { return el.value; };
      card.appendChild(field(f.label, el));
    });
    var getCfg = function () { var cfg = {}; Object.keys(vals).forEach(function (k) { cfg[k] = vals[k](); }); return cfg; };
    if (R.canEdit) {
      var btn = h('button', { class: 'btn', onclick: function (e) {
        busy(e.target, function () { return A.op('pkg.config', { target: { inst: R.inst, tab: pageTab() }, data: { config: getCfg() } }); }).then(function () { LK.mine = true; toast('設定已儲存'); FLASH = 'config'; reload(); A.poll(); }, function (e2) { if (e2.code === 'LOCK') { LK.other = true; reload(); } });
      } }, '儲存設定');
      var tr = track(card, getCfg, btn);
      card.appendChild(h('div', { class: 'row' }, btn, tr.status));
    }
    flashOn(card, 'config');
    box.appendChild(card);
  }
  function contactsEditor(list) {
    var rows = list.map(function (c) { return { name: c.name || '', role: c.role || '', phone: c.phone || '', side: c.side === 'worker' ? 'worker' : '' }; });
    var el = h('div', { class: 'col', style: { gap: '6px' } });
    var draw = function () {
      clear(el);
      rows.forEach(function (c, i) {
        var a = inp(c.name, { placeholder: '姓名', disabled: !R.canEdit }), b = inp(c.role, { placeholder: '職稱', disabled: !R.canEdit }), p = inp(c.phone, { placeholder: '電話', disabled: !R.canEdit });
        var sd = sel([{ value: '', label: '學員和工作人員都看得到' }, { value: 'worker', label: '只有工作人員' }], c.side, { disabled: !R.canEdit });
        a.oninput = function () { c.name = a.value; }; b.oninput = function () { c.role = b.value; }; p.oninput = function () { c.phone = p.value; }; sd.onchange = function () { c.side = sd.value; };
        el.appendChild(h('div', { class: 'row' }, a, b, p, sd, R.canEdit ? h('button', { class: 'btn sm ghost', onclick: function () { rows.splice(i, 1); draw(); } }, '✕') : null));
      });
      if (R.canEdit) el.appendChild(h('div', null, h('button', { class: 'btn sm', onclick: function () { rows.push({ name: '', role: '', phone: '', side: '' }); draw(); } }, '＋ 聯絡人')));
    };
    draw();
    return { el: el, get: function () { return rows.filter(function (c) { return c.name || c.phone; }); } };
  }

  /* ---------------- 各 Package ---------------- */
  var VIEWS = {};

  VIEWS.people = {
    /** 工作人員一覽：直接在表格裡改，改完按「儲存變更」；可以從 Excel 複製整塊貼上 */
    workers: function (box, D) {
      var depts = (R.config.depts || []).slice();
      D.workers.forEach(function (w) { if (w.data.dept && depts.indexOf(w.data.dept) < 0) depts.push(w.data.dept); });
      var q = inp('', { placeholder: '搜尋姓名、電話、備註', style: { maxWidth: '220px' } }), dsel = sel([{ value: '', label: '全部股別' }].concat(depts.map(function (d) { return { value: d, label: d }; })), '', { style: { maxWidth: '160px' } });
      var count = h('span', { class: 'small muted' });
      box.appendChild(h('div', { class: 'hint', style: { marginBottom: '8px' } }, '直接在表格裡改，改過的列會有橘色框，最後按「儲存變更」一次存。可以從 Excel 複製「姓名、股別、小隊、電話、備註」整塊貼到姓名欄。工作人員用「姓名＋股別＋營隊通行碼」登入，同名同股別會無法登入；報名後台的專輔、隨輔會自動加進來（股別「輔導」）。股別清單在「股別與活動」設定。勾「可展延」的人，在工作人員端的營期流程可以按「快速展延」。'));
      var rows = D.workers.slice().sort(function (a, b) { return (depts.indexOf(a.data.dept) - depts.indexOf(b.data.dept)) || String(a.data.name).localeCompare(String(b.data.name), 'zh-Hant'); })
        .map(function (w) { return { id: w.id, ver: w.version, vals: { name: w.data.name, dept: w.data.dept || '', squad: w.data.squad === undefined ? '' : w.data.squad, phone: w.data.phone || '', note: w.data.note || '', extend: !!w.data.extend, inactive: !!w.data.inactive }, w: w }; });
      var byId = {};
      D.workers.forEach(function (w) { byId[w.id] = w; });
      var G = grid(box, [
        { k: 'name', label: '姓名', w: '130px' },
        { k: 'dept', label: '股別', w: '110px', list: depts },
        { k: 'squad', label: '小隊', type: 'number', w: '70px' },
        { k: 'reg', label: '報名後台', type: 'calc', w: '120px', fn: function (v, r) { var w = r.id && byId[r.id]; if (!w || !w.data.reg) return null; return h('span', { class: 'small muted', title: '從報名後台同步' }, (w.data.title || '專輔／隨輔') + ((w.data.regSquads || []).length ? ' · ' + w.data.regSquads.join('、') + ' 隊' : '')); } },
        { k: 'phone', label: '電話', w: '130px' },
        { k: 'note', label: '備註', multi: true },
        { k: 'extend', label: '可展延', type: 'check', w: '60px', title: '工作人員端「營期流程」可以按快速展延' },
        { k: 'inactive', label: '停用', type: 'check', w: '50px' }
      ], {
        rows: rows, saveOp: 'worker.save', delOp: 'worker.delete', parse: parseCell, flash: 'workers', addText: '＋ 新增工作人員',
        blank: function () { return { name: '', dept: dsel.value || '', squad: '', phone: '', note: '', extend: false, inactive: false }; },
        isEmpty: function (v) { return !String(v.name || '').trim(); },
        toData: function (v, r) { return { id: r.id, name: v.name, dept: v.dept, squad: v.squad, phone: v.phone, note: v.note, extend: v.extend, inactive: v.inactive }; },
        rowHook: function (r, G) {
          var v = r.read(), k = String(v.name).trim() + '|' + String(v.dept).trim();
          var dup = String(v.name).trim() && G.rows.some(function (x) { return x !== r && !x.del && String(x.read().name).trim() + '|' + String(x.read().dept).trim() === k; });
          r.tr.classList.toggle('g-bad', !!dup);
          r.tr.title = dup ? '同名同股別：這兩位會無法登入，請改股別或在姓名加註' : '';
          r.tr.classList.toggle('g-off', !!v.inactive);
          var s = q.value.trim(), d = dsel.value;
          r.tr.classList.toggle('hidden', !!((s && [v.name, v.phone, v.note].join(' ').indexOf(s) < 0) || (d && v.dept !== d && r.id)));
        },
        onChange: function (G) {
          var by = {};
          G.rows.forEach(function (r) { if (r.del) return; var v = r.read(); if (!String(v.name).trim() || v.inactive) return; by[v.dept || '（沒填股別）'] = (by[v.dept || '（沒填股別）'] || 0) + 1; });
          clear(count).appendChild(document.createTextNode(Object.keys(by).map(function (k) { return k + ' ' + by[k]; }).join('　·　') || ''));
        },
        tools: function () {
          return [q, dsel, R.canEdit ? h('button', { class: 'btn', onclick: function () {
            var t = area('', { rows: 8, placeholder: '王小明,輔導,1,0912345678\n李大華,活動' });
            form('貼上多位工作人員', [field('每行一位：姓名,股別,小隊,電話（小隊和電話可省略）', t, '同名同股別已存在的會略過')], function () { return run('worker.import', { text: t.value }, { action: 'create', msg: false }).then(function (x) { if (x) toast('新增 ' + x.added + ' 位'); }); });
          } }, '一次貼上多位') : null];
        }
      });
      box.insertBefore(h('div', { style: { margin: '-4px 0 8px' } }, count), G.bar.nextSibling);
      q.addEventListener('input', G.hooks); dsel.addEventListener('change', G.hooks);
      if (Q.id) { var hit = G.rows.filter(function (r) { return r.id === Q.id; })[0]; if (hit) { hit.tr.style.background = 'var(--warn-soft)'; setTimeout(function () { hit.tr.scrollIntoView({ block: 'center' }); }, 50); } }
    },
    squads: function (box, D) {
      var edit = function (s) {
        s = s || { data: {} };
        var no = inp(s.data.no, { type: 'number', min: 1, max: 99, disabled: !!s.id }), name = inp(s.data.name), line = inp(s.data.line, { placeholder: 'https://line.me/…' });
        form(s.id ? '編輯小隊' : '新增小隊', [h('div', { class: 'grid2' }, field('小隊號碼', no), field('隊名', name)), field('小隊群組連結（學員端會顯示）', line)], function () { return run('squad.save', { no: no.value, name: name.value, line: line.value }); });
      };
      box.appendChild(bar(addBtn('新增小隊', function () { edit(); }), h('span', { class: 'hint' }, '和報名系統串接時，同步名單會自動補上報名系統的小隊。')));
      var staffOf = function (no) {
        var out = [];
        D.workers.forEach(function (w) { if (w.data.inactive) return; var sq = (w.data.regSquads || []).map(Number); if (String(w.data.squad) === String(no) || sq.indexOf(Number(no)) >= 0) out.push(w.data.name + ((w.data.titles || {})[String(no)] ? '（' + w.data.titles[String(no)] + '）' : '')); });
        return out.join('、');
      };
      var cnt = function (no) { return D.students.filter(function (x) { return x.data.active !== false && String(x.data.squad) === String(no); }).length; };
      box.appendChild(table(['號碼', '隊名', '專輔、隨輔', '學員', '群組', ''], D.squads.map(function (s) {
        return h('tr', null, h('td', null, s.data.no), h('td', null, s.data.name), h('td', { class: 'small' }, staffOf(s.data.no) || h('span', { class: 'tag warn' }, '未安排')), h('td', null, cnt(s.data.no)), h('td', { class: 'small' }, s.data.line ? '有' : ''), actions(function () { edit(s); }, function () { del('squad.delete', { no: s.data.no }, s.data.name); }));
      }), '還沒有小隊'));
    },
    students: function (box, D) {
      var active = D.students.filter(function (s) { return s.data.active !== false; });
      var add = addBtn('手動新增（測試用）', function () {
        var name = inp(''), squad = inp('', { type: 'number', min: 1 });
        form('手動新增學員', [field('姓名', name), field('小隊', squad), h('div', { class: 'hint' }, '正式學員請從報名系統同步；手動新增的學員不能從學員專區進入，只用於測試畫面。')], function () { return run('student.save', { name: name.value, squad: squad.value }, { action: 'create' }); });
      });
      box.appendChild(bar(add, h('span', { class: 'hint' }, '有效 ' + active.length + ' 位')));
      box.appendChild(h('div', { class: 'hint', style: { marginBottom: '8px' } }, '報名系統是正式資料來源：互動系統只保存學員代碼、姓名、小隊、房間與是否有效，分隊、分房要在報名系統改。'));
      box.appendChild(table(['學員代碼', '姓名', '小隊', '房間', '狀態'], D.students.slice().sort(function (a, b) { return (Number(a.data.squad) || 99) - (Number(b.data.squad) || 99); }).map(function (s) {
        return h('tr', null, h('td', { class: 'small' }, s.id), h('td', null, s.data.name), h('td', null, s.data.squad || '—'), h('td', null, s.data.room || '—'), h('td', null, s.data.active === false ? h('span', { class: 'tag' }, '無效（取消／候補）') : h('span', { class: 'tag ok' }, '有效'), s.data.manual ? h('span', { class: 'tag info', style: { marginLeft: '4px' } }, '手動') : null));
      }), '還沒有學員。到「營隊設定」完成串接後按「從報名後台同步」。'));
    },
    rooms: function (box, D) {
      var act = D.students.filter(function (s) { return s.data.active !== false; });
      var none = act.filter(function (s) { return !s.data.room; }).length;
      box.appendChild(h('div', { class: 'hint', style: { marginBottom: '8px' } }, '分房在報名後台設定，這裡只顯示同步來的結果。工作人員端可以放「分房表（工作人員）」畫面；學員端「我的資料」會顯示自己的房間（報名後台有公布分房時）。' + (none ? '　還有 ' + none + ' 位學員沒有分房。' : '')));
      box.appendChild(table(['房號', '名稱', '性別', '備註', '學員'], (D.rooms || []).map(function (r) {
        var ppl = act.filter(function (s) { return s.data.room === r.no; }).map(function (s) { return s.data.name; });
        return h('tr', null, h('td', null, h('b', null, r.no)), h('td', null, r.label || ''), h('td', null, r.sex || '不限'), h('td', { class: 'small' }, r.note || ''), h('td', { class: 'small' }, ppl.length + ' 人：' + (ppl.join('、') || '—')));
      }), '還沒有分房資料。在報名後台分房後，按上面的「從報名後台同步」。'));
    },
    /** 工作分配：依活動分組，每列一個工作（角色／詳細工作／日期／需要人數／人員），人數不夠會標出來 */
    assign: function (box, D) {
      var CN = '〇一二三四五六七八九十';
      var nextJob = function (v) {
        var d = String(v.detail || ''), m = d.match(/^(.*?)(\d+)(\D*)$/), c = d.match(/^(.*?)([一二三四五六七八九十]{1,2})([^一二三四五六七八九十]*)$/);
        if (m) d = m[1] + (Number(m[2]) + 1) + m[3];
        else if (c) {
          var n = c[2].length === 1 ? CN.indexOf(c[2]) : c[2] === '十' ? 10 : c[2].charAt(0) === '十' ? 10 + CN.indexOf(c[2].charAt(1)) : CN.indexOf(c[2].charAt(0)) * 10 + (c[2].charAt(1) === '十' ? 0 : CN.indexOf(c[2].charAt(1)));
          n++;
          if (n > 0 && n < 20) d = c[1] + (n <= 10 ? (n === 10 ? '十' : CN.charAt(n)) : '十' + CN.charAt(n - 10)) + c[3];
        }
        return { activity: v.activity || '', role: v.role || '', detail: d === String(v.detail || '') ? '' : d, date: v.date || '', need: v.need === undefined ? '' : v.need, people: [] };
      };
      var acts = actsOf(D);
      D.assign.forEach(function (a) { if (a.data.activity && acts.indexOf(a.data.activity) < 0) acts.push(a.data.activity); });
      // 同一組工作（同活動＋同工作別）排在一起：照第一次出現的順序，組內保持原本順序
      var jobOrder = function (list) {
        var key = function (a) { return String(a.data.activity || '').replace(/\s+/g, '') + '|' + String(a.data.role || '').replace(/\s+/g, ''); }, first = {};
        list.forEach(function (a, i) { var k = key(a); if (!(k in first)) first[k] = i; });
        return list.map(function (a, i) { return { a: a, i: i }; }).sort(function (x, y) { return first[key(x.a)] - first[key(y.a)] || x.i - y.i; }).map(function (x) { return x.a; });
      };
      var groups = [''].concat(acts);   // 第一組：不屬於某個活動的一般工作事項（接待、守夜…）
      var wById = {};
      D.workers.forEach(function (w) { if (!w.data.inactive) wById[w.id] = w; });
      var roles = [];
      D.assign.forEach(function (a) { if (a.data.role && roles.indexOf(a.data.role) < 0) roles.push(a.data.role); });
      ['關主', '機動', '守夜', '場控', '器材', '攝影'].forEach(function (x) { if (roles.indexOf(x) < 0) roles.push(x); });
      box.appendChild(h('div', { class: 'hint', style: { marginBottom: '8px' } }, '最上面「一般工作事項」放不屬於某個活動的工作（接待、守夜、場佈…）；同一個工作有好幾關（例如關主），在詳細工作按 Enter 或按 ↓，會在下面多一列，自動帶好工作並接下一關，只要放人。其他依活動分組（活動清單和營期流程同一份）。列出要做的工作和需要幾個人，再把人放進去；人數不夠會標紅、剛好是綠色。角色含「守夜」的會自動成為那一晚的守夜人員（日期要填）。'));
      var sum = h('div', { class: 'row wrap', style: { marginBottom: '8px' } });
      var load = h('details', { class: 'card', style: { marginTop: '12px' } }, h('summary', { style: { cursor: 'pointer', fontWeight: 700 } }, '每個人分到的工作'), h('div', { class: 'small' }));
      var G = grid(box, [
        { k: 'activity', label: '活動', w: '130px', list: acts },
        { k: 'role', label: '工作（角色）', w: '120px', list: roles },
        { k: 'detail', label: '詳細工作', w: '160px', multi: true },
        { k: 'date', label: '日期', type: 'date', w: '140px' },
        { k: 'need', label: '需要人數', type: 'number', w: '80px' },
        { k: 'people', label: '人員', type: 'people' },
        { k: 'st', label: '核對', type: 'calc', w: '86px', fn: function (v) {
          var n = (v.people || []).filter(function (p) { return wById[p]; }).length, need = Number(v.need) || 0;
          if (!need) return h('span', { class: 'tag' }, n + ' 人');
          return h('span', { class: 'tag ' + (n < need ? 'bad' : n > need ? 'warn' : 'ok') }, n + '／' + need + (n < need ? ' 缺 ' + (need - n) : n > need ? ' 多 ' + (n - need) : ' ✓'));
        } }
      ], {
        rows: jobOrder(D.assign).map(function (a) { return { id: a.id, ver: a.version, vals: { activity: a.data.activity, role: a.data.role, detail: a.data.detail || '', date: a.data.date || '', need: a.data.need === undefined ? '' : a.data.need, people: a.data.people || [] } }; }),
        workers: D.workers.filter(function (w) { return !w.data.inactive; }), saveOp: 'assign.save', delOp: 'assign.delete', parse: parseCell, flash: 'assign', addText: '＋ 這個活動加一個工作',
        groupOf: function (v) { return v.activity || ''; }, extraGroups: groups,
        groupOrder: function (keys) { return keys.sort(function (a, b) { var x = groups.indexOf(a), y = groups.indexOf(b); return (x < 0 ? 999 : x) - (y < 0 ? 999 : y); }); },
        groupLabel: function (k, rows) { return (k || '一般工作事項（不屬於某個活動）') + '　' + rows.length + ' 個工作'; },
        groupActions: function (k) {
          if (!k) return null;
          var sa = (D.schedActRows || []).filter(function (a) { return String(a.data.name || '').trim() === k; })[0];
          var cnt = function () { return D.assign.filter(function (a) { return String(a.data.activity || '').trim() === k; }).length; };
          var guard = function () { if (dirtyAny()) { toast('還有沒儲存的改動（橘色框），先儲存再改活動', true); return false; } return true; };
          // 營期流程也有這個活動：一起改名／刪掉（沒有權限就跳過，提醒到營期流程改）
          var sched = function (fn) { return sa ? fn().then(function () { return ''; }, function (e) { return '（營期流程的活動沒改到：' + e.message + '）'; }) : Promise.resolve(''); };
          return h('span', { class: 'row', style: { gap: '2px' } },
            h('button', { class: 'btn sm ghost', type: 'button', title: '活動改名（底下的工作一起改）', onclick: function () {
              if (!guard()) return;
              askText('活動改名', '新的活動名稱', k).then(function (n) {
                n = String(n || '').trim(); if (!n || n === k) return;
                return A.op('pkg.data', { action: 'update', target: { pkg: 'people', op: 'act.rename', tab: pageTab() }, data: { from: k, to: n } })
                  .then(function () { return sched(function () { return A.op('pkg.data', { action: 'update', target: { pkg: 'schedule', op: 'activity.save' }, data: Object.assign({}, sa.data, { id: sa.id, name: n }), ver: sa.version }); }); })
                  .then(function (w) { toast('已改名為「' + n + '」' + w); return reload(); }, fail);
              });
            } }, '✎ 改名'),
            h('button', { class: 'btn sm ghost', type: 'button', title: '刪除這個活動', onclick: function () {
              if (!guard()) return;
              var n = cnt(), keep = h('input', { type: 'radio', name: 'actdel', checked: true }), drop = h('input', { type: 'radio', name: 'actdel' });
              var body = h('div', { class: 'col' }, h('div', null, '刪除活動「' + k + '」' + (sa ? '，營期流程的這個活動也會一起刪掉（流程項目會變成不連活動）' : '') + '。'),
                n ? h('label', { class: 'check' }, keep, h('span', null, '底下 ' + n + ' 個工作移到「一般工作事項」')) : null,
                n ? h('label', { class: 'check' }, drop, h('span', null, '底下 ' + n + ' 個工作一起刪除')) : null);
              modal({ title: '刪除活動', body: body, actions: [{ text: '取消' }, { text: '刪除', cls: 'danger', onClick: function () {
                return A.op('pkg.data', { action: 'delete', target: { pkg: 'people', op: 'act.remove', tab: pageTab() }, data: { name: k, jobs: drop.checked ? 'delete' : 'move' } })
                  .then(function () { return sched(function () { return A.op('pkg.data', { action: 'delete', target: { pkg: 'schedule', op: 'activity.delete' }, data: { id: sa.id } }); }); })
                  .then(function (w) { toast('已刪除活動「' + k + '」' + w); return reload(); });
              } }] });
            } }, '🗑 刪除'));
        },
        // Enter 在下面插入一列：同一個活動、工作、日期、人數，詳細工作自動接下一關（第一關 → 第二關、第 1 關 → 第 2 關）
        enterInsert: true,
        blank: function (k, x, prev) { return prev ? nextJob(prev) : { activity: k || '', role: '', detail: '', date: '', need: '', people: [] }; },
        rowActions: function (r, G) { return R.canEdit ? h('button', { class: 'btn sm ghost', type: 'button', title: '同一個工作往下加一列（例如下一關），人員空白', onclick: function () { var n = G.add({ id: '', ver: undefined, vals: { activity: '', role: '', detail: '', date: '', need: '', people: [] }, fill: nextJob(r.read()) }, r.tr.nextSibling); G.changed(n); var f = n.tr.querySelector('td[data-ci="2"] input'); if (f) { f.focus(); f.select(); } } }, '↓') : null; },
        isEmpty: function (v) { return !String(v.role || '').trim() && !(v.people || []).length; },
        validate: function (d) { return !String(d.role).trim() ? '每一列都要填工作（角色）' : ''; },
        toData: function (v, r) { return { id: r.id, activity: v.activity, role: v.role, detail: v.detail, date: v.date, need: v.need, people: v.people }; },
        onChange: function (G) {
          // 同一組工作（同活動＋同工作，例如都是關主）：左邊同一個顏色、標「第幾列／共幾列」；同一組裡（同一天）同一個人出現兩次標紅
          var norm = function (x) { return String(x || '').replace(/\s+/g, ''); }, jobs = {}, order = [];
          G.rows.filter(function (r) { return !r.del && r.tr.parentNode; }).sort(function (a, b) { return a.tr.compareDocumentPosition(b.tr) & 4 ? -1 : 1; }).forEach(function (r) {
            var v = r.read(), k = norm(v.activity) + '|' + norm(v.role);
            if (!norm(v.role)) k = '';
            if (k && !jobs[k]) { jobs[k] = []; order.push(k); }
            r._job = k; if (k) jobs[k].push(r);
          });
          var dupN = 0;
          G.rows.forEach(function (r) {
            var td = r.tr.querySelector('td[data-ci="1"]'); if (!td) return;
            var tag = td.querySelector('.job-n'); if (tag) tag.remove();
            r.tr.classList.remove('job-grp', 'job-cont', 'job-dup'); r.tr.removeAttribute('data-job');
            var list = r._job ? jobs[r._job] : null;
            if (r.del || !list || list.length < 2) return;
            var i = list.indexOf(r), v = r.read(), names = [];
            (v.people || []).forEach(function (p) {
              if (list.some(function (o2) { if (o2 === r) return false; var w = o2.read(); return (w.date || '') === (v.date || '') && (w.people || []).indexOf(p) >= 0; })) names.push(wById[p] ? wById[p].data.name : p);
            });
            r.tr.classList.add('job-grp'); if (i > 0 && list[i - 1].tr === r.tr.previousSibling) r.tr.classList.add('job-cont');
            r.tr.dataset.job = String(order.indexOf(r._job) % 6);
            var t = h('div', { class: 'job-n' }, h('span', null, '同一組 ' + (i + 1) + '／' + list.length));
            if (names.length) { r.tr.classList.add('job-dup'); dupN++; t.appendChild(h('span', { class: 'tag bad' }, '重複：' + names.join('、'))); }
            td.appendChild(t);
          });
          var need = 0, have = 0, short = 0, per = {};
          G.rows.forEach(function (r) {
            if (r.del) return;
            var v = r.read(), n = (v.people || []).filter(function (p) { return wById[p]; }).length, nd = Number(v.need) || 0;
            need += nd; have += Math.min(n, nd || n); if (nd && n < nd) short++;
            (v.people || []).forEach(function (p) { (per[p] = per[p] || []).push((v.activity ? v.activity + '／' : '') + (v.role || '') + (v.date ? '（' + v.date.slice(5) + '）' : '')); });
          });
          clear(sum).appendChild(h('span', { class: 'tag ' + (short ? 'bad' : 'ok') }, short ? short + ' 個工作還缺人' : '人數都夠了'));
          if (dupN) sum.appendChild(h('span', { class: 'tag bad' }, '同一組工作有人重複（' + dupN + ' 列）'));
          if (need) sum.appendChild(h('span', { class: 'small muted' }, '需要 ' + need + ' 人次，已安排 ' + have));
          var lb = load.lastChild, free = D.workers.filter(function (w) { return !w.data.inactive && !per[w.id]; });
          clear(lb).appendChild(h('div', { class: 'col', style: { gap: '4px', marginTop: '8px' } }, D.workers.filter(function (w) { return per[w.id]; }).sort(function (a, b) { return per[b.id].length - per[a.id].length; }).map(function (w) {
            return h('div', null, h('b', null, w.data.name), h('span', { class: 'muted' }, '（' + (w.data.dept || '') + '）' + per[w.id].length + ' 個：'), per[w.id].join('、'));
          }), free.length ? h('div', { class: 'muted', style: { marginTop: '6px' } }, '還沒分到工作：' + free.map(function (w) { return w.data.name; }).join('、')) : null));
        }
      });
      box.insertBefore(sum, G.bar);
      box.appendChild(load);
      if (R.canEdit) box.appendChild(h('div', { style: { marginTop: '8px' } }, h('button', { class: 'btn sm', onclick: function () { askText('新增活動', '活動名稱', '').then(function (n) { n = String(n || '').trim(); if (!n) return; var r = G.newRow(n, null); r.tr.querySelector('td[data-ci="1"] input').focus(); }); } }, '＋ 新的活動')));
    },
    /** 先設定好有哪些股別、哪些活動 */
    setup: function (box, D) {
      var listEd = function (title, hint, items, counts, extra) {
        var rows = items.slice(), el = h('div', { class: 'col', style: { gap: '6px' } });
        var draw = function () {
          clear(el);
          rows.forEach(function (x, i) {
            var t = inp(x, { disabled: !R.canEdit });
            t.oninput = function () { rows[i] = t.value; };
            el.appendChild(h('div', { class: 'row' }, h('div', { class: 'grow' }, t), counts ? h('span', { class: 'small muted', style: { minWidth: '60px' } }, counts(x) + ' 人') : null,
              R.canEdit ? h('button', { class: 'btn sm ghost', type: 'button', onclick: function () { if (i) { rows.splice(i - 1, 0, rows.splice(i, 1)[0]); draw(); } } }, '↑') : null,
              R.canEdit ? h('button', { class: 'btn sm ghost', type: 'button', onclick: function () { rows.splice(i, 1); draw(); } }, '✕') : null));
          });
          if (R.canEdit) el.appendChild(h('div', { class: 'row wrap' }, h('button', { class: 'btn sm', type: 'button', onclick: function () { rows.push(''); draw(); var l = el.querySelectorAll('input'); l[l.length - 1].focus(); } }, '＋ 新增'), extra ? extra(rows, draw) : null));
        };
        draw();
        return { el: h('div', { class: 'card col' }, h('h2', null, title), h('div', { class: 'hint' }, hint), el), get: function () { return rows.map(function (x) { return String(x).trim(); }).filter(String); } };
      };
      var cnt = {}, deptOf = function (x) { return String(x || '').trim().replace(/\s+/g, ''); };
      D.workers.forEach(function (w) { if (!w.data.inactive) { var k = deptOf(w.data.dept); cnt[k] = (cnt[k] || 0) + 1; } });
      // 股別名稱寫法略有不同（例如「活動」和「活動股」）也算進去
      var cntOf = function (x) {
        var k = deptOf(x), n = cnt[k] || 0;
        if (!n && k) Object.keys(cnt).forEach(function (c) { if (c && (c.replace(/股$/, '') === k.replace(/股$/, ''))) n += cnt[c]; });
        return n;
      };
      var dE = listEd('股別', '工作人員名單選股別時會跳出這些；也是登入時要填的股別，名稱請和大家講好。', R.config.depts || [], cntOf, function (rows, draw) {
        return h('button', { class: 'btn sm ghost', type: 'button', onclick: function () { Object.keys(cnt).forEach(function (d) { if (d && rows.indexOf(d) < 0) rows.push(d); }); draw(); } }, '從工作人員名單帶入');
      });
      var used = {};
      D.assign.forEach(function (a) { used[a.data.activity] = (used[a.data.activity] || 0) + 1; });
      var hasSched = A.pool.some(function (p) { return p.pkg === 'schedule'; });
      var aE = listEd('活動', '工作分配依這些活動分組（例如：開幕、闖關、晚會）。接待、守夜這種不屬於活動的工作不用列，工作分配最上面有「一般工作事項」。' + (hasSched ? '這份清單和「營期流程 → 活動」同步：這裡新增的會一起建立到營期流程（先設為學員端不公開），營期流程新增的也會出現在這裡（要刪掉營期流程的活動，請到營期流程刪）。' : ''), actsOf(D), null, function (rows, draw) {
        return Object.keys(used).some(function (n) { return n && rows.indexOf(n) < 0; }) ? h('button', { class: 'btn sm ghost', type: 'button', onclick: function () { Object.keys(used).forEach(function (n) { if (n && rows.indexOf(n) < 0) rows.push(n); }); draw(); } }, '把工作分配用到的活動帶入') : null;
      });
      var btn = h('button', { class: 'btn', onclick: function (e) { busy(e.target, function () {
        var acts = aE.get();
        return syncSchedActs(acts, D.schedActs || []).then(function (n) { return run('setup.save', { depts: dE.get(), actList: acts }, { msg: '股別與活動已儲存' + (n ? '（營期流程新增 ' + n + ' 個活動）' : ''), flash: 'setup' }); });
      }).catch(function () {}); } }, '儲存');
      var wrap = h('div', { class: 'col' }, h('div', { class: 'grid2', style: { alignItems: 'start' } }, dE.el, aE.el), R.canEdit ? h('div', { class: 'row' }, btn) : null);
      var tr = track(wrap, function () { return [dE.get(), aE.get()]; }, btn);
      if (R.canEdit) btn.parentNode.appendChild(tr.status);
      flashOn(wrap, 'setup');
      box.appendChild(wrap);
    }
  };

  /** 活動清單：人員與分隊自己列的＋營期流程建立的，合在一起（兩邊同一份） */
  function actsOf(D) {
    var out = [];
    (R.config.actList || []).concat(D.schedActs || []).forEach(function (n) { n = String(n || '').trim(); if (n && out.indexOf(n) < 0) out.push(n); });
    return out;
  }
  /** 營期流程還沒有的活動：幫忙建立（先設成不公開）；沒有營期流程或沒有權限就跳過 */
  function syncSchedActs(names, have) {
    var add = names.filter(function (n) { return have.indexOf(n) < 0; });
    if (!add.length || !A.pool.some(function (p) { return p.pkg === 'schedule'; })) return Promise.resolve(0);
    return A.op('pkg.data', { action: 'replace', target: { pkg: 'schedule', op: '_batch' }, data: { list: add.map(function (n) { return { op: 'activity.save', data: { name: n, publicMode: 'hidden' } }; }) } })
      .then(function (x) { return x ? x.saved : 0; }, function () { return 0; });
  }
  var PUB = { public: '公開', hidden: '不公開', auto: '自動公開', manual: '手動公開' };
  VIEWS.schedule = {
    items: function (box, D) {
      var flows = D.flows.slice().sort(function (a, b) { return (a.data.order || 0) - (b.data.order || 0); });
      var cur = Q.flow || (flows[0] && flows[0].id) || 'main';
      var cf = String(R.config.customFields || '').split(/[、,，]/).map(function (x) { return x.trim(); }).filter(String);
      var acts = [{ value: '', label: '（不連活動）' }].concat(D.activities.map(function (a) { return { value: a.id, label: a.data.name }; }));
      var edit = function (it) {
        it = it || { id: '', data: { flow: cur } };
        var d = it.data;
        var flow = sel(flows.map(function (f) { return { value: f.id, label: f.data.name }; }), d.flow || cur), date = inp(d.date, { type: 'date' }), time = inp(d.time, { type: 'time' }), dur = inp(d.dur || '', { type: 'number', min: 0, placeholder: '分鐘' });
        var name = inp(d.name), place = inp(d.place, { list: 'placeList' }), act = sel(acts, d.activity || ''), note = area(d.note, { rows: 2 }), link = inp(d.link, { placeholder: 'https://' });
        var wi = workerItems(D.workers), owner = chips(wi, d.owner), staff = chips(wi, d.staff), backup = chips(wi, d.backup);
        var sq = chips(D.squads.map(function (s) { return { value: s.no, label: s.name }; }), d.squads);
        var custom = {};
        var dl = h('datalist', { id: 'placeList' }, D.places.map(function (p) { return h('option', { value: p.data.name }); }));
        form(it.id ? '編輯流程項目' : '新增流程項目', [dl, h('div', { class: 'grid2' }, field('流程', flow), field('活動名稱', name)), h('div', { class: 'grid2' }, h('div', { class: 'grid2' }, field('日期', date), field('時間', time)), h('div', { class: 'grid2' }, field('時長', dur), field('場地', place))),
          field('連到活動（決定學員看不看得到、現在主題）', act), field('負責人員', owner.el), field('關主／參與人員', staff.el), field('機動人員', backup.el), field('參與小隊（隊輔的帶隊流程會顯示）', sq.el),
          cf.map(function (k) { var x = inp((d.custom || {})[k]); custom[k] = x; return field(k, x); }), field('備註', note), field('連結', link)],
          function () {
            var c = {};
            Object.keys(custom).forEach(function (k) { c[k] = custom[k].value; });
            return run('item.save', { id: it.id, flow: flow.value, date: date.value, time: time.value, dur: dur.value, name: name.value, place: place.value, activity: act.value, owner: owner.get(), staff: staff.get(), backup: backup.get(), squads: sq.get(), note: note.value, link: link.value, tone: d.tone || '', go: d.go || '', custom: c }, { ver: it.id ? it.version : undefined });
          }, true);
      };
      // 匯出 Excel：全部流程、全部天，顏色和這裡一樣（活動淡色、重要黃、極重要紅底白字）
      var csv = function () {
        var mm = function (t) { var m = String(t || '').match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
        var hmx = function (n) { n = ((n % 1440) + 1440) % 1440; return pad2(Math.floor(n / 60)) + ':' + pad2(n % 60); };
        var heads = ['日期', '開始', '時長', '結束', '標示', '活動名稱', '場地', '負責人員', '關主／參與人員', '機動人員', '備註', '連結'].concat(cf);
        var widths = [12, 8, 6, 8, 8, 22, 16, 20, 20, 16, 30, 24].concat(cf.map(function () { return 16; }));
        var toneName = { act: '活動', key: '重要', crit: '極重要' };
        var order = flows.slice().sort(function (x, y) { return (x.id === cur ? -1 : 0) - (y.id === cur ? -1 : 0) || (Number(x.data.order) || 0) - (Number(y.data.order) || 0); });
        var last = heads.length - 1;
        var sheets = order.map(function (f) {
          var its = D.items.filter(function (it) { return (it.data.flow || 'main') === f.id; }).slice().sort(function (x, y) { return String(x.data.date || '9999').localeCompare(String(y.data.date || '9999')) || (mm(x.data.time) === null ? 9999 : mm(x.data.time)) - (mm(y.data.time) === null ? 9999 : mm(y.data.time)); });
          var rows = [[{ v: (A.info.name || '') + '　' + f.data.name, bold: true, size: 14, border: false }]], merges = [[0, 0, 0, last]];
          rows.push(heads.map(function (x) { return { v: x, bg: '#2f5d57', color: '#ffffff', bold: true, align: 'center' }; }));
          var day = null;
          its.forEach(function (it) {
            var d = it.data;
            if (d.date !== day) { day = d.date; merges.push([rows.length, 0, rows.length, last]); rows.push([{ v: d.date ? dayNo(d.date) + dayLabel(d.date) : '（沒填日期）', bg: '#e8ecea', bold: true }].concat(heads.slice(1).map(function () { return { v: '', bg: '#e8ecea' }; }))); }
            var st = d.tone === 'crit' ? { bg: '#b3261e', color: '#ffffff', bold: true } : d.tone === 'key' ? { bg: '#ffe3a3', bold: true } : d.tone === 'act' ? { bg: Front.actColor(d.name) } : {};
            var s0 = mm(d.time), en = s0 !== null && d.dur ? hmx(s0 + Number(d.dur)) : '';
            var cells = [d.date || '', d.time || '', d.dur || '', en, toneName[d.tone] || '', d.name || '', d.place || '', nameOf(D.workers, d.owner), nameOf(D.workers, d.staff), nameOf(D.workers, d.backup), d.note || '', d.link || ''].concat(cf.map(function (k) { return (d.custom || {})[k] || ''; }));
            rows.push(cells.map(function (c, ci) { return Object.assign({ v: c, align: ci < 5 ? 'center' : '' }, st); }));
          });
          return { name: f.data.name, cols: widths, rows: rows, merges: merges };
        });
        saveBlob(xlsxBlob(sheets), (A.info.name || '營隊') + '-營期流程.xlsx');
        toast('已匯出全部流程、全部天（每份流程一個工作表）');
      };
      var items = D.items.filter(function (it) { return (it.data.flow || 'main') === cur; });
      // 一覽編輯（像 Excel）：依日期分組，直接改；同時段並行的項目用同色的左邊線標出來，同一人同時被排兩個會標紅
      var dflt = Number(R.config.defaultDuration) || 60;
      var toMin = function (t) { var m = String(t || '').match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
      var toHm = function (n) { n = ((n % 1440) + 1440) % 1440; return pad2(Math.floor(n / 60)) + ':' + pad2(n % 60); };
      var days = [];
      // 驗收流程：分組的日子用那次驗收的日期（天數壓縮）
      var curF = flows.filter(function (f) { return f.id === cur; })[0], curRh = curF && curF.data.kind === 'rehearsal' ? (A.info.rehearsals || []).filter(function (r) { return r.id === curF.data.rh; })[0] : null;
      var dS = curRh ? curRh.start : A.info.start, dE = curRh ? curRh.end : A.info.end;
      if (dS && dE) for (var dd = new Date(dS + 'T12:00:00+08:00'); taipei(dd).ymd <= dE; dd = new Date(dd.getTime() + 86400000)) days.push(taipei(dd).ymd);
      var dayNo = function (k) { var i = days.indexOf(k); return i >= 0 ? (curRh ? curRh.name : '') + '第' + '一二三四五六七八九十'.charAt(i) + '天｜' : ''; };
      var wn = {};
      D.workers.forEach(function (w) { wn[w.id] = w.data.name; });
      var OVC = ['#c8803a', '#3563a8', '#8a4fb0', '#2e7d4f', '#c0392b'];
      var selBar = h('span', { class: 'row wrap hidden' });
      var shift = inp('', { type: 'number', placeholder: '±分鐘', style: { width: '90px' } }), toDate = inp('', { type: 'date', style: { width: '150px' } });
      var SCH_PRESETS = ['集合', '緩衝時間', '早餐', '午餐', '晚餐', '工人用餐'];
      var actNames = [];
      D.activities.map(function (a) { return a.data.name; }).concat(D.peopleActs || []).forEach(function (n) { n = String(n || '').trim(); if (n && actNames.indexOf(n) < 0) actNames.push(n); });
      var nameList = actNames.concat(SCH_PRESETS);
      D.items.forEach(function (it) { var n = String(it.data.name || '').trim(); if (n && nameList.indexOf(n) < 0) nameList.push(n); });   // 自己打過的名稱下次也會出現在選單
      var actById = {};
      D.activities.forEach(function (a) { actById[a.id] = a; });
      // 活動配色看連到的活動（沒有就看名稱），和工作人員端一樣
      var actOfRow = function (v) { return v.name; };
      // 工作分配裡有這個活動：名稱填好時自動帶入那些工作人員（之後可以自己拿掉）
      var assignOf = function (name) { name = String(name || '').trim(); var out = []; (D.assign || []).forEach(function (a) { if (String(a.data.activity || '').trim() === name) (a.data.people || []).forEach(function (p) { if (out.indexOf(p) < 0) out.push(p); }); }); return out; };
      var endOf = function (v) { var t = toMin(v.time); return t === null ? null : t + (Number(v.dur) || dflt); };
      items = items.slice().sort(function (a, b) { var x = a.data, y = b.data; return (x.date || '').localeCompare(y.date || '') || (x.time || '99:99').localeCompare(y.time || '99:99') || (Number(y.dur) || 0) - (Number(x.dur) || 0); });
      var G = grid(box, [
        { k: 'date', type: 'hidden' }, { k: 'flow', type: 'hidden' },
        { k: 'time', label: '開始', type: 'time', w: '74px' },
        { k: 'dur', label: '時長(分)', type: 'number', w: '72px' },
        { k: 'end', label: '結束', type: 'time', w: '74px', nopaste: true, ph: '' },
        { k: 'tone', label: '標示', type: 'select', w: '78px', nopaste: true, opts: [{ value: '', label: '—' }, { value: 'act', label: '活動' }, { value: 'key', label: '重要' }, { value: 'crit', label: '極重要' }] },
        { k: 'name', label: '活動名稱', w: '170px', list: nameList },
        { k: 'rel', label: '時間關係', type: 'calc', w: '150px', fn: function () { return null; } },
        { k: 'place', label: '場地', type: 'tags', w: '140px', list: D.places.map(function (p) { return p.data.name; }) },
        { k: 'owner', label: '負責人員', type: 'people', w: '150px' },
        { k: 'staff', label: '關主或參與人員', type: 'people', w: '190px' },
        { k: 'backup', label: '機動人員', type: 'people', w: '130px' },
        { k: 'note', label: '備註', w: '150px', multi: true },
        { k: 'go', label: '連到流程／活動細流', type: 'select', w: '170px', nopaste: true, opts: [{ value: '', label: '—' }].concat(flows.filter(function (f) { return f.id !== cur; }).map(function (f) { return { value: 'flow:' + f.id, label: '流程：' + f.data.name }; }), D.rotations.map(function (r) { return { value: 'rot:' + r.id, label: '細流：' + (r.data.name || (actById[r.data.activity] ? actById[r.data.activity].data.name : '活動細流')) }; })) },
        { k: 'link', label: '其他連結', w: '110px', ph: 'https://' }
      ].concat(cf.map(function (k) { return { k: 'cf:' + k, label: k, w: '110px' }; })), {
        rows: items.map(function (it) { var d = it.data, v = { date: d.date, flow: d.flow || cur, time: d.time, dur: d.dur || '', end: '', tone: d.tone || '', name: d.name, place: d.place, owner: d.owner || [], staff: d.staff || [], backup: d.backup || [], note: d.note || '', go: d.go || '', link: d.link || '' }; var e = endOf(v); if (e !== null && d.dur) v.end = toHm(e); cf.forEach(function (k) { v['cf:' + k] = (d.custom || {})[k] || ''; }); return { id: it.id, ver: it.version, vals: v, it: it }; }),
        // 選人時可以改成「依工作分配」：每個工作一組，這一列的活動排最前面
        workGroups: function (row) {
          var nm = String((row && row.ed && row.ed.name && row.ed.name.get ? row.ed.name.get() : row && row.vals.name) || '').trim();
          // 同活動＋同工作別（例如校園導覽的關主）合成一組，不分詳細工作（化學館、大草坪…）
          var gs = [], byK = {};
          (D.assign || []).forEach(function (a) {
            var d = a.data; if (!(d.people || []).length) return;
            var act = String(d.activity || '').trim(), role = String(d.role || '').trim(), k = act + '|' + role;
            var g = byK[k] || (byK[k] = gs[gs.push({ act: act, role: role, values: [] }) - 1]);
            d.people.forEach(function (p) { if (g.values.indexOf(p) < 0) g.values.push(p); });
          });
          gs.forEach(function (g) { g.name = (g.act || '一般工作') + '｜' + (g.role || '') + '（' + g.values.length + ' 人）'; });
          return gs.filter(function (g) { return g.act === nm; }).concat(gs.filter(function (g) { return g.act !== nm; }));
        },
        workers: D.workers, saveOp: 'item.save', delOp: 'item.delete', parse: parseCell, flash: 'items', select: true, drag: true, addText: '＋ 這一天加一項',
        groupOf: function (v) { return v.date || ''; }, extraGroups: days,
        groupOrder: function (keys) { return keys.sort(function (x, y) { return (x || '9999').localeCompare(y || '9999'); }); },
        groupLabel: function (k, rs) { return k ? dayNo(k) + dayLabel(k) + '　' + rs.length + ' 項' : '（沒填日期）'; },
        enterInsert: true,
        sortKey: function (v) { return (v.time || '99:99') + String(10000 - (Number(v.dur) || 0)).padStart(5, '0') + v.name; },
        // 新的一列：開始時間接上一列的結束
        blank: function (k, _, prev) { var e = prev ? endOf(prev) : null; var v = { date: k, flow: cur, time: e === null ? '' : toHm(e), dur: '', end: '', tone: '', name: '', place: '', owner: [], staff: [], backup: [], note: '', go: '', link: '' }; cf.forEach(function (c) { v['cf:' + c] = ''; }); return v; },
        isEmpty: function (v) { return !String(v.name || '').trim(); },
        validate: function (d) { return !String(d.name).trim() ? '有一列沒有活動名稱' : d.time && !/^\d{2}:\d{2}$/.test(d.time) ? '時間「' + d.time + '」看不懂，請打像 09:30' : ''; },
        toData: function (v, r) {
          var old = r.it ? r.it.data : {}, c = Object.assign({}, old.custom || {});
          cf.forEach(function (k) { c[k] = v['cf:' + k]; });
          var la = old.activity && actById[old.activity];
          var activity = la && la.data.name === old.name && v.name !== old.name ? '' : old.activity || '';   // 改了名稱就不再連到原本同名的活動（同名的會自動連）
          return { id: r.id, flow: v.flow || cur, date: v.date, time: v.time, dur: v.dur, tone: v.tone, name: v.name, place: v.place, activity: activity, owner: v.owner, staff: v.staff, backup: v.backup, squads: old.squads || [], note: v.note, go: v.go, link: v.link, custom: c };
        },
        rowInit: function (r) {
          // 開始、時長、結束三格連動：改結束就幫你算時長
          var setEnd = function () { var v = r.read(), e = endOf(v); if (e !== null && v.dur !== '') r.ed.end.set(toHm(e)); else if (v.dur === '') r.ed.end.set(''); };
          r.ed.time.input.addEventListener('input', setEnd); r.ed.time.input.addEventListener('change', setEnd);
          r.ed.dur.input.addEventListener('input', setEnd);
          r.ed.end.input.addEventListener('change', function () {
            var s0 = toMin(r.read().time), e0 = toMin(normTime(r.ed.end.input.value) || '');
            if (s0 === null || e0 === null) return;
            r.ed.dur.set(((e0 - s0) % 1440 + 1440) % 1440);
            r.t.check(); G.changed(r);
          });
          r.ed.name.input.addEventListener('change', function () {
            var v = r.read(), nm = v.name.trim();
            if (!v.tone && actNames.indexOf(nm) >= 0) r.ed.tone.set('act');
            var ppl = assignOf(nm);
            if (ppl.length && !(v.staff || []).length) { r.ed.staff.set(ppl); toast('已從工作分配帶入「' + nm + '」的 ' + ppl.length + ' 位工作人員（不需要的可以按 ✕ 拿掉）'); }
            r.t.check(); G.changed(r);
          });
        },
        afterSave: function (r) { var d = G.o.toData(r.read(), r); r.it = { id: r.id, version: r.ver, data: Object.assign({}, r.it ? r.it.data : {}, d) }; },
        rowActions: function (r) {
          return h('button', { class: 'btn sm ghost', type: 'button', title: '詳細設定（連到活動、參與小隊、自訂欄位）', onclick: function () {
            if (!r.it) { toast('新的列先按「儲存變更」，再開詳細設定', true); return; }
            if (dirtyAny()) { toast('表格還有沒儲存的改動，先按「儲存變更」再開詳細設定', true); return; }
            edit(r.it);
          } }, '⋯');
        },
        onDrop: function (r, k, G) { r.ed.date.set(k); G.moveTo(r, k); r.t.check(); G.changed(r); toast('已改到 ' + (k ? dayLabel(k) : '沒有日期') + '，記得按「儲存變更」'); },
        onSelect: function (list) { selBar.classList.toggle('hidden', !list.length); selBar.firstChild.textContent = '已選 ' + list.length + ' 項：'; },
        rowHook: null,
        onChange: function (G) {
          // 時間關係：完全包在另一項裡面的是「期間內」（例如午餐 11:00–13:00 裡的工人用餐 12:00–12:30），不是並排；
          // 一模一樣的時段是「並行」；只有部分重疊的是「時間交錯」，要確認；同一人在交錯或並行的兩項會標紅
          var byDay = {};
          G.rows.forEach(function (r) {
            var v = r.read(), s0 = toMin(v.time);
            r.tr.classList.remove('g-ov', 'g-child'); r.tr.style.removeProperty('--ov');
            r.tr.classList.toggle('g-tone-act', v.tone === 'act'); r.tr.classList.toggle('g-tone-key', v.tone === 'key'); r.tr.classList.toggle('g-tone-crit', v.tone === 'crit');
            if (v.tone === 'act') r.tr.style.setProperty('--tone', Front.actColor(actOfRow(v))); else r.tr.style.removeProperty('--tone');   // 每個活動自己的顏色
            var cell = clear(r.ed.rel.el);
            if (s0 === null || r.del) { if (!v.time && String(v.name || '').trim()) cell.appendChild(h('span', { class: 'tag bad' }, '沒時間')); return; }
            var e0 = s0 + (Number(v.dur) || dflt);
            if (v.dur !== '' && document.activeElement !== r.ed.end.input && v.end !== toHm(e0)) r.ed.end.set(toHm(e0));   // 平移時間之後結束也跟著動
            if (!v.dur) cell.appendChild(h('span', { class: 'small muted', title: '沒填時長，先用 ' + dflt + ' 分鐘算' }, '沒填時長 '));
            var pl = r.it && r.it.data.planned;
            if (pl && (pl.date !== v.date || pl.time !== v.time || String(pl.dur || '') !== String(v.dur || '') || (pl.place || '') !== (v.place || ''))) cell.appendChild(h('span', { class: 'diff', style: { display: 'block' }, title: '與既定行程不同' + (r.it.data.changedBy ? '（' + r.it.data.changedBy + ' 調整）' : '') }, '原訂 ' + String(pl.date || '').slice(5) + ' ' + (pl.time || '') + (pl.place && pl.place !== v.place ? ' ' + pl.place : '')));
            (byDay[v.date] = byDay[v.date] || []).push({ r: r, s: s0, e: e0, v: v, ppl: [].concat(v.owner || [], v.staff || [], v.backup || []) });
          });
          var color = 0;
          Object.keys(byDay).forEach(function (k) {
            var list = byDay[k];
            list.forEach(function (x) {
              var par = null, kids = 0, cross = [], same = [], clash = [];
              list.forEach(function (y) {
                if (y === x || !(x.s < y.e && y.s < x.e)) return;
                var xin = y.s <= x.s && x.e <= y.e, yin = x.s <= y.s && y.e <= x.e;
                if (xin && yin) same.push(y);
                else if (xin) { if (!par || (y.e - y.s) < (par.e - par.s)) par = y; }
                else if (yin) kids++;
                else cross.push(y);
                if (!(xin && !yin) && !(yin && !xin)) x.ppl.forEach(function (p) { if (y.ppl.indexOf(p) >= 0 && clash.indexOf(p) < 0) clash.push(p); });
              });
              var cell = x.r.ed.rel.el;
              if (par) { x.r.tr.classList.add('g-child'); cell.appendChild(h('span', { class: 'tag info' }, '⤷ 在「' + (par.v.name || '?') + '」期間')); }
              if (kids) cell.appendChild(h('span', { class: 'small muted' }, ' 期間內有 ' + kids + ' 項'));
              if (same.length) { x.col = x.col || same.map(function (y) { return y.col; }).filter(Boolean)[0] || OVC[color++ % OVC.length]; same.forEach(function (y) { y.col = y.col || x.col; }); x.r.tr.classList.add('g-ov'); x.r.tr.style.setProperty('--ov', x.col); cell.appendChild(h('span', { class: 'tag', style: { background: 'transparent', color: x.col, border: '1px solid ' + x.col } }, '並行')); }
              if (cross.length) cell.appendChild(h('span', { class: 'g-warn', style: { display: 'block' } }, '⚠ 和「' + cross.map(function (y) { return y.v.name; }).join('、') + '」時間交錯'));
              if (clash.length) cell.appendChild(h('span', { class: 'g-warn', style: { display: 'block' } }, '⚠ ' + clash.map(function (p) { return wn[p] || '?'; }).join('、') + ' 同時有別的'));
            });
          });
        },
        tools: function (G) {
          var apply = function (fn, msg) { var l = G.selected(); if (!l.length) return; l.forEach(function (r) { fn(r); r.t.check(); G.changed(r); }); toast(msg + '（' + l.length + ' 項），記得按「儲存變更」'); };
          selBar.appendChild(h('b', { class: 'small' }, ''));
          selBar.appendChild(h('span', { class: 'row' }, shift, h('button', { class: 'btn sm', type: 'button', onclick: function () {
            var n = Number(shift.value); if (!n) { toast('填要往後（正數）或往前（負數）幾分鐘', true); return; }
            apply(function (r) { var t = toMin(r.read().time); if (t !== null) r.ed.time.set(toHm(t + n)); }, '已平移 ' + (n > 0 ? '+' : '') + n + ' 分鐘');
          } }, '平移時間')));
          selBar.appendChild(h('span', { class: 'row' }, toDate, h('button', { class: 'btn sm', type: 'button', onclick: function () {
            if (!toDate.value) { toast('先選日期', true); return; }
            apply(function (r) { r.ed.date.set(toDate.value); G.moveTo(r, toDate.value); }, '已改到 ' + dayLabel(toDate.value));
          } }, '改到這天')));
          selBar.appendChild(h('button', { class: 'btn sm', type: 'button', onclick: function () {
            var l = G.selected(); l.forEach(function (r) { var v = r.read(); G.newRow(v.date, G.groupEnd(v.date), v); r.ck.checked = false; }); G.selChanged(); toast('已複製 ' + l.length + ' 項（新的列在那一天最下面），記得按「儲存變更」');
          } }, '複製一份'));
          selBar.appendChild(h('button', { class: 'btn sm ghost', type: 'button', onclick: function () { G.selected().forEach(function (r) { if (r.id) { r.del = true; r.tr.classList.add('g-del'); r.t.check(); } else { r.tr.remove(); G.rows = G.rows.filter(function (x) { return x !== r; }); } r.ck.checked = false; }); G.selChanged(); G.changed(); } }, '刪除'));
          return [h('button', { class: 'btn', type: 'button', title: '每一天依時間重新排好', onclick: function () { G.sort(); } }, '依時間排序'),
            h('button', { class: 'btn', onclick: csv }, '匯出 Excel（全部）'),
            A.isAdmin() && R.canEdit ? h('button', { class: 'btn', onclick: function () {
              confirmBox('鎖定既定行程', '把目前所有項目的日期、時間、時長、場地記為「既定行程」。之後的修改會在工作人員端顯示「與既定行程不同」（原訂、調整者、時間）。', '鎖定').then(function (ok) { if (ok) run('baseline', {}, { action: 'run', msg: '已鎖定既定行程' }).catch(fail); });
            } }, '鎖定既定行程') : null, selBar];
        }
      });
      if (curF && curF.data.kind === 'rehearsal') {
        // 驗收流程：說明＋從別的流程複製一天過來（例如正式第一天 → 一驗）
        var copyDay = function () {
          var others = flows.filter(function (f) { return f.id !== cur; });
          if (!others.length) { toast('沒有其他流程可以複製', true); return; }
          var from = sel(others.map(function (f) { return { value: f.id, label: f.data.name }; }), (others.filter(function (f) { return f.data.kind === 'main'; })[0] || others[0]).id);
          var srcDays = function () { var ds = []; D.items.forEach(function (it) { if (it.data.flow === from.value && it.data.date && ds.indexOf(it.data.date) < 0) ds.push(it.data.date); }); return ds.sort(); };
          var fromDate = sel([], ''), fill = function () { var ds = srcDays(); clear(fromDate); (ds.length ? ds : ['']).forEach(function (x) { fromDate.appendChild(h('option', { value: x }, x ? dayLabel(x) + '（' + D.items.filter(function (it) { return it.data.flow === from.value && it.data.date === x; }).length + ' 項）' : '這份流程沒有項目')); }); };
          from.addEventListener('change', fill); fill();
          var toD = sel(days.map(function (x, i) { return { value: x, label: curRh.name + '第' + '一二三四五六七八九十'.charAt(i) + '天（' + dayLabel(x) + '）' }; }), days[0] || '');
          form('從其他流程複製一天', [field('從哪份流程', from), field('哪一天', fromDate), field('複製到' + curF.data.name + '的', toD), h('div', { class: 'hint' }, '時間、時長、場地、人員都會帶過來，日期換成驗收那天；原本的不會被刪，可以複製好再改。')], function () {
            if (!fromDate.value || !toD.value) { toast('請選日期', true); return false; }
            return run('flow.copyDay', { from: from.value, to: cur, date: fromDate.value, toDate: toD.value }, { action: 'create', msg: '已複製到' + dayLabel(toD.value) });
          });
        };
        box.insertBefore(h('div', { class: 'recall-banner row wrap', style: { marginBottom: '10px' } },
          h('span', { class: 'grow' }, curRh ? '這是「' + curRh.name + '」（' + curRh.start.slice(5) + (curRh.end !== curRh.start ? '～' + curRh.end.slice(5) : '') + '）自己的流程。驗收期間工作人員端、快速展延、學員首頁的現在主題都改用這一份，正式流程不會被動到；驗收以外看不到。' : '這份驗收流程的驗收日程已經刪掉了，工作人員端不會再用到它，可以到「流程清單」刪除。'),
          curRh && R.canEdit ? h('button', { class: 'btn sm', type: 'button', onclick: copyDay }, '從其他流程複製一天') : null), G.bar);
      }
      box.insertBefore(h('div', { class: 'chips', style: { marginBottom: '10px' } }, flows.map(function (f) { return h('a', { class: 'chip' + (f.id === cur ? ' on' : ''), href: '#data/schedule/items?flow=' + f.id, style: { textDecoration: 'none' }, title: f.data.kind === 'rehearsal' ? '驗收流程：驗收期間自動使用' : f.data.hidden ? '工作人員端還看不到（到「流程清單」打開）' : null }, f.data.name, f.data.kind === 'rehearsal' ? h('span', { class: 'small', style: { opacity: .75 } }, '（驗收）') : f.data.hidden ? h('span', { class: 'small muted' }, '（未顯示）') : null); }), h('a', { class: 'chip', href: '#data/schedule/flows', style: { textDecoration: 'none' } }, '＋ 管理流程（複製、顯示）')), G.bar);
      box.insertBefore(h('div', { class: 'hint', style: { marginBottom: '8px' } }, '像 Excel 一樣直接改：↑↓ 換列、Enter 在下面插入一列、Ctrl+S 儲存；改了時間會自動排到正確的位置；時間直接打 930 或 9:30；改「結束」會自動算時長；新的一列開始時間接上一列結束。活動名稱可以從選單選（活動、集合、緩衝時間、三餐、工人用餐），也可以自己打，打過的下次會出現在選單。「標示」：活動是淡色、重要時程是鮮豔色。包在另一項時段裡的（例如午餐裡的工人用餐）會縮排標「期間內」；只有部分重疊的會標「時間交錯」。⧉ 複製一列再改；勾選左邊可以一次平移時間、改日期、複製；可以從 Excel 複製整塊（開始、時長、活動名稱、場地、負責、關主、機動、備註、連結）貼上。'), G.bar);
      if (Q.id) { var hit = G.rows.filter(function (r) { return r.id === Q.id; })[0]; if (hit) { hit.tr.style.background = 'var(--warn-soft)'; setTimeout(function () { hit.tr.scrollIntoView({ block: 'center' }); }, 50); } }
    },
    activities: function (box, D) {
      // 一覽表：學員端公開用開關，改好一次儲存；「手動公開」的活動開關就是公開／收回
      var tsLocal = function (iso) { if (!iso) return ''; var t = taipei(new Date(iso)); return t.ymd + 'T' + t.hm; };
      box.appendChild(h('div', { class: 'hint', style: { marginBottom: '8px' } }, '開關打開＝學員現在看得到。想到某個時間自動公開：開關關著、填「自動公開時間」。全部改好按一次「儲存變更」。這份清單和「人員與分隊 → 股別與活動」同一份；活動卡片頁在編輯器裡把頁面連到活動，活動還沒公開時學員端看不到那一頁。'));
      // 課程的詳細介紹（時間、教材、照片）在「課程簡介」；舊的營隊要先安裝
      var hasCourses = A.pool.some(function (p) { return p.pkg === 'courses'; });
      box.appendChild(h('div', { class: 'recall-banner row wrap', style: { marginBottom: '10px' } }, h('span', { class: 'grow' }, hasCourses ? '課程（課程導覽、參訪導覽、實驗室介紹）的時間、講者、教材檔案、照片在「課程簡介」編輯；這裡列的是要不要讓學員看到。' : '這個營隊還沒安裝「課程簡介」（10/22 之前建立的營隊不會自動有）。安裝後左邊會多一個「課程簡介」，可以放課程時間、講者、教材檔案、照片。'),
        hasCourses ? h('a', { class: 'btn sm', href: '#data/courses/list' }, '到課程簡介') : A.isAdmin() ? h('button', { class: 'btn sm primary', onclick: function (e) { busy(e.target, function () { return A.op('pkg.install', { data: { pkg: 'courses' } }); }).then(function () { toast('已安裝課程簡介'); return A.reload(); }).then(function () { A.navBuild(); A.route(); }, function () {}); } }, '安裝課程簡介') : null));
      var have = D.activities.map(function (a) { return String(a.data.name || '').trim(); });
      var miss = (D.peopleActs || []).filter(function (n) { return n && have.indexOf(n) < 0; });
      // 驗收時開放：每次驗收一欄，驗收中到時間就公開，驗收結束後回到原本設定
      var rhs = A.info.rehearsals || [];
      var rhVals = function (d) { var o = {}; rhs.forEach(function (x) { o['rh:' + x.id] = (d.rhOpen || {})[x.id] || ''; }); return o; };
      var rhOpenOf = function (v) { var o = {}; rhs.forEach(function (x) { if (v['rh:' + x.id]) o[x.id] = v['rh:' + x.id]; }); return o; };
      var G = grid(box, [
        { k: 'name', label: '活動／課程', w: '180px' },
        { k: 'pub', label: '學員看得到', type: 'switch', w: '100px' },
        { k: 'autoAt', label: '自動公開時間', type: 'datetime', w: '200px' }
      ].concat(rhs.map(function (x) { return { k: 'rh:' + x.id, label: x.name + '時開放（' + x.start.slice(5) + '～' + x.end.slice(5) + '）', type: 'datetime', w: '210px', min: x.start + 'T00:00', max: x.end + 'T23:59' }; })).concat([
        { k: 'summary', label: '簡介（現在主題、活動列表顯示）', w: '320px', multi: true },
        { k: 'st', label: '狀態', type: 'calc', w: '170px', fn: function (v, r) {
          var d = r.a ? r.a.data : {};
          if (v.pub) return h('span', { class: 'tag ok' }, '學員看得到');
          if (v.autoAt) return h('span', { class: 'tag info' }, Date.parse(v.autoAt + ':00+08:00') <= Date.now() ? '時間到了，存檔後公開' : fmt(v.autoAt + ':00+08:00') + ' 自動公開');
          return h('span', null, h('span', { class: 'tag' }, '看不到'), d.revealedBy ? h('div', { class: 'small muted' }, (d.revealed ? '公開' : '收回') + '：' + d.revealedBy + ' ' + fmt(d.revealedAt)) : null);
        } }
      ]), {
        rows: D.activities.map(function (a) {
          var d = a.data, now = Date.now(), vis = d.publicMode === 'public' || (d.publicMode === 'manual' && d.revealed) || (d.publicMode === 'auto' && Date.parse(d.autoAt) <= now);
          return { id: a.id, ver: a.version, a: a, vals: Object.assign({ name: d.name, pub: !!vis, autoAt: d.publicMode === 'auto' && Date.parse(d.autoAt) > now ? tsLocal(d.autoAt) : '', summary: d.summary || '' }, rhVals(d)) };
        }),
        saveOp: 'activity.save', delOp: 'activity.delete', addText: '＋ 新增活動', noCopy: true, empty: '還沒有活動',
        blank: function () { return Object.assign({ name: '', pub: false, autoAt: '', summary: '' }, rhVals({})); },
        isEmpty: function (v) { return !String(v.name || '').trim(); },
        validate: function (d, op) {
          if (op !== 'activity.save') return '';
          if (!String(d.name).trim()) return '有一列沒有活動名稱';
          // 驗收時開放的時間一定要在那次驗收的日期內
          var bad = rhs.filter(function (x) { var v = String((d.rhOpen || {})[x.id] || '').slice(0, 10); return v && (v < x.start || v > x.end); })[0];
          return bad ? '「' + d.name + '」在「' + bad.name + '」的開放時間要在 ' + bad.start + '～' + bad.end + ' 之間' : '';
        },
        saveItems: function (v, r) {
          var d = r.a ? r.a.data : {}, out = [];
          var base = { id: r.id, name: v.name, summary: v.summary, autoAt: v.autoAt ? v.autoAt + ':00+08:00' : '', rhOpen: rhOpenOf(v) };
          if (d.publicMode === 'manual' && r.id && !v.autoAt) {
            // 手動公開的活動：名稱、簡介照存，開關是「公開／收回」（會記下誰、什麼時候）
            var was = r.vals0 ? r.vals0.pub : !!d.revealed;
            if (v.name !== d.name || v.summary !== (d.summary || '') || JSON.stringify(base.rhOpen) !== JSON.stringify(rhOpenOf(rhVals(d)))) out.push({ op: 'activity.save', data: Object.assign(base, { publicMode: 'manual' }) });
            if (v.pub !== was) out.push({ op: 'activity.reveal', data: { id: r.id, revealed: v.pub } });
            return out.length ? out : [{ op: 'activity.save', data: Object.assign(base, { publicMode: 'manual' }) }];
          }
          return [{ op: 'activity.save', data: Object.assign(base, { publicMode: v.pub ? 'public' : v.autoAt ? 'auto' : 'hidden' }) }];
        },
        rowInit: function (r) { r.vals0 = r.read(); },
        afterSave: function (r) {
          var v = r.read(); r.vals0 = v;
          if (!r.a) r.a = { id: r.id, data: { publicMode: 'hidden' } };
          r.a.data.name = v.name; r.a.data.summary = v.summary; r.a.data.rhOpen = rhOpenOf(v);
          if (r.a.data.publicMode !== 'manual' || v.autoAt) r.a.data.publicMode = v.pub ? 'public' : v.autoAt ? 'auto' : 'hidden';
        }
      });
      if (miss.length && R.canEdit) box.insertBefore(h('div', { class: 'fb-notice row wrap', style: { marginBottom: '10px' } }, h('span', { class: 'grow' }, '人員與分隊的活動清單還有 ' + miss.length + ' 個不在這裡：' + miss.join('、')),
        h('button', { class: 'btn sm', onclick: function () { miss.forEach(function (n) { var r = G.newRow(''); r.ed.name.set(n); r.t.check(); G.changed(r); }); miss = []; toast('已加到表格下面（學員端先看不到），記得按「儲存變更」'); } }, '加到表格')), G.bar);
    },
    rotations: function (box, D) {
      // 直接在畫面上改，每個跑關一張卡、按「儲存」背景上傳；關卡、時段用空白分隔
      var acts = [{ value: '', label: '（不連活動）' }].concat(D.activities.map(function (a) { return { value: a.id, label: a.data.name }; }));
      var split = function (s) { return String(s || '').split(/[\s、,，]+/).map(function (x) { return x.trim(); }).filter(String); };
      var toMin = function (t) { var m = String(t || '').match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
      var toHm = function (n) { n = ((n % 1440) + 1440) % 1440; return pad2(Math.floor(n / 60)) + ':' + pad2(n % 60); };
      var placeList = 'rotPlaces';
      box.appendChild(h('datalist', { id: placeList }, D.places.map(function (p) { return h('option', { value: p.data.name }); })));
      var list = h('div', { class: 'col' });
      // 時間有沒有包在營期流程排的時段裡（和「警示與通知」同一套規則）
      var spanWarn = function (r) {
        var box2 = h('div');
        if (!r || !r.id) return box2;
        var x = r.data, mm = toMin, s0 = null, e0 = null;
        var off = 0, prev = null;   // 跨午夜（23:50 → 00:20）的列往後加一天
        if (x.kind === 'table') (x.rows || []).forEach(function (w) { var a = mm(w.start), b = mm(w.end); if (a === null) return; if (prev !== null && a + off < prev - 360) off += 1440; a += off; prev = a; b = b === null ? a : b + off; if (b < a) b += 1440; if (s0 === null || a < s0) s0 = a; if (e0 === null || b > e0) e0 = b; });
        else (x.slots || []).forEach(function (tt) { var a = mm(tt); if (a === null) return; if (s0 === null || a < s0) s0 = a; var b = a + (Number(x.len) || 0); if (e0 === null || b > e0) e0 = b; });
        if (s0 === null) return box2;
        var its = D.items.filter(function (it) { return it.data.go === 'rot:' + r.id; });
        if (!its.length && x.activity) its = D.items.filter(function (it) { return it.data.activity === x.activity && mm(it.data.time) !== null; });
        if (!its.length) { box2.appendChild(h('div', { class: 'hint' }, '還沒有營期流程項目連到這份細流（在營期流程的「連到流程／活動細流」選它）。')); return box2; }
        var dflt = Number(R.config.defaultDuration) || 60;
        var fit = its.some(function (it) { var a = mm(it.data.time), b = a + (Number(it.data.dur) || dflt); return a <= s0 && e0 <= b; });
        var it = its[0], a = mm(it.data.time), b = a + (Number(it.data.dur) || dflt);
        box2.appendChild(fit ? h('div', { class: 'small', style: { color: 'var(--ok)' } }, '✓ 在營期流程「' + it.data.name + '」' + toHm(a) + '–' + toHm(b) + ' 的時段內')
          : h('div', { class: 'fb-notice' }, '⚠ 營期流程「' + it.data.name + '」排 ' + toHm(a) + '–' + toHm(b) + '，這份細流是 ' + toHm(s0) + '–' + toHm(e0) + (e0 > b ? '，會超過 ' + (e0 - b) + ' 分鐘' : '，比流程早開始') + '。'));
        return box2;
      };
      /** 時間表型：每列一個時段，好幾欄；格子打 < 和左邊合併、^ 和上面合併；可以從 Excel 整塊貼上 */
      var COLORS = [{ value: '', label: '—' }, { value: 'yellow', label: '黃' }, { value: 'cyan', label: '青' }, { value: 'green', label: '綠' }, { value: 'blue', label: '藍' }, { value: 'purple', label: '紫' }, { value: 'orange', label: '橘' }, { value: 'pink', label: '粉' }, { value: 'red', label: '紅' }, { value: 'gray', label: '灰' }];
      var tableCard = function (r) {
        r = r || { id: '', data: { kind: 'table', cols: ['各小隊', '關主', '備註'], rows: [] } };
        var d = JSON.parse(JSON.stringify(r.data)), ro = !R.canEdit;
        var cols = (d.cols || []).slice(), rows = (d.rows || []).map(function (x) { return { start: x.start || '', end: x.end || '', place: x.place || '', color: x.color || '', cells: (x.cells || []).slice() }; });
        var act = sel(acts, d.activity || '', { disabled: ro }), name = inp(d.name, { placeholder: '例如：賭場、晚會', disabled: ro });
        var colBox = h('div', { class: 'row wrap', style: { gap: '6px' } }), body = h('div');
        var ME = mapEditor(d.map, ro, function () { t.check(); });
        var dur = function (x) { var a = toMin(x.start), b = toMin(x.end); return a !== null && b !== null ? ((b - a) % 1440 + 1440) % 1440 : ''; };
        var drawCols = function () {
          clear(colBox);
          cols.forEach(function (c, i) {
            var x = inp(c, { style: { width: '120px' }, disabled: ro, placeholder: '欄名' });
            x.addEventListener('input', function () { cols[i] = x.value; t.check(); });
            x.addEventListener('change', drawRows);
            colBox.appendChild(h('span', { class: 'row', style: { gap: '2px' } }, x, ro || cols.length < 2 ? null : h('button', { class: 'btn sm ghost', type: 'button', title: '刪除這一欄', onclick: function () { cols.splice(i, 1); rows.forEach(function (w) { w.cells.splice(i, 1); }); drawCols(); drawRows(); t.check(); } }, '✕')));
          });
          if (!ro && cols.length < 12) colBox.appendChild(h('button', { class: 'btn sm', type: 'button', onclick: function () { cols.push('新欄'); drawCols(); drawRows(); t.check(); } }, '＋ 欄'));
        };
        var grow = function (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; };
        var pasteAt = function (i, j, text) {
          // 從 Excel 複製的一整塊：Tab 分欄、換行分列；不夠的列自動加
          var lines = String(text).replace(/\r/g, '').split('\n');
          if (lines.length && lines[lines.length - 1] === '') lines.pop();
          lines.forEach(function (ln, k) {
            var cells = ln.split('\t');
            if (!rows[i + k]) rows.push({ start: '', end: '', color: '', cells: [] });
            cells.forEach(function (v, q) { if (j + q < cols.length) rows[i + k].cells[j + q] = v.replace(/^"|"$/g, ''); });
          });
          drawRows(); t.check();
        };
        var prevBox = null, prevT = 0;
        var refreshPrev = function (now) { clearTimeout(prevT); var f = function () { if (prevBox) { clear(prevBox); prevBox.appendChild(Front.detailTable({ cols: cols, rows: rows })); } }; if (now) f(); else prevT = setTimeout(f, 250); };
        var drawRows = function () {
          clear(body);
          var tb = h('tbody');
          rows.forEach(function (w, i) {
            var st = h('input', { class: 'g-in g-tm', value: w.start, placeholder: '16:20', disabled: ro });
            var du = h('input', { class: 'g-in', type: 'number', min: 0, value: dur(w), style: { width: '56px' }, disabled: ro });
            var en = h('input', { class: 'g-in g-tm', value: w.end, placeholder: '16:30', disabled: ro });
            var pl = h('input', { class: 'g-in', value: w.place || '', placeholder: '場地', list: placeList, disabled: ro });
            pl.addEventListener('input', function () { w.place = pl.value; refreshPrev(); t.check(); });
            st.addEventListener('change', function () { var n = normTime(st.value); if (n !== null) st.value = n; var old = Number(du.value); w.start = st.value; if (old && toMin(w.start) !== null) { w.end = toHm(toMin(w.start) + old); en.value = w.end; } refreshPrev(); t.check(); });
            du.addEventListener('change', function () { if (toMin(w.start) !== null && du.value !== '') { w.end = toHm(toMin(w.start) + Number(du.value)); en.value = w.end; } refreshPrev(); t.check(); });
            en.addEventListener('change', function () { var n = normTime(en.value); if (n !== null) en.value = n; w.end = en.value; du.value = dur(w); t.check(); });
            var tr = h('tr', null, h('td', null, st), h('td', null, du), h('td', null, en), h('td', null, pl));
            cols.forEach(function (c, j) {
              var ta = h('textarea', { class: 'g-in dt-in', rows: 1, disabled: ro });
              ta.value = w.cells[j] || '';
              ta.addEventListener('input', function () { w.cells[j] = ta.value; grow(ta); var v2 = ta.value.trim(); ta.parentNode.className = v2 === '<' || v2 === '^' ? 'dt-merged' : ''; refreshPrev(); t.check(); });
              ta.addEventListener('paste', function (e) { var tx = (e.clipboardData || window.clipboardData).getData('text'); if (/[\t\n]/.test(tx.replace(/\n$/, ''))) { e.preventDefault(); pasteAt(i, j, tx); } });
              if (j === 0 && w.color) ta.style.background = Front.CELL_COLORS[w.color];
              var v = String(w.cells[j] || '').trim();
              tr.appendChild(h('td', { class: v === '<' || v === '^' ? 'dt-merged' : '' }, ta));
              setTimeout(function () { grow(ta); }, 0);
            });
            var color = sel(COLORS, w.color, { disabled: ro, class: 'g-in' });
            color.addEventListener('change', function () { w.color = color.value; drawRows(); t.check(); });
            tr.appendChild(h('td', null, color));
            tr.appendChild(h('td', { class: 'g-x' }, ro ? null : h('button', { class: 'btn sm ghost', type: 'button', title: '複製這一列', onclick: function () { rows.splice(i + 1, 0, JSON.parse(JSON.stringify(w))); drawRows(); t.check(); } }, '⧉'),
              ro ? null : h('button', { class: 'btn sm ghost', type: 'button', title: '刪除這一列', onclick: function () { rows.splice(i, 1); drawRows(); t.check(); } }, '✕')));
            tb.appendChild(tr);
          });
          body.appendChild(h('div', { class: 'tbl-wrap' }, h('table', { class: 't grid dt-ed' }, h('thead', null, h('tr', null, h('th', { style: { width: '74px' } }, '開始'), h('th', { style: { width: '64px' } }, '分鐘'), h('th', { style: { width: '74px' } }, '結束'), h('th', { style: { width: '110px' } }, '場地'), cols.map(function (c) { return h('th', { style: { minWidth: '130px' } }, c); }), h('th', { style: { width: '70px' } }, '顏色'), h('th', { style: { width: '70px' } }))), tb)));
          if (!ro) body.appendChild(h('div', { class: 'row wrap', style: { marginTop: '6px' } },
            h('button', { class: 'btn sm', type: 'button', onclick: function () { var last = rows[rows.length - 1]; rows.push({ start: last ? last.end : '', end: '', color: '', cells: [] }); drawRows(); t.check(); } }, '＋ 加一列（接上一列結束）'),
            h('button', { class: 'btn sm ghost', type: 'button', onclick: importXls }, '從 Excel 整張貼上'),
            h('span', { class: 'hint' }, '格子打 < 和左邊合併、打 ^ 和上面合併（例如「主持人開關」橫跨三欄、「主持關卡」連續好幾列）；顏色套在第一欄。')));
          prevBox = h('div');
          body.appendChild(h('div', { style: { marginTop: '10px' } }, h('div', { class: 'small muted', style: { marginBottom: '4px' } }, '工作人員看到的樣子'), prevBox));
          refreshPrev(true);
        };
        // 整張貼上：第一欄是「16:20-16:30」這種時間（或開始、結束兩欄），第二欄如果是數字當作分鐘；第一列是標題的話當欄名
        var importXls = function () {
          askText('從 Excel 整張貼上', '在 Excel 選好整張（含標題列）複製，貼在這裡', '', { multi: true, okText: '帶入', hint: '會取代目前的列。空白格會自動和左邊合併（Excel 的合併儲存格複製出來是空白）；不要合併的可以再改。' }).then(function (tx) {
            if (!tx) return;
            var lines = String(tx).replace(/\r/g, '').split('\n').filter(function (x) { return x.trim(); }).map(function (x) { return x.split('\t'); });
            var tm = function (v) { var m = String(v || '').match(/(\d{1,2})[:：](\d{2})\s*[-–~～]\s*(\d{1,2})[:：](\d{2})/); return m ? [pad2(Number(m[1])) + ':' + m[2], pad2(Number(m[3])) + ':' + m[4]] : null; };
            var startIdx = 0;
            if (lines.length && !tm(lines[0][0])) { var hd = lines[0].slice(1); if (/^(時長|分|分鐘)$/.test(String(hd[0] || '').trim())) hd = hd.slice(1); if (hd.length) cols = hd.map(function (x) { return x.trim() || '欄'; }); startIdx = 1; }
            rows = [];
            lines.slice(startIdx).forEach(function (cells) {
              var t2 = tm(cells[0]); if (!t2) return;
              var rest = cells.slice(1);
              if (/^\d+$/.test(String(rest[0] || '').trim())) rest = rest.slice(1);
              var out = cols.map(function (c, j) { return String(rest[j] || '').trim(); });
              rows.push({ start: t2[0], end: t2[1], color: '', cells: out });
            });
            // 合併儲存格：同一列中間空白的格子（不是最後一欄）併到左邊
            rows.forEach(function (w) { for (var j = 1; j < cols.length - 1; j++) if (!w.cells[j] && w.cells[j - 1] !== undefined && !w.cells.slice(j + 1, cols.length - 1).some(function (v) { return v; }) && w.cells[0]) w.cells[j] = '<'; });
            drawCols(); drawRows(); t.check();
            toast('已帶入 ' + rows.length + ' 列，記得按「儲存」');
          });
        };
        drawCols(); drawRows();
        var get = function () { return { id: r.id, kind: 'table', activity: act.value, name: name.value, cols: cols.map(function (c) { return String(c).trim(); }), rows: rows, map: ME.get() }; };
        var save = h('button', { class: 'btn', onclick: function () {
          var v = get();
          if (!v.cols.length) { toast('至少要有一欄', true); return; }
          queueDoc(el, t, 'rotation.save', v, { ver: r.id ? r.version : undefined, done: function (x) {
            if (x && x.id) r.id = x.id;
            var ad = x && x._extra && x._extra.admin, cur = ad && (ad.data.rotations || []).filter(function (y) { return y.id === r.id; })[0];
            if (cur) { r.version = cur.version; r.data = cur.data; var w2 = spanWarn(r); warnBox.replaceWith(w2); warnBox = w2; }
          } });
        } }, '儲存');
        var warnBox = spanWarn(r);
        var el = h('div', { class: 'card col' },
          h('div', { class: 'row' }, h('span', { class: 'tag info' }, '時間表'), h('span', { class: 'grow' }), ro ? null : h('button', { class: 'btn sm ghost', type: 'button', title: '活動、名稱、地圖會保留；每一列的開始時間變成跑關的時段', onclick: function () { convert(el, toRot(get(), r)); } }, '改成跑關／對抗')),
          h('div', { class: 'grid2' }, field('活動', act), field('名稱', name)),
          h('div', null, h('div', { class: 'small', style: { fontWeight: 700, marginBottom: '4px' } }, '欄位（例如：各小隊、主持人、賭馬、關主、備註）'), colBox),
          body, warnBox,
          h('div', { class: 'field' }, h('span', null, '地圖（上傳底圖，再加標點、文字、連線）'), ME.el),
          ro ? null : h('div', { class: 'row' }, save, h('button', { class: 'btn ghost', type: 'button', onclick: function () { if (!r.id) { el.remove(); return; } del('rotation.delete', { id: r.id }, d.name || '活動細流'); } }, '刪除')));
        var t = track(el, function () { var v = get(); delete v.id; return v; }, save);
        if (!ro) save.parentNode.appendChild(t.status);
        el._t = t;
        return el;
      };
      var cardOf = function (r) {
        r = r || { id: '', data: { stations: [], places: [], slots: [], grid: {}, mode: 'table', len: '', turn: '' } };
        var d = JSON.parse(JSON.stringify(r.data)), ro = !R.canEdit;
        d.grid = d.grid || {}; d.places = d.places || []; d.notes = d.notes || []; d.free = d.free || [];
        var act = sel(acts, d.activity || '', { disabled: ro }), name = inp(d.name, { placeholder: '例如：大地遊戲第一輪', disabled: ro });
        var stations = inp((d.stations || []).join(' '), { placeholder: '關卡名稱用空白分隔，例如：第一關 第二關 第三關', disabled: ro });
        var start = inp((d.slots || [])[0] || '', { placeholder: '09:00', style: { width: '90px' }, disabled: ro });
        var len = inp(d.len || '', { type: 'number', min: 0, placeholder: '分鐘', style: { width: '90px' }, disabled: ro });
        var turn = inp(d.turn || '', { type: 'number', min: 0, placeholder: '分鐘', style: { width: '90px' }, disabled: ro });
        var slots = inp((d.slots || []).join(' '), { placeholder: '時段用空白分隔，例如：09:00 09:30 10:00；或用上面的開始時間＋每關＋換關自動排', disabled: ro });
        var vs = sel([{ value: '', label: '跑關：一關一隊，輪流換關' }, { value: 'fixed', label: '對抗 A：固定兩隊一起，輪流換關' }, { value: 'round', label: '對抗 B：每隊輪流遇到每一隊（不同關）' }], d.vs || '', { disabled: ro });
        vs.addEventListener('change', function () { drawGrid(); if (Object.keys(d.grid).some(function (k) { return (d.grid[k] || []).some(function (x) { return x !== ''; }); })) toast('換了模式：按「自動輪流排」重新排一次'); });
        var ME = mapEditor(d.map || (d.mode === 'map' && d.image ? { img: d.image, items: [] } : null), ro, function () { t.check(); });
        var placeBox = h('div', { class: 'row wrap', style: { gap: '6px' } }), placeIn = [];
        var gridBox = h('div');
        var drawPlaces = function () {
          var st = split(stations.value), keep = placeIn.map(function (x) { return x.value; });
          clear(placeBox); placeIn = [];
          st.forEach(function (n, i) { var x = inp(keep[i] !== undefined ? keep[i] : d.places[i] || '', { list: placeList, placeholder: '場地', style: { width: '130px' }, disabled: ro }); placeIn.push(x); placeBox.appendChild(h('label', { class: 'small', style: { display: 'flex', flexDirection: 'column', gap: '2px' } }, h('b', null, n), x)); });
          if (!st.length) placeBox.appendChild(h('span', { class: 'hint' }, '先在上面打關卡名稱'));
        };
        var autoSlots = function () {
          var s0 = toMin(normTime(start.value)), n = split(stations.value).length, L = Number(len.value) || 0, T = Number(turn.value) || 0;
          if (s0 === null || !n || !L) { toast('先填開始時間、關卡、每關幾分鐘', true); return; }
          var nq = D.squads.length, k = vs.value === 'round' ? (nq % 2 ? nq : nq - 1) : vs.value === 'fixed' ? n : n;
          var out = []; for (var i = 0; i < k; i++) out.push(toHm(s0 + i * (L + T)));
          slots.value = out.join(' '); drawGrid(); t.check();
        };
        var autoFill = function () {
          var n = split(stations.value).length, m = split(slots.value).length;
          if (!n || !m) { toast('先填關卡和時段', true); return; }
          var qs = D.squads.map(function (q) { return String(q.no); });
          qs.forEach(function (q) { d.grid[q] = []; for (var j = 0; j < m; j++) d.grid[q].push(''); });
          if (vs.value === 'fixed') {
            // 對抗 A：1、2 隊一組，3、4 隊一組…；每一組一起換關
            // 一定兩隊對抗：單數隊時最後一隊空著；組數比關卡多時，多出來的組那個時段休息（空白）
            var np = Math.floor(qs.length / 2), cyc = Math.max(np, n);
            if (qs.length % 2) toast(D.squads[qs.length - 1].name + ' 沒有可以配對的隊，先空著（可以手動放進某一組）', true);
            if (np > n) toast('有 ' + np + ' 組，但只有 ' + n + ' 關：每個時段有 ' + (np - n) + ' 組休息', true);
            for (var p2 = 0; p2 < np; p2++) for (var j2 = 0; j2 < m; j2++) { var st2 = (p2 + j2) % cyc; if (st2 < n) { d.grid[qs[2 * p2]][j2] = st2; d.grid[qs[2 * p2 + 1]][j2] = st2; } }
          } else if (vs.value === 'round') {
            // 對抗 B：輪轉法（circle method），每一輪兩兩對戰；每一組換到不同關
            var arr = qs.slice(); if (arr.length % 2) arr.push('');
            var R2 = arr.length - 1, half = arr.length / 2;
            if (half > n) toast('每一輪有 ' + half + ' 場，但只有 ' + n + ' 關：多出來的場次沒有關卡', true);
            for (var rd = 0; rd < Math.min(R2, m); rd++) {
              var pairs = [];
              for (var q2 = 0; q2 < half; q2++) pairs.push([arr[q2], arr[arr.length - 1 - q2]]);
              pairs.filter(function (pp) { return pp[0] && pp[1]; }).forEach(function (pp, pi) { var st3 = (pi + rd) % n; if (pi < n) { d.grid[pp[0]][rd] = st3; d.grid[pp[1]][rd] = st3; } });
              arr.splice(1, 0, arr.pop());
            }
            if (m < R2) toast('要 ' + R2 + ' 個時段才能每一隊都遇到，現在只有 ' + m + ' 個', true);
          } else {
            qs.forEach(function (q, i) { for (var j = 0; j < m; j++) d.grid[q][j] = (i + j) % n; });
          }
          drawGrid(); t.check();
        };
        var drawGrid = function () {
          clear(gridBox);
          var st = split(stations.value), sl = split(slots.value).map(function (x) { var n = normTime(x); return n === null ? x : n; }), L = Number(len.value) || 0;
          if (!st.length || !sl.length || !D.squads.length) { gridBox.appendChild(h('div', { class: 'hint' }, D.squads.length ? '填好關卡和時段後，這裡會出現排序表' : '先到「人員與分隊」建立小隊（或用測試資料）')); return; }
          gridBox.appendChild(h('div', { class: 'tbl-wrap' }, h('table', { class: 't grid-rot' }, h('thead', null, h('tr', null, h('th', null, '小隊＼時段'), sl.map(function (x) { var s0 = toMin(x); return h('th', null, x, L && s0 !== null ? h('div', { class: 'small muted' }, '–' + toHm(s0 + L)) : null); }))),
            h('tbody', null, D.squads.map(function (sq) {
              var row = d.grid[String(sq.no)] = (d.grid[String(sq.no)] || []).slice(0, sl.length);
              while (row.length < sl.length) row.push('');
              return h('tr', null, h('td', null, sq.name), sl.map(function (x, i) {
                var c = sel([{ value: '', label: '—' }].concat(st.map(function (n, j) { return { value: j, label: n }; })), row[i] === undefined || row[i] === null ? '' : row[i], { disabled: ro });
                var opp = h('div', { class: 'small muted vs-opp' });
                var upd = function () {
                  if (!vs.value) { opp.textContent = ''; return; }
                  var mine = row[i], o2 = mine === '' || mine === undefined ? [] : D.squads.filter(function (q) { return q !== sq && (d.grid[String(q.no)] || [])[i] === mine; });
                  opp.textContent = mine === '' || mine === undefined ? '' : o2.length ? '對 ' + o2.map(function (q) { return q.name; }).join('、') : '（沒有對手）';
                  opp.classList.toggle('bad', mine !== '' && mine !== undefined && o2.length !== 1);
                };
                c.addEventListener('change', function () { row[i] = c.value === '' ? '' : Number(c.value); $all('.vs-opp', gridBox).forEach(function (x) { if (x._upd) x._upd(); }); drawPreview(); });
                opp._upd = upd; upd();
                return h('td', null, c, opp);
              }));
            }), h('tr', { class: 'rot-notes' }, h('td', { class: 'small muted' }, '備註'), sl.map(function (x, i) {
              var ni = area(d.notes[i] || '', { placeholder: '（可不填）', disabled: ro, rows: 1, class: 'input g-ta', style: { width: '100%' } });
              var gr = function () { ni.style.height = 'auto'; ni.style.height = Math.min(160, ni.scrollHeight + 2) + 'px'; };
              ni.addEventListener('input', function () { d.notes[i] = ni.value; gr(); }); setTimeout(gr, 0);
              return h('td', null, ni);
            }))))));
          drawPreview();
        };
        // 自由列：負責人開關、移動、場復、結關、大亂鬥…（所有小隊一起，依時間排進流程）
        var freeBox = h('div', { class: 'col', style: { gap: '6px' } }), freeRows = [];
        var drawFree = function () {
          clear(freeBox); freeRows = [];
          freeBox.appendChild(h('div', { class: 'rot-free' }, h('span', { class: 'hd' }, '開始'), h('span', { class: 'hd' }, '結束'), h('span', { class: 'hd' }, '內容'), h('span', { class: 'hd fr-pl' }, '場地'), h('span', { class: 'hd fr-nt' }, '備註'), h('span')));
          d.free.forEach(function (x, i) {
            var a1 = inp(x.start || '', { placeholder: '16:00', inputmode: 'numeric', disabled: ro }), b1 = inp(x.end || '', { placeholder: '16:05', inputmode: 'numeric', disabled: ro });
            var tx = inp(x.text || '', { placeholder: '例如：負責人開關、移動、結關', list: 'rotFreeList', disabled: ro }), pl = inp(x.place || '', { list: placeList, placeholder: '場地', class: 'input fr-pl', disabled: ro }), nt = area(x.note || '', { placeholder: '備註', class: 'input fr-nt g-ta', rows: 1, disabled: ro });
            [a1, b1].forEach(function (y) { y.addEventListener('change', function () { var n = normTime(y.value); if (n) y.value = n; }); });
            var rd = function () { x.start = normTime(a1.value) || a1.value; x.end = normTime(b1.value) || b1.value; x.text = tx.value; x.place = pl.value; x.note = nt.value; };
            [a1, b1, tx, pl, nt].forEach(function (y) { y.addEventListener('input', rd); y.addEventListener('change', function () { rd(); drawPreview(); }); });
            freeBox.appendChild(h('div', { class: 'rot-free' }, a1, b1, tx, pl, nt, ro ? h('span') : h('button', { class: 'btn sm ghost', type: 'button', title: '拿掉', onclick: function () { d.free.splice(i, 1); drawFree(); drawPreview(); t.check(); } }, '✕')));
          });
          if (!d.free.length) freeBox.appendChild(h('div', { class: 'hint' }, '還沒有。可以按「自動加開關、移動、結關」，或自己加一列。'));
          if (!ro) freeBox.appendChild(h('div', { class: 'row wrap' }, h('button', { class: 'btn sm', type: 'button', onclick: function () { var lst = d.free[d.free.length - 1]; d.free.push({ start: lst ? lst.end || '' : '', end: '', text: '', place: '', note: '' }); drawFree(); var ins = $all('.rot-free input', freeBox); if (ins.length) ins[ins.length - 5].focus(); t.check(); } }, '＋ 加一列'),
            h('button', { class: 'btn sm', type: 'button', title: '第一個時段前加「負責人開關」，時段之間的空檔加「移動與場復」，最後加「負責人結關」', onclick: autoFree }, '自動加開關、移動、結關')));
        };
        var autoFree = function () {
          var sl = split(slots.value).map(function (x) { return normTime(x) || x; }), L = Number(len.value) || 0, T = Number(turn.value) || 0;
          if (!sl.length || !L) { toast('先填時段和每關幾分鐘', true); return; }
          var has = function (a) { return d.free.some(function (x) { return x.start === a; }); }, add = function (a, b, txt) { if (a && !has(a)) d.free.push({ start: a, end: b, text: txt, place: '', note: '' }); };
          var s0 = toMin(sl[0]);
          if (s0 !== null) add(toHm(s0 - (T || 5)), sl[0], '負責人開關');
          sl.forEach(function (x, i) { var a = toMin(x), nx = toMin(sl[i + 1]); if (a !== null && nx !== null && nx > a + L) add(toHm(a + L), sl[i + 1], '移動與場復'); });
          var e0 = toMin(sl[sl.length - 1]);
          if (e0 !== null) add(toHm(e0 + L), toHm(e0 + L + (T || 5)), '負責人結關');
          d.free.sort(function (x, y) { return String(x.start).localeCompare(String(y.start)); });
          drawFree(); drawPreview(); t.check();
        };
        // 工作人員看到的樣子（跟前台一樣：一列一個時段，自由列整列橫跨）
        var prevBox = h('div');
        var drawPreview = function () {
          if (!prevBox || !get) return;
          clear(prevBox);
          var v = get(), st = v.stations;
          if (!v.slots.length || !D.squads.length) return;
          prevBox.appendChild(Front.rotTable({ slots: v.slots, stations: st, places: v.places, len: Number(v.len) || 0, vs: v.vs, notes: v.notes, free: v.free.filter(function (x) { return x.start && x.text; }),
            rows: D.squads.map(function (q) { var row = v.grid[String(q.no)] || []; return { squad: q.name, cells: v.slots.map(function (x, i) { var k = row[i]; return k === '' || k === undefined || k === null ? '' : st[k] || ''; }) }; }) }));
        };
        start.addEventListener('change', function () { var n = normTime(start.value); if (n) start.value = n; });
        stations.addEventListener('change', function () { drawPlaces(); drawGrid(); });
        slots.addEventListener('change', drawGrid);
        len.addEventListener('change', drawGrid);
        drawPlaces(); drawFree(); drawGrid();
        var get = function () { return { id: r.id, kind: 'rot', notes: split(slots.value).map(function (x, i) { return d.notes[i] || ''; }), free: d.free.map(function (x) { return { start: normTime(x.start) || x.start || '', end: normTime(x.end) || x.end || '', text: x.text || '', place: x.place || '', note: x.note || '' }; }), activity: act.value, name: name.value, stations: split(stations.value), places: placeIn.map(function (x) { return x.value; }), slots: split(slots.value).map(function (x) { var n = normTime(x); return n === null ? x : n; }), len: len.value, turn: turn.value, grid: d.grid, mode: 'table', image: '', map: ME.get(), vs: vs.value }; };
        var save = h('button', { class: 'btn', onclick: function () {
          var v = get();
          if (!v.stations.length) { toast('先填關卡', true); return; }
          queueDoc(el, t, 'rotation.save', v, { ver: r.id ? r.version : undefined, done: function (x) {
            if (x && x.id) r.id = x.id;
            var ad = x && x._extra && x._extra.admin, cur = ad && (ad.data.rotations || []).filter(function (y) { return y.id === r.id; })[0];
            if (cur) r.version = cur.version;
          } });
        } }, '儲存');
        var el = h('div', { class: 'card col' },
          h('div', { class: 'row' }, h('span', { class: 'tag info' }, '跑關／對抗（小隊輪流換關）'), h('span', { class: 'grow' }), ro ? null : h('button', { class: 'btn sm ghost', type: 'button', title: '活動、名稱、地圖會保留；時段會變成時間表的列', onclick: function () { convert(el, toTable(get(), r)); } }, '改成時間表')),
          h('div', { class: 'grid2' }, field('活動', act), field('名稱', name)),
          field('玩法', vs),
          field('關卡（用空白分隔）', stations),
          h('div', null, h('div', { class: 'small', style: { fontWeight: 700, marginBottom: '4px' } }, '每一關的場地'), placeBox),
          h('div', { class: 'row wrap', style: { alignItems: 'flex-end' } }, field('開始時間', start), field('每關幾分鐘', len), field('換關幾分鐘', turn), ro ? null : h('button', { class: 'btn sm', type: 'button', onclick: autoSlots }, '自動排時段')),
          field('時段（用空白分隔）', slots),
          h('div', { class: 'row wrap' }, h('b', { class: 'grow' }, '排序表（小隊 × 時段 → 關卡）'), ro ? null : h('button', { class: 'btn sm', type: 'button', onclick: autoFill }, '自動輪流排')),
          gridBox,
          h('div', { class: 'field' }, h('span', null, '其他流程（負責人開關、移動、場復、結關、大亂鬥…所有小隊一起）'), freeBox, h('datalist', { id: 'rotFreeList' }, ['負責人開關', '移動', '移動與場復', '負責人結關', '返回會場', '集合', '大亂鬥'].map(function (x) { return h('option', { value: x }); }))),
          h('div', { class: 'field' }, h('span', null, '工作人員看到的樣子'), prevBox),
          spanWarn(r),
          h('div', { class: 'field' }, h('span', null, '地圖（上傳底圖，再加標點、文字、連線）'), ME.el),
          ro ? null : h('div', { class: 'row' }, save, h('button', { class: 'btn ghost', type: 'button', onclick: function () {
            if (!r.id) { el.remove(); return; }
            del('rotation.delete', { id: r.id }, d.name || '活動細流');
          } }, '刪除')));
        var t = track(el, function () { var v = get(); delete v.id; return v; }, save);   // 存好後才拿到的 ID 不算改動
        if (!ro) save.parentNode.appendChild(t.status);
        el._t = t;
        drawPreview();
        return el;
      };
      // 換模式（跑關 ↔ 時間表）：活動、名稱、地圖保留，時間帶過去；按儲存才會生效
      var toTable = function (v, r) {
        var L = Number(v.len) || 0;
        return { id: r.id, version: r.version, data: { kind: 'table', activity: v.activity, name: v.name, map: v.map, cols: ['各小隊', '關主', '備註'],
          rows: (v.slots || []).map(function (x, i) { var a = toMin(x); return { start: x, end: a !== null && L ? toHm(a + L) : '', place: '', color: '', cells: ['', '', (v.notes || [])[i] || ''] }; })
            .concat((v.free || []).filter(function (x) { return x.start && x.text; }).map(function (x) { return { start: x.start, end: x.end, place: x.place || '', color: '', cells: [x.text, '<', x.note || ''] }; }))
            .sort(function (a, b) { return String(a.start).localeCompare(String(b.start)); }) } };
      };
      var toRot = function (v, r) {
        var st = (v.rows || []).map(function (w) { return w.start; }).filter(Boolean), w0 = (v.rows || [])[0], L = w0 && toMin(w0.start) !== null && toMin(w0.end) !== null ? ((toMin(w0.end) - toMin(w0.start)) % 1440 + 1440) % 1440 : '';
        return { id: r.id, version: r.version, data: { kind: 'rot', activity: v.activity, name: v.name, map: v.map, stations: [], places: [], slots: st, grid: {}, len: L, turn: '' } };
      };
      var convert = function (oldEl, r2) {
        var n = r2.data.kind === 'table' ? tableCard(r2) : cardOf(r2);
        oldEl.replaceWith(n);
        if (n._t) n._t.restore('"converted"');
        toast('已換成' + (r2.data.kind === 'table' ? '時間表' : '跑關') + '，活動、名稱、地圖保留；記得按「儲存」');
      };
      box.appendChild(h('div', { class: 'hint', style: { marginBottom: '8px' } }, '每個活動的細流：可以是「時間表」（像賭場、晚會：每列一個時段，好幾欄分給各小隊、主持人、關主、備註…），或「跑關」（小隊輪流換關）。每一張改好按自己的「儲存」（背景上傳）。在營期流程的「連到流程／活動細流」選它，工作人員點了就會展開。時間超出營期流程排的時段會提醒。'));
      if (R.canEdit) box.appendChild(h('div', { class: 'row wrap', style: { marginBottom: '10px' } },
        h('button', { class: 'btn primary', onclick: function () { list.insertBefore(tableCard(), list.firstChild); } }, '＋ 時間表（賭場、晚會…）'),
        h('button', { class: 'btn', onclick: function () { list.insertBefore(cardOf(), list.firstChild); } }, '＋ 跑關（小隊輪流換關）')));
      box.appendChild(list);
      D.rotations.forEach(function (r) { list.appendChild(hl(r.data.kind === 'table' ? tableCard(r) : cardOf(r), r.id)); });
      if (!D.rotations.length && !R.canEdit) list.appendChild(h('div', { class: 'card empty' }, '還沒有活動細流'));
    },
    places: function (box, D) {
      box.appendChild(h('div', { class: 'hint', style: { marginBottom: '8px' } }, '一次打好幾個（Enter 換下一列，也可以從 Excel 貼一整欄），改完按一次「儲存變更」。流程項目填新場地時也會自動加進來。'));
      grid(box, [{ k: 'name', label: '場地名稱', w: '220px' }, { k: 'cat', label: '分類（例如：室內、戶外）', w: '220px' }], {
        rows: D.places.map(function (p) { return { id: p.id, ver: p.version, vals: { name: p.data.name, cat: p.data.cat || '' } }; }),
        saveOp: 'place.save', delOp: 'place.delete', addText: '＋ 加一列', empty: '還沒有場地',
        blank: function () { return { name: '', cat: '' }; },
        isEmpty: function (v) { return !String(v.name || '').trim(); },
        toData: function (v, r) { return { id: r.id, name: v.name, cat: v.cat }; }
      });
    },
    flows: function (box, D) {
      box.appendChild(bar(addBtn('新增流程', function () {
        var name = inp('', { placeholder: '例如：一驗、二驗、總驗' }), order = inp(D.flows.length, { type: 'number' });
        form('新增流程', [field('名稱', name), field('排序', order), h('div', { class: 'hint' }, '新的流程先不顯示在工作人員端，做好再打開「工作人員端顯示」。')], function () { return run('flow.save', { name: name.value, kind: 'detail', order: order.value, hidden: true }, { action: 'create' }); });
      }), h('span', { class: 'hint' }, '可以先在後台做好一驗、二驗…，要給工作人員看時再打開「顯示」。「複製」會整份複製（含所有項目），適合二驗跟一驗大致一樣的時候。「總流程」決定學員首頁的現在主題。在營隊設定加驗收日程時，每次驗收會自動有一份「驗收流程」，驗收期間取代總流程。')));
      var sorted = D.flows.slice().sort(function (x, y) { return (Number(x.data.order) || 0) - (Number(y.data.order) || 0); });
      box.appendChild(table(['流程', '種類', '項目數', '工作人員端顯示', ''], sorted.map(function (f) {
        var n = D.items.filter(function (it) { return it.data.flow === f.id; }).length;
        var sw = h('input', { type: 'checkbox', class: 'sw', checked: !f.data.hidden, disabled: !R.canEdit });
        sw.addEventListener('change', function () { run('flow.save', { id: f.id, name: f.data.name, kind: f.data.kind, order: f.data.order, parentItem: f.data.parentItem || '', hidden: !sw.checked }, { msg: sw.checked ? '「' + f.data.name + '」工作人員端看得到了' : '「' + f.data.name + '」先不給工作人員看' }).catch(function () { sw.checked = !sw.checked; }); });
        var rh = f.data.kind === 'rehearsal' ? (A.info.rehearsals || []).filter(function (r) { return r.id === f.data.rh; })[0] : null;
        return h('tr', null, h('td', null, h('b', null, f.data.name)), h('td', null, f.data.kind === 'main' ? '總流程' : f.data.kind === 'rehearsal' ? '驗收流程' : '其他流程'), h('td', null, n),
          h('td', null, f.data.kind === 'rehearsal' ? h('span', { class: 'small muted' }, rh ? rh.start.slice(5) + (rh.end !== rh.start ? '～' + rh.end.slice(5) : '') + ' 驗收時自動使用' : '驗收已刪除，不會再用到') : h('label', { class: 'sw-wrap' }, sw, h('span', { class: 'sw-k' }))),
          h('td', { class: 'row', style: { gap: '4px', justifyContent: 'flex-end' } },
            R.canEdit ? h('button', { class: 'btn sm', onclick: function () { askText('複製流程', '新流程的名稱', f.data.name + '（複製）').then(function (nm) { nm = String(nm || '').trim(); if (!nm) return; run('flow.copy', { id: f.id, name: nm }, { action: 'create', msg: '已複製為「' + nm + '」（先不顯示，做好再打開）' }); }); } }, '⧉ 複製') : null,
            R.canEdit ? h('button', { class: 'btn sm ghost', onclick: function () { askText('流程改名', '名稱', f.data.name).then(function (nm) { nm = String(nm || '').trim(); if (!nm || nm === f.data.name) return; run('flow.save', { id: f.id, name: nm, kind: f.data.kind, order: f.data.order, parentItem: f.data.parentItem || '' }); }); } }, '改名') : null,
            f.data.kind === 'main' || rh || !R.canEdit ? null : h('button', { class: 'btn sm ghost', onclick: function () { del('flow.delete', { id: f.id }, f.data.name); } }, '刪除')));
      })));
    }
  };

  VIEWS.studentflow = {
    items: function (box, D) {
      var schById = {};
      D.schedule.forEach(function (x) { schById[x.id] = x; });
      var sch = [{ value: '', label: '（不引用）' }].concat(D.schedule.map(function (x) { return { value: x.id, label: (x.data.date || '').slice(5) + ' ' + (x.data.time || '') + ' ' + x.data.name }; }));
      var acts = [{ value: '', label: '（不連活動）' }].concat((D.activities || []).map(function (a) { return { value: a.id, label: a.data.name }; }));
      var days = [];
      if (A.info.start && A.info.end) for (var dd = new Date(A.info.start + 'T12:00:00+08:00'); taipei(dd).ymd <= A.info.end; dd = new Date(dd.getTime() + 86400000)) days.push(taipei(dd).ymd);
      box.appendChild(h('div', { class: 'hint', style: { marginBottom: '8px' } }, '放進這裡＝學員看得到（要保密就先不要放）。像試算表一樣一次打好幾列，改完按一次「儲存變更」。時間只寫開始也可以，「結束」可不填；Enter 在下面插入一列，改了時間會自動排好。「引用」選營期流程的項目會帶入時間和名稱（之後流程改了會出現在「待處理變更」，不會自動改）。內容跟著學員端一起發布。'));
      if (D.pending.length) box.appendChild(h('a', { class: 'fb-notice', href: '#data/studentflow/pending', style: { display: 'block', marginBottom: '10px' } }, '營期流程有 ' + D.pending.length + ' 項變更還沒處理 →'));
      var G = grid(box, [
        { k: 'date', type: 'hidden' },
        { k: 'time', label: '時間', type: 'time', w: '74px' },
        { k: 'end', label: '結束', type: 'time', w: '74px', ph: '可不填' },
        { k: 'title', label: '名稱', w: '180px', list: D.schedule.map(function (x) { return x.data.name; }).filter(function (n, i, a) { return n && a.indexOf(n) === i; }) },
        { k: 'note', label: '說明', w: '260px', multi: true },
        { k: 'ref', label: '引用營期流程', type: 'select', w: '210px', nopaste: true, opts: sch },
        { k: 'activity', label: '連到活動', type: 'select', w: '150px', nopaste: true, opts: acts }
      ], {
        rows: D.items.slice().sort(function (a, b) { return ((a.data.date || '') + (a.data.time || '')).localeCompare((b.data.date || '') + (b.data.time || '')); }).map(function (it) { var d = it.data; return { id: it.id, ver: it.version, vals: { date: d.date || '', time: d.time || '', end: d.end || '', title: d.title || '', note: d.note || '', ref: d.ref || '', activity: d.activity || '' } }; }),
        saveOp: 'item.save', delOp: 'item.delete', parse: parseCell, addText: '＋ 這一天加一項',
        groupOf: function (v) { return v.date || ''; }, extraGroups: days,
        groupOrder: function (keys) { return keys.sort(function (x, y) { return (x || '9999').localeCompare(y || '9999'); }); },
        groupLabel: function (k, rs) { return k ? dayLabel(k) + '　' + rs.length + ' 項' : '（沒填日期）'; },
        enterInsert: true,
        sortKey: function (v) { return v.time || '99:99'; },
        blank: function (k) { return { date: k, time: '', end: '', title: '', note: '', ref: '', activity: '' }; },
        isEmpty: function (v) { return !String(v.title || '').trim(); },
        validate: function (d) { return !String(d.title).trim() ? '有一列沒有名稱' : ''; },
        toData: function (v, r) { return { id: r.id, date: v.date, time: v.time, end: v.end, title: v.title, note: v.note, activity: v.activity, ref: v.ref }; },
        rowInit: function (r, G) {
          r.ed.ref.input.addEventListener('change', function () {
            var x = schById[r.ed.ref.get()];
            if (!x) return;
            var v = r.read();
            if (!v.time) r.ed.time.set(x.data.time || '');
            if (!String(v.title).trim()) r.ed.title.set(x.data.name || '');
            if (!v.activity && x.data.activity) r.ed.activity.set(x.data.activity);
            if (x.data.date && x.data.date !== v.date) { r.ed.date.set(x.data.date); G.moveTo(r, x.data.date); }
            r.t.check(); G.changed(r);
          });
        }
      });
    },
    pending: function (box, D) {
      if (!D.pending.length) { box.appendChild(h('div', { class: 'card empty' }, '沒有待處理的變更 👍')); return; }
      var rows = D.pending.map(function (p) {
        var ck = h('input', { type: 'checkbox', checked: true }), ch = sel([{ value: 'apply', label: p.type === 'add' ? '加入學員行程' : p.type === 'delete' ? '從學員行程刪除' : '套用' }, { value: 'keep', label: p.type === 'add' ? '不加入' : '維持現狀' }].concat(p.type === 'time' || p.type === 'add' ? [{ value: 'custom', label: '自訂時間' }] : []), 'apply');
        var d = inp(p.date || '', { type: 'date' }), t = inp(p.time || '', { type: 'time' }), cw = h('div', { class: 'row hidden' }, d, t);
        ch.addEventListener('change', function () { cw.classList.toggle('hidden', ch.value !== 'custom'); });
        return { p: p, ck: ck, ch: ch, d: d, t: t, tr: h('tr', null, h('td', null, ck), h('td', null, h('b', null, p.title), h('div', { class: 'small' }, p.text)), h('td', null, ch, cw)) };
      });
      box.appendChild(h('div', { class: 'hint', style: { marginBottom: '8px' } }, '營期流程改了不會自動改到學員行程。勾選要處理的項目、選擇處理方式，一次送出。引用關係會保留，之後流程再變還會出現在這裡。'));
      box.appendChild(table(['', '變更', '處理方式'], rows.map(function (r) { return r.tr; })));
      if (R.canEdit) box.appendChild(h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn primary', onclick: function (e) {
        var list = rows.filter(function (r) { return r.ck.checked; }).map(function (r) { return { key: r.p.key, choice: r.ch.value, date: r.d.value, time: r.t.value }; });
        if (!list.length) { toast('請至少勾選一項', true); return; }
        busy(e.target, function () { return run('pending.apply', { list: list }, { action: 'run', msg: false }); }).then(function (x) { if (x) toast('已處理 ' + x.handled + ' 項'); }, function () {});
      } }, '處理勾選的項目')));
    }
  };

  VIEWS.emergency = {
    watch: function (box, D) {
      var nights = (D.nights || []).slice(), fromA = D.fromAssign || {};
      box.appendChild(h('div', { class: 'card col', style: { marginBottom: '12px' } }, h('h2', null, '今晚（' + dayLabel(D.tonightDate) + '）守夜'), D.tonight.length ? D.tonight.map(function (w) { return h('div', null, w.name + '（' + w.dept + '）' + (w.phone ? '　' + w.phone : '')); }) : h('div', { class: 'muted' }, '還沒有守夜人員')));
      box.appendChild(h('div', { class: 'hint', style: { marginBottom: '8px' } }, '每一晚先列好日期。「工作分配」裡角色含「守夜」的人會自動帶進來；沒有設定的晚上就是空的，在這裡指定。臨時換班、代班也在這裡改（指定後以這裡為準）。改過還沒存的晚上會有橘色框。'));
      var rows = [], list = h('div', { class: 'col' });
      var save = h('button', { class: 'btn', onclick: function (e) {
        var ch = rows.filter(function (r) { return r.t.isDirty(); });
        if (!ch.length) { toast('沒有要儲存的改動'); return; }
        busy(e.target, function () {
          return runBatch(ch.map(function (r) {
            var ids = r.pp.get(), same = ids.slice().sort().join() === (fromA[r.dt] || []).slice().sort().join();
            return { op: 'watch.save', key: r.dt, data: { date: r.dt, wids: same ? [] : ids } };
          }), { msg: '已儲存 ' + ch.length + ' 晚的守夜人員', flash: 'watch' });
        }).catch(function () {});
      } }, '儲存守夜人員');
      var other = inp('', { type: 'date' });
      var addNight = function (dt) {
        var ov = D.watch.filter(function (w) { return w.id === dt; })[0], own = ov && (ov.data.wids || []).length;
        var pp = peoplePicker(D.workers, own ? ov.data.wids : (fromA[dt] || []), { disabled: !R.canEdit, placeholder: '＋ 加守夜人員（打名字）' });
        var tag = own ? h('span', { class: 'tag info' }, '另外指定') : (fromA[dt] || []).length ? h('span', { class: 'tag ok' }, '依工作分配') : h('span', { class: 'tag warn' }, '還沒有人');
        var c = h('div', { class: 'card col' }, h('div', { class: 'row' }, h('b', { class: 'grow' }, dayLabel(dt) + ' 晚上'), tag), pp.el);
        var t = track(c, function () { return pp.get(); }, save);
        c.querySelector('.row').insertBefore(t.status, tag);
        if (own && R.canEdit && (fromA[dt] || []).length) c.appendChild(h('div', null, h('button', { class: 'btn sm ghost', onclick: function () { pp.set(fromA[dt]); c.dispatchEvent(new Event('change')); } }, '改回依工作分配')));
        flashOn(c, 'watch');
        rows.push({ dt: dt, pp: pp, t: t });
        list.appendChild(c);
      };
      if (R.canEdit) box.appendChild(bar(save, h('span', { class: 'row' }, other, h('button', { class: 'btn', onclick: function () {
        if (!other.value) return;
        if (nights.indexOf(other.value) >= 0) { toast('已經有這一晚'); return; }
        nights.push(other.value); addNight(other.value);
      } }, '加一個日期'))));
      nights.forEach(addNight);
      if (!nights.length) list.appendChild(h('div', { class: 'card empty' }, '在「營隊設定」填營期日期後，這裡會列出每一晚'));
      box.appendChild(list);
    },
    /** 處理流程圖：左邊編輯、右邊即時預覽（和工作人員端看到的一樣） */
    flow: function (box) {
      var flow = JSON.parse(JSON.stringify(R.config.sopFlow || { title: '', steps: [] }));
      var ro = !R.canEdit, ed = h('div', { class: 'col' }, ''), pv = h('div', { class: 'card' });
      var preview = function () { clear(pv).appendChild(h('h2', { style: { marginBottom: '10px' } }, flow.title || '事件處理流程')); pv.appendChild(flow.steps.length ? Front.flowChart(flow) : h('div', { class: 'muted' }, '還沒有步驟')); };
      var redraw = function () { draw(); preview(); };
      var mini = function (text, fn, title) { return ro ? null : h('button', { class: 'btn sm ghost', type: 'button', title: title || text, onclick: fn }, text); };
      var seqEd = function (steps, depth) {
        var el = h('div', { class: 'fe-seq' });
        steps.forEach(function (st, i) {
          var t = inp(st.text, { placeholder: '步驟（例如：撥打 119）', disabled: ro }), n = inp(st.note, { placeholder: '補充說明（橘色小字，可空白）', disabled: ro }), ph = inp(st.phone, { placeholder: '電話', style: { width: '90px' }, disabled: ro });
          t.oninput = function () { st.text = t.value; preview(); }; n.oninput = function () { st.note = n.value; preview(); }; ph.oninput = function () { st.phone = ph.value; preview(); };
          var card = h('div', { class: 'fe-step' }, h('div', { class: 'row' }, h('span', { class: 'fe-n' }, (i + 1) + '.'), h('div', { class: 'grow' }, t), ph,
            mini('↑', function () { if (i) { steps.splice(i - 1, 0, steps.splice(i, 1)[0]); redraw(); } }, '往上'), mini('↓', function () { if (i < steps.length - 1) { steps.splice(i + 1, 0, steps.splice(i, 1)[0]); redraw(); } }, '往下'),
            mini('✕', function () { if (!(st.branches || []).length || confirm('這一步底下的分岔也會一起刪掉，確定嗎？')) { steps.splice(i, 1); redraw(); } }, '刪除')), n);
          if ((st.branches || []).length) {
            var brs = h('div', { class: 'fe-brs' });
            st.branches.forEach(function (b, j) {
              var lb = inp(b.label, { placeholder: '分支條件（例如：有生命危險）', disabled: ro }), tone = sel([{ value: '', label: '一般' }, { value: 'bad', label: '紅字（危急）' }], b.tone || '', { disabled: ro, style: { width: '120px' } });
              lb.oninput = function () { b.label = lb.value; preview(); }; tone.onchange = function () { b.tone = tone.value; preview(); };
              brs.appendChild(h('div', { class: 'fe-br' }, h('div', { class: 'row' }, h('b', { class: 'small' }, '分支 ' + (j + 1)), h('div', { class: 'grow' }, lb), tone,
                mini('✕', function () { if (confirm('刪掉這個分支和底下的步驟？')) { st.branches.splice(j, 1); if (!st.branches.length) delete st.branches; redraw(); } }, '刪除分支')), seqEd(b.steps = b.steps || [], depth + 1)));
            });
            if (!ro && st.branches.length < 4) brs.appendChild(h('div', null, h('button', { class: 'btn sm', type: 'button', onclick: function () { st.branches.push({ label: '', steps: [{ text: '' }] }); redraw(); } }, '＋ 再一個分支')));
            card.appendChild(brs);
          } else if (!ro && depth < 4) card.appendChild(h('div', null, h('button', { class: 'btn sm ghost', type: 'button', onclick: function () { st.branches = [{ label: '是', steps: [{ text: '' }] }, { label: '否', steps: [{ text: '' }] }]; redraw(); } }, '⑂ 從這一步分岔')));
          el.appendChild(card);
        });
        if (!ro) el.appendChild(h('div', null, h('button', { class: 'btn sm', type: 'button', onclick: function () { steps.push({ text: '' }); redraw(); } }, depth ? '＋ 這個分支加一步' : '＋ 加一步')));
        return el;
      };
      var title = inp(flow.title, { placeholder: '緊急事件處理程序', disabled: ro });
      title.oninput = function () { flow.title = title.value; preview(); };
      var body = h('div');
      var draw = function () { clear(body).appendChild(seqEd(flow.steps, 0)); };
      var btn = h('button', { class: 'btn', onclick: function (e) { busy(e.target, function () { return run('flow.save', { flow: flow }, { msg: '流程圖已儲存', flash: 'flow' }); }).catch(function () {}); } }, '儲存流程圖');
      ed.appendChild(h('div', { class: 'hint' }, '由上往下排步驟；遇到要判斷的地方按「從這一步分岔」，每個分支各自往下排。分岔那一步的下一步，就是各分支做完之後的共同步驟（匯合）。填了電話的步驟，工作人員可以直接點來撥打。'));
      ed.appendChild(field('標題', title));
      ed.appendChild(body);
      var wrap = h('div', { class: 'fe' }, h('div', { class: 'card col' }, ed, R.canEdit ? h('div', { class: 'row wrap' }, btn, h('button', { class: 'btn ghost', onclick: function (e) {
        confirmBox('恢復預設流程', '把流程圖換回系統預設的「緊急事件處理程序」？目前的內容會被取代。', '恢復預設').then(function (ok) { if (ok) busy(e.target, function () { return run('flow.save', { reset: true }, { msg: '已恢復預設流程' }); }).catch(function () {}); });
      } }, '恢復預設')) : null), h('div', { class: 'col' }, h('div', { class: 'small muted' }, '預覽（工作人員端「緊急應變與聯絡資訊」看到的樣子）'), pv));
      var tr = track(wrap.firstChild, function () { return flow; }, btn);
      if (R.canEdit) btn.parentNode.appendChild(tr.status);
      flashOn(wrap.firstChild, 'flow');
      redraw();
      box.appendChild(wrap);
    },
    submissions: function (box, D) {
      box.appendChild(h('div', { class: 'hint', style: { marginBottom: '8px' } }, '學員在學員端送出的，或工作人員在工作人員端幫學員填、學員簽名的自我評估切結書（固定格式）。送出時有編輯工作人員端權限的人會收到通知。'));
      box.appendChild(table(['送出時間', '學員', '小隊', '事件時間', '身體狀況', '自我評估', '需要的協助', '評估人員', '學員簽名'], D.submissions.map(function (s) {
        var a = s.data.answers || {};
        return h('tr', null, h('td', null, fmt(s.data.at)), h('td', null, s.data.name), h('td', null, s.data.squad), h('td', { class: 'small' }, String(a.eventTime || '').replace('T', ' ')), h('td', { class: 'small' }, a.condition), h('td', null, a.canContinue), h('td', null, a.needs),
          h('td', null, s.data.assessor || (s.data.by ? '' : '（學員自己填）')), h('td', null, /^data:image\//.test(s.data.sign || '') ? h('img', { src: s.data.sign, alt: '簽名', class: 'sign-img' }) : ''));
      }), '還沒有人送出'));
    },
    form: function (box, D) {
      box.appendChild(h('div', { class: 'card col' }, h('div', { class: 'hint' }, '自我評估切結書是固定格式的系統表單（第 ' + D.form.version + ' 版），欄位寫在程式裡，營隊不能修改，確保每個營隊的紀錄格式一致。'),
        h('ol', { style: { margin: 0, paddingLeft: '20px' } }, D.form.fields.map(function (f) { return h('li', null, f.label + (f.options ? '（' + f.options.join('／') + '）' : '') + (f.required ? '　必填' : '')); }))));
    }
  };

  /** 地圖編輯：上傳底圖，再加標點、文字、文字卡片、連線（線一定接在兩個點／卡片之間，選到線後點線上可加轉折點，拖曳轉折點移動、點兩下刪除） */
  var MAP_COLORS = [{ value: '#c62828', label: '紅' }, { value: '#1f1f1f', label: '黑' }, { value: '#1565c0', label: '藍' }, { value: '#2e7d32', label: '綠' }, { value: '#ef6c00', label: '橘' }, { value: '#6a1b9a', label: '紫' }, { value: '#ffffff', label: '白' }];
  /** 不重畫畫面的小操作（例如存到圖庫）：正在改、還沒存的卡片不會被洗掉 */
  function runQuiet(name, data, action) {
    return A.op('pkg.data', { action: action || 'update', target: { pkg: R.pkg, op: name, tab: pageTab(), fresh: true }, data: data }).then(function (x) {
      applyAdmin(R.pkg, x && x._extra && x._extra.admin, false);
      return x;
    });
  }
  /** 常用圖庫：存目前的地圖、或從圖庫拿一張來用 */
  function mapLibPick(cb) {
    var body = h('div', { class: 'map-lib' });
    var m;
    var draw = function () {
      clear(body);
      if (!(R.data.maps || []).length) { body.appendChild(h('div', { class: 'hint' }, '圖庫還是空的：在任何一張地圖按「存到圖庫」就會出現在這裡。')); return; }
      (R.data.maps || []).forEach(function (x) {
        body.appendChild(h('div', { class: 'map-lib-it' }, h('button', { type: 'button', class: 'map-lib-pick', onclick: function () { m.close(); cb(JSON.parse(JSON.stringify(x.data.map))); } }, Front.mapView(x.data.map).el, h('b', null, x.data.name), h('span', { class: 'small muted' }, (x.data.map.items || []).length + ' 個標記')),
          R.canEdit ? h('button', { type: 'button', class: 'btn sm ghost', onclick: function () { confirmBox('從圖庫刪除', '刪除「' + x.data.name + '」？已經用這張圖的細流不受影響。', '刪除', true).then(function (ok) { if (ok) runQuiet('map.delete', { id: x.id }, 'delete').then(function () { toast('已從圖庫刪除'); draw(); }, fail); }); } }, '刪除') : null));
      });
    };
    m = modal({ title: '常用圖庫', wide: true, body: body });
    draw();
  }
  function mapEditor(map0, ro, onChange) {
    var map = map0 && map0.img ? JSON.parse(JSON.stringify(map0)) : null;
    if (map) map.items = map.items || [];
    var el = h('div', { class: 'map-ed col', style: { gap: '8px' } }), mode = 'sel', selId = '', pending = '', V = null, note = h('div', { class: 'small', style: { color: 'var(--warn)' } });
    var changed = function () { if (onChange) onChange(); };
    var byId = function (id) { return (map.items || []).filter(function (x) { return x.id === id; })[0]; };
    var MODES = [['sel', '選取／移動'], ['pin', '＋ 標點'], ['text', '＋ 文字'], ['card', '＋ 文字卡片'], ['line', '＋ 連線'], ['del', '刪除']];
    var HINT = { sel: '拖曳可以移動。點一下線選取，線上每一段中間有「＋」，按住拖曳就多一個轉折點；轉折點會吸到水平、鉛直或 30°、45°、60°，點兩下刪除。線會自動只走這些角度。', pin: '在圖上點一下放一個標點。', text: '在圖上點一下放一段文字。', card: '在圖上點一下放一張文字卡片（有框）。', line: '先點起點（標點或卡片），再點終點，兩點會連起來。', del: '點要刪除的東西（刪除標點或卡片，連到它的線也會一起刪掉）。' };
    var pt = function (e) {
      var r = V.svg.getBoundingClientRect();
      var c = function (v) { return Math.max(0, Math.min(1, Math.round(v * 10000) / 10000)); };
      return [c((e.clientX - r.left) / r.width), c((e.clientY - r.top) / r.height)];
    };
    var addBend = function (ln, p) {
      var a = byId(ln.a), b = byId(ln.b); if (!a || !b) return;
      var full = [[a.x, a.y]].concat(ln.pts || [], [[b.x, b.y]]), best = 0, bd = Infinity;
      for (var k = 0; k < full.length - 1; k++) {
        var x1 = full[k][0], y1 = full[k][1], x2 = full[k + 1][0], y2 = full[k + 1][1], dx = x2 - x1, dy = y2 - y1;
        var u = dx || dy ? Math.max(0, Math.min(1, ((p[0] - x1) * dx + (p[1] - y1) * dy) / (dx * dx + dy * dy))) : 0;
        var d2 = Math.pow(x1 + u * dx - p[0], 2) + Math.pow(y1 + u * dy - p[1], 2);
        if (d2 < bd) { bd = d2; best = k; }
      }
      ln.pts = ln.pts || []; if (ln.pts.length >= 30) return toast('一條線最多 30 個轉折點', true);
      ln.pts.splice(best, 0, p);
    };
    // 拖轉折點：和前一點（必要時也和後一點）的連線吸到水平、鉛直、30°、45°、60°…
    var snapBend = function (ln, i, p) {
      var S = V.size(), a = byId(ln.a), b = byId(ln.b);
      var pv = i === 0 ? [a.x, a.y] : ln.pts[i - 1], nx = i === ln.pts.length - 1 ? [b.x, b.y] : ln.pts[i + 1];
      var px = function (q) { return [q[0] * S.W, q[1] * S.H]; }, P0 = px(pv), P1 = px(nx), M = px(p);
      var dirs = Front.MAP_ANGLES.map(function (g) { return [Math.cos(g * Math.PI / 180), Math.sin(g * Math.PI / 180)]; });
      // 兩邊都吸得到的交點（直角轉彎那種），離游標 25 以內就用它
      var best = null;
      dirs.forEach(function (u) { dirs.forEach(function (v) {
        var det = u[0] * v[1] - u[1] * v[0]; if (Math.abs(det) < 1e-6) return;
        var dx = P1[0] - P0[0], dy = P1[1] - P0[1], s1 = (dx * v[1] - dy * v[0]) / det;
        if (s1 <= 0) return;
        var c = [P0[0] + s1 * u[0], P0[1] + s1 * u[1]], d = Math.hypot(c[0] - M[0], c[1] - M[1]);
        if (!best || d < best.d) best = { c: c, d: d };
      }); });
      var out;
      if (best && best.d < 25) out = best.c;
      else {
        var dx = M[0] - P0[0], dy = M[1] - P0[1], L = Math.hypot(dx, dy), g = Math.atan2(dy, dx) * 180 / Math.PI;
        var sn = Front.MAP_ANGLES.reduce(function (m, x) { var d = Math.abs(((g - x + 540) % 360) - 180); return d < m.d ? { x: x, d: d } : m; }, { x: 0, d: 999 }).x * Math.PI / 180;
        var t = dx * Math.cos(sn) + dy * Math.sin(sn); if (t < 0) t = L;
        out = [P0[0] + t * Math.cos(sn), P0[1] + t * Math.sin(sn)];
      }
      var c2 = function (v) { return Math.max(0, Math.min(1, Math.round(v * 10000) / 10000)); };
      return [c2(out[0] / S.W), c2(out[1] / S.H)];
    };
    var props = h('div', { class: 'map-props row wrap', style: { gap: '8px', alignItems: 'flex-end' } });
    var drawProps = function (fresh) {
      clear(props);
      var x = selId && byId(selId);
      if (!x || ro) return;
      var col = sel(MAP_COLORS, x.color || '#c62828');
      col.addEventListener('change', function () { x.color = col.value; V.redraw(selId); changed(); });
      var rm = h('button', { class: 'btn sm danger', type: 'button', onclick: function () { remove(x.id); } }, '刪除');
      if (x.t === 'line') {
        var st = sel([{ value: 'solid', label: '實線' }, { value: 'dash', label: '虛線' }], x.style || 'solid');
        st.addEventListener('change', function () { x.style = st.value; V.redraw(selId); changed(); });
        var ar = h('input', { type: 'checkbox', checked: x.arrow !== false });
        ar.addEventListener('change', function () { x.arrow = ar.checked; V.redraw(selId); changed(); });
        props.appendChild(h('span', { class: 'small muted' }, '線：'));
        props.append(st, col, h('label', { class: 'small row', style: { gap: '4px' } }, ar, '箭頭'), (x.pts || []).length ? h('button', { class: 'btn sm', type: 'button', onclick: function () { x.pts = []; V.redraw(selId); drawProps(); changed(); } }, '拉直（清掉轉折點）') : null, rm);
        return;
      }
      var tx = h('textarea', { class: 'map-tx', rows: 2, placeholder: x.t === 'pin' ? '標點旁的字（可留白）' : '文字（可換行）', style: { width: '220px' } });
      tx.value = x.text || '';
      tx.addEventListener('input', function () { x.text = tx.value.slice(0, 200); V.redraw(selId); changed(); });
      var sz = sel([{ value: '0.7', label: '小' }, { value: '1', label: '中' }, { value: '1.4', label: '大' }, { value: '2', label: '特大' }], String(x.size || 1));
      sz.addEventListener('change', function () { x.size = Number(sz.value); V.redraw(selId); changed(); });
      props.append(h('span', { class: 'small muted' }, { pin: '標點：', text: '文字：', card: '卡片：' }[x.t]), tx, col, sz, rm);
      if (fresh && x.t !== 'pin') setTimeout(function () { tx.focus(); tx.select(); }, 0);
    };
    var remove = function (id) {
      map.items = map.items.filter(function (x) { return x.id !== id && x.a !== id && x.b !== id; });
      if (selId === id || !byId(selId)) selId = '';
      if (pending === id) pending = '';
      V.redraw(selId); drawProps(); changed();
    };
    var setMode = function (m) { mode = m; pending = ''; draw(); };
    // 放大編輯：整個編輯器搬到全螢幕視窗，關掉再放回原位
    var zoom = function () {
      var holder = h('span'); el.replaceWith(holder); el.classList.add('map-zoom');
      var mm = modal({ title: '地圖（放大編輯）', full: true, body: el, onClose: function () { el.classList.remove('map-zoom'); holder.replaceWith(el); draw(); } });
      draw(); void mm;
    };
    var draw = function () {
      clear(el);
      if (!map) {
        if (ro) { el.appendChild(h('div', { class: 'hint' }, '沒有地圖')); return; }
        var pick = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } }), url = inp('', { placeholder: '或貼上圖片網址（https://…）', style: { flex: 1, minWidth: '200px' } });
        pick.addEventListener('change', function () {
          if (pick.files[0]) upload(pick.files[0], note).then(function (r) { map = { img: String(r.img || r.url).replace('sz=w1000', 'sz=w2000'), items: [] }; draw(); changed(); }, function (e) { toast(e.message, true); });
        });
        el.appendChild(h('div', { class: 'row wrap', style: { gap: '6px' } }, pick, h('button', { class: 'btn sm', type: 'button', onclick: function () { pick.click(); } }, '上傳底圖'),
          h('button', { class: 'btn sm', type: 'button', onclick: function () { mapLibPick(function (mp) { map = mp; map.items = map.items || []; draw(); changed(); }); } }, '從常用圖庫選'), url,
          h('button', { class: 'btn sm', type: 'button', onclick: function () { var u = url.value.trim(); if (!/^https:\/\//.test(u)) return toast('網址要用 https:// 開頭', true); map = { img: u, items: [] }; draw(); changed(); } }, '用這張')));
        el.appendChild(note);
        return;
      }
      V = Front.mapView(map, { edit: !ro, sel: selId });
      if (ro) { el.appendChild(V.el); return; }
      el.appendChild(h('div', { class: 'row wrap map-tools', style: { gap: '4px' } }, MODES.map(function (m) {
        return h('button', { class: 'btn sm' + (mode === m[0] ? ' primary' : ''), type: 'button', 'data-mode': m[0], onclick: function () { setMode(m[0]); } }, m[1]);
      }), h('span', { style: { flex: 1 } }),
        el.classList.contains('map-zoom') ? null : h('button', { class: 'btn sm ghost', type: 'button', onclick: function () { zoom(); } }, '⤢ 放大編輯'),
        h('button', { class: 'btn sm ghost', type: 'button', onclick: function () {
          askText('存到常用圖庫', '名稱', '').then(function (nm) { nm = String(nm || '').trim(); if (!nm) return; runQuiet('map.save', { name: nm, map: { img: map.img, items: map.items } }, 'create').then(function () { toast('已存到常用圖庫「' + nm + '」'); }, fail); });
        } }, '存到圖庫'),
        h('button', { class: 'btn sm ghost', type: 'button', onclick: function () { mapLibPick(function (mp) { if (map.items.length && !confirm('換成圖庫的地圖？目前的標記會被取代（按儲存才會生效）')) return; map = mp; map.items = map.items || []; selId = ''; draw(); changed(); }); } }, '換圖庫的圖'),
        h('button', { class: 'btn sm ghost', type: 'button', onclick: function () { if (map.items.length && !confirm('移除底圖和上面所有標記？（按儲存才會生效）')) return; map = null; selId = ''; draw(); changed(); } }, '移除地圖')));
      var hint = h('div', { class: 'hint map-hint' }, HINT[mode] + (mode === 'line' && pending ? '　已選起點，再點終點。' : ''));
      el.appendChild(hint);
      V.el.classList.add('map-edit', 'mode-' + mode);
      el.appendChild(V.el);
      el.appendChild(props);
      var drag = null;
      V.svg.addEventListener('pointerdown', function (e) {
        var p = pt(e), bend = e.target.closest('[data-bend]'), it = e.target.closest('[data-id]'), id = it ? it.getAttribute('data-id') : '';
        var x = id && byId(id);
        e.preventDefault();
        if (bend) { var bp = bend.getAttribute('data-bend').split(':'); drag = { line: byId(bp[0]), i: Number(bp[1]) }; V.svg.setPointerCapture(e.pointerId); return; }
        var add = e.target.closest('[data-add]');
        if (add) {
          var ap = add.getAttribute('data-add').split(':'), al = byId(ap[0]);
          if (al) { al.pts = al.pts || []; if (al.pts.length >= 30) return toast('一條線最多 30 個轉折點', true); al.pts.splice(Number(ap[1]), 0, [Number(ap[2]), Number(ap[3])]); drag = { line: al, i: Number(ap[1]) }; V.redraw(selId); drawProps(); V.svg.setPointerCapture(e.pointerId); changed(); }
          return;
        }
        if (mode === 'del') { if (x) remove(id); return; }
        if (mode === 'line') {
          if (!x || x.t === 'line') return;
          if (!pending) { pending = id; selId = id; V.redraw(selId); hint.textContent = HINT.line + '　已選起點，再點終點。'; return; }
          if (pending === id) return;
          var ln = { id: rid('m', 8), t: 'line', a: pending, b: id, pts: [], style: 'solid', arrow: true, color: (byId(pending) || {}).color || '#c62828' };
          map.items.push(ln); pending = ''; selId = ln.id; hint.textContent = HINT.line;
          V.redraw(selId); drawProps(); changed(); return;
        }
        if (x) {
          if (x.t === 'line') { if (selId === id && mode === 'sel') { addBend(x, p); changed(); } selId = id; V.redraw(selId); drawProps(); return; }
          if (selId !== id) { selId = id; V.redraw(selId); drawProps(); }
          drag = { it: x, dx: x.x - p[0], dy: x.y - p[1], moved: false };
          V.svg.setPointerCapture(e.pointerId);
          return;
        }
        if (mode === 'pin' || mode === 'text' || mode === 'card') {
          var n = { id: rid('m', 8), t: mode, x: p[0], y: p[1], text: mode === 'pin' ? '' : mode === 'card' ? '關卡' : '文字', color: '#c62828', size: 1 };
          map.items.push(n); selId = n.id; V.redraw(selId); drawProps(true); changed(); return;
        }
        if (selId) { selId = ''; V.redraw(''); drawProps(); }
      });
      V.svg.addEventListener('pointermove', function (e) {
        if (!drag) return;
        var p = pt(e);
        if (drag.line) drag.line.pts[drag.i] = snapBend(drag.line, drag.i, p);
        else { drag.it.x = Math.max(0, Math.min(1, p[0] + drag.dx)); drag.it.y = Math.max(0, Math.min(1, p[1] + drag.dy)); drag.moved = true; }
        V.redraw(selId);
      });
      var end = function () { if (drag && (drag.line || drag.moved)) changed(); drag = null; };
      V.svg.addEventListener('pointerup', end);
      V.svg.addEventListener('pointercancel', end);
      V.svg.addEventListener('dblclick', function (e) {
        var bend = e.target.closest('[data-bend]'); if (!bend) return;
        var bp = bend.getAttribute('data-bend').split(':'), ln = byId(bp[0]);
        if (ln) { ln.pts.splice(Number(bp[1]), 1); V.redraw(selId); drawProps(); changed(); }
      });
      drawProps();
    };
    draw();
    return { el: el, get: function () { return map && map.img ? { img: map.img, items: map.items } : null; } };
  }

  /** 上傳檔案到雲端硬碟（最多 20MB），回傳 {url, img, name, kind} */
  function upload(file, note) {
    if (file.size > 20 * 1024 * 1024) return Promise.reject(new Error('「' + file.name + '」太大（最多 20MB）。大的檔案請先放到雲端硬碟，再貼分享連結'));
    if (note) note.textContent = '上傳中：' + file.name + '…';
    return new Promise(function (ok, no) {
      var fr = new FileReader();
      fr.onload = function () { ok(String(fr.result).split(',')[1] || ''); };
      fr.onerror = function () { no(new Error('讀不到檔案')); };
      fr.readAsDataURL(file);
    }).then(function (b64) { return api('pkgUpload', A.camp, R.pkg, file.name, file.type, b64); }).then(function (r) {
      if (note) note.textContent = r.shared ? '' : '已上傳，但雲端硬碟不允許設成「知道連結的人可以檢視」，學員可能打不開：請到雲端硬碟手動調整分享設定';
      return r;
    }, function (e) { if (note) note.textContent = ''; throw e; });
  }
  var minOf = function (t) { var m = String(t || '').match(/^(\d{2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  function durText(a, b) { var s = minOf(a), e = minOf(b); if (s === null || e === null) return ''; if (e <= s) return '結束比開始早'; var d = e - s; return '共 ' + (d >= 60 ? Math.floor(d / 60) + ' 小時' + (d % 60 ? ' ' + (d % 60) + ' 分' : '') : d + ' 分鐘'); }

  VIEWS.courses = {
    list: function (box, D) {
      var edit = function (c) {
        c = c || { id: '', data: { type: D.types[0], files: [] } };
        var d = c.data, files = (d.files || []).map(function (f) { return Object.assign({}, f); }), photo = d.photo || '';
        var type = sel(D.types, d.type), title = inp(d.title, { placeholder: '例如：奈米材料實驗室參訪' }), date = inp(d.date, { type: 'date' }), st = inp(d.start, { type: 'time' }), en = inp(d.end, { type: 'time' });
        var dur = h('span', { class: 'small muted' }), place = inp(d.place), speaker = inp(d.speaker, { placeholder: '例如：王大明 教授' }), desc = area(d.desc, { rows: 6, placeholder: '課程內容、注意事項、要帶的東西…（可用 **粗體**、- 清單、[文字](網址)）' });
        var hide = h('input', { type: 'checkbox', checked: !!d.hidden }), note = h('div', { class: 'small', style: { color: 'var(--warn)' } });
        var upd = function () { dur.textContent = durText(st.value, en.value); };
        st.addEventListener('input', upd); en.addEventListener('input', upd); upd();
        var fl = h('div', { class: 'col', style: { gap: '6px' } });
        var drawFiles = function () {
          clear(fl);
          files.forEach(function (f, i) {
            var n = inp(f.name, { placeholder: '顯示名稱' }), u = inp(f.url, { placeholder: 'https://' });
            n.oninput = function () { f.name = n.value; }; u.oninput = function () { f.url = u.value; };
            fl.appendChild(h('div', { class: 'row' }, h('span', null, f.kind === 'pdf' ? '📄' : f.kind === 'slides' ? '📊' : '📎'), h('div', { style: { flex: '1 1 40%' } }, n), h('div', { style: { flex: '1 1 60%' } }, u), h('button', { class: 'btn sm ghost', type: 'button', onclick: function () { files.splice(i, 1); drawFiles(); } }, '✕')));
          });
          var pick = h('input', { type: 'file', multiple: true, class: 'hidden', accept: '.pdf,.ppt,.pptx,.key,.doc,.docx,.xls,.xlsx,.zip,image/*' });
          pick.addEventListener('change', function () {
            var list = Array.prototype.slice.call(pick.files);
            list.reduce(function (p, file) { return p.then(function () { return upload(file, note).then(function (r) { files.push({ name: r.name.replace(/\.[^.]+$/, ''), url: r.url, kind: r.kind }); drawFiles(); }); }); }, Promise.resolve()).catch(fail);
          });
          fl.appendChild(h('div', { class: 'row wrap' }, pick, h('button', { class: 'btn sm', type: 'button', onclick: function () { pick.click(); } }, '上傳檔案（PDF、簡報…）'), h('button', { class: 'btn sm ghost', type: 'button', onclick: function () { files.push({ name: '', url: '' }); drawFiles(); } }, '＋ 貼連結（雲端硬碟、網站）')));
        };
        drawFiles();
        var ph = h('div', { class: 'col', style: { gap: '10px' } });
        var pos = Object.assign({ x: 50, y: 50, z: 1 }, d.photoPos || {}), frame = d.frame || 'circle';
        var drawPhoto = function () {
          clear(ph);
          var pick = h('input', { type: 'file', accept: 'image/*', class: 'hidden' });
          pick.addEventListener('change', function () { if (pick.files[0]) upload(pick.files[0], note).then(function (r) { photo = r.img || r.url; pos = { x: 50, y: 50, z: 1 }; drawPhoto(); }, fail); });
          var url = inp(photo, { placeholder: '或貼圖片網址 https://', style: { width: '260px' } });
          url.onchange = function () { photo = url.value.trim(); drawPhoto(); };
          var btns = h('div', { class: 'col', style: { gap: '6px' } }, pick, h('div', { class: 'row' }, h('button', { class: 'btn sm', type: 'button', onclick: function () { pick.click(); } }, photo ? '換照片' : '上傳照片'), photo ? h('button', { class: 'btn sm ghost', type: 'button', onclick: function () { photo = ''; drawPhoto(); } }, '不放照片') : null), url,
            h('div', { class: 'hint' }, '教授照片、場館或實驗室照片；不放就不顯示'));
          if (!photo) { ph.appendChild(h('div', { class: 'row wrap' }, h('div', { class: 'cs-photo none' }, '沒有照片'), btns)); return; }
          // 調整顯示範圍：拖曳照片移動、滑桿放大；下面同步顯示在各版型的樣子
          var stage = h('div', { class: 'ph-edit' }), mini = h('div', { class: 'ph-minis' });
          var zoom = h('input', { type: 'range', min: '1', max: '3', step: '0.05', value: String(pos.z), style: { width: '160px' } });
          var paint = function () {
            clear(stage).appendChild(Front.photo(photo, pos, frame, 168));
            clear(mini);
            [['清單', frame, 48], ['講者名片', frame, 76]].forEach(function (x) { mini.appendChild(h('div', { class: 'col', style: { gap: '4px', alignItems: 'center' } }, Front.photo(photo, pos, x[1], x[2]), h('span', { class: 'small muted' }, x[0]))); });
            mini.appendChild(h('div', { class: 'col', style: { gap: '4px', alignItems: 'center', width: '180px' } }, Front.photo(photo, pos, 'wide'), h('span', { class: 'small muted' }, '封面大圖')));
          };
          var drag = null;
          stage.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }; stage.setPointerCapture(e.pointerId); e.preventDefault(); });
          stage.addEventListener('pointermove', function (e) {
            if (!drag) return;
            var k = 100 / 168 / pos.z * 1.6;
            pos.x = Math.max(0, Math.min(100, Math.round(drag.px - (e.clientX - drag.x) * k)));
            pos.y = Math.max(0, Math.min(100, Math.round(drag.py - (e.clientY - drag.y) * k)));
            paint();
          });
          stage.addEventListener('pointerup', function () { drag = null; });
          stage.addEventListener('wheel', function (e) { e.preventDefault(); pos.z = Math.max(1, Math.min(3, Math.round((pos.z - e.deltaY * 0.002) * 100) / 100)); zoom.value = String(pos.z); paint(); }, { passive: false });
          zoom.oninput = function () { pos.z = Number(zoom.value); paint(); };
          var frames = h('div', { class: 'row wrap', style: { gap: '6px' } }, Object.keys(Front.FRAMES).map(function (k) {
            return h('button', { type: 'button', class: 'ph-pick' + (k === frame ? ' on' : ''), title: Front.FRAMES[k], onclick: function () { frame = k; drawPhoto(); } }, Front.photo(photo, pos, k, 34), h('span', null, Front.FRAMES[k]));
          }));
          paint();
          ph.appendChild(h('div', { class: 'row wrap', style: { alignItems: 'flex-start', gap: '16px' } }, stage,
            h('div', { class: 'col', style: { gap: '8px', flex: '1 1 240px' } },
              h('div', { class: 'small' }, '拖曳照片調整位置，滑桿（或滑鼠滾輪）放大'),
              h('div', { class: 'row' }, h('span', { class: 'small muted' }, '放大'), zoom, h('button', { class: 'btn sm ghost', type: 'button', onclick: function () { pos = { x: 50, y: 50, z: 1 }; zoom.value = '1'; paint(); } }, '重設')),
              h('div', { class: 'small' }, '外框'), frames, btns)));
          ph.appendChild(h('div', null, h('div', { class: 'small muted', style: { marginBottom: '4px' } }, '在各版型看起來（版型在「設定」選）'), mini));
        };
        drawPhoto();
        form(c.id ? '編輯課程' : '新增課程', [h('div', { class: 'grid2' }, field('類別', type), field('課程名稱', title)),
          h('div', { class: 'grid2' }, field('日期', date), h('div', null, h('div', { class: 'grid2' }, field('開始', st), field('結束', en)), dur)),
          h('div', { class: 'grid2' }, field('地點', place), field('講者／帶隊', speaker)), field('課程描述', desc), field('課程檔案', fl), field('頭貼照片', ph), note,
          h('label', { class: 'check' }, hide, h('span', null, '學員端不顯示（只給工作人員看）'))],
          function () { return run('course.save', { id: c.id, type: type.value, title: title.value, date: date.value, start: st.value, end: en.value, place: place.value, speaker: speaker.value, desc: desc.value, files: files, photo: photo, photoPos: pos, frame: frame, hidden: hide.checked }, { ver: c.id ? c.version : undefined }); }, true);
      };
      box.appendChild(bar(addBtn('新增課程', function () { edit(); }), h('span', { class: 'hint' }, '課程導覽、參訪導覽、實驗室介紹、其他課程介紹。在編輯器放「課程簡介」畫面，學員端、工作人員端就看得到。')));
      if (!D.courses.length) { box.appendChild(h('div', { class: 'card empty' }, '還沒有課程')); return; }
      D.types.forEach(function (t) {
        var list = D.courses.filter(function (c) { return c.data.type === t; });
        if (!list.length) return;
        box.appendChild(h('h2', { style: { margin: '14px 0 8px' } }, t + '（' + list.length + '）'));
        box.appendChild(table(['日期', '時間', '課程', '講者／地點', '檔案', '照片', ''], list.map(function (c) {
          var d = c.data;
          return hl(h('tr', { style: d.hidden ? { opacity: 0.65 } : null }, h('td', { style: { whiteSpace: 'nowrap' } }, d.date ? dayLabel(d.date) : h('span', { class: 'tag warn' }, '沒日期')),
            h('td', { style: { whiteSpace: 'nowrap' } }, (d.start || '') + (d.end ? '–' + d.end : ''), h('div', { class: 'small muted' }, durText(d.start, d.end))),
            h('td', null, h('b', null, d.title), d.hidden ? h('span', { class: 'tag', style: { marginLeft: '4px' } }, '學員看不到') : null, d.desc ? h('div', { class: 'small muted' }, String(d.desc).slice(0, 60) + (String(d.desc).length > 60 ? '…' : '')) : null),
            h('td', { class: 'small' }, [d.speaker, d.place].filter(String).join('\n')), h('td', null, (d.files || []).length || ''), h('td', null, d.photo ? Front.photo(d.photo, d.photoPos, d.frame, 40) : ''),
            actions(function () { edit(c); }, function () { del('course.delete', { id: c.id }, d.title); })), c.id);
        })));
      });
    }
  };

  // 團隊計分：改／刪一筆結果或加減分
  function sbEditResult(r, D) {
    var g = D.games.filter(function (x) { return x.id === r.data.game; })[0];
    var s = inp(r.data.score, { type: 'number' }), note = inp(r.data.note || '');
    form('修改「' + (g ? g.data.name : '') + '」' + teamName(D, r.data.team) + '的結果', [field('分數', s), D.categories ? field('備註', note) : null, h('div', { class: 'hint' }, '會覆蓋這一隊在這個 Game 的結果（舊的分數留在操作紀錄）。')],
      function () { return run('result.submit', { game: r.data.game, team: r.data.team, score: s.value, note: note.value }, { msg: '已更新' }); });
  }
  function sbEditAdjust(a, D) {
    var t = sel(D.teams.map(function (x) { return { value: x.no, label: x.name }; }), a.data.team), dl = inp(a.data.delta, { type: 'number' }), note = inp(a.data.note || '');
    var cat = D.categories ? sel(D.categories, a.data.category || D.categories[0]) : null;
    form('修改加／扣分', [h('div', { class: 'grid2' }, field('隊伍', t), field('分數', dl)), h('div', { class: 'grid2' }, cat ? field('類別', cat) : h('span'), field('理由', note))],
      function () { return run('adjust.save', { id: a.id, team: t.value, delta: dl.value, note: note.value, category: cat ? cat.value : '' }, { ver: a.version, msg: '已更新' }); });
  }
  function teamName(D, no) { var t = D.teams.filter(function (x) { return String(x.no) === String(no); })[0]; return t ? t.name : '第 ' + no + ' 隊'; }
  /** 全部分數紀錄：Game 結果＋加減分，新的在上面；可以改、刪 */
  function sbRecords(D, only) {
    var gn = {};
    D.games.forEach(function (x) { gn[x.id] = x.data.name; });
    var list = (only === 'adjust' ? [] : D.results.map(function (r) { return { kind: 'result', at: r.data.at, rec: r }; }))
      .concat(only === 'result' ? [] : D.adjust.map(function (a) { return { kind: 'adjust', at: a.data.at, rec: a }; }))
      .sort(function (x, y) { return String(y.at || '').localeCompare(String(x.at || '')); });
    return table(['時間', '隊伍', '項目', '分數', '記錄者', ''], list.map(function (x) {
      var r = x.rec, isR = x.kind === 'result', sc = isR ? r.data.score : r.data.delta;
      var what = isR ? 'Game：' + (gn[r.data.game] || '（已刪除）') : (r.data.category ? r.data.category + '：' : '') + (r.data.note || (sc >= 0 ? '加分' : '扣分'));
      return h('tr', null, h('td', { class: 'small' }, fmt(r.data.at)), h('td', null, teamName(D, r.data.team)), h('td', null, what, r.data._rh ? h('span', { class: 'tag info', style: { marginLeft: '6px' } }, '驗收') : null),
        h('td', null, h('b', { style: { color: !isR && sc < 0 ? 'var(--bad)' : !isR ? 'var(--ok)' : '' } }, (!isR && sc > 0 ? '+' : '') + sc)), h('td', { class: 'small' }, (r.data.by || '') + (r.data.editedBy ? '（' + r.data.editedBy + ' 改過）' : '')),
        actions(function () { if (isR) sbEditResult(r, D); else sbEditAdjust(r, D); }, function () { del(isR ? 'result.delete' : 'adjust.delete', { id: r.id }, teamName(D, r.data.team) + ' ' + what + ' ' + sc); }));
    }), only === 'result' ? (D.games.length ? '還沒有結果' : '先到「Game 清單」新增 Game') : only === 'adjust' ? '還沒有加減分' : '還沒有任何分數');
  }
  VIEWS.scoreboard = {
    board: function (box, D) {
      var b = D.board;
      box.appendChild(h('div', { class: 'card' }, h('h2', null, (R.config.title || '團隊積分') + (b.provisional ? '（暫定排名）' : '')),
        h('div', { class: 'board' }, b.rows.map(function (r) { return h('details', { class: 'r', style: { display: 'block' } }, h('summary', { class: 'row', style: { cursor: 'pointer' } }, h('span', { class: 'rk' }, r.rank), h('span', { class: 'grow' }, r.name), h('span', { class: 'sc' }, r.score)),
          h('div', { class: 'small', style: { padding: '6px 0 0 40px' } }, r.parts.length ? r.parts.map(function (p) { return h('div', null, p.name + '：' + (p.score > 0 ? '+' : '') + p.score); }) : '還沒有分數')); })),
        b.provisional ? h('div', { class: 'hint', style: { marginTop: '8px' } }, '有 Game 結果還沒發布，所以是暫定排名。到「Game 清單」發布。') : null));
      var rh = A.info.rehearsal;
      box.appendChild(h('div', { class: 'row wrap', style: { margin: '16px 0 8px', alignItems: 'center' } }, h('h2', { class: 'grow', style: { margin: 0, fontSize: '16px' } }, '全部分數紀錄'),
        R.canEdit && (D.results.length || D.adjust.length) ? h('button', { class: 'btn danger sm', onclick: function (e) {
          askText('清除全部分數', '輸入「清除」確認', '', { okText: '清除', hint: rh ? '「' + rh.name + '」驗收中：只會清掉驗收時產生的分數。' : '會刪掉所有 Game 結果和加減分（Game 清單留著），每一筆都留在操作紀錄。' }).then(function (v) {
            if (v === null) return;
            busy(e.target, function () { return run('scores.clear', { confirm: String(v).trim() }, { action: 'delete', msg: false }); }).then(function (x) { if (x) toast('已清除 ' + x.cleared + ' 筆分數'); }, function () {});
          });
        } }, '清除全部分數') : null));
      box.appendChild(sbRecords(D));
    },
    games: function (box, D) {
      var REL = { immediate: '立即發布', all: '所有隊伍到齊後發布', manual: '手動發布' };
      var canPub = A.info.isRoot || ((A.info.pkgPerms || {})[R.pkg] || []).indexOf('publish') >= 0;
      var edit = function (g) {
        g = g || { id: '', data: { release: 'immediate' } };
        var name = inp(g.data.name), rel = sel(Object.keys(REL).map(function (k) { return { value: k, label: REL[k] }; }), g.data.release);
        form(g.id ? '編輯 Game' : '新增 Game', [field('名稱', name), field('結果發布方式', rel)], function () { return run('game.save', { id: g.id, name: name.value, release: rel.value }, { ver: g.id ? g.version : undefined }); });
      };
      box.appendChild(bar(addBtn('新增 Game', function () { edit(); })));
      box.appendChild(table(['Game', '發布方式', '已收到', '狀態', ''], D.games.map(function (g) {
        var n = D.results.filter(function (r) { return r.data.game === g.id; }).length, ok = D.board.released[g.id];
        return h('tr', null, h('td', null, h('b', null, g.data.name)), h('td', null, REL[g.data.release]), h('td', null, n + '／' + D.teams.length + ' 隊'),
          h('td', null, ok ? h('span', { class: 'tag ok' }, '已發布') : h('span', { class: 'tag' }, '未發布'), canPub && R.canEdit ? h('button', { class: 'btn sm', style: { marginLeft: '6px' }, onclick: function (e) {
            busy(e.target, function () { return run('game.publish', { id: g.id, published: !g.data.published }, { msg: g.data.published ? '已收回' : '已發布' }); }).catch(function () {});
          } }, g.data.published ? '收回手動發布' : '手動發布') : null),
          actions(function () { edit(g); }, n ? null : function () { del('game.delete', { id: g.id }, g.data.name); }));
      }), '還沒有 Game'));
    },
    results: function (box, D) {
      if (R.canEdit && D.games.length) {
        var g = sel(D.games.map(function (x) { return { value: x.id, label: x.data.name }; }), D.games[0].id), t = sel(D.teams.map(function (x) { return { value: x.no, label: x.name }; }), D.teams[0] && D.teams[0].no), s = inp('', { type: 'number' }), note = inp('');
        box.appendChild(h('div', { class: 'card col', style: { marginBottom: '12px' } }, h('h2', null, '提交 Game 結果'), h('div', { class: 'hint' }, '同一個 Game 同一隊再送一次是「更新結果」（最新的生效），不是加分；修正請用新的分數覆蓋或到「加／扣分」。'),
          h('div', { class: 'grid2' }, field('Game', g), field('隊伍', t)), h('div', { class: 'grid2' }, field('分數', s), D.categories ? field('備註', note) : h('span')),
          h('div', null, h('button', { class: 'btn primary', onclick: function (e) { busy(e.target, function () { return run('result.submit', { game: g.value, team: t.value, score: s.value, note: note.value }, { action: 'create', msg: false }); }).then(function (x) { if (x) { toast(x.updated ? '已更新這一隊的結果' : '已送出'); } }, function () {}); } }, '送出'))));
      }
      box.appendChild(sbRecords(D, 'result'));
    },
    adjust: function (box, D) {
      if (R.canEdit) {
        var t = sel(D.teams.map(function (x) { return { value: x.no, label: x.name }; }), D.teams[0] && D.teams[0].no), dl = inp('', { type: 'number', placeholder: '+100 或 -100' }), note = inp('', { placeholder: '可空白' });
        var cat = D.categories ? sel(D.categories, D.categories[0]) : null;
        box.appendChild(h('div', { class: 'card col', style: { marginBottom: '12px' } }, h('h2', null, '手動加／扣分'), h('div', { class: 'hint' }, '每一筆都是獨立的修正事件，立即生效；記錯了可以在下面直接改或刪。'),
          h('div', { class: 'grid2' }, field('隊伍', t), field('分數', dl)), h('div', { class: 'grid2' }, cat ? field('類別', cat) : h('span'), field('理由', note)),
          h('div', null, h('button', { class: 'btn primary', onclick: function (e) { busy(e.target, function () { return run('adjust.add', { team: t.value, delta: dl.value, note: note.value, category: cat ? cat.value : '' }, { action: 'create', msg: '已記錄' }); }).catch(function () {}); } }, '記錄'))));
      }
      box.appendChild(sbRecords(D, 'adjust'));
    }
  };

  return { open: open };
})();
