/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 管理端（admin.html?c=營隊ID）：總覽、兩端編輯器、Package 資料、Package 管理、警示與通知、成員、操作紀錄、營隊設定。
 * 網址 #edit/student、#data/people/workers … 對應各畫面；離開編輯器前會先儲存。
 */

var A = {
  camp: param('c'), info: null, pool: [], leaving: null, counts: { warnings: 0, reminders: 0, unread: 0 },
  op: function (kind, o) { return op(kind, Object.assign({ camp: A.camp }, o || {})); },
  isAdmin: function () { return A.info.isRoot || A.info.role === 'admin'; },
  isManager: function () { return A.info.isRoot || A.info.role === 'admin' || A.info.role === 'manager'; },
  can: function (perm) { return A.info.isRoot || (A.info.perms || []).indexOf(perm) >= 0; },
  canSide: function (side) { return A.can('edit_' + side); },
  frontBase: function () { var u = A.info.frontUrl || ''; if (!u) u = location.href.replace(/[^/]*([?#].*)?$/, ''); return u.replace(/\/?$/, '/'); },
  main: function () { return $('#main'); }
};

A.start = function () {
  if (!A.camp) { location.href = 'camps.html'; return; }
  Staff.init().then(function () { return A.reload(); }).then(function () {
    $('#top').appendChild(Staff.topbar(h('span', null, h('a', { href: 'camps.html' }, '我的營隊'), ' / ', h('b', { id: 'campName' }, A.info.name)), A.bell()));
    A.navBuild();
    window.addEventListener('hashchange', A.route);
    A.route();
    A.poll();
    setInterval(A.poll, 60000);
  }, function (e) { if (e && e.message !== '未登入') clear(A.main()).appendChild(h('div', { class: 'card' }, h('h2', null, '無法開啟營隊'), h('p', null, e.message), h('a', { class: 'btn', href: 'camps.html' }, '回我的營隊'))); });
};

A.reload = function () {
  return Promise.all([api('getCamp', A.camp), api('getPackages', A.camp)]).then(function (r) {
    A.info = r[0];
    A.pkgs = r[1];
    A.pool = r[1].installed.filter(function (s) { return s.active; });
    if ($('#campName')) $('#campName').textContent = A.info.name;
  });
};

A.bell = function () {
  var b = h('a', { class: 'bell', href: '#events', title: '警示與通知', 'aria-label': '警示與通知' }, icon('bell'), h('span', { class: 'badge hidden', id: 'bellBadge' }));
  return b;
};

A.poll = function () {
  if (document.hidden) return;
  Promise.all([api('listEvents', A.camp, false), api('listNotifications', A.camp)]).then(function (r) {
    A.counts = { warnings: r[0].warnings, reminders: r[0].reminders, unread: r[1].unread };
    var bd = $('#bellBadge');
    var n = r[0].warnings || r[1].unread;
    bd.classList.toggle('hidden', !n);
    bd.classList.toggle('w', !r[0].warnings);
    bd.textContent = r[0].warnings ? '⚠' + r[0].warnings : r[1].unread;
    var ev = $('#navEvents');
    if (ev) ev.textContent = '警示與通知' + (r[0].warnings ? '（⚠️' + r[0].warnings + '）' : '');
  }, function () {});
};

A.navBuild = function () {
  var nav = clear($('#nav')), I = A.info;
  var item = function (hash, text, id) { return h('a', { href: '#' + hash, 'data-r': hash, id: id || null }, text); };
  nav.appendChild(item('home', '總覽'));
  if (A.canSide('student') || A.canSide('worker')) nav.appendChild(h('div', { class: 'grp' }, '前台編輯'));
  if (A.canSide('student')) nav.appendChild(h('a', { href: '#edit/student', 'data-r': 'edit/student' }, h('span', { class: 'side-dot' }), '學員端'));
  if (A.canSide('worker')) nav.appendChild(h('a', { href: '#edit/worker', 'data-r': 'edit/worker' }, h('span', { class: 'side-dot worker' }), '工作人員端'));
  var info = A.pool.filter(function (p) { return p.category !== 'activity'; }), act = A.pool.filter(function (p) { return p.category === 'activity'; });
  if (info.length) { nav.appendChild(h('div', { class: 'grp' }, '資料')); info.forEach(function (p) { nav.appendChild(item('data/' + p.pkg, p.name + (p.maintenance ? ' 🔧' : ''))); }); }
  if (act.length) { nav.appendChild(h('div', { class: 'grp' }, '活動 Package')); act.forEach(function (p) { nav.appendChild(item('data/' + p.pkg, p.name + (p.maintenance ? ' 🔧' : ''))); }); }
  nav.appendChild(h('div', { class: 'grp' }, '管理'));
  nav.appendChild(item('packages', 'Package 管理'));
  nav.appendChild(item('events', '警示與通知', 'navEvents'));
  nav.appendChild(item('members', '成員與權限'));
  nav.appendChild(item('log', '操作紀錄'));
  if (A.isAdmin()) nav.appendChild(item('settings', '營隊設定與備份'));
  A.navMark();
};
A.navMark = function () {
  var r = location.hash.slice(1) || 'home';
  $all('#nav a').forEach(function (a) { a.classList.toggle('on', r === a.dataset.r || r.indexOf(a.dataset.r + '/') === 0 || r.indexOf(a.dataset.r + '?') === 0); });
};

A.route = function () {
  var go = function () {
    A.leaving = null;
    var hash = location.hash.slice(1) || 'home';
    var q = {};
    if (hash.indexOf('?') >= 0) { new URLSearchParams(hash.split('?')[1]).forEach(function (v, k) { q[k] = v; }); hash = hash.split('?')[0]; }
    var p = hash.split('/');
    A.navMark();
    var m = clear(A.main());
    m.classList.remove('side-student', 'side-worker');
    window.scrollTo(0, 0);
    if (p[0] === 'edit' && (p[1] === 'student' || p[1] === 'worker')) Editor.open(m, p[1], q);
    else if (p[0] === 'data' && p[1]) PkgAdmin.open(m, p[1], p[2] || '', q);
    else if (A.views[p[0]]) A.views[p[0]](m, q);
    else A.views.home(m, q);
  };
  if (A.leaving) {
    var l = A.leaving;
    A.leaving = null;
    Promise.resolve(l()).then(go, function (e) { fail(e); go(); });
  } else go();
};

A.title = function (m, title, lead, actions) {
  m.appendChild(h('div', { class: 'row wrap', style: { marginBottom: '14px', alignItems: 'flex-start' } }, h('div', { class: 'grow' }, h('h1', null, title), lead ? h('p', { class: 'lead', style: { margin: '2px 0 0', color: 'var(--text-2)' } }, lead) : null), actions || null));
};

/** 警示／提醒的連結 → 管理端的畫面 */
A.linkOf = function (e) {
  var l = String(e.link || '');
  var m = l.match(/^page:(\w+)(?::(\w+))?$/);
  if (m) return '#edit/' + (e.side || 'student') + '?page=' + m[1] + (m[2] ? '&block=' + m[2] : '');
  m = l.match(/^pkg:([\w-]+)(?::(\w+))?(?::(\w+))?$/);
  if (m) return m[1] === 'emergency' && m[2] === 'config' ? '#data/emergency/config' : '#data/' + m[1] + (m[2] ? '/' + m[2] : '') + (m[3] ? '?id=' + m[3] : '');
  if (/^editor:/.test(l)) return '#edit/' + l.slice(7);
  return '';
};

A.views = {};

/* ---------------- 總覽 ---------------- */
A.views.home = function (m) {
  var I = A.info;
  var ROLE = { root: '系統終端', admin: '專案管理員', manager: '協作管理員', collab: '協作者', pkg: '活動協作' };
  A.title(m, I.name, (I.start || '未設定日期') + (I.end ? ' ～ ' + I.end : '') + '　·　你的身分：' + (ROLE[I.role] || I.role));
  if (I.status === 'ended') m.appendChild(h('div', { class: 'recall-banner', style: { marginBottom: '14px' } }, '營隊已結束（回憶模式）：前台保留內容，資料不能再修改。需要時專案管理員可以在「營隊設定」重新開啟。'));
  var stats = h('div', { class: 'stat' });
  m.appendChild(stats);
  var ev = h('div', { class: 'section' });
  m.appendChild(ev);
  apiCached('listEvents', [A.camp, true], function (r) {
    clear(stats); clear(ev);
    stats.appendChild(h('a', { class: 'card', href: '#events', style: { textDecoration: 'none', color: 'inherit' } }, h('b', { style: { color: r.warnings ? 'var(--bad)' : 'var(--ok)' } }, r.warnings), '⚠️ 警示（會阻擋發布）'));
    stats.appendChild(h('a', { class: 'card', href: '#events', style: { textDecoration: 'none', color: 'inherit' } }, h('b', null, r.reminders), '💡 提醒'));
    ['student', 'worker'].filter(A.canSide).forEach(function (side) {
      var slot = h('a', { class: 'card', href: '#edit/' + side, style: { textDecoration: 'none', color: 'inherit' } });
      stats.appendChild(slot);
      apiCached('listSnapshots', [A.camp, side], function (s) {
        clear(slot).appendChild(h('b', null, s.length ? '第 ' + s[0].ver + ' 版' : '未發布'));
        slot.appendChild(document.createTextNode((side === 'student' ? '學員端' : '工作人員端') + (s.length ? '　' + fmt(s[0].at) : '')));
      }).then(null, function () {});
    });
    var top = r.events.filter(function (e) { return e.type === 'warning' || e.state === 'pin'; }).slice(0, 6);
    if (top.length) { ev.appendChild(h('h2', null, '需要處理')); top.forEach(function (e) { ev.appendChild(A.eventRow(e, function () { A.route(); })); }); }
  }).then(null, fail);
  var links = h('div', { class: 'section' }, h('h2', null, '前台連結'));
  var wl = A.frontBase() + 'app.html?c=' + encodeURIComponent(A.camp) + '&s=worker';
  links.appendChild(h('div', { class: 'card col' },
    h('div', null, h('b', null, '學員端：'), '學員從報名系統的學員專區按「進入營隊互動」自動登入（需要在「營隊設定」完成串接）。'),
    h('div', null, h('b', null, '工作人員端：'), h('a', { href: wl, target: '_blank', rel: 'noopener' }, wl), '　', h('button', { class: 'btn sm', onclick: function () { navigator.clipboard.writeText(wl).then(function () { toast('已複製'); }); } }, '複製'),
      I.workerPassSet ? null : h('span', { class: 'tag warn', style: { marginLeft: '6px' } }, '還沒設定工作人員通行碼')),
    h('div', { class: 'row wrap' }, ['student', 'worker'].filter(A.canSide).map(function (side) {
      return [h('a', { class: 'btn sm', target: '_blank', href: 'app.html?c=' + encodeURIComponent(A.camp) + '&s=' + side + '&preview=pub' }, '預覽' + (side === 'student' ? '學員端' : '工作人員端') + '（發布版）'),
        h('a', { class: 'btn sm', target: '_blank', href: 'app.html?c=' + encodeURIComponent(A.camp) + '&s=' + side + '&preview=draft' }, '預覽' + (side === 'student' ? '學員端' : '工作人員端') + '（草稿）')];
    }))));
  m.appendChild(links);
  m.appendChild(h('div', { class: 'section' }, h('h2', null, '使用順序建議'), h('div', { class: 'card' }, h('ol', { style: { margin: 0, paddingLeft: '20px' } },
    h('li', null, '「營隊設定」填營期日期、工作人員通行碼，並和報名系統串接（同步學員與小隊）。'),
    h('li', null, '「人員與分隊」建立工作人員、小隊與工作分配；「營期流程與活動」建立流程、活動與跑關。'),
    h('li', null, '「學員行程」整理學員看得到的行程；「緊急應變」填指揮中心電話與守夜人員。'),
    h('li', null, '到「學員端／工作人員端」按「開始編輯」調整頁面，處理完警示後發布。')))));
};

/* ---------------- 警示與通知 ---------------- */
A.eventRow = function (e, after) {
  var href = A.linkOf(e);
  var acts = h('div', { class: 'row', style: { gap: '4px' } });
  if (href) acts.appendChild(h('a', { class: 'btn sm', href: href }, '前往'));
  if (e.type === 'reminder') {
    var mark = function (st) { return function (ev) { busy(ev.target, function () { return A.op('event.mark', { data: { eid: e.eid, state: st } }); }).then(after, function () {}); }; };
    if (e.state !== 'pin') acts.appendChild(h('button', { class: 'btn sm ghost', onclick: mark('pin'), title: '釘選（只對自己）' }, '📌'));
    if (e.state !== 'ignore') acts.appendChild(h('button', { class: 'btn sm ghost', onclick: mark('ignore'), title: '忽略（只對自己）' }, '忽略'));
    if (e.state) acts.appendChild(h('button', { class: 'btn sm ghost', onclick: mark('') }, '取消' + (e.state === 'pin' ? '釘選' : '忽略')));
  }
  return h('div', { class: 'ev ' + e.type + (e.state === 'ignore' ? ' ignored' : '') }, h('span', null, e.type === 'warning' ? '⚠️' : (e.state === 'pin' ? '📌' : '💡')),
    h('div', { class: 'tx' }, h('div', null, e.text), h('div', { class: 'small muted' }, e.sourceName + (e.side ? '　·　' + (e.side === 'student' ? '學員端' : '工作人員端') : '') + '　·　自 ' + fmt(e.since))), acts);
};

A.views.events = function (m) {
  A.title(m, '警示與通知', '⚠️ 警示要處理掉才會消失（有發布權限的人看過後可以強制發布）；💡 提醒可以釘選或忽略，只對你自己有效。');
  var evBox = h('div', { class: 'section' }, h('div', { class: 'empty loading' }, '檢查中…'));
  var ntBox = h('div', { class: 'section' });
  m.appendChild(evBox);
  m.appendChild(ntBox);
  var showIgnored = false;
  var loadEv = function () {
    apiCached('listEvents', [A.camp, true], function (r) {
      clear(evBox).appendChild(h('h2', null, '目前的警示與提醒', h('button', { class: 'btn sm ghost', onclick: function () { showIgnored = !showIgnored; loadEv(); } }, showIgnored ? '隱藏已忽略' : '顯示已忽略')));
      var list = r.events.filter(function (e) { return showIgnored || e.state !== 'ignore'; });
      if (!list.length) evBox.appendChild(h('div', { class: 'card empty' }, '目前沒有需要處理的事 👍'));
      list.forEach(function (e) { evBox.appendChild(A.eventRow(e, loadEv)); });
      A.poll();
    }).then(null, fail);
  };
  var loadNt = function () {
    api('listNotifications', A.camp).then(function (r) {
      clear(ntBox).appendChild(h('h2', null, '通知', r.unread ? h('span', { class: 'tag bad' }, r.unread + ' 則未讀') : null));
      if (!r.list.length) { ntBox.appendChild(h('div', { class: 'card empty' }, '沒有通知')); return; }
      ntBox.appendChild(h('div', { class: 'card', style: { padding: '6px 14px' } }, r.list.map(function (n) {
        var href = n.link ? A.linkOf({ link: n.link }) : '';
        return h('div', { class: 'contact' }, h('span', { class: 'tag ' + (n.read ? '' : 'info') }, n.kindName), h('div', { class: 'who' }, n.text, h('small', null, fmt(n.at))), href ? h('a', { class: 'btn sm', href: href }, '前往') : null);
      })));
      var unread = r.list.filter(function (n) { return !n.read; }).map(function (n) { return n.id; });
      if (unread.length) op('notify.read', { data: { ids: unread } }).then(A.poll, function () {});   // 查看即已讀
    }, fail);
  };
  loadEv();
  loadNt();
};

/* ---------------- 成員與權限 ---------------- */
A.views.members = function (m) {
  A.title(m, '成員與權限', '專案管理員 → 協作管理員 → 協作者；發布是特殊權限。上游失去權限時，下游由他授出的同一權限會一起收回。');
  var box = h('div');
  m.appendChild(box);
  var load = function () {
    apiCached('listMembers', [A.camp], render).then(null, fail);
  };
  var permName = function (r, p, pkg) { var arr = pkg ? r.pkgPerms : r.infoPerms; var x = arr.filter(function (y) { return y.key === p; })[0]; return x ? x.name : p; };
  function render(r) {
    clear(box);
    var I = A.info;
    var bar = h('div', { class: 'row wrap', style: { marginBottom: '12px' } });
    if (A.isAdmin()) bar.appendChild(h('button', { class: 'btn primary', onclick: function () { addMember(r); } }, '加入成員'));
    if (I.isRoot) bar.appendChild(h('button', { class: 'btn', onclick: function () { pkgGrant(r); } }, '授權活動 Package'));
    if (A.isManager() || Object.keys(I.pkgPerms || {}).length) bar.appendChild(h('button', { class: 'btn', onclick: function () { makeInvite(r); } }, '產生邀請碼'));
    if (A.isAdmin()) bar.appendChild(h('button', { class: 'btn', onclick: function () {
      confirmBox('關閉全部協作者', '營期中收斂權限：一次撤銷所有「協作者」，只留專案管理員與協作管理員。之後要再加入需要新的邀請碼。', '全部關閉', true).then(function (ok) {
        if (ok) A.op('member.closeCollabs').then(function (x) { toast('已關閉 ' + x.closed + ' 位協作者'); load(); }, fail);
      });
    } }, '關閉全部協作者'));
    if (!I.isRoot) bar.appendChild(h('button', { class: 'btn ghost', onclick: function () {
      confirmBox('退出這個營隊', '退出後你授出的成員會交給其他管理者接管。確定要退出嗎？', '退出', true).then(function (ok) {
        if (ok) A.op('member.leave').then(function () { location.href = 'camps.html'; }, fail);
      });
    } }, '退出營隊'));
    box.appendChild(bar);
    var active = r.grants.filter(function (g) { return g.status === 'active'; }), past = r.grants.filter(function (g) { return g.status !== 'active'; });
    box.appendChild(h('div', { class: 'tbl-wrap' }, h('table', { class: 't' }, h('thead', null, h('tr', null, ['成員', '身分', '權限', '授權者', '期限', ''].map(function (x) { return h('th', null, x); }))),
      h('tbody', null, active.map(function (g) {
        var perms = g.perms.map(function (p) { return h('span', { class: 'tag' + (/publish/.test(p) ? ' warn' : '') }, permName(r, p, g.role === 'pkg')); });
        return h('tr', null, h('td', null, h('b', null, g.name), h('div', { class: 'small muted' }, g.email)), h('td', null, g.roleName + (g.pkg ? '：' + g.pkg : ''), g.viaInvite ? h('div', { class: 'small muted' }, '邀請碼加入') : null),
          h('td', null, h('div', { class: 'chips' }, perms)), h('td', { class: 'small' }, g.granter), h('td', { class: 'small' }, g.expires ? g.expires.slice(0, 10) : '—'),
          h('td', null, h('div', { class: 'row', style: { gap: '4px' } }, h('button', { class: 'btn sm', onclick: function () { editPerms(r, g); } }, '權限'), h('button', { class: 'btn sm ghost', onclick: function () {
            confirmBox('撤銷授權', '撤銷「' + g.name + '」的' + g.roleName + '身分？他授出的權限也會一起收回（協作管理員底下的人會由你接管）。', '撤銷', true).then(function (ok) {
              if (ok) A.op('member.revoke', { target: { grantId: g.grantId } }).then(function () { toast('已撤銷'); load(); }, fail);
            });
          } }, '撤銷'))));
      })))));
    if (past.length) box.appendChild(h('details', { class: 'section' }, h('summary', { class: 'muted', style: { cursor: 'pointer' } }, '已失效的授權（' + past.length + '）'),
      h('div', { class: 'tbl-wrap', style: { marginTop: '8px' } }, h('table', { class: 't' }, h('tbody', null, past.map(function (g) {
        return h('tr', null, h('td', null, g.name + '（' + g.email + '）'), h('td', null, g.roleName), h('td', null, { revoked: '已撤銷', expired: '已到期' }[g.status] || g.status), h('td', { class: 'small' }, g.revokedBy || ''));
      }))))));
    if (r.invites.length) box.appendChild(h('div', { class: 'section' }, h('h2', null, '邀請碼紀錄'), h('div', { class: 'tbl-wrap' }, h('table', { class: 't' }, h('tbody', null, r.invites.slice().reverse().slice(0, 30).map(function (i) {
      return h('tr', null, h('td', { class: 'small' }, fmt(i.created)), h('td', null, i.pkg ? '活動協作：' + i.pkg : '協作者'), h('td', null, i.perms.map(function (p) { return permName(r, p, !!i.pkg); }).join('、')),
        h('td', null, h('span', { class: 'tag ' + (i.status === 'active' ? 'ok' : '') }, { active: '可使用', used: '已使用', replaced: '已被新邀請碼取代', expired: '已失效' }[i.status] || i.status)), h('td', { class: 'small' }, i.usedBy || ''));
    }))))));
  }
  function infoChips(r, selected, limit) {
    var mine = A.info.isRoot ? r.infoPerms.map(function (p) { return p.key; }) : (r.me.perms || []);
    return chips(r.infoPerms.filter(function (p) { return !limit || mine.indexOf(p.key) >= 0; }).map(function (p) { return { value: p.key, label: p.name }; }), selected);
  }
  function addMember(r) {
    var role = sel([A.info.isRoot ? { value: 'admin', label: '專案管理員（全部資訊權限）' } : null, { value: 'manager', label: '協作管理員' }, { value: 'collab', label: '協作者' }].filter(Boolean), 'manager');
    var email = inp('', { type: 'email' }), name = inp(''), exp = inp('', { type: 'date' });
    var ch = infoChips(r, ['edit_student', 'edit_worker'], true), chWrap = field('權限', ch.el);
    role.addEventListener('change', function () { chWrap.classList.toggle('hidden', role.value === 'admin'); });
    modal({ title: '加入成員', body: h('div', { class: 'col' }, field('身分', role), field('信箱', email), field('名稱（新帳號才需要）', name), chWrap, field('期限（可空白）', exp)),
      actions: [{ text: '取消' }, { text: '加入', cls: 'primary', onClick: function () {
        return A.op('member.add', { data: { role: role.value, email: email.value, name: name.value, perms: ch.get(), expires: exp.value ? exp.value + 'T23:59:59+08:00' : '' } }).then(function (x) {
          if (x.newPassword) modal({ title: '已建立帳號', body: h('div', { class: 'col' }, h('div', null, email.value + ' 的初始密碼：'), h('code', { style: { fontSize: '18px' } }, x.newPassword), h('div', { class: 'hint' }, '只會顯示這一次，請轉交本人並請他登入後修改。')) });
          else toast('已加入');
          load();
        });
      } }] });
  }
  function pkgGrant(r) {
    var acts = A.pkgs.repo.filter(function (p) { return p.category === 'activity'; });
    var pkg = sel(acts.map(function (p) { return { value: p.id, label: p.name }; }), acts[0] && acts[0].id);
    var email = inp('', { type: 'email' }), name = inp(''), exp = inp('', { type: 'date' });
    var ch = chips(r.pkgPerms.map(function (p) { return { value: p.key, label: p.name }; }), ['content', 'test']);
    modal({ title: '授權活動 Package', body: h('div', { class: 'col' }, field('Package', pkg), field('信箱', email), field('名稱（新帳號才需要）', name), field('權限', ch.el, '發布權只能由系統終端授權'), field('期限（可空白）', exp)),
      actions: [{ text: '取消' }, { text: '授權', cls: 'primary', onClick: function () {
        return A.op('member.pkgGrant', { data: { pkg: pkg.value, email: email.value, name: name.value, perms: ch.get(), expires: exp.value ? exp.value + 'T23:59:59+08:00' : '' } }).then(function (x) {
          if (x.newPassword) modal({ title: '已建立帳號', body: h('div', { class: 'col' }, h('div', null, email.value + ' 的初始密碼：'), h('code', { style: { fontSize: '18px' } }, x.newPassword)) });
          else toast('已授權');
          load();
        });
      } }] });
  }
  function makeInvite(r) {
    var mine = A.info.pkgPerms || {};
    var opts = [];
    if (A.isManager()) opts.push({ value: '', label: '協作者（資訊模組）' });
    Object.keys(mine).filter(function (k) { return k !== '*'; }).forEach(function (k) { opts.push({ value: k, label: '活動協作：' + k }); });
    if (A.info.isRoot) A.pkgs.repo.filter(function (p) { return p.category === 'activity'; }).forEach(function (p) { if (!opts.some(function (o) { return o.value === p.id; })) opts.push({ value: p.id, label: '活動協作：' + p.name }); });
    var kind = sel(opts, opts[0] && opts[0].value);
    var wrap = h('div');
    var ch;
    var draw = function () {
      clear(wrap);
      ch = kind.value ? chips(r.pkgPerms.filter(function (p) { return p.key !== 'publish'; }).map(function (p) { return { value: p.key, label: p.name }; }), ['content']) : infoChips(r, ['edit_student'], true);
      wrap.appendChild(field('邀請碼帶的權限', ch.el, kind.value ? 'Package 邀請碼不含發布權' : '不能超過你自己有的權限'));
    };
    kind.addEventListener('change', draw);
    draw();
    modal({ title: '產生邀請碼', body: h('div', { class: 'col' }, field('種類', kind), wrap, h('div', { class: 'hint' }, '邀請碼只能使用一次；產生新的之後，你之前產生的同種邀請碼會失效；營隊結束時全部失效。')),
      actions: [{ text: '取消' }, { text: '產生', cls: 'primary', onClick: function () {
        return A.op('invite.create', { data: { pkg: kind.value, perms: ch.get() } }).then(function (x) {
          modal({ title: '邀請碼', body: h('div', { class: 'col', style: { alignItems: 'center' } }, h('code', { style: { fontSize: '26px', letterSpacing: '.1em' } }, x.code),
            h('div', { class: 'hint' }, '對方到登入頁「用邀請碼加入」，或登入後在「我的營隊」輸入。這個邀請碼只顯示這一次。'),
            h('button', { class: 'btn', onclick: function () { navigator.clipboard.writeText(x.code).then(function () { toast('已複製'); }); } }, '複製')) });
          load();
        });
      } }] });
  }
  function editPerms(r, g) {
    var isPkg = g.role === 'pkg';
    var ch = isPkg ? chips(r.pkgPerms.map(function (p) { return { value: p.key, label: p.name }; }), g.perms) : infoChips(r, g.perms, !A.info.isRoot);
    modal({ title: g.name + ' 的權限', body: h('div', { class: 'col' }, ch.el, h('div', { class: 'hint' }, '全部取消等於撤銷這筆授權。減少的權限會連鎖收回他授出的同一權限。')),
      actions: [{ text: '取消' }, { text: '儲存', cls: 'primary', onClick: function () { return A.op('member.perms', { target: { grantId: g.grantId }, data: { perms: ch.get() } }).then(function () { toast('已更新'); load(); }); } }] });
  }
  load();
};

/* ---------------- 操作紀錄 ---------------- */
A.views.log = function (m) {
  A.title(m, '操作紀錄', '所有寫入都會留下紀錄（自動儲存與心跳除外）。Package 的細節依操作 ID 關聯在同一列。');
  var q = inp('', { placeholder: '搜尋操作者、類型、對象' }), res = sel([{ value: '', label: '全部結果' }, { value: 'ok', label: '成功' }, { value: 'error', label: '失敗' }], '');
  var box = h('div');
  var load = function () {
    api('getOpLog', A.camp, { search: q.value, result: res.value, limit: 300 }).then(function (r) {
      clear(box).appendChild(h('div', { class: 'hint', style: { marginBottom: '6px' } }, '保留 ' + r.retentionDays + ' 天；顯示最新 ' + r.rows.length + ' 筆'));
      box.appendChild(h('div', { class: 'tbl-wrap' }, h('table', { class: 't' }, h('thead', null, h('tr', null, ['時間', '操作者', '類型', '對象', '結果'].map(function (x) { return h('th', null, x); }))),
        h('tbody', null, r.rows.map(function (x) {
          return h('tr', null, h('td', { class: 'small', style: { whiteSpace: 'nowrap' } }, fmt(x.at)), h('td', { class: 'small' }, x.actor), h('td', null, x.kind, h('div', { class: 'small muted' }, x.stage + '／' + x.action)),
            h('td', { class: 'small' }, x.target, x.details.map(function (d) { return h('div', { class: 'muted' }, '↳ ' + d.pkg + '：' + d.detail); })),
            h('td', null, x.result === 'ok' ? h('span', { class: 'tag ok' }, '成功') : h('span', { class: 'tag bad' }, '失敗'), x.error ? h('div', { class: 'small muted' }, x.error) : null));
        })))));
    }, fail);
  };
  var t;
  q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(load, 400); });
  res.addEventListener('change', load);
  m.appendChild(h('div', { class: 'row', style: { marginBottom: '10px' } }, h('div', { class: 'grow' }, q), h('div', { style: { width: '140px' } }, res)));
  m.appendChild(box);
  load();
};

/* ---------------- 營隊設定與備份 ---------------- */
A.views.settings = function (m) {
  var I = A.info;
  A.title(m, '營隊設定與備份');
  var name = inp(I.name), start = inp(I.start, { type: 'date' }), end = inp(I.end, { type: 'date' }), front = inp(I.frontUrl, { placeholder: 'https://你的帳號.github.io/camp-interact/' });
  var basic = h('div', { class: 'card col' }, h('h2', null, '基本資料'), field('營隊名稱', name), h('div', { class: 'grid2' }, field('營期開始', start), field('營期結束', end)),
    field('前台網址（GitHub Pages）', front, '用來產生工作人員連結；空白時用目前這個網站的網址'),
    h('div', null, h('button', { class: 'btn primary', onclick: function (e) {
      busy(e.target, function () { return A.op('camp.settings', { data: { name: name.value, start: start.value, end: end.value, frontUrl: front.value } }); }).then(function () { toast('已儲存'); A.reload(); }, function () {});
    } }, '儲存')));
  m.appendChild(basic);

  // 通行碼：可以自己訂，也可以按「系統產生」（不含容易看錯的 0/O、1/I/l）
  var wp = inp('', { type: 'text', placeholder: I.workerPassSet ? '輸入新的通行碼可以更換' : '至少 4 個字', autocomplete: 'off' }), kind = 'custom';
  wp.addEventListener('input', function () { kind = 'custom'; });
  var gen = function () {
    var cs = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', a = new Uint32Array(6), out = '';
    crypto.getRandomValues(a);
    for (var i = 0; i < 6; i++) out += cs[a[i] % cs.length];
    wp.value = out; kind = 'auto'; wp.focus(); wp.select();
  };
  var copy = function (text, what) { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('已複製' + (what || '')); }, function () { askText('複製', '手動複製下面的文字', text); }); };
  var loginText = function (code) { return '工作人員端：' + A.frontBase() + 'app.html?c=' + encodeURIComponent(A.camp) + '&s=worker\n登入方式：姓名＋股別＋營隊通行碼\n營隊通行碼：' + code; };
  var curPass = I.workerPassText ? h('div', { class: 'row wrap' }, h('span', null, '目前的通行碼：'), h('b', { style: { fontSize: '18px', letterSpacing: '2px', fontFamily: 'ui-monospace, monospace' } }, I.workerPassText),
    h('span', { class: 'tag' }, I.workerPassKind === 'auto' ? '系統產生' : '自訂'),
    h('button', { class: 'btn sm', onclick: function () { copy(I.workerPassText, '通行碼'); } }, '複製通行碼'), h('button', { class: 'btn sm', onclick: function () { copy(loginText(I.workerPassText), '登入說明'); } }, '複製登入說明（連結＋通行碼）'))
    : I.workerPassSet ? h('div', { class: 'hint' }, '已經設定過通行碼（舊版設定的看不到內容）。忘記的話重新設定一個就好。') : h('span', { class: 'tag warn' }, '還沒設定工作人員通行碼');
  m.appendChild(h('div', { class: 'card col section' }, h('h2', null, '工作人員登入'), h('div', { class: 'hint' }, '工作人員用「姓名＋股別＋營隊通行碼」登入。通行碼可以自己訂（至少 4 個字），也可以按「系統產生」產生一組 6 碼的；換掉之後，舊通行碼不能再登入新的裝置。'),
    curPass, field(I.workerPassSet ? '更換通行碼' : '營隊通行碼', h('div', { class: 'row' }, h('div', { class: 'grow' }, wp), h('button', { class: 'btn', type: 'button', onclick: gen }, '系統產生'))),
    h('div', null, h('button', { class: 'btn primary', onclick: function (e) {
      var v = wp.value.trim();
      if (v.length < 4) { toast('通行碼至少 4 個字，或按「系統產生」', true); return; }
      busy(e.target, function () { return A.op('camp.settings', { data: { workerPass: v, passKind: kind } }); }).then(function () { toast('通行碼已更新'); wp.value = ''; A.reload().then(A.route); }, function () {});
    } }, '儲存通行碼'))));

  var regUrl = inp(I.regUrl, { placeholder: 'https://script.google.com/macros/s/…/exec' }), regPrefix = inp(I.regPrefix, { placeholder: '例如 S26' });
  var secretBox = h('div');
  m.appendChild(h('div', { class: 'card col section' }, h('h2', null, '與報名系統串接'),
    h('div', { class: 'hint' }, '報名系統是學員資料的正式來源；互動系統只拿學員代碼、姓名、小隊、房間、是否有效，各隊專輔隨輔（姓名、職稱、聯絡方式）與分房，不會寫回報名系統。'),
    h('ol', { class: 'small', style: { margin: 0, paddingLeft: '20px' } },
      h('li', null, '在下面填報名系統的網址（Apps Script /exec）與專案代碼，按儲存。'),
      h('li', null, '按「產生串接金鑰」，複製金鑰。'),
      h('li', null, '到報名系統的學員管理頁按「學員專區」，在「營隊互動系統」區塊貼上：互動系統網址（這個網站）、互動營隊 ID（' + A.camp + '）、串接金鑰，勾選開啟後儲存。'),
      h('li', null, '回到這裡按「立即同步名單」。之後每小時會自動同步。')),
    h('div', { class: 'grid2' }, field('報名系統網址', regUrl), field('報名系統專案代碼', regPrefix)),
    h('div', { class: 'kv' }, h('span', null, '互動營隊 ID'), h('code', null, A.camp), h('span', null, '互動系統網址'), h('code', null, A.frontBase()), h('span', null, '串接金鑰'), h('span', null, I.secretSet ? '已產生（看不到內容；重新產生後要到報名系統更新）' : '尚未產生'), h('span', null, '上次同步'), h('span', null, I.lastSync ? fmt(I.lastSync) : '尚未同步')),
    secretBox,
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn primary', onclick: function (e) { busy(e.target, function () { return A.op('camp.settings', { data: { regUrl: regUrl.value, regPrefix: regPrefix.value } }); }).then(function () { toast('已儲存'); A.reload(); }, function () {}); } }, '儲存'),
      h('button', { class: 'btn', onclick: function (e) {
        confirmBox('產生串接金鑰', I.secretSet ? '重新產生後，舊金鑰立刻失效，報名系統那邊要貼上新的金鑰才能繼續同步與進入。' : '金鑰只會顯示一次，請馬上貼到報名系統。', '產生').then(function (ok) {
          if (!ok) return;
          A.op('camp.settings', { data: { newSecret: true } }).then(function (x) {
            clear(secretBox).appendChild(h('div', { class: 'fb-notice col' }, h('b', null, '串接金鑰（只顯示這一次）'), h('code', { style: { fontSize: '16px', wordBreak: 'break-all' } }, x.secret),
              h('div', null, h('button', { class: 'btn sm', onclick: function () { navigator.clipboard.writeText(x.secret).then(function () { toast('已複製'); }); } }, '複製'))));
            A.reload();
          }, fail);
        });
      } }, I.secretSet ? '重新產生串接金鑰' : '產生串接金鑰'),
      h('button', { class: 'btn', onclick: function (e) {
        busy(e.target, function () { return A.op('pkg.data', { action: 'run', target: { pkg: 'people', op: 'sync' } }); }).then(function (x) { toast('已同步：學員 ' + x.total + ' 位（更新 ' + x.changed + '）、專輔隨輔 ' + (x.staff || 0) + ' 位、房間 ' + (x.rooms || 0) + ' 間'); A.reload().then(function () { A.route(); }); }, function () {});
      } }, '立即同步（學員、小隊、專輔隨輔、分房）'))));

  // 備份
  var bk = h('div', { class: 'card col section' }, h('h2', null, '備份與復原'), h('div', { class: 'empty loading' }, '載入中…'));
  m.appendChild(bk);
  var loadBk = function () {
    api('getBackups', A.camp).then(function (r) {
      clear(bk).appendChild(h('h2', null, '備份與復原'));
      var freq = sel([{ value: 'off', label: '不自動備份' }, { value: 'daily', label: '每天' }, { value: 'weekly', label: '每週' }], r.settings.freq), keep = inp(r.settings.keep, { type: 'number', min: 1, max: 30 });
      bk.appendChild(h('div', { class: 'row wrap', style: { alignItems: 'flex-end' } }, h('div', { style: { width: '160px' } }, field('自動整庫備份', freq)), h('div', { style: { width: '120px' } }, field('保留份數', keep)),
        h('button', { class: 'btn', onclick: function (e) { busy(e.target, function () { return A.op('camp.settings', { data: { backup: { freq: freq.value, keep: Number(keep.value) } } }); }).then(function () { toast('已儲存'); }, function () {}); } }, '儲存備份設定'),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn primary', onclick: function (e) { busy(e.target, function () { return A.op('backup.create', { data: { note: '手動備份' } }); }).then(function () { toast('已建立備份'); loadBk(); }, function () {}); } }, '立即備份')));
      bk.appendChild(h('div', { class: 'hint' }, '復原不會覆蓋現有檔案：系統會先替目前的資料再備份一次，再把選的備份複製成新的營隊資料庫並改用它，原本的檔案保留在雲端硬碟。'));
      if (!r.list.length) { bk.appendChild(h('div', { class: 'empty' }, '還沒有備份')); return; }
      bk.appendChild(h('div', { class: 'tbl-wrap' }, h('table', { class: 't' }, h('thead', null, h('tr', null, ['時間', '種類', '說明', '到期', ''].map(function (x) { return h('th', null, x); }))),
        h('tbody', null, r.list.map(function (b) {
          return h('tr', null, h('td', null, fmt(b.at)), h('td', null, { full: '手動', auto: '定時', migration: '遷移前（' + b.pkg + '）' }[b.kind] || b.kind), h('td', { class: 'small' }, b.note), h('td', { class: 'small' }, b.expires ? fmt(b.expires) : '依保留份數'),
            h('td', null, h('div', { class: 'row', style: { gap: '4px' } }, h('button', { class: 'btn sm', onclick: function () { restore(b); } }, '復原'), h('button', { class: 'btn sm ghost', onclick: function () {
              confirmBox('刪除備份', '刪除 ' + fmt(b.at) + ' 的' + (b.kind === 'migration' ? '「' + b.pkg + '」遷移前' : '') + '備份？刪除後無法再用它復原。', '刪除', true).then(function (ok) {
                if (ok) A.op('backup.delete', { target: { backup: b.id }, data: { confirm: b.id } }).then(function () { toast('已刪除'); loadBk(); }, fail);
              });
            } }, '刪除'))));
        })))));
    }, fail);
  };
  var restore = function (b) {
    var nm = inp('', { placeholder: I.name });
    modal({ title: '復原到 ' + fmt(b.at), body: h('div', { class: 'col' }, h('div', { class: 'fb-notice' }, '復原後，這個時間之後的修改都不會出現在營隊資料庫裡（原本的檔案仍保留）。所有人的編輯鎖會被釋放。'), field('請輸入營隊名稱「' + I.name + '」確認', nm)),
      actions: [{ text: '取消' }, { text: '復原', cls: 'danger', onClick: function () {
        return op('backup.restore', { target: { camp: A.camp, backup: b.id }, data: { confirmName: nm.value } }).then(function () { toast('已復原'); loadBk(); });
      } }] });
  };
  loadBk();

  var ended = I.status === 'ended';
  m.appendChild(h('div', { class: 'card col section' }, h('h2', null, '營隊狀態'), h('div', { class: 'hint' }, ended ? '營隊已結束（回憶模式）。重新開啟後可以再修改資料。' : '營隊結束後進入回憶模式：前台保留內容、資料不能再改，未使用的邀請碼全部失效。'),
    h('div', null, h('button', { class: 'btn ' + (ended ? 'primary' : 'danger'), onclick: function () {
      confirmBox(ended ? '重新開啟營隊' : '結束營隊', ended ? '重新開啟後資料可以再修改。' : '確定要結束「' + I.name + '」嗎？', ended ? '重新開啟' : '結束營隊', !ended).then(function (ok) {
        if (ok) A.op('camp.status', { data: { status: ended ? 'active' : 'ended' } }).then(function () { A.reload().then(A.route); }, fail);
      });
    } }, ended ? '重新開啟營隊' : '結束營隊'))));
};

/* ---------------- Package 管理 ---------------- */
A.views.packages = function (m) {
  A.title(m, 'Package 管理', '營隊不能改 Package 程式，但可以調整設定。更新一律在新副本上進行：準備 → 測試環境測試 → 專案管理員正式採用；舊版副本保留。');
  var box = h('div');
  m.appendChild(box);
  var load = function () { A.reload().then(function () { render(A.pkgs); A.navBuild(); }, fail); };
  var STATUS = { active: '使用中', standby: '待更新', old: '舊版（保留）', failed: '初始化失敗' };
  function render(P) {
    clear(box);
    var installed = {};
    P.installed.forEach(function (s) { installed[s.pkg] = s; });
    P.repo.forEach(function (r) {
      var s = installed[r.id];
      var cur = s && s.instances.filter(function (i) { return i.inst === s.active; })[0];
      var latest = r.versions[r.versions.length - 1];
      var card = h('div', { class: 'card col section' });
      card.appendChild(h('div', { class: 'row wrap' }, h('h2', { class: 'grow' }, r.name, h('span', { class: 'tag', style: { marginLeft: '6px' } }, r.category === 'activity' ? '活動 Package' : '資訊模組'),
        cur ? h('span', { class: 'tag ok', style: { marginLeft: '6px' } }, 'v' + cur.version) : h('span', { class: 'tag', style: { marginLeft: '6px' } }, '未安裝'),
        s && s.maintenance ? h('span', { class: 'tag warn', style: { marginLeft: '6px' } }, '🔧 維護中') : null),
        cur && cur.version !== latest.version && s.canEdit ? h('button', { class: 'btn primary sm', onclick: function () { prepare(r, s, latest.version); } }, '更新到 v' + latest.version) : null,
        !s || !s.active ? h('button', { class: 'btn primary sm', disabled: !P.canInstall, onclick: function () { install(r); } }, '安裝') : null));
      card.appendChild(h('div', { class: 'muted small' }, r.description));
      if (s && s.reason && s.maintenance) card.appendChild(h('div', { class: 'fb-notice small' }, '維護原因：' + s.reason));
      if (s) {
        var acts = h('div', { class: 'row wrap' });
        if (s.active && s.canEdit) {
          acts.appendChild(h('a', { class: 'btn sm', href: '#data/' + r.id }, '資料'));
          acts.appendChild(h('a', { class: 'btn sm', href: '#data/' + r.id + '/config' }, '設定'));
          if (!s.maintenance) acts.appendChild(h('button', { class: 'btn sm', onclick: function () {
            askText('設為模組維護', '原因', '', { hint: s.maintenanceMode === 'safe' ? '維護中仍可查看聯絡資訊、送出切結書（安全模式）' : '維護中前台這個功能會變成唯讀' }).then(function (reason) {
              if (reason !== null) A.op('pkg.maintenance.enter', { target: { pkg: r.id }, data: { reason: reason } }).then(load, fail);
            });
          } }, '設為維護'));
          else acts.appendChild(h('button', { class: 'btn sm', onclick: function () { release(r, s); } }, '解除維護'));
        }
        card.appendChild(acts);
        var others = s.instances.filter(function (i) { return i.inst !== s.active; });
        if (others.length) card.appendChild(h('div', { class: 'tbl-wrap' }, h('table', { class: 't' }, h('tbody', null, others.map(function (i) {
          var t = i.test;
          return h('tr', null, h('td', null, 'v' + i.version), h('td', null, STATUS[i.status] || i.status), h('td', { class: 'small' }, t ? (t.ok ? '✅ 測試通過 ' + fmt(t.at) : '❌ 測試未通過 ' + fmt(t.at)) : (i.status === 'standby' ? '尚未測試' : '')),
            h('td', null, h('div', { class: 'row', style: { gap: '4px' } },
              i.status === 'standby' ? h('button', { class: 'btn sm', onclick: function () { test(r, i); } }, '測試') : null,
              i.status === 'standby' && t && t.ok && P.isAdmin ? h('button', { class: 'btn sm primary', onclick: function () { apply(r, i); } }, '正式採用') : null,
              P.isAdmin ? h('button', { class: 'btn sm ghost', onclick: function () {
                confirmBox('刪除副本', '刪除 v' + i.version + ' 的程式副本？營隊資料與歷史不會刪除。', '刪除', true).then(function (ok) { if (ok) A.op('pkg.copy.delete', { target: { inst: i.inst } }).then(load, fail); });
              } }, '刪除副本') : null)));
        })))));
        if (s.migrations.length) card.appendChild(h('details', null, h('summary', { class: 'small', style: { cursor: 'pointer' } }, '資料遷移紀錄（' + s.migrations.length + '）'), s.migrations.map(function (g) {
          return h('div', { class: 'small row', style: { padding: '4px 0' } }, h('span', { class: 'grow' }, fmt(g.started) + '　v' + g.from + ' → v' + g.to + '　' + g.done + '／' + g.total + '　' + ({ success: '✅ 完成', failed: '❌ 失敗', pending: '⏸ 中斷（可續跑）', running: '進行中' }[g.status] || g.status) + (g.error ? '　' + g.error : '')),
            g.status === 'pending' && P.isAdmin ? h('button', { class: 'btn sm primary', onclick: function (e) { busy(e.target, function () { return A.op('pkg.migration.resume', { target: { migration: g.id } }); }).then(function (x) { toast(x.applied ? '遷移完成，已採用新版' : '仍未完成：' + x.error); load(); }, function () {}); } }, '接續遷移') : null);
        })));
      }
      box.appendChild(card);
    });
  }
  function install(r) {
    var v = sel(r.versions.slice().reverse().map(function (x) { return { value: x.version, label: 'v' + x.version + (x.changelog ? '　' + x.changelog.slice(0, 30) : '') }; }), r.versions[r.versions.length - 1].version);
    modal({ title: '安裝「' + r.name + '」', body: h('div', { class: 'col' }, field('版本', v)), actions: [{ text: '取消' }, { text: '安裝', cls: 'primary', onClick: function () { return A.op('pkg.install', { data: { pkg: r.id, version: v.value } }).then(function () { toast('已安裝'); load(); }); } }] });
  }
  function prepare(r, s, to) {
    A.op('pkg.update.prepare', { data: { pkg: r.id, version: to } }).then(function (x) {
      var CH = { added: '新增', 'default': '預設值改變', removed: '移除' };
      modal({ title: '準備更新 v' + x.from + ' → v' + x.to, wide: true, body: h('div', { class: 'col' },
        h('div', null, h('b', null, '更新內容：'), x.changelog || '（沒有說明）'),
        h('div', null, h('b', null, '資料結構：'), x.compat.schemaFrom === x.compat.schemaTo ? '不變' : x.compat.schemaFrom + ' → ' + x.compat.schemaTo + '（遷移步驟：' + x.compat.steps.join('、') + '）'),
        x.migration ? h('div', null, h('b', null, '遷移方式：'), x.migration.strategy === 'resume' ? '中斷時保留進度、修復後接續' : '失敗時整批取消', x.migration.backup ? '；遷移前會先備份（保留 ' + (x.migration.backupDays || 14) + ' 天）' : '') : null,
        x.diff.length ? h('div', null, h('b', null, '設定差異'), h('div', { class: 'tbl-wrap' }, h('table', { class: 't' }, h('tbody', null, x.diff.map(function (d) { return h('tr', null, h('td', null, d.label), h('td', null, CH[d.change]), h('td', { class: 'small' }, d.change === 'removed' ? '目前值：' + JSON.stringify(d.current) : '新預設：' + JSON.stringify(d.newDefault))); }))))) : h('div', { class: 'muted' }, '設定欄位沒有差異（你的設定會沿用）'),
        h('div', { class: 'hint' }, '新版副本已建立（待更新）。下一步先在測試環境用合成資料測試，不會碰到正式資料。')),
        actions: [{ text: '稍後' }, { text: '開始測試', cls: 'primary', onClick: function () { load(); test(r, { inst: x.inst, version: x.to }); } }] });
      load();
    }, fail);
  }
  function test(r, i) {
    var m2 = modal({ title: '測試 v' + i.version, sticky: true, body: h('div', { class: 'empty' }, '正在建立測試環境並執行…（約需數十秒）') });
    A.op('pkg.update.test', { target: { inst: i.inst } }).then(function (t) {
      m2.close();
      modal({ title: t.ok ? '✅ 測試通過' : '❌ 測試未通過', body: h('div', { class: 'col' }, h('ul', { style: { margin: 0, paddingLeft: '20px' } }, t.log.map(function (l) { return h('li', null, l); })),
        t.checks.length ? h('details', null, h('summary', null, '測試資料的檢查結果（' + t.checks.length + '）'), t.checks.map(function (c) { return h('div', { class: 'small' }, (c.type === 'warning' ? '⚠️ ' : '💡 ') + c.text); })) : null,
        t.ok ? h('div', { class: 'hint' }, A.pkgs.isAdmin ? '可以正式採用了。' : '請專案管理員到「Package 管理」正式採用。') : null),
        actions: t.ok && A.pkgs.isAdmin ? [{ text: '稍後' }, { text: '正式採用', cls: 'primary', onClick: function () { apply(r, i); } }] : [{ text: '關閉' }] });
      load();
    }, function (e) { m2.close(); fail(e); });
  }
  function apply(r, i) {
    confirmBox('正式採用 v' + i.version, h('div', { class: 'col' }, h('div', null, '依新版的遷移規則轉換「' + r.name + '」的資料，完成後切換到新版；舊版副本保留。'), h('div', { class: 'hint' }, '已發布的學員端／工作人員端不會自動改變，需要時請重新發布。')), '正式採用').then(function (ok) {
      if (!ok) return;
      A.op('pkg.update.apply', { target: { inst: i.inst }, data: { confirm: true } }).then(function (x) {
        if (x.applied) toast('已更新到 v' + x.version + (x.maintenance ? '（健康檢查有問題，已設為維護）' : ''));
        else if (x.rolledBack) toast('遷移失敗，已全部回復：' + x.error, true);
        else if (x.pending) toast('遷移中斷（' + x.done + '／' + x.total + '），已設為維護，修復後可接續', true);
        load();
      }, fail);
    });
  }
  function release(r, s) {
    A.op('pkg.maintenance.release', { target: { pkg: r.id }, data: {} }).then(function (x) {
      if (x.released) { toast('已解除維護'); load(); return; }
      var list = (x.problems || []).map(function (p) { return h('li', null, (p.unsafe ? '❌ ' : '💡 ') + p.text); });
      if (!x.needConfirm) { modal({ title: '還不能解除維護', body: h('ul', null, list) }); return; }
      confirmBox('解除維護', h('div', { class: 'col' }, h('div', null, '系統檢查沒有發現阻擋的問題。請確認資料正常後再解除。'), list.length ? h('ul', null, list) : null), '確認解除').then(function (ok) {
        if (ok) A.op('pkg.maintenance.release', { target: { pkg: r.id }, data: { confirm: true } }).then(function () { toast('已解除維護'); load(); }, fail);
      });
    }, fail);
  }
  render(A.pkgs);
};
