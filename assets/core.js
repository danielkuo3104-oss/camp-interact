/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/* 共用程式：API、操作協定、畫面小工具（彈窗、確認、提示、圖示） */

var IA = { token: null, user: null, onAuth: null };

/** token：一般登入存 sessionStorage；勾「保持登入」存 localStorage */
function store(key, val, persist) {
  try {
    if (val === undefined) return sessionStorage.getItem(key) || localStorage.getItem(key);
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
    if (val !== null) (persist ? localStorage : sessionStorage).setItem(key, val);
  } catch (e) { return null; }
}
function jget(key, dflt) { try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : dflt; } catch (e) { return dflt; } }
function jset(key, v) { try { if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }

var NO_TOKEN_ = { login: 1, registerWithInvite: 1, workerLogin: 1, studentEnter: 1, campPublicInfo: 1 };

/**
 * 呼叫 Apps Script 後端（text/plain 避免 CORS 預檢）。錯誤帶 code：AUTH／LOCK／CONFLICT／NET
 * Apps Script 偶爾會回 404、回到健康檢查（沒有 result）或連不上：自動重試 3 次（操作有 op_id，重送不會重複執行）。
 * 同時最多送 3 個請求，其他的排隊，避免一次打太多讓 Apps Script 忙不過來。
 */
var API_Q_ = { busy: 0, wait: [] };
function apiSlot_() { return new Promise(function (ok) { if (API_Q_.busy < 3) { API_Q_.busy++; netState_(); ok(); } else API_Q_.wait.push(ok); }); }
function apiFree_() { var n = API_Q_.wait.shift(); if (n) n(); else API_Q_.busy--; netState_(); }
/** 右下角的小轉圈：有請求在跑就顯示，讓人知道系統還在動 */
function netState_() {
  var el = document.getElementById('netBusy');
  if (!el && document.body) { el = document.createElement('div'); el.id = 'netBusy'; el.className = 'net-busy'; el.innerHTML = '<span class="spin"></span><span class="tx">連線中…</span>'; document.body.appendChild(el); }
  if (!el) return;
  clearTimeout(API_Q_.t);
  if (API_Q_.busy > 0) API_Q_.t = setTimeout(function () { el.classList.add('on'); }, 250);   // 很快就回來的不閃
  else el.classList.remove('on', 'retry');
}
function apiOnce_(url, body) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body, redirect: 'follow' }).then(function (r) {
    if (!r.ok) throw Object.assign(new Error('連線失敗（HTTP ' + r.status + '）'), { code: 'NET', retry: r.status === 404 || r.status === 429 || r.status >= 500 });
    return r.json().catch(function () { throw Object.assign(new Error('伺服器回應看不懂，請稍後再試'), { code: 'NET', retry: true }); });
  }, function () {
    throw Object.assign(new Error('無法連線到伺服器，請檢查網路'), { code: 'NET', retry: true });
  }).then(function (j) {
    if (j && j.ok && !('result' in j)) throw Object.assign(new Error('伺服器暫時沒有正確回應，請稍後再試'), { code: 'NET', retry: true });
    return j;
  });
}
function api(name) {
  var args = Array.prototype.slice.call(arguments, 1);
  if (!NO_TOKEN_[name]) args = [IA.token].concat(args);
  var url = window.INTERACT_CONFIG && INTERACT_CONFIG.API_URL;
  if (!url || /請填入/.test(url)) return Promise.reject(Object.assign(new Error('尚未設定後端網址：請編輯 assets/config.js 的 API_URL'), { code: 'SETUP' }));
  var body = JSON.stringify({ fn: name, args: args }), tries = 0;
  function go() {
    return apiOnce_(url, body).catch(function (e) {
      if (!e.retry || tries >= 3) throw e;
      tries++;
      var el = document.getElementById('netBusy'); if (el) { el.classList.add('on', 'retry'); el.querySelector('.tx').textContent = '連線不穩，重試第 ' + tries + ' 次…'; }
      return new Promise(function (ok) { setTimeout(ok, 700 * Math.pow(2, tries - 1)); }).then(go);
    });
  }
  return apiSlot_().then(go).then(function (j) {
    apiFree_();
    var el = document.getElementById('netBusy'); if (el) el.querySelector('.tx').textContent = '連線中…';
    if (j.ok) return j.result;
    var msg = String(j.error || '發生錯誤').replace(/^(Exception|Error):\s*/, '');
    var m = msg.match(/^(AUTH|LOCK|CONFLICT):/);
    var err = new Error(m ? msg.slice(m[0].length) : msg);
    if (m) err.code = m[1];
    if (err.code === 'AUTH' && IA.onAuth) { IA.onAuth(err); return new Promise(function () {}); }
    throw err;
  }, function (e) { apiFree_(); throw e; });
}

