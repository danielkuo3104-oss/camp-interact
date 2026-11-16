/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/** 登入頁（index.html）：原本寫在頁面裡，搬出來才能用內容安全政策擋掉頁面內插入的程式 */
homeName('管理', '');
(function () {
  var next = param('next') || 'camps.html';
  if (!/^[\w.-]+\.html(\?[\w=&%.-]*)?$/.test(next)) next = 'camps.html';
  if (param('msg')) $('#msg').textContent = param('msg');
  IA.token = store('ia_token');
  IA.onAuth = function () { store('ia_token', null); IA.token = null; };
  // 邀請連結（index.html?invite=代碼）：已登入直接加入；沒登入的人登入或建立帳號後自動加入
  var invite = String(param('invite') || '').trim().toUpperCase();
  var redeem = function () {
    return op('invite.redeem', { data: { code: invite } }).then(function (r) { location.replace('admin.html?c=' + encodeURIComponent(r.campId)); },
      function (err) { $('#msg').textContent = err.message; invite = ''; });
  };
  if (invite) {
    $('#code').value = invite;
    $('#code').closest('label').classList.add('hidden');
    $('#join .hint').textContent = '你收到營隊的協作邀請。還沒有帳號就在這裡建立；已經有帳號請切到「登入」，登入後會自動加入。';
    $('[data-tab="join"]').textContent = '建立帳號並加入';
    $('#invite-note').classList.remove('hidden');
  }
  if (IA.token) api('whoami').then(function (u) { if (u && u.email) { if (invite) redeem(); else location.replace(next); } }, function () {});
  $all('[data-tab]').forEach(function (t) {
    var go = function () {
      $all('[data-tab]').forEach(function (x) { x.classList.toggle('on', x === t); });
      $('#login').classList.toggle('hidden', t.dataset.tab !== 'login');
      $('#join').classList.toggle('hidden', t.dataset.tab !== 'join');
      $('#msg').textContent = '';
    };
    t.addEventListener('click', go);
    t.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  $('#login').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = this.querySelector('button');
    $('#msg').textContent = '';
    busy(btn, function () { return api('login', $('#email').value, $('#pw').value, $('#remember').checked); }).then(function (r) {
      store('ia_token', r.token, $('#remember').checked);
      if (r.mustChange) { try { sessionStorage.setItem('ia_must_pw', '1'); } catch (e) {} }
      IA.token = r.token;
      if (invite) redeem(); else location.replace(next);
    }, function (err) { $('#msg').textContent = err.message; });
  });
  // 忘記密碼：臨時密碼寄到帳號的信箱
  $('#forgot').addEventListener('click', function () {
    var em = inp($('#email').value, { type: 'email', autocomplete: 'username' });
    modal({ title: '忘記密碼', body: h('div', { class: 'col' }, field('帳號的信箱', em), h('div', { class: 'hint' }, '會寄一組臨時密碼到這個信箱，1 小時內有效。用臨時密碼登入後，系統會請你設定新密碼。')),
      actions: [{ text: '取消' }, { text: '寄出臨時密碼', cls: 'primary', onClick: function () {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em.value.trim())) { toast('請填正確的信箱', true); return false; }
        return api('forgotPassword', em.value.trim()).then(function (r) {
          $('#email').value = em.value.trim(); $('#pw').value = '';
          $('#msg').textContent = '';
          toast('如果這個信箱有帳號，臨時密碼已經寄出（' + r.minutes + ' 分鐘內有效），也看一下垃圾郵件');
        });
      } }] });
  });
  $('#join').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = this.querySelector('button'), code = $('#code').value.trim().toUpperCase();
    $('#msg').textContent = '';
    busy(btn, function () {
      return api('registerWithInvite', code, $('#jemail').value, $('#jname').value, $('#jpw').value).then(function (r) {
        store('ia_token', r.token);
        IA.token = r.token;
        return op('invite.redeem', { data: { code: code } });
      });
    }).then(function (r) { location.replace('admin.html?c=' + encodeURIComponent(r.campId)); }, function (err) { $('#msg').textContent = err.message; });
  });
})();
