/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 兩端的編輯器：頁面樹 ｜ 區塊 ｜ 手機預覽。
 *   只有按「開始編輯」才取得編輯鎖；只開頁面是唯讀。同一人第二個分頁是唯讀。
 *   自動儲存只更新草稿；按「儲存」、結束編輯、交接、離開時才新增歷史版本。
 *   發布前先儲存再檢查，有警示會擋下；有發布權限的人看過全部警示後可以強制發布。
 */

var Editor = (function () {
  var BT = {
    heading: '標題', text: '文字', image: '圖片', video: '影片', map: '地圖', link: '連結', button: '按鈕', list: '清單', table: '表格',
    divider: '分隔線', pagelink: '頁面連結', notice: '公告提示', pkg: 'Package 畫面'
  };
  var E = null;

  function tabId() { return pageTab(); }

  function open(m, side, q) {
    stop();
    E = { side: side, m: m, q: q || {}, tab: tabId(), pages: {}, blocks: {}, dirty: {}, seq: 0, sel: '', mine: false, timers: [], lastInput: 0, shownHandoffs: {}, live: {}, pkgPub: {}, acts: [] };
    // 看過的話先用上次的資料畫出來（唯讀），最新的到了再換掉
    var hit = apiCacheGet('getEditor', [A.camp, side]);
    if (hit) { apply(hit); E.cached = true; render(); } else m.appendChild(h('div', { class: 'empty loading' }, '載入編輯器…'));
    load().then(function () {
      if (!E || E.m !== m) return;
      if (E.q.page && E.pages[E.q.page]) E.sel = E.q.page;
      render();
      if (E.q.block) setTimeout(function () { var el = $('[data-edit-bid="' + E.q.block + '"]'); if (el) { el.classList.add('hit'); el.scrollIntoView({ block: 'center' }); } }, 80);
    }, function (e) { clear(m).appendChild(h('div', { class: 'card' }, h('h2', null, '無法開啟編輯器'), h('p', null, e.message))); });
    E.timers.push(setInterval(ping, 60000));
    E.timers.push(setInterval(watchLock, 30000));
    A.leaving = leave;
    window.addEventListener('beforeunload', beacon);
    // 活動 Package 的頁面可以連到「活動」：先讀活動清單
    if (A.pool.some(function (p) { return p.pkg === 'schedule'; })) api('getPkgAdmin', A.camp, 'schedule').then(function (r) { E.acts = r.data.activities || []; }, function () {});
  }

  function stop() {
    if (!E) return;
    E.timers.forEach(clearInterval);
    clearTimeout(E.autoT);
    clearTimeout(E.prevT);
    window.removeEventListener('beforeunload', beacon);
    E = null;
  }

  function load() {
    var side = E.side;
    return api('getEditor', A.camp, side).then(function (d) {
      if (!E || E.side !== side) return;
      apiCachePut('getEditor', [A.camp, side], d);
      E.cached = false;
      apply(d);
      E.mine = false;
      var me = IA.user.email;
      if (d.lock.held && d.lock.holder === me) {
        return op('lock.ping', { camp: A.camp, data: { side: side, tab: E.tab, active: false } }).then(function (r) {
          if (!E) return;
          E.mine = r.mine;
          // 自己的鎖、但另一個分頁超過 2 分半沒心跳（多半已經關掉或重新開過）：直接改到這個分頁
          if (!r.mine && r.lock && r.lock.held && r.lock.holder === me && !r.lock.claimPending && r.lock.seenAgo > 150) return takeHere();
        }, function () {});
      }
    }).then(refreshPub);
  }
  function apply(d) {
    E.d = d;
    E.pages = {};
    E.blocks = {};
    d.pages.forEach(function (p) { E.pages[p.id] = { id: p.id, parent: p.parent || '', ord: p.ord, title: p.title, icon: p.icon, fixed: p.fixed, activity: p.activity || '', deleted: false }; });
    d.blocks.forEach(function (b) { E.blocks[b.id] = { id: b.id, page: b.page, ord: b.ord, type: b.type, data: b.data || {}, deleted: false, updated: b.updated, by: b.by }; });
    E.dirty = {};
    if (!E.sel || !E.pages[E.sel]) E.sel = (roots()[0] || {}).id || '';
  }

  /** 預覽用：草稿快照裡的 Package 發布資料（例如學員行程） */
  function refreshPub() {
    return api('frontBoot', A.camp, E.side, 'draft').then(function (b) { if (E && b.snapshot) { E.pkgPub = b.snapshot.packages || {}; E.me = b.me; } }, function () {});
  }

  /* ---------------- 資料操作 ---------------- */
  function alive(o) { return o && !o.deleted; }
  function pagesArr() { return Object.keys(E.pages).map(function (k) { return E.pages[k]; }).filter(alive); }
  function roots() { return pagesArr().filter(function (p) { return !p.parent; }).sort(function (a, b) { return a.ord - b.ord; }); }
  function kidsOf(id) { return pagesArr().filter(function (p) { return p.parent === id; }).sort(function (a, b) { return a.ord - b.ord; }); }
  function blocksOf(pid) { return Object.keys(E.blocks).map(function (k) { return E.blocks[k]; }).filter(function (b) { return alive(b) && b.page === pid; }).sort(function (a, b) { return a.ord - b.ord; }); }
  function descendants(id) { var out = []; kidsOf(id).forEach(function (k) { out.push(k.id); out = out.concat(descendants(k.id)); }); return out; }

  function touch(kind, id) {
    E.seq++;
    E.dirty[kind + ':' + id] = E.seq;
    E.lastInput = Date.now();
    status();
    clearTimeout(E.autoT);
    E.autoT = setTimeout(autosave, 4000);
    schedulePreview();
  }
  function changes() {
    var out = { pages: [], blocks: [] }, sent = {};
    Object.keys(E.dirty).forEach(function (k) {
      sent[k] = E.dirty[k];
      var p = k.split(':'), o = p[0] === 'page' ? E.pages[p[1]] : E.blocks[p[1]];
      if (!o) return;
      if (p[0] === 'page') out.pages.push({ id: o.id, parent: o.parent, ord: o.ord, title: o.title, icon: o.icon, activity: o.activity, deleted: o.deleted });
      else out.blocks.push({ id: o.id, page: o.page, ord: o.ord, type: o.type, data: o.data, deleted: o.deleted });
    });
    // 新頁面要排在它的區塊與子頁面前面
    out.pages.sort(function (a, b) { return depth(a) - depth(b); });
    return { c: out, sent: sent };
  }
  function depth(p) { var n = 0, x = p; while (x && x.parent && n < 20) { x = E.pages[x.parent]; n++; } return n; }
  function clean(sent) { Object.keys(sent).forEach(function (k) { if (E.dirty[k] === sent[k]) delete E.dirty[k]; }); status(); }
  function hasDirty() { return Object.keys(E.dirty).length > 0; }

  function lockLost(e) {
    if (!E) return;
    E.mine = false;
    toast(e.message || '編輯鎖已釋放', true);
    render();
  }

  function autosave() {
    if (!E || !E.mine || !hasDirty() || E.saving) return Promise.resolve();
    var x = changes();
    E.saving = true;
    return op('draft.autosave', { camp: A.camp, data: { side: E.side, tab: E.tab, changes: x.c } }).then(function () {
      E.saving = false;
      clean(x.sent);
      E.savedAt = new Date();
      status();
    }, function (e) {
      E.saving = false;
      if (e.code === 'LOCK') lockLost(e); else { status('自動儲存失敗：' + e.message); }
    });
  }

  function save(btn) {
    var x = changes();
    clearTimeout(E.autoT);
    return busy(btn, function () { return op('draft.save', { camp: A.camp, data: { side: E.side, tab: E.tab, changes: x.c } }); }).then(function (r) {
      clean(x.sent);
      E.savedAt = new Date();
      var w = (r.events || []).filter(function (e) { return e.type === 'warning'; }).length;
      toast('已儲存' + (r.history ? '（' + r.history + ' 項新版本）' : '') + (w ? '，目前有 ' + w + ' 項警示' : ''));
      A.poll();
      refreshPub().then(schedulePreview);
      status();
    }, function (e) { if (e.code === 'LOCK') lockLost(e); });
  }

  function acquire(btn) {
    busy(btn, function () { return op('lock.acquire', { camp: A.camp, data: { side: E.side, tab: E.tab } }); }).then(function () {
      return load().then(render);
    }, function () {});
  }

  function takeHere(btn) {
    var go = function () { return op('lock.acquire', { camp: A.camp, data: { side: E.side, tab: E.tab, take: true } }); };
    return (btn ? busy(btn, go) : go()).then(function (r) {
      if (!E) return;
      E.d.lock = r.lock;
      E.mine = true;
      if (btn) render();
    }, function () {});
  }

  function release(btn) {
    var x = changes();
    clearTimeout(E.autoT);
    return busy(btn, function () { return op('lock.release', { camp: A.camp, data: { side: E.side, tab: E.tab, changes: x.c } }); }).then(function () {
      toast('已儲存並結束編輯');
      return load().then(render);
    }, function () {});
  }

  /** 離開編輯器：先儲存（含歷史），成功才釋放；失敗保留鎖 */
  function leave() {
    if (!E) return;
    var cur = E;
    if (!cur.mine) { stop(); return; }
    var x = changes();
    return op('lock.release', { camp: A.camp, data: { side: cur.side, tab: cur.tab, changes: x.c } }).then(function () { stop(); }, function (e) {
      stop();
      // 鎖已經改到別的分頁（或逾期）：這裡不再是編輯者，直接離開
      if (e.code === 'LOCK') { if (x.c.pages.length || x.c.blocks.length) toast('編輯已經改到別的分頁，這裡還沒存的變更沒有帶過去'); return; }
      throw new Error('離開前儲存失敗：' + e.message + '（編輯鎖仍保留在你身上）');
    });
  }
  function beacon() {
    if (!E || !E.mine || !window.INTERACT_CONFIG) return;
    var x = changes();
    var req = { op_id: rid('op', 20), camp_id: A.camp, stage: 'lock', action: 'delete', kind: 'lock.release', target: {}, data: { side: E.side, tab: E.tab, changes: x.c } };
    try { navigator.sendBeacon(INTERACT_CONFIG.API_URL, new Blob([JSON.stringify({ fn: 'op', args: [IA.token, req] })], { type: 'text/plain;charset=utf-8' })); } catch (e) {}
  }

  function ping() {
    if (!E || !E.mine) return;
    var active = Date.now() - E.lastInput < 60000;
    op('lock.ping', { camp: A.camp, data: { side: E.side, tab: E.tab, active: active } }).then(function (r) {
      if (!E) return;
      if (!r.mine) { lockLost({ message: r.lock && r.lock.held && r.lock.holder === IA.user.email ? '編輯已改到你的另一個分頁，這個分頁變成唯讀' : '編輯鎖已釋放（離線超過 10 分鐘或閒置超過 30 分鐘），要繼續請再按「開始編輯」' }); return; }
      (r.handoffs || []).forEach(function (ho) { if (!E.shownHandoffs[ho.id]) { E.shownHandoffs[ho.id] = 1; handoffPopup(ho); } });
    }, function () {});
  }
  function watchLock() {
    if (!E || E.mine) return;
    api('getLock', A.camp, E.side).then(function (r) {
      if (!E || E.mine) return;
      var before = JSON.stringify(E.d.lock);
      E.d.lock = r.lock;
      E.myReq = r.myRequest;
      if (before !== JSON.stringify(r.lock)) { if (r.lock.held && r.lock.holder === IA.user.email) toast('對方已把編輯交給你，按「開始編輯」就可以接手'); lockbar(); }
    }, function () {});
  }

  function handoffPopup(ho) {
    var mm = modal({ title: '交接請求', body: h('div', null, h('b', null, ho.fromName), ' 想接手編輯' + E.d.sideName + '。接受後會先儲存你的變更再交給對方。'),
      actions: [{ text: '拒絕', onClick: function () { return op('handoff.reject', { camp: A.camp, data: { side: E.side, id: ho.id } }).then(function () { toast('已拒絕'); }); } },
        { text: '接受交接', cls: 'primary', onClick: function () {
          var x = changes();
          return op('handoff.accept', { camp: A.camp, data: { side: E.side, tab: E.tab, id: ho.id, changes: x.c } }).then(function () { toast('已交給 ' + ho.fromName); return load().then(render); });
        } }] });
    setTimeout(function () { mm.close(); }, 120000);   // 2 分鐘後只留在通知中心
  }

  /* ---------------- 畫面 ---------------- */
  var nodes = {};
  function render() {
    if (!E) return;
    var m = clear(E.m), d = E.d;
    m.classList.add(E.side === 'worker' ? 'side-worker' : 'side-student');
    A.title(m, h('span', null, d.sideName, h('span', { class: 'side-tag' }, E.side === 'worker' ? '工作人員看到的' : '學員看到的')), d.published ? '目前發布第 ' + d.published.ver + ' 版（' + fmt(d.published.at) + '，' + d.published.by + '）' + (d.published.forced ? '・強制發布' : '') : '還沒有發布過',
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn sm', onclick: versions }, '發布紀錄'),
        h('button', { class: 'btn sm', onclick: deletedList }, '已刪除的內容'),
        h('button', { class: 'btn sm', onclick: templates }, '模板'),
        h('a', { class: 'btn sm', target: '_blank', href: 'app.html?c=' + encodeURIComponent(A.camp) + '&s=' + E.side + '&preview=draft' }, '開新視窗預覽')));
    nodes.lock = h('div', { class: 'lockbar' });
    m.appendChild(nodes.lock);
    lockbar();
    nodes.tree = h('div', { class: 'card tree', style: { padding: '10px' } });
    nodes.blocks = h('div', { class: 'ed-blocks' });
    nodes.phone = h('div', { class: 'phone-wrap' });
    m.appendChild(h('div', { class: 'editor' }, nodes.tree, nodes.blocks, nodes.phone));
    tree();
    blocks();
    preview();
    m.addEventListener('input', function () { if (E) E.lastInput = Date.now(); });
  }

  function status(msg) {
    var el = $('#edStatus');
    if (!el || !E) return;
    if (msg) { el.textContent = msg; el.style.color = 'var(--bad)'; return; }
    el.style.color = '';
    el.textContent = hasDirty() ? '有未儲存的變更（幾秒後自動儲存草稿）' : (E.savedAt ? '草稿已自動儲存 ' + pad2(E.savedAt.getHours()) + ':' + pad2(E.savedAt.getMinutes()) : '');
  }

  function lockbar() {
    var el = clear(nodes.lock), L = E.d.lock, me = IA.user.email;
    el.className = 'lockbar' + (E.mine ? ' mine' : (L.held && L.holder !== me ? ' other' : ''));
    if (A.info.status === 'ended') { el.appendChild(h('span', null, '營隊已結束（回憶模式），內容不能再修改。')); return; }
    if (E.cached) { el.appendChild(h('span', { class: 'muted' }, '顯示上次看到的內容，正在更新…')); return; }
    if (E.mine) {
      el.appendChild(h('b', null, '✏️ 你正在編輯'));
      el.appendChild(h('span', { class: 'small muted grow', id: 'edStatus' }));
      el.appendChild(h('button', { class: 'btn sm', onclick: function (e) { save(e.target); } }, '儲存'));
      el.appendChild(h('button', { class: 'btn sm', onclick: function (e) { release(e.target); } }, '結束編輯'));
    } else if (L.held && L.holder !== me) {
      el.appendChild(h('span', { class: 'grow' }, '👀 ', h('b', null, L.name), ' 正在編輯，你目前是唯讀。'));
      var req = E.myReq && E.myReq.status === 'pending';
      el.appendChild(h('button', { class: 'btn sm', disabled: req, onclick: function (e) {
        busy(e.target, function () { return op('handoff.request', { camp: A.camp, data: { side: E.side } }); }).then(function () { toast('已送出交接請求，等對方接受'); E.myReq = { status: 'pending' }; lockbar(); }, function () {});
      } }, req ? '已請求交接，等待回覆' : '請求交接'));
    } else if (L.held && L.holder === me) {
      el.appendChild(h('span', { class: 'grow' }, L.claimPending ? '對方已把編輯交給你。' : '你在另一個分頁（或另一台裝置）編輯中，這個分頁是唯讀。如果那個分頁已經關掉，或你想改在這裡編輯，按「改在這個分頁編輯」。'));
      if (L.claimPending) el.appendChild(h('button', { class: 'btn sm primary', onclick: function (e) { acquire(e.target); } }, '開始編輯'));
      else el.appendChild(h('button', { class: 'btn sm primary', title: '另一個分頁還沒存的內容不會帶過來', onclick: function (e) { takeHere(e.target); } }, '改在這個分頁編輯'));
    } else {
      el.appendChild(h('span', { class: 'grow' }, '目前沒有人在編輯。' + (L.expired ? '（上一位的編輯鎖已逾期）' : '')));
      el.appendChild(h('button', { class: 'btn sm primary', onclick: function (e) { acquire(e.target); } }, '開始編輯'));
    }
    if (E.d.canPublish) el.appendChild(h('button', { class: 'btn sm primary', onclick: function (e) { publish(e.target); } }, '發布'));
    status();
  }

  function tree() {
    var el = clear(nodes.tree);
    var row = function (p, lvl) {
      var n = h('div', { class: 'node' + (p.id === E.sel ? ' on' : ''), style: { paddingLeft: (8 + lvl * 16) + 'px' }, onclick: function () { E.sel = p.id; tree(); blocks(); preview(); } },
        icon(p.icon || 'page', 16), h('span', { class: 'ttl' }, p.title), p.fixed ? h('span', { class: 'tag', title: '固定入口，不能刪除' }, '入口') : null, p.activity ? h('span', { class: 'tag info' }, '活動') : null);
      el.appendChild(n);
      kidsOf(p.id).forEach(function (k) { row(k, lvl + 1); });
    };
    roots().forEach(function (p) { row(p, 0); });
    if (E.mine && E.sel) el.appendChild(h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn sm', onclick: addPage }, '＋ 在這頁下新增子頁面')));
  }

  function addPage() {
    askText('新增子頁面', '頁面名稱', '').then(function (t) {
      if (t === null) return;
      var id = rid('pg', 12), sibs = kidsOf(E.sel);
      E.pages[id] = { id: id, parent: E.sel, ord: sibs.length ? sibs[sibs.length - 1].ord + 1 : 0, title: t.trim() || '新頁面', icon: 'page', fixed: '', activity: '', deleted: false };
      touch('page', id);
      E.sel = id;
      tree(); blocks(); preview();
    });
  }

  function movePage(p, dir) {
    var sibs = p.parent ? kidsOf(p.parent) : roots(), i = sibs.indexOf(p), j = i + dir;
    if (j < 0 || j >= sibs.length) return;
    sibs.splice(i, 1);
    sibs.splice(j, 0, p);
    sibs.forEach(function (s, k) { if (s.ord !== k) { s.ord = k; touch('page', s.id); } });
    tree(); preview();
  }

  function pageSettings(p, ro) {
    var title = inp(p.title, { disabled: ro }), ic = sel(ICON_CHOICES, p.icon || 'page', { disabled: ro });
    title.addEventListener('input', function () { p.title = title.value; touch('page', p.id); clearTimeout(E.treeT); E.treeT = setTimeout(tree, 400); });
    ic.addEventListener('change', function () { p.icon = ic.value; touch('page', p.id); tree(); });
    var box = h('div', { class: 'card col', style: { marginBottom: '12px' } }, h('div', { class: 'row wrap' }, h('div', { class: 'grow' }, field('頁面名稱', title)), h('div', { style: { width: '120px' } }, field('圖示', ic))));
    if (!p.fixed) {
      var bad = {};
      bad[p.id] = 1;
      descendants(p.id).forEach(function (x) { bad[x] = 1; });
      var parent = sel(pagesArr().filter(function (x) { return !bad[x.id]; }).map(function (x) { return { value: x.id, label: x.title }; }), p.parent, { disabled: ro });
      parent.addEventListener('change', function () { p.parent = parent.value; p.ord = 99; touch('page', p.id); tree(); preview(); });
      var actOpts = [{ value: '', label: '（一般頁面）' }].concat(E.acts.map(function (a) { return { value: a.id, label: a.data.name }; }));
      var act = sel(actOpts, p.activity, { disabled: ro });
      act.addEventListener('change', function () { p.activity = act.value; touch('page', p.id); tree(); });
      box.appendChild(h('div', { class: 'grid2' }, field('上層頁面', parent), field('活動卡片', act, E.side === 'student' ? '連到活動後，活動還沒公開時學員看不到這一頁' : '連到活動後，活動列表會連到這一頁')));
    }
    if (!ro) {
      box.appendChild(h('div', { class: 'row wrap' },
        h('button', { class: 'btn sm', onclick: function () { movePage(p, -1); } }, '↑ 上移'), h('button', { class: 'btn sm', onclick: function () { movePage(p, 1); } }, '↓ 下移'),
        h('button', { class: 'btn sm', onclick: function () { history('page', p.id, p.title); } }, '頁面歷史'),
        h('span', { class: 'grow' }),
        p.fixed ? null : h('button', { class: 'btn sm ghost', style: { color: 'var(--bad)' }, onclick: function () {
          var ds = descendants(p.id);
          confirmBox('刪除頁面', '刪除「' + p.title + '」' + (ds.length ? '和底下 ' + ds.length + ' 個子頁面' : '') + '？刪除後可以在「已刪除的內容」從歷史還原。', '刪除', true).then(function (ok) {
            if (!ok) return;
            [p.id].concat(ds).forEach(function (id) {
              E.pages[id].deleted = true; touch('page', id);
              blocksOf(id).forEach(function (b) { b.deleted = true; touch('block', b.id); });
            });
            E.sel = p.parent;
            tree(); blocks(); preview();
          });
        } }, '刪除頁面')));
    }
    return box;
  }

  function blocks() {
    var el = clear(nodes.blocks), p = E.pages[E.sel];
    if (!p) { el.appendChild(h('div', { class: 'empty' }, '選一個頁面')); return; }
    var ro = !E.mine;
    el.appendChild(pageSettings(p, ro));
    var list = blocksOf(p.id);
    if (!list.length) el.appendChild(h('div', { class: 'empty card', style: { marginBottom: '10px' } }, ro ? '這一頁沒有區塊' : '這一頁還沒有區塊，從下面新增'));
    list.forEach(function (b, i) { el.appendChild(blockCard(b, i, list, ro)); });
    if (!ro) {
      var add = h('div', { class: 'blk-add' }, h('span', { class: 'small muted', style: { width: '100%' } }, '新增區塊'));
      Object.keys(BT).forEach(function (t) { add.appendChild(h('button', { class: 'btn sm', onclick: function () { addBlock(t); } }, BT[t])); });
      el.appendChild(add);
    }
  }

  function addBlock(type) {
    var mk = function (data) {
      var id = rid('bk', 12), list = blocksOf(E.sel);
      E.blocks[id] = { id: id, page: E.sel, ord: list.length ? list[list.length - 1].ord + 1 : 0, type: type, data: data, deleted: false };
      touch('block', id);
      blocks(); preview();
      setTimeout(function () { var n = $('[data-edit-bid="' + id + '"]'); if (n) n.scrollIntoView({ block: 'center' }); }, 30);
    };
    var dflt = { heading: { text: '標題', level: 2 }, text: { md: '' }, image: { url: '' }, video: { url: '' }, map: { query: '' }, link: { text: '', url: '' }, button: { text: '前往', url: '' },
      list: { items: [''] }, table: { rows: [['項目', '說明'], ['', '']], header: true }, divider: {}, pagelink: { page: '' }, notice: { text: '' } };
    if (type !== 'pkg') { mk(dflt[type]); return; }
    var opts = [];
    // 工作人員端可以放所有畫面（學員看得到的，工作人員也可以看）；學員端只放學員的畫面
    A.pool.forEach(function (p) { (p.views || []).filter(function (v) { return (v.sides || []).indexOf(E.side) >= 0; }).forEach(function (v) { opts.push({ value: p.pkg + '|' + v.key, label: p.name + '：' + v.name }); }); });
    if (E.side === 'worker') A.pool.forEach(function (p) { (p.views || []).filter(function (v) { return (v.sides || []).indexOf('worker') < 0; }).forEach(function (v) { opts.push({ value: p.pkg + '|' + v.key, label: p.name + '：' + v.name + '〔學員端畫面〕' }); }); });
    if (!opts.length) { toast('沒有可以放在這一端的 Package 畫面，請先到「Package 管理」安裝', true); return; }
    var s = sel(opts, opts[0].value);
    modal({ title: '放入 Package 畫面', body: field('畫面', s, 'Package 畫面的內容來自各 Package 的資料，在左邊選單「資料」編輯'), actions: [{ text: '取消' }, { text: '放入', cls: 'primary', onClick: function () { var v = s.value.split('|'); mk({ pkg: v[0], view: v[1] }); } }] });
  }

  function moveBlock(b, list, dir) {
    var i = list.indexOf(b), j = i + dir;
    if (j < 0 || j >= list.length) return;
    list.splice(i, 1);
    list.splice(j, 0, b);
    list.forEach(function (x, k) { if (x.ord !== k) { x.ord = k; touch('block', x.id); } });
    blocks(); preview();
  }

  function blockCard(b, i, list, ro) {
    var d = b.data;
    var set = function (k, v) { d[k] = v; touch('block', b.id); };
    var body = h('div', { class: 'blk-body' });
    var t = function (label, k, attrs) { var x = inp(d[k], Object.assign({ disabled: ro }, attrs || {})); x.addEventListener('input', function () { set(k, x.value); }); return field(label, x); };
    var ta = function (label, k, hint) { var x = area(d[k], { rows: 4, disabled: ro }); x.addEventListener('input', function () { set(k, x.value); }); return field(label, x, hint); };
    var pageSel = function (k) {
      var x = sel([{ value: '', label: '（選一個頁面）' }].concat(pagesArr().map(function (p) { return { value: p.id, label: p.title }; })), d[k], { disabled: ro });
      x.addEventListener('change', function () { set(k, x.value); });
      return x;
    };
    switch (b.type) {
      case 'heading': {
        var lv = sel([{ value: 2, label: '大標' }, { value: 3, label: '小標' }], d.level || 2, { disabled: ro });
        lv.addEventListener('change', function () { set('level', Number(lv.value)); });
        body.appendChild(h('div', { class: 'row' }, h('div', { class: 'grow' }, t('文字', 'text')), h('div', { style: { width: '100px' } }, field('大小', lv))));
        break;
      }
      case 'text': body.appendChild(ta('內容', 'md', '空一行分段；**粗體**；[文字](https://網址)；每行「- 」開頭變清單')); break;
      case 'image': body.appendChild(t('圖片網址', 'url', { placeholder: 'https://…（可用 Google 雲端硬碟公開連結或圖床）' })); body.appendChild(h('div', { class: 'grid2' }, t('替代文字', 'alt'), t('說明', 'caption'))); break;
      case 'video': body.appendChild(t('影片網址', 'url', { placeholder: 'YouTube 網址' })); body.appendChild(t('標題', 'title')); break;
      case 'map': body.appendChild(h('div', { class: 'grid2' }, t('地點（地址或地名）', 'query'), t('顯示名稱', 'label'))); break;
      case 'link': body.appendChild(h('div', { class: 'grid2' }, t('文字', 'text'), t('網址', 'url', { placeholder: 'https:// 或 tel:' }))); break;
      case 'button': {
        var mode = sel([{ value: 'url', label: '開網址' }, { value: 'page', label: '到頁面' }], d.page ? 'page' : 'url', { disabled: ro });
        var tgt = h('div');
        var draw = function () { clear(tgt); tgt.appendChild(mode.value === 'page' ? field('頁面', pageSel('page')) : t('網址', 'url', { placeholder: 'https://' })); };
        mode.addEventListener('change', function () { if (mode.value === 'url') set('page', ''); else set('url', ''); draw(); });
        draw();
        body.appendChild(h('div', { class: 'grid2' }, t('按鈕文字', 'text'), field('按下去', mode)));
        body.appendChild(tgt);
        break;
      }
      case 'list': {
        var lx = area((d.items || []).join('\n'), { rows: 4, disabled: ro });
        lx.addEventListener('input', function () { set('items', lx.value.split('\n')); });
        var ord = h('input', { type: 'checkbox', checked: !!d.ordered, disabled: ro });
        ord.addEventListener('change', function () { set('ordered', ord.checked); });
        body.appendChild(field('每行一項', lx));
        body.appendChild(h('label', { class: 'check' }, ord, h('span', null, '編號清單')));
        break;
      }
      case 'table': {
        var tx = area((d.rows || []).map(function (r) { return r.join(' | '); }).join('\n'), { rows: 5, disabled: ro });
        tx.addEventListener('input', function () { set('rows', tx.value.split('\n').map(function (l) { return l.split('|').map(function (c) { return c.trim(); }); })); });
        var hd = h('input', { type: 'checkbox', checked: d.header !== false, disabled: ro });
        hd.addEventListener('change', function () { set('header', hd.checked); });
        body.appendChild(field('每行一列，欄位用 | 分開', tx));
        body.appendChild(h('label', { class: 'check' }, hd, h('span', null, '第一列是標題')));
        break;
      }
      case 'divider': body.appendChild(h('div', { class: 'small muted' }, '一條分隔線')); break;
      case 'pagelink': body.appendChild(h('div', { class: 'grid2' }, field('連到頁面', pageSel('page')), t('顯示文字（空白用頁面名稱）', 'text'))); break;
      case 'notice': body.appendChild(ta('提示內容', 'text')); break;
      case 'pkg': {
        var pp = A.pool.filter(function (p) { return p.pkg === d.pkg; })[0];
        if (!pp) { body.appendChild(h('div', { class: 'fb-notice' }, '這個 Package（' + d.pkg + '）沒有安裝或初始化失敗，發布會被擋下。')); break; }
        var vs = sel((pp.views || []).filter(function (v) { return E.side === 'worker' || (v.sides || []).indexOf(E.side) >= 0; }).map(function (v) { return { value: v.key, label: v.name + ((v.sides || []).indexOf(E.side) < 0 ? '〔學員端畫面〕' : '') }; }), d.view, { disabled: ro });
        vs.addEventListener('change', function () { set('view', vs.value); preview(); });
        body.appendChild(h('div', { class: 'row' }, h('div', { class: 'grow' }, field(pp.name + (pp.maintenance ? '（維護中）' : '') + ' 的畫面', vs)), h('a', { class: 'btn sm', href: '#data/' + d.pkg, style: { alignSelf: 'flex-end' } }, '編輯資料')));
        break;
      }
    }
    var head = h('div', { class: 'blk-head' }, h('b', null, BT[b.type] || b.type), h('span', { class: 'grow muted' }, b.by ? fmt(b.updated) : ''));
    head.appendChild(h('button', { class: 'btn sm ghost', title: '歷史版本', onclick: function () { history('block', b.id, BT[b.type]); } }, '歷史'));
    if (!ro) {
      head.appendChild(h('button', { class: 'btn sm ghost', disabled: i === 0, onclick: function () { moveBlock(b, list, -1); }, 'aria-label': '上移' }, '↑'));
      head.appendChild(h('button', { class: 'btn sm ghost', disabled: i === list.length - 1, onclick: function () { moveBlock(b, list, 1); }, 'aria-label': '下移' }, '↓'));
      head.appendChild(h('button', { class: 'btn sm ghost', title: '移到其他頁面', onclick: function () {
        var s = sel(pagesArr().filter(function (p) { return p.id !== b.page; }).map(function (p) { return { value: p.id, label: p.title }; }), '');
        modal({ title: '移到其他頁面', body: field('目標頁面', s, '區塊移動會保留 ID 與歷史'), actions: [{ text: '取消' }, { text: '移動', cls: 'primary', onClick: function () { var tl = blocksOf(s.value); b.page = s.value; b.ord = tl.length ? tl[tl.length - 1].ord + 1 : 0; touch('block', b.id); blocks(); preview(); } }] });
      } }, '移到…'));
      head.appendChild(h('button', { class: 'btn sm ghost', style: { color: 'var(--bad)' }, onclick: function () { b.deleted = true; touch('block', b.id); blocks(); preview(); toast('已刪除（可以從「已刪除的內容」還原）'); } }, '刪除'));
    }
    return h('div', { class: 'blk', 'data-edit-bid': b.id }, head, body);
  }

  /* ---------------- 預覽 ---------------- */
  function schedulePreview() { clearTimeout(E.prevT); E.prevT = setTimeout(preview, 500); }
  function preview() {
    if (!E || !nodes.phone) return;
    var wrap = clear(nodes.phone);
    var pages = pagesArr().map(function (p) { return { id: p.id, parent: p.parent, ord: p.ord, title: p.title, icon: p.icon, fixed: p.fixed, activity: p.activity }; });
    var blocks = Object.keys(E.blocks).map(function (k) { return E.blocks[k]; }).filter(function (b) { return alive(b) && E.pages[b.page] && alive(E.pages[b.page]); });
    var env = { pages: pages, blocks: blocks, packages: E.pkgPub, live: E.live, side: E.side, me: E.me || { name: IA.user.name }, preview: true,
      nav: function (pid) { if (E.pages[pid]) { E.sel = pid; tree(); blocks_(); preview(); } }, action: function () { return Promise.reject(new Error('預覽中不會送出')); } };
    var cur = E.pages[E.sel], rootOf = cur;
    while (rootOf && rootOf.parent && E.pages[rootOf.parent]) rootOf = E.pages[rootOf.parent];
    var content = h('div', { class: 'col', style: { gap: '12px' } });
    var body = h('div', { class: 'app-body', style: { paddingBottom: '20px' } }, content);
    var head = h('div', { class: 'app-head' }, h('span', { class: 'brand-mark' }, '營'), h('div', { class: 'grow' }, h('div', { class: 'small muted' }, A.info.name), h('h1', null, cur ? cur.title : '')));
    var rs = roots();
    var navEl = E.side === 'student'
      ? h('nav', { class: 'app-tabs' }, rs.map(function (p) { return h('button', { class: rootOf && rootOf.id === p.id ? 'on' : '', onclick: function () { env.nav(p.id); } }, icon(p.icon || 'page'), p.title); }))
      : h('nav', { class: 'wk-menu' }, rs.map(function (p) { return h('button', { class: rootOf && rootOf.id === p.id ? 'on' : '', onclick: function () { env.nav(p.id); } }, p.title); }));
    var app = h('div', { class: 'app' }, head, E.side === 'worker' ? navEl : null, body);
    var phone = h('div', { class: 'phone' }, app, E.side === 'student' ? navEl : null);
    wrap.appendChild(h('div', { class: 'small muted', style: { textAlign: 'center', marginBottom: '6px' } }, '手機預覽（草稿）'));
    wrap.appendChild(phone);
    if (cur) Front.page(content, cur.id, env);
    // 每個區塊只抓一次：伺服器沒回的（或抓失敗）不會一直重抓，切換學員端／工作人員端也不會卡住
    var E0 = E; E0.asked = E0.asked || {};
    var need = Front.liveBlocks(env, E.sel).filter(function (b) { return E.live[b.id] === undefined && !E0.asked[b.id]; }).slice(0, 60);
    need.forEach(function (b) { E0.asked[b.id] = 1; });
    if (need.length) api('frontLive', A.camp, E0.side, need).then(function (r) {
      if (E !== E0) return;
      need.forEach(function (b) { E.live[b.id] = r.live[b.id] === undefined ? {} : r.live[b.id]; });
      preview();
    }, function () { need.forEach(function (b) { delete E0.asked[b.id]; }); });
  }
  function blocks_() { blocks(); }

  /* ---------------- 發布 ---------------- */
  function publish(btn) {
    var go = function (force, ack) {
      var x = E.mine ? changes() : { c: { pages: [], blocks: [] }, sent: {} };
      clearTimeout(E.autoT);
      return op('side.publish', { camp: A.camp, data: { side: E.side, tab: E.tab, changes: x.c, force: force, ack: ack } }).then(function (r) {
        clean(x.sent);
        if (r.blocked) { blockedDialog(r); return; }
        toast('已發布第 ' + r.ver + ' 版' + (r.forced ? '（強制發布，警示仍在）' : ''));
        A.poll();
        load().then(render);
      });
    };
    var blockedDialog = function (r) {
      var ck = h('input', { type: 'checkbox' });
      modal({ title: '有 ' + r.warnings.length + ' 項警示，發布被擋下', wide: true, body: h('div', { class: 'col' },
        h('div', { class: 'hint' }, '變更已經儲存。建議先處理警示再發布；確定沒問題的話可以強制發布（會留下紀錄，警示不會因此消失）。'),
        r.warnings.map(function (e) { return A.eventRow(e, function () {}); }),
        r.reminders.length ? h('details', null, h('summary', { style: { cursor: 'pointer' } }, '另外還有 ' + r.reminders.length + ' 項提醒（不會擋發布）'), r.reminders.map(function (e) { return A.eventRow(e, function () {}); })) : null,
        h('label', { class: 'check' }, ck, h('span', null, '我已看過以上全部 ' + r.warnings.length + ' 項警示，仍要發布'))),
        actions: [{ text: '先去處理' }, { text: '強制發布', cls: 'danger', onClick: function () {
          if (!ck.checked) { toast('請先勾選確認', true); return false; }
          return go(true, r.warnings.length);
        } }] });
    };
    busy(btn, function () { return go(false, 0); }).catch(function (e) { if (e.code === 'LOCK') lockLost(e); });
  }

  /* ---------------- 歷史、已刪除、發布紀錄、模板 ---------------- */
  function needSaved() {
    if (!E.mine) return Promise.reject(new Error('要先按「開始編輯」才能回復'));
    return autosave();
  }

  function history(kind, id, label) {
    api('getHistory', A.camp, E.side, kind, id).then(function (list) {
      var REASON = { save: '儲存', autosave: '自動儲存', leave: '結束編輯', handoff: '交接', restore: '回復', template: '模板', 'delete': '刪除' };
      modal({ title: label + ' 的歷史版本', wide: true, body: list.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 't' }, h('tbody', null, list.map(function (x, i) {
        var summary = kind === 'page' ? x.data.title : (x.data.data ? JSON.stringify(x.data.data).slice(0, 80) : '');
        return h('tr', null, h('td', null, '第 ' + x.hver + ' 版'), h('td', { class: 'small' }, fmt(x.at) + '　' + x.by), h('td', null, REASON[x.reason] || x.reason), h('td', { class: 'small', style: { maxWidth: '320px', wordBreak: 'break-all' } }, summary),
          h('td', null, i === 0 && !x.data.deleted ? h('span', { class: 'small muted' }, '最新') : h('button', { class: 'btn sm', disabled: !E.mine, onclick: function (e) {
            busy(e.target, function () { return needSaved().then(function () { return op('draft.restore', { camp: A.camp, data: { side: E.side, tab: E.tab, kind: kind, id: id, hver: x.hver } }); }); }).then(function () {
              toast('已用第 ' + x.hver + ' 版的內容建立新版本');
              $all('.modal-bg').forEach(function (n) { n.remove(); });
              load().then(render);
            }, function () {});
          } }, '回復這一版')));
      })))) : h('div', { class: 'empty' }, '還沒有歷史版本（按「儲存」後才會產生）') });
    }, fail);
  }

  function deletedList() {
    api('getDeleted', A.camp, E.side).then(function (r) {
      var restoreLatest = function (kind, id, btn) {
        return busy(btn, function () {
          return needSaved().then(function () { return api('getHistory', A.camp, E.side, kind, id); }).then(function (list) {
            var v = list.filter(function (x) { return !x.data.deleted; })[0];
            if (!v) throw new Error('這個項目沒有可以回復的歷史版本（刪除前沒有儲存過）');
            return op('draft.restore', { camp: A.camp, data: { side: E.side, tab: E.tab, kind: kind, id: id, hver: v.hver } });
          });
        }).then(function () { toast('已還原'); $all('.modal-bg').forEach(function (n) { n.remove(); }); load().then(render); }, function () {});
      };
      var titleOf = function (pid) { return (E.pages[pid] || {}).title || '（已刪除的頁面）'; };
      modal({ title: '已刪除的內容', wide: true, body: h('div', { class: 'col' },
        !E.mine ? h('div', { class: 'hint' }, '要先按「開始編輯」才能還原') : null,
        r.pages.length ? h('div', null, h('h3', null, '頁面'), r.pages.map(function (p) { return h('div', { class: 'contact' }, h('div', { class: 'who' }, p.title, h('small', null, fmt(p.updated) + ' ' + p.by)), h('button', { class: 'btn sm', disabled: !E.mine, onclick: function (e) { restoreLatest('page', p.id, e.target); } }, '還原')); })) : null,
        r.blocks.length ? h('div', null, h('h3', null, '區塊'), r.blocks.map(function (b) { return h('div', { class: 'contact' }, h('div', { class: 'who' }, BT[b.type] + '　' + JSON.stringify(b.data).slice(0, 60), h('small', null, '在「' + titleOf(b.page) + '」・' + fmt(b.updated) + ' ' + b.by)), h('button', { class: 'btn sm', disabled: !E.mine, onclick: function (e) { restoreLatest('block', b.id, e.target); } }, '還原')); })) : null,
        !r.pages.length && !r.blocks.length ? h('div', { class: 'empty' }, '沒有已刪除的內容') : null) });
    }, fail);
  }

  function versions() {
    api('listSnapshots', A.camp, E.side).then(function (list) {
      modal({ title: E.d.sideName + '發布紀錄', body: list.length ? h('div', { class: 'col' }, h('div', { class: 'hint' }, '學員／工作人員進入時拿到當下最新的版本，這次使用期間都固定用那一版；重新進入才會換成新版。'),
        h('div', { class: 'tbl-wrap' }, h('table', { class: 't' }, h('tbody', null, list.map(function (s) {
          return h('tr', null, h('td', null, '第 ' + s.ver + ' 版'), h('td', null, fmt(s.at)), h('td', { class: 'small' }, s.by), h('td', null, s.forced ? h('span', { class: 'tag warn' }, '強制發布（' + s.forced + ' 項警示）') : ''));
        }))))) : h('div', { class: 'empty' }, '還沒有發布過') });
    }, fail);
  }

  function templates() {
    var p = E.pages[E.sel];
    if (!p) return;
    var d = E.d, list = h('div', { class: 'col' });
    var apply = function (source, action, btn) {
      return busy(btn, function () { return needSaved().then(function () { return op('template.apply', { camp: A.camp, action: action, data: { side: E.side, tab: E.tab, source: source, page: p.id, parent: p.id } }); }); })
        .then(function (r) { toast(action === 'replace' ? '已套用到「' + p.title + '」' : '已建立新頁面'); $all('.modal-bg').forEach(function (n) { n.remove(); }); E.sel = r.page; load().then(render); }, function () {});
    };
    if (p.fixed) list.appendChild(h('div', { class: 'contact' }, h('div', { class: 'who' }, h('b', null, '系統預設：' + p.title), h('small', null, '用系統預設模板的最新版取代這一頁的區塊（舊區塊會軟刪除，可從歷史還原）')),
      h('button', { class: 'btn sm', disabled: !E.mine, onclick: function (e) { apply('system:' + p.fixed, 'replace', e.target); } }, '取代這一頁')));
    d.templates.forEach(function (t) {
      list.appendChild(h('div', { class: 'contact' }, h('div', { class: 'who' }, h('b', null, t.name), h('small', null, fmt(t.at) + ' ' + t.by)),
        h('button', { class: 'btn sm', disabled: !E.mine, onclick: function (e) { apply(t.id, 'create', e.target); } }, '建立為子頁面'),
        h('button', { class: 'btn sm', disabled: !E.mine, onclick: function (e) { apply(t.id, 'replace', e.target); } }, '取代這一頁')));
    });
    if (!d.templates.length && !p.fixed) list.appendChild(h('div', { class: 'muted small' }, '這個營隊還沒有自訂模板'));
    modal({ title: '模板', wide: true, body: h('div', { class: 'col' }, h('div', { class: 'hint' }, '套用模板一律是複製一份，之後模板改了也不會影響已套用的頁面。'), list,
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: function (e) {
        askText('把「' + p.title + '」存成模板', '模板名稱', p.title).then(function (name) {
          if (name === null) return;
          autosave().then(function () { return op('template.save', { camp: A.camp, data: { side: E.side, page: p.id, name: name } }); }).then(function () { toast('已存成模板'); $all('.modal-bg').forEach(function (n) { n.remove(); }); load().then(render); }, fail);
        });
      } }, '把目前這一頁存成模板'))) });
  }

  return { open: open, stop: stop };
})();