/**
 * 看過的畫面不用再等：先用上次的資料馬上畫出來，背景再抓最新的，有變才重畫。
 * 資料放在記憶體與這個分頁的 sessionStorage（關掉分頁就清掉）。show(資料, 是否最新) 可能被呼叫兩次。
 */
var API_CACHE_ = {};
function apiCacheKey_(name, args) { return 'ia_c|' + ((IA.user && IA.user.email) || '') + '|' + name + '|' + JSON.stringify(args); }
function apiCacheGet(name, args) {
  var k = apiCacheKey_(name, args), j = API_CACHE_[k];
  if (j === undefined) { try { j = sessionStorage.getItem(k) || undefined; } catch (e) {} }
  return j === undefined ? null : JSON.parse(j);
}
function apiCachePut(name, args, d) {
  var k = apiCacheKey_(name, args), j = JSON.stringify(d);
  API_CACHE_[k] = j;
  try { sessionStorage.setItem(k, j); } catch (e) { try { sessionStorage.removeItem(k); } catch (e2) {} }
  return j;
}
function apiCached(name, args, show) {
  var hit = apiCacheGet(name, args), old = hit ? JSON.stringify(hit) : null;
  if (hit) show(hit, false);
  return api.apply(null, [name].concat(args)).then(function (d) {
    if (apiCachePut(name, args, d) !== old) show(d, true);
    return d;
  }, function (e) {
    if (hit) { toast('無法更新，畫面是上次的資料：' + e.message, true); return hit; }   // 已經有畫面，就不要整頁變成錯誤
    throw e;
  });
}

/** 操作協定：kind → [階段代碼, 預設動作] */
var OPK = {
  'user.password': ['member', 'update'], 'camp.create': ['camp', 'create'], 'camp.settings': ['camp', 'update'], 'camp.status': ['camp', 'update'], 'camp.upgrade': ['system', 'run'], 'system.reglink': ['system', 'update'],
  'member.add': ['member', 'create'], 'member.pkgGrant': ['member', 'create'], 'member.perms': ['member', 'update'], 'member.revoke': ['member', 'delete'],
  'member.closeCollabs': ['member', 'update'], 'member.leave': ['member', 'delete'], 'invite.create': ['member', 'create'], 'invite.redeem': ['member', 'create'],
  'notify.read': ['event', 'update'], 'event.mark': ['event', 'update'],
  'draft.autosave': ['draft', 'update'], 'draft.save': ['save', 'update'], 'draft.restore': ['save', 'restore'], 'side.publish': ['publish', 'replace'],
  'template.save': ['save', 'create'], 'template.apply': ['save', 'create'],
  'lock.acquire': ['lock', 'create'], 'lock.ping': ['lock', 'update'], 'lock.release': ['lock', 'delete'],
  'pkglock.ping': ['lock', 'update'], 'pkglock.release': ['lock', 'delete'], 'pkglock.take': ['lock', 'update'],
  'handoff.request': ['lock', 'create'], 'handoff.accept': ['lock', 'update'], 'handoff.reject': ['lock', 'update'],
  'pkg.install': ['package', 'create'], 'pkg.config': ['package', 'update'], 'pkg.data': ['data', 'update'],
  'pkg.update.prepare': ['package', 'create'], 'pkg.update.test': ['package', 'run'], 'pkg.update.apply': ['package', 'replace'],
  'pkg.migration.resume': ['package', 'run'], 'pkg.copy.delete': ['package', 'delete'], 'pkg.maintenance.enter': ['package', 'update'], 'pkg.maintenance.release': ['package', 'update'],
  'backup.create': ['backup', 'create'], 'backup.delete': ['backup', 'delete'], 'backup.restore': ['backup', 'restore'],
  'front.action': ['front', 'create']
};

