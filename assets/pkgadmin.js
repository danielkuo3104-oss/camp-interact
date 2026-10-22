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
  function del(name, data, label) {
    return confirmBox('刪除', '確定要刪除「' + label + '」嗎？', '刪除', true).then(function (ok) { if (ok) return run(name, data, { action: 'delete', msg: '已刪除' }).catch(fail); });
  }
  function flashOn(el, key) { if (FLASH === key) { FLASH = ''; el.classList.add('saved'); setTimeout(function () { el.classList.remove('saved'); }, 3000); } }

  var TABS = {
    people: [['workers', '工作人員'], ['assign', '工作分配'], ['setup', '股別與活動'], ['squads', '小隊'], ['students', '學員'], ['rooms', '分房'], ['config', '設定']],
    schedule: [['items', '營期流程'], ['activities', '活動'], ['rotations', '跑關'], ['places', '場地'], ['flows', '流程清單'], ['config', '設定']],
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
    var I = A.info, linked = I.regUrl && I.regPrefix && I.secretSet;
    var btn = R.canEdit && linked ? h('button', { class: 'btn primary', onclick: function (e) {
      busy(e.target, function () { return run('sync', {}, { action: 'run', msg: false }); }).then(function (x) {
        if (x) { toast('已同步：學員 ' + x.total + ' 位（更新 ' + x.changed + '）、專輔隨輔 ' + (x.staff || 0) + ' 位（新增 ' + (x.staffAdded || 0) + '）、房間 ' + (x.rooms || 0) + ' 間'); A.reload().then(function () { A.route(); }); }
      }, function () {});
    } }, '從報名後台同步') : null;
    return h('div', { class: 'card row wrap', style: { padding: '10px 14px', marginBottom: '12px' } }, btn,
      h('span', { class: 'hint grow' }, linked ? '同步學員（小隊、房間）、各隊專輔隨輔（自動成為工作人員）、分房。每小時會自動同步，報名後台改了想馬上看到就按這裡。' + (I.lastSync ? '　上次同步 ' + fmt(I.lastSync) : '　尚未同步')
        : '還沒和報名後台串接，到「營隊設定與備份」設定後就能同步。'));
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
  function peoplePicker(workers, selected, o) {
    o = o || {};
    var sel_ = (selected || []).map(String), byId = {}, byLabel = {};
    var label = function (w) { return w.data.name + (w.data.dept ? '（' + w.data.dept + '）' : ''); };
    (workers || []).forEach(function (w) { byId[w.id] = w; byLabel[label(w)] = w.id; byLabel[w.data.name] = byLabel[w.data.name] || w.id; });
    var lid = 'ppl' + (++PP_SEQ), el = h('div', { class: 'pp' + (o.compact ? ' compact' : '') }), list = h('datalist', { id: lid }, (workers || []).map(function (w) { return h('option', { value: label(w) }); }));
    var box = h('span', { class: 'pp-list' });
    var input = h('input', { class: 'pp-in', list: lid, placeholder: o.placeholder || '＋ 加人', disabled: o.disabled });
    var draw = function () {
      clear(box);
      sel_.forEach(function (id, i) {
        var w = byId[id];
        box.appendChild(h('span', { class: 'chip on pp-chip' + (w ? '' : ' gone') }, w ? w.data.name : '（已移除）', o.disabled ? null : h('button', { class: 'pp-x', type: 'button', 'aria-label': '移除', onclick: function (e) { e.stopPropagation(); sel_.splice(i, 1); draw(); el.dispatchEvent(new Event('change', { bubbles: true })); } }, '✕')));
      });
    };
    var add = function () {
      var v = input.value.trim(), id = byLabel[v];
      if (!id) { var hit = (workers || []).filter(function (w) { return w.data.name.indexOf(v) >= 0; }); if (v && hit.length === 1) id = hit[0].id; }
      if (id && sel_.indexOf(id) < 0) sel_.push(id);
      if (id || !v) { input.value = ''; draw(); el.dispatchEvent(new Event('change', { bubbles: true })); }
    };
    input.addEventListener('change', add);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } else if (e.key === 'Backspace' && !input.value && sel_.length) { sel_.pop(); draw(); el.dispatchEvent(new Event('change', { bubbles: true })); } });
    el.appendChild(box); if (!o.disabled) el.appendChild(input); el.appendChild(list);
    el.addEventListener('click', function () { input.focus(); });
    draw();
    return { el: el, get: function () { return sel_.slice(); }, set: function (ids) { sel_ = (ids || []).map(String); draw(); }, input: input };
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
      if (t === 'people') { var pp = peoplePicker(o.workers || [], v || [], { compact: true, disabled: ro, placeholder: '＋' }); e = { el: pp.el, get: pp.get, set: function (x) { pp.set(x); }, input: pp.input }; }
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
      else {
        var i = h('input', { class: 'g-in', type: t === 'number' ? 'number' : t === 'date' ? 'date' : t === 'datetime' ? 'datetime-local' : 'text', value: v === undefined || v === null ? '' : v, placeholder: c.ph || '', list: colList[c.k] || null, disabled: ro, min: t === 'number' ? 0 : null });
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
    G.moveTo = function (r, k) { G.ensureGroup(k); body.insertBefore(r.tr, G.groupEnd(k)); G.labels(); };
    /** 每組內依 o.sortKey 排好 */
    G.sort = function () {
      if (!o.sortKey) return;
      Object.keys(heads).forEach(function (k) {
        var rs = G.rows.filter(function (r) { return o.groupOf(r.read()) === k; }).sort(function (a, b) { return String(o.sortKey(a.read())).localeCompare(String(o.sortKey(b.read()))); });
        var end = G.groupEnd(k);
        rs.forEach(function (r) { body.insertBefore(r.tr, end); });
      });
    };
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
      var td = e.target.closest('td'), tr = td && td.parentNode;
      if (!td || !td.dataset.ci) return;
      e.preventDefault();
      var nx = tr.nextSibling;
      while (nx && nx.classList.contains('hidden')) nx = nx.nextSibling;
      if ((!nx || nx.classList.contains('g-grp')) && !ro) { var cur = G.rows.filter(function (x) { return x.tr === tr; })[0], gk2 = o.groupOf && cur ? o.groupOf(cur.read()) : ''; nx = G.newRow(gk2, o.groupOf ? G.groupEnd(gk2) : null).tr; }
      var t2 = nx && nx.querySelector('td[data-ci="' + td.dataset.ci + '"] input, td[data-ci="' + td.dataset.ci + '"] select');
      if (t2) t2.focus();
    });
    // 從 Excel／Google 試算表複製多格貼上
    table.addEventListener('paste', function (e) {
      var text = (e.clipboardData || window.clipboardData).getData('text');
      if (ro || !/[\t\n]/.test(String(text).replace(/\n$/, ''))) return;
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
        r.t.check(); G.changed(r);
      });
      toast('已貼上 ' + lines.length + ' 列' + (made ? '（新增 ' + made + ' 列）' : '') + '，記得按「儲存變更」');
    });
    G.bar = h('div', { class: 'row wrap g-bar' }, ro ? null : save, status, upMsg, o.tools ? o.tools(G) : null);
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
    var rows = list.map(function (c) { return { name: c.name || '', role: c.role || '', phone: c.phone || '' }; });
    var el = h('div', { class: 'col', style: { gap: '6px' } });
    var draw = function () {
      clear(el);
      rows.forEach(function (c, i) {
        var a = inp(c.name, { placeholder: '姓名', disabled: !R.canEdit }), b = inp(c.role, { placeholder: '職稱', disabled: !R.canEdit }), p = inp(c.phone, { placeholder: '電話', disabled: !R.canEdit });
        a.oninput = function () { c.name = a.value; }; b.oninput = function () { c.role = b.value; }; p.oninput = function () { c.phone = p.value; };
        el.appendChild(h('div', { class: 'row' }, a, b, p, R.canEdit ? h('button', { class: 'btn sm ghost', onclick: function () { rows.splice(i, 1); draw(); } }, '✕') : null));
      });
      if (R.canEdit) el.appendChild(h('div', null, h('button', { class: 'btn sm', onclick: function () { rows.push({ name: '', role: '', phone: '' }); draw(); } }, '＋ 聯絡人')));
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
      box.appendChild(h('div', { class: 'hint', style: { marginBottom: '8px' } }, '直接在表格裡改，改過的列會有橘色框，最後按「儲存變更」一次存。可以從 Excel 複製「姓名、股別、小隊、電話、備註」整塊貼到姓名欄。工作人員用「姓名＋股別＋營隊通行碼」登入，同名同股別會無法登入；報名後台的專輔、隨輔會自動加進來（股別「輔導」）。股別清單在「股別與活動」設定。'));
      var rows = D.workers.slice().sort(function (a, b) { return (depts.indexOf(a.data.dept) - depts.indexOf(b.data.dept)) || String(a.data.name).localeCompare(String(b.data.name), 'zh-Hant'); })
        .map(function (w) { return { id: w.id, ver: w.version, vals: { name: w.data.name, dept: w.data.dept || '', squad: w.data.squad === undefined ? '' : w.data.squad, phone: w.data.phone || '', note: w.data.note || '', inactive: !!w.data.inactive }, w: w }; });
      var byId = {};
      D.workers.forEach(function (w) { byId[w.id] = w; });
      var G = grid(box, [
        { k: 'name', label: '姓名', w: '130px' },
        { k: 'dept', label: '股別', w: '110px', list: depts },
        { k: 'squad', label: '小隊', type: 'number', w: '70px' },
        { k: 'reg', label: '報名後台', type: 'calc', w: '120px', fn: function (v, r) { var w = r.id && byId[r.id]; if (!w || !w.data.reg) return null; return h('span', { class: 'small muted', title: '從報名後台同步' }, (w.data.title || '專輔／隨輔') + ((w.data.regSquads || []).length ? ' · ' + w.data.regSquads.join('、') + ' 隊' : '')); } },
        { k: 'phone', label: '電話', w: '130px' },
        { k: 'note', label: '備註' },
        { k: 'inactive', label: '停用', type: 'check', w: '50px' }
      ], {
        rows: rows, saveOp: 'worker.save', delOp: 'worker.delete', parse: parseCell, flash: 'workers', addText: '＋ 新增工作人員',
        blank: function () { return { name: '', dept: dsel.value || '', squad: '', phone: '', note: '', inactive: false }; },
        isEmpty: function (v) { return !String(v.name || '').trim(); },
        toData: function (v, r) { return { id: r.id, name: v.name, dept: v.dept, squad: v.squad, phone: v.phone, note: v.note, inactive: v.inactive }; },
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
      var acts = actsOf(D);
      D.assign.forEach(function (a) { if (a.data.activity && acts.indexOf(a.data.activity) < 0) acts.push(a.data.activity); });
      var groups = [''].concat(acts);   // 第一組：不屬於某個活動的一般工作事項（接待、守夜…）
      var wById = {};
      D.workers.forEach(function (w) { if (!w.data.inactive) wById[w.id] = w; });
      var roles = [];
      D.assign.forEach(function (a) { if (a.data.role && roles.indexOf(a.data.role) < 0) roles.push(a.data.role); });
      ['關主', '機動', '守夜', '場控', '器材', '攝影'].forEach(function (x) { if (roles.indexOf(x) < 0) roles.push(x); });
      box.appendChild(h('div', { class: 'hint', style: { marginBottom: '8px' } }, '最上面「一般工作事項」放不屬於某個活動的工作（接待、守夜、場佈…）；其他依活動分組（活動清單和營期流程同一份）。列出要做的工作和需要幾個人，再把人放進去；人數不夠會標紅、剛好是綠色。角色含「守夜」的會自動成為那一晚的守夜人員（日期要填）。'));
      var sum = h('div', { class: 'row wrap', style: { marginBottom: '8px' } });
      var load = h('details', { class: 'card', style: { marginTop: '12px' } }, h('summary', { style: { cursor: 'pointer', fontWeight: 700 } }, '每個人分到的工作'), h('div', { class: 'small' }));
      var G = grid(box, [
        { k: 'activity', label: '活動', w: '130px', list: acts },
        { k: 'role', label: '工作（角色）', w: '120px', list: roles },
        { k: 'detail', label: '詳細工作', w: '160px' },
        { k: 'date', label: '日期', type: 'date', w: '140px' },
        { k: 'need', label: '需要人數', type: 'number', w: '80px' },
        { k: 'people', label: '人員', type: 'people' },
        { k: 'st', label: '核對', type: 'calc', w: '86px', fn: function (v) {
          var n = (v.people || []).filter(function (p) { return wById[p]; }).length, need = Number(v.need) || 0;
          if (!need) return h('span', { class: 'tag' }, n + ' 人');
          return h('span', { class: 'tag ' + (n < need ? 'bad' : n > need ? 'warn' : 'ok') }, n + '／' + need + (n < need ? ' 缺 ' + (need - n) : n > need ? ' 多 ' + (n - need) : ' ✓'));
        } }
      ], {
        rows: D.assign.map(function (a) { return { id: a.id, ver: a.version, vals: { activity: a.data.activity, role: a.data.role, detail: a.data.detail || '', date: a.data.date || '', need: a.data.need === undefined ? '' : a.data.need, people: a.data.people || [] } }; }),
        workers: D.workers.filter(function (w) { return !w.data.inactive; }), saveOp: 'assign.save', delOp: 'assign.delete', parse: parseCell, flash: 'assign', addText: '＋ 這個活動加一個工作',
        groupOf: function (v) { return v.activity || ''; }, extraGroups: groups,
        groupOrder: function (keys) { return keys.sort(function (a, b) { var x = groups.indexOf(a), y = groups.indexOf(b); return (x < 0 ? 999 : x) - (y < 0 ? 999 : y); }); },
        groupLabel: function (k, rows) { return (k || '一般工作事項（不屬於某個活動）') + '　' + rows.length + ' 個工作'; },
        blank: function (k) { return { activity: k || '', role: '', detail: '', date: '', need: '', people: [] }; },
        isEmpty: function (v) { return !String(v.role || '').trim() && !(v.people || []).length; },
        validate: function (d) { return !String(d.role).trim() ? '每一列都要填工作（角色）' : ''; },
        toData: function (v, r) { return { id: r.id, activity: v.activity, role: v.role, detail: v.detail, date: v.date, need: v.need, people: v.people }; },
        onChange: function (G) {
          var need = 0, have = 0, short = 0, per = {};
          G.rows.forEach(function (r) {
            if (r.del) return;
            var v = r.read(), n = (v.people || []).filter(function (p) { return wById[p]; }).length, nd = Number(v.need) || 0;
            need += nd; have += Math.min(n, nd || n); if (nd && n < nd) short++;
            (v.people || []).forEach(function (p) { (per[p] = per[p] || []).push((v.activity ? v.activity + '／' : '') + (v.role || '') + (v.date ? '（' + v.date.slice(5) + '）' : '')); });
          });
          clear(sum).appendChild(h('span', { class: 'tag ' + (short ? 'bad' : 'ok') }, short ? short + ' 個工作還缺人' : '人數都夠了'));
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
            return run('item.save', { id: it.id, flow: flow.value, date: date.value, time: time.value, dur: dur.value, name: name.value, place: place.value, activity: act.value, owner: owner.get(), staff: staff.get(), backup: backup.get(), squads: sq.get(), note: note.value, link: link.value, custom: c }, { ver: it.id ? it.version : undefined });
          }, true);
      };
      var csv = function () {
        var rows = [['流程', '日期', '時間', '時長', '活動名稱', '場地', '負責人員', '關主／參與人員', '機動人員', '備註', '連結'].concat(cf)];
        var fname = {};
        flows.forEach(function (f) { fname[f.id] = f.data.name; });
        D.items.forEach(function (it) { var d = it.data; rows.push([fname[d.flow] || d.flow, d.date, d.time, d.dur || '', d.name, d.place, nameOf(D.workers, d.owner), nameOf(D.workers, d.staff), nameOf(D.workers, d.backup), d.note || '', d.link || ''].concat(cf.map(function (k) { return (d.custom || {})[k] || ''; }))); });
        var text = '﻿' + rows.map(function (r) { return r.map(function (c) { c = String(c === undefined ? '' : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
        var a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: A.info.name + '-營期流程.csv' });
        document.body.appendChild(a); a.click(); a.remove();
      };
      var items = D.items.filter(function (it) { return (it.data.flow || 'main') === cur; });
      // 一覽編輯（像 Excel）：依日期分組，直接改；同時段並行的項目用同色的左邊線標出來，同一人同時被排兩個會標紅
      var dflt = Number(R.config.defaultDuration) || 60;
      var toMin = function (t) { var m = String(t || '').match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
      var toHm = function (n) { n = ((n % 1440) + 1440) % 1440; return pad2(Math.floor(n / 60)) + ':' + pad2(n % 60); };
      var days = [];
      if (A.info.start && A.info.end) for (var dd = new Date(A.info.start + 'T12:00:00+08:00'); taipei(dd).ymd <= A.info.end; dd = new Date(dd.getTime() + 86400000)) days.push(taipei(dd).ymd);
      var dayNo = function (k) { var i = days.indexOf(k); return i >= 0 ? '第' + '一二三四五六七八九十'.charAt(i) + '天｜' : ''; };
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
      var endOf = function (v) { var t = toMin(v.time); return t === null ? null : t + (Number(v.dur) || dflt); };
      items = items.slice().sort(function (a, b) { var x = a.data, y = b.data; return (x.date || '').localeCompare(y.date || '') || (x.time || '99:99').localeCompare(y.time || '99:99') || (Number(y.dur) || 0) - (Number(x.dur) || 0); });
      var G = grid(box, [
        { k: 'date', type: 'hidden' }, { k: 'flow', type: 'hidden' },
        { k: 'time', label: '開始', type: 'time', w: '74px' },
        { k: 'dur', label: '時長(分)', type: 'number', w: '72px' },
        { k: 'end', label: '結束', type: 'time', w: '74px', nopaste: true, ph: '' },
        { k: 'tone', label: '標示', type: 'select', w: '78px', nopaste: true, opts: [{ value: '', label: '—' }, { value: 'act', label: '活動' }, { value: 'key', label: '重要' }] },
        { k: 'name', label: '活動名稱', w: '170px', list: nameList },
        { k: 'rel', label: '時間關係', type: 'calc', w: '150px', fn: function () { return null; } },
        { k: 'place', label: '場地', w: '110px', list: D.places.map(function (p) { return p.data.name; }) },
        { k: 'owner', label: '負責人員', type: 'people', w: '150px' },
        { k: 'staff', label: '關主或參與人員', type: 'people', w: '190px' },
        { k: 'backup', label: '機動人員', type: 'people', w: '130px' },
        { k: 'note', label: '備註', w: '150px' },
        { k: 'link', label: '連結', w: '110px', ph: 'https://' }
      ].concat(cf.map(function (k) { return { k: 'cf:' + k, label: k, w: '110px' }; })), {
        rows: items.map(function (it) { var d = it.data, v = { date: d.date, flow: d.flow || cur, time: d.time, dur: d.dur || '', end: '', tone: d.tone || '', name: d.name, place: d.place, owner: d.owner || [], staff: d.staff || [], backup: d.backup || [], note: d.note || '', link: d.link || '' }; var e = endOf(v); if (e !== null && d.dur) v.end = toHm(e); cf.forEach(function (k) { v['cf:' + k] = (d.custom || {})[k] || ''; }); return { id: it.id, ver: it.version, vals: v, it: it }; }),
        workers: D.workers, saveOp: 'item.save', delOp: 'item.delete', parse: parseCell, flash: 'items', select: true, drag: true, addText: '＋ 這一天加一項',
        groupOf: function (v) { return v.date || ''; }, extraGroups: days,
        groupOrder: function (keys) { return keys.sort(function (x, y) { return (x || '9999').localeCompare(y || '9999'); }); },
        groupLabel: function (k, rs) { return k ? dayNo(k) + dayLabel(k) + '　' + rs.length + ' 項' : '（沒填日期）'; },
        sortKey: function (v) { return (v.time || '99:99') + String(10000 - (Number(v.dur) || 0)).padStart(5, '0') + v.name; },
        // 新的一列：開始時間接上一列的結束
        blank: function (k, _, prev) { var e = prev ? endOf(prev) : null; var v = { date: k, flow: cur, time: e === null ? '' : toHm(e), dur: '', end: '', tone: '', name: '', place: '', owner: [], staff: [], backup: [], note: '', link: '' }; cf.forEach(function (c) { v['cf:' + c] = ''; }); return v; },
        isEmpty: function (v) { return !String(v.name || '').trim(); },
        validate: function (d) { return !String(d.name).trim() ? '有一列沒有活動名稱' : d.time && !/^\d{2}:\d{2}$/.test(d.time) ? '時間「' + d.time + '」看不懂，請打像 09:30' : ''; },
        toData: function (v, r) {
          var old = r.it ? r.it.data : {}, c = Object.assign({}, old.custom || {});
          cf.forEach(function (k) { c[k] = v['cf:' + k]; });
          var la = old.activity && actById[old.activity];
          var activity = la && la.data.name === old.name && v.name !== old.name ? '' : old.activity || '';   // 改了名稱就不再連到原本同名的活動（同名的會自動連）
          return { id: r.id, flow: v.flow || cur, date: v.date, time: v.time, dur: v.dur, tone: v.tone, name: v.name, place: v.place, activity: activity, owner: v.owner, staff: v.staff, backup: v.backup, squads: old.squads || [], note: v.note, link: v.link, custom: c };
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
          r.ed.name.input.addEventListener('change', function () { if (!r.read().tone && actNames.indexOf(r.read().name.trim()) >= 0) { r.ed.tone.set('act'); r.t.check(); G.changed(r); } });
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
            r.tr.classList.toggle('g-tone-act', v.tone === 'act'); r.tr.classList.toggle('g-tone-key', v.tone === 'key');
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
            h('button', { class: 'btn', onclick: csv }, '匯出 Excel（CSV）'),
            A.isAdmin() && R.canEdit ? h('button', { class: 'btn', onclick: function () {
              confirmBox('鎖定既定行程', '把目前所有項目的日期、時間、時長、場地記為「既定行程」。之後的修改會在工作人員端顯示「與既定行程不同」（原訂、調整者、時間）。', '鎖定').then(function (ok) { if (ok) run('baseline', {}, { action: 'run', msg: '已鎖定既定行程' }).catch(fail); });
            } }, '鎖定既定行程') : null, selBar];
        }
      });
      box.insertBefore(h('div', { class: 'chips', style: { marginBottom: '10px' } }, flows.map(function (f) { return h('a', { class: 'chip' + (f.id === cur ? ' on' : ''), href: '#data/schedule/items?flow=' + f.id, style: { textDecoration: 'none' } }, f.data.name); })), G.bar);
      box.insertBefore(h('div', { class: 'hint', style: { marginBottom: '8px' } }, '像 Excel 一樣直接改：↑↓ 和 Enter 換列、Ctrl+S 儲存；時間直接打 930 或 9:30；改「結束」會自動算時長；新的一列開始時間接上一列結束。活動名稱可以從選單選（活動、集合、緩衝時間、三餐、工人用餐），也可以自己打，打過的下次會出現在選單。「標示」：活動是淡色、重要時程是鮮豔色。包在另一項時段裡的（例如午餐裡的工人用餐）會縮排標「期間內」；只有部分重疊的會標「時間交錯」。⧉ 複製一列再改；勾選左邊可以一次平移時間、改日期、複製；可以從 Excel 複製整塊（開始、時長、活動名稱、場地、負責、關主、機動、備註、連結）貼上。'), G.bar);
      if (Q.id) { var hit = G.rows.filter(function (r) { return r.id === Q.id; })[0]; if (hit) { hit.tr.style.background = 'var(--warn-soft)'; setTimeout(function () { hit.tr.scrollIntoView({ block: 'center' }); }, 50); } }
    },
    activities: function (box, D) {
      // 一覽表：學員端公開用開關，改好一次儲存；「手動公開」的活動開關就是公開／收回
      var tsLocal = function (iso) { if (!iso) return ''; var t = taipei(new Date(iso)); return t.ymd + 'T' + t.hm; };
      box.appendChild(h('div', { class: 'hint', style: { marginBottom: '8px' } }, '開關打開＝學員現在看得到。想到某個時間自動公開：開關關著、填「自動公開時間」。全部改好按一次「儲存變更」。這份清單和「人員與分隊 → 股別與活動」同一份；活動卡片頁在編輯器裡把頁面連到活動，活動還沒公開時學員端看不到那一頁。'));
      var have = D.activities.map(function (a) { return String(a.data.name || '').trim(); });
      var miss = (D.peopleActs || []).filter(function (n) { return n && have.indexOf(n) < 0; });
      var G = grid(box, [
        { k: 'name', label: '活動', w: '180px' },
        { k: 'pub', label: '學員看得到', type: 'switch', w: '100px' },
        { k: 'autoAt', label: '自動公開時間', type: 'datetime', w: '200px' },
        { k: 'summary', label: '簡介（現在主題、活動列表顯示）', w: '320px' },
        { k: 'st', label: '狀態', type: 'calc', w: '170px', fn: function (v, r) {
          var d = r.a ? r.a.data : {};
          if (v.pub) return h('span', { class: 'tag ok' }, '學員看得到');
          if (v.autoAt) return h('span', { class: 'tag info' }, Date.parse(v.autoAt + ':00+08:00') <= Date.now() ? '時間到了，存檔後公開' : fmt(v.autoAt + ':00+08:00') + ' 自動公開');
          return h('span', null, h('span', { class: 'tag' }, '看不到'), d.revealedBy ? h('div', { class: 'small muted' }, (d.revealed ? '公開' : '收回') + '：' + d.revealedBy + ' ' + fmt(d.revealedAt)) : null);
        } }
      ], {
        rows: D.activities.map(function (a) {
          var d = a.data, now = Date.now(), vis = d.publicMode === 'public' || (d.publicMode === 'manual' && d.revealed) || (d.publicMode === 'auto' && Date.parse(d.autoAt) <= now);
          return { id: a.id, ver: a.version, a: a, vals: { name: d.name, pub: !!vis, autoAt: d.publicMode === 'auto' && Date.parse(d.autoAt) > now ? tsLocal(d.autoAt) : '', summary: d.summary || '' } };
        }),
        saveOp: 'activity.save', delOp: 'activity.delete', addText: '＋ 新增活動', noCopy: true, empty: '還沒有活動',
        blank: function () { return { name: '', pub: false, autoAt: '', summary: '' }; },
        isEmpty: function (v) { return !String(v.name || '').trim(); },
        validate: function (d, op) { return op === 'activity.save' && !String(d.name).trim() ? '有一列沒有活動名稱' : ''; },
        saveItems: function (v, r) {
          var d = r.a ? r.a.data : {}, out = [];
          var base = { id: r.id, name: v.name, summary: v.summary, autoAt: v.autoAt ? v.autoAt + ':00+08:00' : '' };
          if (d.publicMode === 'manual' && r.id && !v.autoAt) {
            // 手動公開的活動：名稱、簡介照存，開關是「公開／收回」（會記下誰、什麼時候）
            var was = r.vals0 ? r.vals0.pub : !!d.revealed;
            if (v.name !== d.name || v.summary !== (d.summary || '')) out.push({ op: 'activity.save', data: Object.assign(base, { publicMode: 'manual' }) });
            if (v.pub !== was) out.push({ op: 'activity.reveal', data: { id: r.id, revealed: v.pub } });
            return out.length ? out : [{ op: 'activity.save', data: Object.assign(base, { publicMode: 'manual' }) }];
          }
          return [{ op: 'activity.save', data: Object.assign(base, { publicMode: v.pub ? 'public' : v.autoAt ? 'auto' : 'hidden' }) }];
        },
        rowInit: function (r) { r.vals0 = r.read(); },
        afterSave: function (r) {
          var v = r.read(); r.vals0 = v;
          if (!r.a) r.a = { id: r.id, data: { publicMode: 'hidden' } };
          r.a.data.name = v.name; r.a.data.summary = v.summary;
          if (r.a.data.publicMode !== 'manual' || v.autoAt) r.a.data.publicMode = v.pub ? 'public' : v.autoAt ? 'auto' : 'hidden';
        }
      });
      if (miss.length && R.canEdit) box.insertBefore(h('div', { class: 'fb-notice row wrap', style: { marginBottom: '10px' } }, h('span', { class: 'grow' }, '人員與分隊的活動清單還有 ' + miss.length + ' 個不在這裡：' + miss.join('、')),
        h('button', { class: 'btn sm', onclick: function () { miss.forEach(function (n) { var r = G.newRow(''); r.ed.name.set(n); r.t.check(); G.changed(r); }); miss = []; toast('已加到表格下面（學員端先看不到），記得按「儲存變更」'); } }, '加到表格')), G.bar);
    },
    rotations: function (box, D) {
      var acts = [{ value: '', label: '（不連活動）' }].concat(D.activities.map(function (a) { return { value: a.id, label: a.data.name }; }));
      var edit = function (r) {
        r = r || { id: '', data: { stations: [], slots: [], grid: {}, mode: 'table' } };
        var d = JSON.parse(JSON.stringify(r.data));
        d.grid = d.grid || {};
        var act = sel(acts, d.activity || ''), name = inp(d.name), stations = inp((d.stations || []).join('、'), { placeholder: '第一關、第二關、第三關' }), slots = inp((d.slots || []).join('、'), { placeholder: '09:00、09:30、10:00' });
        var mode = sel([{ value: 'table', label: '表格' }, { value: 'map', label: '上傳地圖（圖片網址）' }], d.mode || 'table'), img = inp(d.image, { placeholder: 'https://' });
        var grid = h('div');
        var split = function (s) { return s.split(/[、,，]/).map(function (x) { return x.trim(); }).filter(String); };
        var draw = function () {
          clear(grid);
          var st = split(stations.value), sl = split(slots.value);
          if (!st.length || !sl.length || !D.squads.length) { grid.appendChild(h('div', { class: 'hint' }, D.squads.length ? '填好關卡和時段後，這裡會出現排序表' : '先到「人員與分隊」建立小隊')); return; }
          grid.appendChild(h('div', { class: 'tbl-wrap' }, h('table', { class: 't grid-rot' }, h('thead', null, h('tr', null, h('th', null, '小隊＼時段'), sl.map(function (t) { return h('th', null, t); }))),
            h('tbody', null, D.squads.map(function (s) {
              var row = d.grid[String(s.no)] = (d.grid[String(s.no)] || []).slice(0, sl.length);
              return h('tr', null, h('td', null, s.name), sl.map(function (t, i) {
                var x = sel([{ value: '', label: '—' }].concat(st.map(function (n, j) { return { value: j, label: n }; })), row[i] === undefined || row[i] === null ? '' : row[i]);
                x.addEventListener('change', function () { row[i] = x.value === '' ? '' : Number(x.value); });
                return h('td', null, x);
              }));
            })))));
          grid.appendChild(h('div', { class: 'hint' }, '兩隊同時在同一關是否算錯，在「設定」的「兩隊同時在同一關」調整。'));
        };
        stations.addEventListener('change', draw);
        slots.addEventListener('change', draw);
        draw();
        form(r.id ? '編輯跑關' : '新增跑關', [h('div', { class: 'grid2' }, field('活動', act), field('名稱', name)), h('div', { class: 'grid2' }, field('關卡（用、分隔）', stations), field('時段（用、分隔）', slots)), h('div', { class: 'grid2' }, field('顯示方式', mode), field('地圖圖片', img)), grid],
          function () { return run('rotation.save', { id: r.id, activity: act.value, name: name.value, stations: split(stations.value), slots: split(slots.value), grid: d.grid, mode: mode.value, image: img.value }, { ver: r.id ? r.version : undefined }); }, true);
      };
      var an = {};
      D.activities.forEach(function (a) { an[a.id] = a.data.name; });
      box.appendChild(bar(addBtn('新增跑關', function () { edit(); }), h('span', { class: 'hint' }, '時段 × 小隊 → 關卡。隊輔在工作人員端「主頁」會看到自己小隊的順序。')));
      box.appendChild(table(['跑關', '關卡', '時段', ''], D.rotations.map(function (r) {
        return hl(h('tr', null, h('td', null, h('b', null, r.data.name || an[r.data.activity] || '跑關')), h('td', { class: 'small' }, (r.data.stations || []).join('、')), h('td', { class: 'small' }, (r.data.slots || []).join('、')),
          actions(function () { edit(r); }, function () { del('rotation.delete', { id: r.id }, r.data.name || '跑關'); })), r.id);
      }), '還沒有跑關'));
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
        var name = inp('', { placeholder: '例如：一驗、二驗、總驗、某活動細流' }), order = inp(D.flows.length, { type: 'number' });
        form('新增流程', [field('名稱', name), field('排序', order)], function () { return run('flow.save', { name: name.value, kind: 'detail', order: order.value }, { action: 'create' }); });
      }), h('span', { class: 'hint' }, '「總流程」決定學員首頁的現在主題；其他流程（驗收、細流）只給工作人員看。')));
      box.appendChild(table(['流程', '種類', '項目數', ''], D.flows.map(function (f) {
        var n = D.items.filter(function (it) { return it.data.flow === f.id; }).length;
        return h('tr', null, h('td', null, f.data.name), h('td', null, f.data.kind === 'main' ? '總流程' : '細流'), h('td', null, n), f.data.kind === 'main' ? h('td') : actions(null, function () { del('flow.delete', { id: f.id }, f.data.name); }));
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
      box.appendChild(h('div', { class: 'hint', style: { marginBottom: '8px' } }, '放進這裡＝學員看得到（要保密就先不要放）。像試算表一樣一次打好幾列，改完按一次「儲存變更」；「引用」選營期流程的項目會帶入時間和名稱（之後流程改了會出現在「待處理變更」，不會自動改）。內容跟著學員端一起發布。'));
      if (D.pending.length) box.appendChild(h('a', { class: 'fb-notice', href: '#data/studentflow/pending', style: { display: 'block', marginBottom: '10px' } }, '營期流程有 ' + D.pending.length + ' 項變更還沒處理 →'));
      var G = grid(box, [
        { k: 'date', type: 'hidden' },
        { k: 'time', label: '時間', type: 'time', w: '74px' },
        { k: 'title', label: '名稱', w: '180px', list: D.schedule.map(function (x) { return x.data.name; }).filter(function (n, i, a) { return n && a.indexOf(n) === i; }) },
        { k: 'note', label: '說明', w: '260px' },
        { k: 'ref', label: '引用營期流程', type: 'select', w: '210px', nopaste: true, opts: sch },
        { k: 'activity', label: '連到活動', type: 'select', w: '150px', nopaste: true, opts: acts }
      ], {
        rows: D.items.slice().sort(function (a, b) { return ((a.data.date || '') + (a.data.time || '')).localeCompare((b.data.date || '') + (b.data.time || '')); }).map(function (it) { var d = it.data; return { id: it.id, ver: it.version, vals: { date: d.date || '', time: d.time || '', title: d.title || '', note: d.note || '', ref: d.ref || '', activity: d.activity || '' } }; }),
        saveOp: 'item.save', delOp: 'item.delete', parse: parseCell, addText: '＋ 這一天加一項',
        groupOf: function (v) { return v.date || ''; }, extraGroups: days,
        groupOrder: function (keys) { return keys.sort(function (x, y) { return (x || '9999').localeCompare(y || '9999'); }); },
        groupLabel: function (k, rs) { return k ? dayLabel(k) + '　' + rs.length + ' 項' : '（沒填日期）'; },
        sortKey: function (v) { return v.time || '99:99'; },
        blank: function (k) { return { date: k, time: '', title: '', note: '', ref: '', activity: '' }; },
        isEmpty: function (v) { return !String(v.title || '').trim(); },
        validate: function (d) { return !String(d.title).trim() ? '有一列沒有名稱' : ''; },
        toData: function (v, r) { return { id: r.id, date: v.date, time: v.time, title: v.title, note: v.note, activity: v.activity, ref: v.ref }; },
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
      box.appendChild(h('div', { class: 'hint', style: { marginBottom: '8px' } }, '學員在學員端送出的自我評估切結書（固定格式）。送出時有編輯工作人員端權限的人會收到通知。'));
      box.appendChild(table(['送出時間', '學員', '小隊', '事件時間', '身體狀況', '自我評估', '需要的協助'], D.submissions.map(function (s) {
        var a = s.data.answers || {};
        return h('tr', null, h('td', null, fmt(s.data.at)), h('td', null, s.data.name), h('td', null, s.data.squad), h('td', { class: 'small' }, String(a.eventTime || '').replace('T', ' ')), h('td', { class: 'small' }, a.condition), h('td', null, a.canContinue), h('td', null, a.needs));
      }), '還沒有人送出'));
    },
    form: function (box, D) {
      box.appendChild(h('div', { class: 'card col' }, h('div', { class: 'hint' }, '自我評估切結書是固定格式的系統表單（第 ' + D.form.version + ' 版），欄位寫在程式裡，營隊不能修改，確保每個營隊的紀錄格式一致。'),
        h('ol', { style: { margin: 0, paddingLeft: '20px' } }, D.form.fields.map(function (f) { return h('li', null, f.label + (f.options ? '（' + f.options.join('／') + '）' : '') + (f.required ? '　必填' : '')); }))));
    }
  };

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
        var ph = h('div', { class: 'row wrap' });
        var drawPhoto = function () {
          clear(ph);
          var pick = h('input', { type: 'file', accept: 'image/*', class: 'hidden' });
          pick.addEventListener('change', function () { if (pick.files[0]) upload(pick.files[0], note).then(function (r) { photo = r.img || r.url; drawPhoto(); }, fail); });
          var url = inp(photo, { placeholder: '或貼圖片網址 https://', style: { width: '260px' } });
          url.oninput = function () { photo = url.value.trim(); };
          ph.appendChild(photo ? h('img', { src: photo, alt: '照片', class: 'cs-photo' }) : h('div', { class: 'cs-photo none' }, '沒有照片'));
          ph.appendChild(h('div', { class: 'col', style: { gap: '6px' } }, pick, h('div', { class: 'row' }, h('button', { class: 'btn sm', type: 'button', onclick: function () { pick.click(); } }, '上傳照片'), photo ? h('button', { class: 'btn sm ghost', type: 'button', onclick: function () { photo = ''; drawPhoto(); } }, '不放照片') : null), url,
            h('div', { class: 'hint' }, '教授照片、場館或實驗室照片；不放就不顯示')));
        };
        drawPhoto();
        form(c.id ? '編輯課程' : '新增課程', [h('div', { class: 'grid2' }, field('類別', type), field('課程名稱', title)),
          h('div', { class: 'grid2' }, field('日期', date), h('div', null, h('div', { class: 'grid2' }, field('開始', st), field('結束', en)), dur)),
          h('div', { class: 'grid2' }, field('地點', place), field('講者／帶隊', speaker)), field('課程描述', desc), field('課程檔案', fl), field('頭貼照片', ph), note,
          h('label', { class: 'check' }, hide, h('span', null, '學員端不顯示（只給工作人員看）'))],
          function () { return run('course.save', { id: c.id, type: type.value, title: title.value, date: date.value, start: st.value, end: en.value, place: place.value, speaker: speaker.value, desc: desc.value, files: files, photo: photo, hidden: hide.checked }, { ver: c.id ? c.version : undefined }); }, true);
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
            h('td', { class: 'small' }, [d.speaker, d.place].filter(String).join('\n')), h('td', null, (d.files || []).length || ''), h('td', null, d.photo ? h('img', { src: d.photo, alt: '', class: 'cs-thumb' }) : ''),
            actions(function () { edit(c); }, function () { del('course.delete', { id: c.id }, d.title); })), c.id);
        })));
      });
    }
  };

  VIEWS.scoreboard = {
    board: function (box, D) {
      var b = D.board;
      box.appendChild(h('div', { class: 'card' }, h('h2', null, (R.config.title || '團隊積分') + (b.provisional ? '（暫定排名）' : '')),
        h('div', { class: 'board' }, b.rows.map(function (r) { return h('details', { class: 'r', style: { display: 'block' } }, h('summary', { class: 'row', style: { cursor: 'pointer' } }, h('span', { class: 'rk' }, r.rank), h('span', { class: 'grow' }, r.name), h('span', { class: 'sc' }, r.score)),
          h('div', { class: 'small', style: { padding: '6px 0 0 40px' } }, r.parts.length ? r.parts.map(function (p) { return h('div', null, p.name + '：' + (p.score > 0 ? '+' : '') + p.score); }) : '還沒有分數')); })),
        b.provisional ? h('div', { class: 'hint', style: { marginTop: '8px' } }, '有 Game 結果還沒發布，所以是暫定排名。到「Game 清單」發布。') : null));
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
      var gn = {};
      D.games.forEach(function (x) { gn[x.id] = x.data.name; });
      box.appendChild(table(['Game', '隊伍', '分數', '時間', '提交者'], D.results.slice().sort(function (a, b) { return String(b.data.at).localeCompare(String(a.data.at)); }).map(function (r) {
        return h('tr', null, h('td', null, gn[r.data.game] || '（已刪除）'), h('td', null, r.data.team), h('td', null, h('b', null, r.data.score)), h('td', { class: 'small' }, fmt(r.data.at)), h('td', { class: 'small' }, r.data.by || ''));
      }), D.games.length ? '還沒有結果' : '先到「Game 清單」新增 Game'));
    },
    adjust: function (box, D) {
      if (R.canEdit) {
        var t = sel(D.teams.map(function (x) { return { value: x.no, label: x.name }; }), D.teams[0] && D.teams[0].no), dl = inp('', { type: 'number', placeholder: '+100 或 -100' }), note = inp('', { placeholder: '可空白' });
        var cat = D.categories ? sel(D.categories, D.categories[0]) : null;
        box.appendChild(h('div', { class: 'card col', style: { marginBottom: '12px' } }, h('h2', null, '手動加／扣分'), h('div', { class: 'hint' }, '每一筆都是獨立的修正事件，立即生效；要更正就再加一筆反向的。'),
          h('div', { class: 'grid2' }, field('隊伍', t), field('分數', dl)), h('div', { class: 'grid2' }, cat ? field('類別', cat) : h('span'), field('理由', note)),
          h('div', null, h('button', { class: 'btn primary', onclick: function (e) { busy(e.target, function () { return run('adjust.add', { team: t.value, delta: dl.value, note: note.value, category: cat ? cat.value : '' }, { action: 'create', msg: '已記錄' }); }).catch(function () {}); } }, '記錄'))));
      }
      box.appendChild(table(['時間', '隊伍', '分數', D.categories ? '類別' : '', '理由', '記錄者'].filter(String), D.adjust.map(function (a) {
        return h('tr', null, h('td', { class: 'small' }, fmt(a.data.at)), h('td', null, a.data.team), h('td', null, h('b', { style: { color: a.data.delta < 0 ? 'var(--bad)' : 'var(--ok)' } }, (a.data.delta > 0 ? '+' : '') + a.data.delta)), D.categories ? h('td', null, a.data.category || '') : null, h('td', { class: 'small' }, a.data.note || ''), h('td', { class: 'small' }, a.data.by || ''));
      }), '還沒有加減分'));
    }
  };

  return { open: open };
})();
