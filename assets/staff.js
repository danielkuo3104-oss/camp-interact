/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/* 編輯者頁面共用：登入檢查、頂部列、帳號選單 */

var Staff = {
  init: function () {
    IA.token = store('ia_token');
    IA.onAuth = function (e) {
      store('ia_token', null);
      location.href = 'index.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search) + '&msg=' + encodeURIComponent(e && e.message || '請重新登入');
    };
    if (!IA.token) { IA.onAuth({ message: '請先登入' }); return Promise.reject(new Error('未登入')); }
    return api('whoami').then(function (u) {
      IA.user = u;
      // 剛用臨時密碼登入：請他馬上設定新密碼
      var must = false; try { must = sessionStorage.getItem('ia_must_pw') === '1'; sessionStorage.removeItem('ia_must_pw'); } catch (e) {}
      if (must) setTimeout(function () { Staff.changePassword(true); }, 300);
      return u;
    });
  },
  logout: function () {
    api('logout').catch(function () {}).then(function () { store('ia_token', null); location.href = 'index.html'; });
  },
  changePassword: function (forced) {
    var o = inp('', { type: 'password', autocomplete: 'current-password' }), n = inp('', { type: 'password', autocomplete: 'new-password' }), n2 = inp('', { type: 'password', autocomplete: 'new-password' });
    modal({ title: forced === true ? '請設定新密碼' : '修改密碼', body: h('div', { class: 'col' }, forced === true ? h('div', { class: 'hint' }, '你是用臨時密碼登入的，請設定自己的新密碼。「目前的密碼」填信裡的臨時密碼。') : null, field('目前的密碼', o), field('新密碼（至少 8 個字）', n), field('再輸入一次新密碼', n2)),
      actions: [{ text: '取消' }, { text: '修改', cls: 'primary', onClick: function () {
        if (n.value !== n2.value) { toast('兩次輸入的新密碼不一樣', true); return false; }
        return op('user.password', { data: { oldPw: o.value, newPw: n.value } }).then(function () { toast('密碼已修改'); });
      } }] });
  },
  userMenu: function () {
    var u = IA.user || {};
    var btn = h('button', { class: 'btn sm' }, u.name || u.email || '帳號');
    btn.addEventListener('click', function () {
      modal({ title: u.name || '帳號', body: h('div', { class: 'col' }, h('div', { class: 'muted' }, u.email + (u.isRoot ? '（系統終端）' : '')),
        h('button', { class: 'btn', onclick: Staff.changePassword }, '修改密碼'),
        h('a', { class: 'btn', href: 'camps.html' }, '我的營隊'),
        h('button', { class: 'btn danger', onclick: Staff.logout }, '登出')) });
    });
    return btn;
  },
  topbar: function (crumb, extra) {
    return h('header', { class: 'topbar' }, h('a', { class: 'brand', href: 'camps.html' }, h('span', { class: 'brand-mark' }, '營'), h('span', { class: 'hide-sm' }, '營隊互動系統')),
      crumb ? h('span', { class: 'crumb' }, crumb) : null, h('span', { class: 'grow' }), extra || null, Staff.userMenu());
  }
};