function rid(prefix, n) {
  var cs = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', out = prefix || '';
  var a = new Uint32Array(n || 16);
  (window.crypto || window.msCrypto).getRandomValues(a);
  for (var i = 0; i < a.length; i++) out += cs[a[i] % cs.length];
  return out;
}

/**
 * 送出一個操作：o = {camp, action, target, data, ver}。
 * 同一個邏輯操作只產生一次 op_id；網路斷線時用同一個 ID 重試，伺服器保證不會重複執行。
 */
function op(kind, o) {
  o = o || {};
  var def = OPK[kind];
  if (!def) return Promise.reject(new Error('前端不認得的操作：' + kind));
  var req = { op_id: rid('op', 20), camp_id: o.camp || '', stage: def[0], action: o.action || def[1], kind: kind, target: o.target || {}, data: o.data || {} };
  if (o.ver !== undefined && o.ver !== null) req.expected_version = o.ver;
  var tries = 0;
  function go() {
    return api('op', req).then(function (r) { return r.result; }, function (e) {
      if (e.code === 'NET' && tries < 1) { tries++; return new Promise(function (ok) { setTimeout(ok, 1000 * Math.pow(2, tries - 1)); }).then(go); }
      throw e;
    });
  }
  return go();
}

/* ---------------- DOM 小工具 ---------------- */
function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

/** h('div', {class:'x', onclick: fn}, '文字', node, [陣列]) */
function h(tag, props) {
  var el = document.createElement(tag);
  props = props || {};
  Object.keys(props).forEach(function (k) {
    var v = props[k];
    if (v === undefined || v === null || v === false) return;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'readOnly') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  });
  var add = function (c) {
    if (c === undefined || c === null || c === false) return;
    if (Array.isArray(c)) { c.forEach(add); return; }
    el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  };
  for (var i = 2; i < arguments.length; i++) add(arguments[i]);
  return el;
}
function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/** 簡單的 Markdown：段落、換行、**粗體**、[文字](網址)、「- 」清單；先跳脫再轉換，不會插入任意 HTML */
function md(text) {
  var safeUrl = function (u) { return /^(https?:|mailto:|tel:)/i.test(u) ? u : '#'; };
  var inline = function (s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, t, u) { return '<a href="' + esc(safeUrl(u.replace(/&amp;/g, '&'))) + '" target="_blank" rel="noopener">' + t + '</a>'; });
  };
  return String(text || '').split(/\n{2,}/).map(function (para) {
    var lines = para.split('\n');
    if (lines.every(function (l) { return /^\s*[-•]\s+/.test(l); })) return '<ul>' + lines.map(function (l) { return '<li>' + inline(l.replace(/^\s*[-•]\s+/, '')) + '</li>'; }).join('') + '</ul>';
    return '<p>' + lines.map(inline).join('<br>') + '</p>';
  }).join('');
}

function toast(msg, bad) {
  var root = $('.toast-root') || document.body.appendChild(h('div', { class: 'toast-root', role: 'status', 'aria-live': 'polite' }));
  var t = root.appendChild(h('div', { class: 'toast' + (bad ? ' bad' : '') }, msg));
  setTimeout(function () { t.remove(); }, bad ? 5200 : 2600);
}
function fail(e) { toast(e && e.message ? e.message : String(e), true); }

/**
 * 彈窗：modal({title, body, wide, actions:[{text, cls, onClick(close) → 回傳 false 不關閉，或 Promise}], onClose})
 */
