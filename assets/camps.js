/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/* 我的營隊：列表、建立營隊（系統終端）、輸入邀請碼、系統操作紀錄 */
(function () {
  var ROLE = { root: '系統終端', admin: '專案管理員', manager: '協作管理員', collab: '協作者', pkg: '活動協作' };
  var camps = [];

  Staff.init().then(function (u) {
    $('#top').appendChild(Staff.topbar('我的營隊'));
    if (u.isRoot) ['#create', '#syslog', '#upgrade'].forEach(function (s) { $(s).classList.remove('hidden'); });
    load();
  });

  function load() {
    api('listCamps').then(function (list) {
      camps = list;
      var el = clear($('#list'));
      if (!list.length) { el.appendChild(h('div', { class: 'card empty', style: { gridColumn: '1/-1' } }, IA.user.isRoot ? '還沒有營隊，按右上角「建立營隊」開始。' : '你目前沒有加入任何營隊。拿到邀請碼後按「輸入邀請碼」。')); return; }
      el.style.gridTemplateColumns = 'repeat(auto-fill, minmax(260px, 1fr))';
      list.forEach(function (c) {
        el.appendChild(h('a', { class: 'card col', href: 'admin.html?c=' + encodeURIComponent(c.campId), style: { textDecoration: 'none', color: 'inherit', gap: '6px' } },
          h('div', { class: 'row' }, h('h2', { class: 'grow' }, c.name), c.status === 'ended' ? h('span', { class: 'tag info' }, '已結束') : h('span', { class: 'tag ok' }, '進行中')),
          h('div', { class: 'muted small' }, (c.start || '未設定日期') + (c.end ? ' ～ ' + c.end : '')),
          h('div', { class: 'row small' }, h('span', { class: 'tag brand' }, ROLE[c.role] || c.role), h('span', { class: 'muted' }, c.campId), c.upgrade === 'failed' ? h('span', { class: 'tag bad' }, '資料庫升級失敗') : null)));
      });
    }, fail);
  }

  $('#redeem').addEventListener('click', function () {
    askText('輸入邀請碼', '邀請碼', '', { placeholder: 'XXXX-XXXX', hint: '邀請碼只能使用一次；新的邀請碼產生後，舊的就失效。' }).then(function (code) {
      if (!code) return;
      op('invite.redeem', { data: { code: code.trim().toUpperCase() } }).then(function (r) { toast('已加入'); location.href = 'admin.html?c=' + encodeURIComponent(r.campId); }, fail);
    });
  });

  $('#create').addEventListener('click', function () {
    var name = inp(''), start = inp('', { type: 'date' }), end = inp('', { type: 'date' });
    var admins = area('', { rows: 3, placeholder: 'leader@example.com, 王小明' });
    var from = sel([{ value: '', label: '不複製（使用系統預設模板）' }].concat(camps.map(function (c) { return { value: c.campId, label: c.name + '（' + c.campId + '）' }; })), '');
    var cpPages = h('input', { type: 'checkbox', checked: true }), cpData = h('input', { type: 'checkbox' });
    var oldSb = h('input', { type: 'checkbox' });
    var copyBox = h('div', { class: 'col hidden' }, h('label', { class: 'check' }, cpPages, h('span', null, '複製兩端的頁面與區塊')), h('label', { class: 'check' }, cpData, h('span', null, '也複製各 Package 的資料（人員、流程…）')));
    from.addEventListener('change', function () { copyBox.classList.toggle('hidden', !from.value); });
    modal({ title: '建立營隊', body: h('div', { class: 'col' },
      field('營隊名稱', name), h('div', { class: 'grid2' }, field('開始日期', start), field('結束日期', end)),
      field('專案管理員（每行一位：信箱, 名稱）', admins, '還沒有帳號的人會自動建立帳號，初始密碼會顯示在下一步'),
      field('從既有營隊複製', from), copyBox,
      h('label', { class: 'check' }, oldSb, h('span', null, '示範用：「團隊計分」先裝舊版 1.0.0，之後可以練習 Package 更新流程'))),
      actions: [{ text: '取消' }, { text: '建立', cls: 'primary', onClick: function () {
        var list = admins.value.split(/\n/).map(function (l) { var p = l.split(/[,，]/).map(function (x) { return x.trim(); }); return p[0] ? { email: p[0], name: p[1] || p[0] } : null; }).filter(Boolean);
        var data = { name: name.value, start: start.value, end: end.value, admins: list };
        if (from.value) { data.copyFrom = from.value; data.copy = { pages: cpPages.checked, data: cpData.checked ? ['people', 'schedule', 'studentflow', 'emergency', 'scoreboard'] : [] }; }
        else if (oldSb.checked) data.versions = { scoreboard: '1.0.0' };
        return op('camp.create', { data: data }).then(function (r) {
          var made = (r.admins || []).filter(function (a) { return a.password; });
          modal({ title: '營隊已建立', body: h('div', { class: 'col' }, h('div', null, '營隊 ID：', h('b', null, r.campId)),
            made.length ? h('div', { class: 'col' }, h('div', { class: 'hint' }, '以下是新建立帳號的初始密碼，只會顯示這一次，請轉交本人並請他登入後修改：'),
              h('div', { class: 'tbl-wrap' }, h('table', { class: 't' }, h('tbody', null, made.map(function (a) { return h('tr', null, h('td', null, a.email), h('td', null, h('code', null, a.password))); }))))) : null),
            actions: [{ text: '進入營隊', cls: 'primary', onClick: function () { location.href = 'admin.html?c=' + encodeURIComponent(r.campId); } }] });
          load();
        });
      } }] });
  });

  $('#syslog').addEventListener('click', function () {
    api('getOpLog', '', { limit: 200 }).then(function (r) {
      modal({ title: '系統操作紀錄（保留 ' + r.retentionDays + ' 天）', wide: true, body: h('div', { class: 'tbl-wrap', style: { maxHeight: '60vh' } }, h('table', { class: 't' },
        h('thead', null, h('tr', null, ['時間', '操作者', '類型', '對象', '結果'].map(function (x) { return h('th', null, x); }))),
        h('tbody', null, r.rows.map(function (x) { return h('tr', null, h('td', null, fmt(x.at)), h('td', null, x.actor), h('td', null, x.kind), h('td', { class: 'small' }, x.target), h('td', null, x.result === 'ok' ? h('span', { class: 'tag ok' }, '成功') : h('span', { class: 'tag bad', title: x.error }, '失敗：' + x.error))); })))) });
    }, fail);
  });

  $('#upgrade').addEventListener('click', function () {
    confirmBox('升級營隊資料庫', '把所有營隊的資料庫補上新版需要的活頁與欄位。已是最新的營隊會跳過；失敗的營隊會標示出來，可以再按一次重試。', '開始升級').then(function (ok) {
      if (!ok) return;
      op('camp.upgrade').then(function (r) { toast('完成：' + r.filter(function (x) { return x.result === 'ok'; }).length + ' 個成功、' + r.filter(function (x) { return x.result !== 'ok'; }).length + ' 個失敗'); load(); }, fail);
    });
  });
})();