function modal(o) {
  var bg = h('div', { class: 'modal-bg' });
  var box = h('div', { class: 'modal' + (o.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title || '' });
  var close = function () { bg.remove(); document.removeEventListener('keydown', onKey); if (o.onClose) o.onClose(); };
  var onKey = function (e) { if (e.key === 'Escape' && !o.sticky) close(); };
  document.addEventListener('keydown', onKey);
  box.appendChild(h('div', { class: 'modal-head' }, h('h2', null, o.title || ''), o.sticky ? null : h('button', { class: 'btn ghost sm', onclick: close, 'aria-label': '關閉' }, '✕')));
  var body = h('div', { class: 'modal-body' }, o.body);
  box.appendChild(body);
  if (o.actions && o.actions.length) {
    var foot = h('div', { class: 'modal-foot' });
    o.actions.forEach(function (a) {
      var b = h('button', { class: 'btn ' + (a.cls || '') }, a.text);
      b.addEventListener('click', function () {
        if (!a.onClick) { close(); return; }
        var r = a.onClick(close, b);
        if (r && r.then) {
          b.disabled = true;
          r.then(function (v) { b.disabled = false; if (v !== false) close(); }, function (e) { b.disabled = false; fail(e); });
        } else if (r !== false) close();
      });
      foot.appendChild(b);
    });
    box.appendChild(foot);
  }
  bg.appendChild(box);
  if (!o.sticky) bg.addEventListener('mousedown', function (e) { if (e.target === bg) close(); });
  document.body.appendChild(bg);
  var first = box.querySelector('.modal-body input, .modal-body select, .modal-body textarea');
  if (first) setTimeout(function () { first.focus(); }, 30);
  return { close: close, el: box, body: body };
}

function confirmBox(title, text, okText, danger) {
  return new Promise(function (ok) {
    modal({ title: title, body: h('div', { class: 'col' }, typeof text === 'string' ? h('p', { style: { margin: 0 } }, text) : text), onClose: function () { ok(false); },
      actions: [{ text: '取消' }, { text: okText || '確定', cls: danger ? 'danger' : 'primary', onClick: function () { ok(true); } }] });
  });
}

function askText(title, label, dflt, opt) {
  opt = opt || {};
  return new Promise(function (ok) {
    var inp = h(opt.multi ? 'textarea' : 'input', { class: 'input', value: dflt || '', placeholder: opt.placeholder || '' });
    var done = false;
    var m = modal({ title: title, body: h('label', { class: 'field' }, h('span', null, label), inp, opt.hint ? h('span', { class: 'hint' }, opt.hint) : null),
      onClose: function () { if (!done) ok(null); },
      actions: [{ text: '取消' }, { text: opt.okText || '確定', cls: 'primary', onClick: function () { done = true; ok(inp.value); } }] });
    if (!opt.multi) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { done = true; ok(inp.value); m.close(); } });
  });
}

/** 按鈕執行期間鎖住，錯誤顯示提示 */
function busy(btn, fn) {
  if (btn) btn.disabled = true;
  var p;
  try { p = Promise.resolve(fn()); } catch (e) { p = Promise.reject(e); }
  return p.then(function (v) { if (btn) btn.disabled = false; return v; }, function (e) { if (btn) btn.disabled = false; fail(e); throw e; });
}

/* ---------------- 欄位小工具 ---------------- */
function field(label, input, hint) { return h('label', { class: 'field' }, h('span', null, label), input, hint ? h('span', { class: 'hint' }, hint) : null); }
function inp(value, attrs) { return h('input', Object.assign({ class: 'input', value: value === undefined || value === null ? '' : value }, attrs || {})); }
function area(value, attrs) { var t = h('textarea', Object.assign({ class: 'input' }, attrs || {})); t.value = value || ''; return t; }
function sel(options, value, attrs) {
  var s = h('select', Object.assign({ class: 'input' }, attrs || {}));
  options.forEach(function (o) {
    if (typeof o !== 'object') o = { value: o, label: o };
    s.appendChild(h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label));
  });
  return s;
}
/** 多選小圓片：items=[{value,label}]，回傳 {el, get()} */
function chips(items, selected) {
  var on = {};
  (selected || []).forEach(function (v) { on[String(v)] = 1; });
  var el = h('div', { class: 'chips' });
  items.forEach(function (it) {
    var c = h('span', { class: 'chip' + (on[String(it.value)] ? ' on' : ''), role: 'checkbox', tabindex: 0, 'aria-checked': on[String(it.value)] ? 'true' : 'false' }, it.label);
    var flip = function () { var k = String(it.value); if (on[k]) delete on[k]; else on[k] = 1; c.classList.toggle('on', !!on[k]); c.setAttribute('aria-checked', on[k] ? 'true' : 'false'); };
    c.addEventListener('click', flip);
    c.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
    el.appendChild(c);
  });
  if (!items.length) el.appendChild(h('span', { class: 'hint' }, '（沒有可選的項目）'));
  return { el: el, get: function () { return items.map(function (i) { return i.value; }).filter(function (v) { return on[String(v)]; }); } };
}

/**
 * 未儲存提示：el 裡的內容和上次儲存的不一樣時加上 .dirty（橘色框＋「● 尚未儲存」），儲存成功後呼叫 saved()（綠色「✓ 已儲存」）。
 * get() 回傳目前的內容；status 是要放在儲存按鈕旁邊的小標籤。onDirty(第一次改動) 用來取得 Package 編輯鎖。
 */
var DIRTY_ = [];
function dirtyTrack(el, get, o) {
  o = o || {};
  var base = JSON.stringify(get()), was = false;
  var status = h('span', { class: 'dirty-status' }, h('span', { class: 'd-on' }, '● 尚未儲存'), h('span', { class: 'd-ok' }, '✓ 已儲存'));
  var t = {
    el: el, status: status, btn: o.btn || null,
    isDirty: function () { return el.isConnected && JSON.stringify(get()) !== base; },
    check: function () {
      var d = t.isDirty();
      el.classList.toggle('dirty', d);
      if (d) el.classList.remove('saved');
      if (o.btn) o.btn.classList.toggle('primary', DIRTY_.some(function (x) { return x.btn === o.btn && x.isDirty(); }));
      if (d && !was && o.onDirty) o.onDirty();
      was = was || d;
      return d;
    },
    saved: function () { base = JSON.stringify(get()); el.classList.remove('dirty'); el.classList.add('saved'); if (o.btn) o.btn.classList.toggle('primary', DIRTY_.some(function (x) { return x.btn === o.btn && x.isDirty(); })); setTimeout(function () { el.classList.remove('saved'); }, 3000); }
  };
  ['input', 'change', 'click', 'keyup'].forEach(function (ev) { el.addEventListener(ev, function () { setTimeout(t.check, 0); }); });
  t.fresh = true;   // 剛建立、還沒放進畫面的也要留著
  setTimeout(function () { t.fresh = false; }, 0);
  DIRTY_ = DIRTY_.filter(function (x) { return x.fresh || x.el.isConnected; });
  DIRTY_.push(t);
  return t;
}
function dirtyAny() { return DIRTY_.filter(function (t) { return t.isDirty(); }).length; }
window.addEventListener('beforeunload', function (e) { if (dirtyAny()) { e.preventDefault(); e.returnValue = ''; } });

/** 這個瀏覽器分頁的識別碼（編輯鎖用：同一人開兩個分頁，第二個唯讀） */
function pageTab() {
  var t = '';
  try { t = sessionStorage.getItem('ia_tab') || ''; if (!t) { t = rid('', 16); sessionStorage.setItem('ia_tab', t); } } catch (e) { t = rid('', 16); }
  return t;
}

/* ---------------- 時間 ---------------- */
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function fmt(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
/** 營隊所在地（台灣）的今天與現在時間，不受手機時區影響 */
function taipei(d) {
  var p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d || new Date()).forEach(function (x) { p[x.type] = x.value; });
  return { ymd: p.year + '-' + p.month + '-' + p.day, hm: p.hour + ':' + p.minute };
}
var WEEK_ = ['日', '一', '二', '三', '四', '五', '六'];
function dayLabel(ymd) {
  var d = new Date(ymd + 'T12:00:00+08:00');
  if (isNaN(d)) return ymd;
  return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '（' + WEEK_[d.getUTCDay()] + '）';
}
function param(k) { return new URLSearchParams(location.search).get(k) || ''; }

/* ---------------- 圖示（線條 SVG） ---------------- */
var ICON_PATHS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0',
  sos: 'M12 3l9 16H3zM12 10v4m0 3v.5',
  flag: 'M5 21V4m0 0h11l-2 4 2 4H5',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-13v5l3 2',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 10a7 7 0 0 1 14 0m1-10a3 3 0 0 0 0-6m5 16a6 6 0 0 0-4-5.6',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zm4 4h4',
  back: 'M15 5l-7 7 7 7',
  page: 'M6 3h9l4 4v14H6zM14 3v5h5',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14m6-12v14',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-10v6m0-9v.5'
};
function icon(name, size) {
  var s = size || 20;
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + (ICON_PATHS[name] || ICON_PATHS.page) + '"/></svg>';
  return h('span', { class: 'ico', html: svg, style: { display: 'inline-flex' } });
}
var ICON_CHOICES = ['home', 'user', 'sos', 'flag', 'more', 'clock', 'users', 'page', 'star', 'moon', 'phone', 'map', 'info'];
