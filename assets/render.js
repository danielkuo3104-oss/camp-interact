/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 前台畫面（學員端／工作人員端）的區塊與 Package 畫面。前台和管理端的手機預覽共用這一份，看到的就是發布後的樣子。
 * env = { pages, blocks, packages(快照裡各 Package 的發布資料), live({區塊ID: 動態資料}), side, me, nav(pageId), action(pkg, name, data), preview }
 */

var Front = (function () {
  function kids(env, pageId) {
    return env.pages.filter(function (p) { return p.parent === pageId; }).sort(function (a, b) { return a.ord - b.ord; });
  }
  function pageById(env, id) { return env.pages.filter(function (p) { return p.id === id; })[0]; }
  function blocksOf(env, pageId) { return env.blocks.filter(function (b) { return b.page === pageId; }).sort(function (a, b) { return a.ord - b.ord; }); }

  function videoEmbed(url) {
    var m = String(url || '').match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
    return m ? 'https://www.youtube.com/embed/' + m[1] : '';
  }
  function okUrl(u) { return /^(https?:|mailto:|tel:)/i.test(String(u || '')); }

  function linkBtn(text, cls, d, env) {
    if (d.page) return h('button', { class: 'btn ' + cls, onclick: function () { env.nav(d.page); } }, text);
    if (okUrl(d.url)) return h('a', { class: 'btn ' + cls, href: d.url, target: /^https?:/i.test(d.url) ? '_blank' : null, rel: 'noopener' }, text);
    return h('button', { class: 'btn ' + cls, disabled: true }, text + '（尚未設定）');
  }

  /** 一般區塊 */
  function block(b, env) {
    var d = b.data || {};
    switch (b.type) {
      case 'heading': return h(d.level === 3 ? 'h3' : 'h2', { style: { margin: '6px 4px 0' } }, d.text || '');
      case 'text': return h('div', { class: 'fb' }, h('div', { class: 'rich', html: md(d.md) }));
      case 'image': return okUrl(d.url) ? h('div', { class: 'fb', style: { padding: '8px' } }, h('img', { src: d.url, alt: d.alt || '', loading: 'lazy' }), d.caption ? h('div', { class: 'small muted', style: { padding: '6px 6px 0' } }, d.caption) : null) : (env.preview ? h('div', { class: 'maint' }, '（圖片還沒放網址）') : null);
      case 'video': {
        var em = videoEmbed(d.url);
        if (em) return h('div', { class: 'fb', style: { padding: '8px' } }, h('div', { class: 'vid' }, h('iframe', { src: em, title: d.title || '影片', allow: 'encrypted-media; picture-in-picture', allowfullscreen: true, loading: 'lazy' })), d.title ? h('div', { class: 'small muted', style: { padding: '6px 6px 0' } }, d.title) : null);
        return okUrl(d.url) ? h('div', { class: 'fb' }, h('a', { href: d.url, target: '_blank', rel: 'noopener' }, d.title || '觀看影片')) : null;
      }
      case 'map': {
        var q = String(d.query || '').trim();
        if (!q) return env.preview ? h('div', { class: 'maint' }, '（地圖還沒填地點）') : null;
        return h('div', { class: 'fb', style: { padding: '8px' } },
          h('div', { class: 'vid' }, h('iframe', { src: 'https://www.google.com/maps?q=' + encodeURIComponent(q) + '&output=embed', title: '地圖：' + q, loading: 'lazy' })),
          h('div', { class: 'row', style: { padding: '8px 4px 0' } }, h('span', { class: 'grow small' }, d.label || q), h('a', { class: 'btn sm', href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q), target: '_blank', rel: 'noopener' }, '開啟導航')));
      }
      case 'link': return h('div', { class: 'fb row' }, icon('page'), h('div', { class: 'grow' }, okUrl(d.url) ? h('a', { href: d.url, target: '_blank', rel: 'noopener' }, d.text || d.url) : h('span', { class: 'muted' }, (d.text || '連結') + '（尚未設定網址）')));
      case 'button': return h('div', { class: 'fb-btn' }, linkBtn(d.text || '按鈕', 'primary', d, env));
      case 'list': {
        var items = (d.items || []).filter(function (x) { return String(x).trim(); });
        return h('div', { class: 'fb' }, h(d.ordered ? 'ol' : 'ul', { style: { margin: 0, paddingLeft: '20px' } }, items.map(function (x) { return h('li', null, x); })));
      }
      case 'table': {
        var rows = (d.rows || []).filter(function (r) { return r.some(function (c) { return String(c).trim(); }); });
        if (!rows.length) return null;
        var head = d.header !== false ? rows[0] : null, body = d.header !== false ? rows.slice(1) : rows;
        return h('div', { class: 'fb', style: { padding: '6px' } }, h('div', { style: { overflowX: 'auto' } }, h('table', { class: 't' },
          head ? h('thead', null, h('tr', null, head.map(function (c) { return h('th', null, c); }))) : null,
          h('tbody', null, body.map(function (r) { return h('tr', null, r.map(function (c) { return h('td', null, c); })); })))));
      }
      case 'divider': return h('hr', { class: 'fb-div' });
      case 'pagelink': {
        var p = pageById(env, d.page);
        if (!p) return env.preview ? h('div', { class: 'maint' }, '（連到的頁面不存在或還沒公開）') : null;
        return h('button', { class: 'fb row', style: { width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }, onclick: function () { env.nav(p.id); } },
          icon(p.icon || 'page'), h('span', { class: 'grow', style: { fontWeight: 700 } }, d.text || p.title), h('span', { class: 'muted' }, '›'));
      }
      case 'notice': return h('div', { class: 'fb-notice', html: md(d.text) });
      case 'pkg': return pkgBlock(b, env);
    }
    return null;
  }

  function pkgBlock(b, env) {
    var d = b.data || {}, data = env.live[b.id];
    var meta = env.packages && env.packages[d.pkg];
    if (meta && meta.missing) return env.preview ? h('div', { class: 'maint' }, '（「' + d.pkg + '」尚未安裝）') : null;
    var view = (VIEWS[d.pkg] || {})[d.view];
    if (!view) return env.preview ? h('div', { class: 'maint' }, '（不認得的 Package 畫面：' + d.pkg + '／' + d.view + '）') : null;
    if (d.pkg !== 'studentflow') {
      if (data === undefined) return h('div', { class: 'fb sk', 'aria-busy': 'true' }, h('span', { class: 'sk-tx' }, '載入中…'), h('i', { class: 'sk-l' }), h('i', { class: 'sk-l s' }));
      if (data && data.maintenance === true) return h('div', { class: 'maint' }, '這個功能維護中，稍後再回來看看');
      if (data && data.error) return blockErr(env, d, data.detail || data.error);
    }
    try {
      var node = view(data || {}, b, env, meta && meta.data);
      if (node && data && data.maintenance && data.maintenance !== true) return h('div', { class: 'col', style: { gap: '6px' } }, h('div', { class: 'small muted', style: { padding: '0 6px' } }, '這個功能維護中，內容可能不是最新的'), node);
      return node;
    } catch (e) {
      return blockErr(env, d, '畫面：' + (e && e.message || e));
    }
  }
  /** 區塊出錯：學員只看到一句話；工作人員端與預覽另外顯示原因，方便回報 */
  function blockErr(env, d, why) {
    var show = env.preview || env.side === 'worker';
    return h('div', { class: 'maint' }, '這個區塊暫時無法顯示', show && why ? h('div', { class: 'small muted', style: { marginTop: '4px', wordBreak: 'break-all' } }, '原因（' + d.pkg + '／' + d.view + '）：' + String(why).slice(0, 200)) : null);
  }

  /** 照片：依 pos（x、y 百分比、z 放大）裁切，套 frame 外框（circle 圓形、ring 圓形外圈、rounded 圓角、square 方形、hex 六角形、wide 橫幅） */
  var FRAMES = { circle: '圓形', ring: '圓形＋外圈', rounded: '圓角方形', square: '方形', hex: '六角形' };
  function photo(url, pos, frame, size) {
    pos = pos || {};
    var x = pos.x == null ? 50 : pos.x, y = pos.y == null ? 50 : pos.y, z = pos.z || 1;
    var img = h('img', { src: url, alt: '', loading: 'lazy', draggable: false, style: { objectPosition: x + '% ' + y + '%', transform: z !== 1 ? 'scale(' + z + ')' : '', transformOrigin: x + '% ' + y + '%' } });
    var box = h('div', { class: 'ph ph-' + (frame === 'wide' || FRAMES[frame] ? frame : 'circle') }, img);
    if (size) { box.style.width = size + 'px'; if (frame !== 'wide') box.style.height = size + 'px'; }
    return box;
  }
  /* ---------------- 活動卡片 ----------------
   * 每個活動一張卡片：封面（活動列表、現在主題）＋點開的詳細。標題和時間固定在最上面，其他元件照設定的順序、置左中右。
   * info = 後端 actInfo_：{id, name, summary, page, times:[{date,time,end}], place, myrot:[{t,st}], card}
   */
  var ACT_GRADS = [['石墨藍', '#5d6f7b', '#36444e'], ['灰綠', '#6e7f73', '#45554b'], ['霧紫', '#77708a', '#4b465a'], ['暖灰棕', '#86796c', '#574d44'],
    ['灰藍', '#6a7d8d', '#40505f'], ['墨綠', '#5d7268', '#374a41'], ['乾燥玫瑰', '#866d71', '#594548'], ['米杏（淺色）', '#e2ddd3', '#c4bbac']];
  var ACT_ELS = { text: '文字（格式工具列）', sub: '副標題', summary: '活動簡介', when: '時間', sessions: '所有時段', place: '地點', button: '按鈕', myrot: '我的小隊關卡順序', divider: '分隔線', image: '圖片', spacer: '空白' };
  var ACT_VARS = ['姓名', '小隊', '活動名稱', '時間', '地點'];
  function actHash(id) { var n = 0; String(id || '').split('').forEach(function (c) { n = (n * 31 + c.charCodeAt(0)) % 9973; }); return n; }
  /** 沒設定過卡片的活動：依活動挑一個預設漸層（淺色那個不自動挑），內容放簡介、時間、地點、資源包 */
  function actDefault(info) {
    return { bg: { type: 'grad' }, h: 'md', fg: '', theme: true,
      cover: info.summary ? [{ t: 'summary', al: 'l' }] : [],
      detail: [{ t: 'summary', al: 'l' }, { t: 'divider', al: 'l' }, { t: 'sessions', al: 'l' }, { t: 'place', al: 'l' }, { t: 'myrot', al: 'l' }, { t: 'button', al: 'c', go: 'res', text: '' }] };
  }
  function actCardOf(info) { var c = info.card; return c && (c.cover || c.detail) ? c : Object.assign(actDefault(info), c && c.theme === false ? { theme: false } : {}); }
  function actGrad(c, id) {
    var b = c.bg || {};
    if (b.g === -1) return { a: b.a || '#4a5d6a', b: b.b || '#2e3b44', ang: b.ang == null ? 135 : b.ang };
    var g = ACT_GRADS[b.g >= 0 && b.g < ACT_GRADS.length ? b.g : actHash(id) % (ACT_GRADS.length - 1)];
    return { a: g[1], b: g[2], ang: 135 };
  }
  /** 文字顏色：有指定用指定的；圖片看遮罩；漸層看底色深淺 */
  function actFg(c, id) {
    if (c.fg) return c.fg;
    var b = c.bg || {};
    if (b.type === 'img') return b.mask === 'light' && b.mk >= 0.25 ? '#1d2521' : '#ffffff';
    var g = actGrad(c, id);
    return RT.textOn(g.a) === '#111111' && RT.textOn(g.b) === '#111111' ? '#1d2521' : '#ffffff';
  }
  /** 時間、地點前面的線條小圖示 */
  function mi(name, text) { return h('span', { class: 'mi' }, icon(name === 'place' ? 'pin' : 'clock', 14), h('span', null, text)); }
  function md2(d) { var m = String(d || '').match(/^\d{4}-(\d{2})-(\d{2})$/); return m ? Number(m[1]) + '/' + Number(m[2]) : ''; }
  function hm0(t) { return String(t || '').replace(/^0(\d):/, '$1:'); }
  function actTime(t, noDate) { return t ? [noDate ? '' : md2(t.date), hm0(t.time) + (t.end ? '–' + hm0(t.end) : '')].filter(String).join('　') : ''; }
  function actBg(c, id) {
    var b = c.bg || {}, layer = h('div', { class: 'ac-bg' });
    if (b.type === 'img' && okUrl(b.img)) {
      var p = b.pos || {}, x = p.x == null ? 50 : p.x, y = p.y == null ? 50 : p.y, z = p.z || 1;
      layer.appendChild(h('img', { src: b.img, alt: '', loading: 'lazy', draggable: false, style: { objectPosition: x + '% ' + y + '%', transform: z !== 1 ? 'scale(' + z + ')' : '', transformOrigin: x + '% ' + y + '%' } }));
      var mk = b.mk == null ? 0.45 : b.mk, bl = b.bl || 0;
      var mask = h('div', { class: 'ac-mask' });
      if (b.mask !== 'none') mask.style.background = (b.mask === 'light' ? 'rgba(250,250,246,' : 'rgba(16,20,24,') + mk + ')';
      if (bl) { mask.style.backdropFilter = 'blur(' + bl + 'px)'; mask.style.webkitBackdropFilter = 'blur(' + bl + 'px)'; }
      return [layer, mask];
    }
    var g = actGrad(c, id);
    layer.style.background = 'linear-gradient(' + g.ang + 'deg, ' + g.a + ', ' + g.b + ')';
    return [layer];
  }
  function actVars(info, env) {
    var me = (env && env.me) || {};
    return { '姓名': me.name || '', '小隊': me.squad !== '' && me.squad != null ? '第 ' + me.squad + ' 小隊' : '', '活動名稱': info.name || '', '時間': actTime((info.times || [])[0]), '地點': info.place || '' };
  }
  /** 一個元件；回傳 null＝這次沒東西可顯示（例如沒有地點） */
  function actEl(e, info, env, ctx) {
    var t = (info.times || [])[0], node = null, dark = ctx.fg !== '#1d2521';
    var btn = function (text, fn, href) {
      var b = href ? h('a', { class: 'ac-btn', href: href, target: '_blank', rel: 'noopener' }, text) : h('button', { type: 'button', class: 'ac-btn' }, text);
      if (fn) b.addEventListener('click', function (ev) { ev.stopPropagation(); fn(); });
      else b.addEventListener('click', function (ev) { ev.stopPropagation(); });
      return b;
    };
    switch (e.t) {
      case 'text': if (String(e.md || '').trim()) node = h('div', { class: 'rt', html: RT.html(e.md, actVars(info, env), { btn: dark ? '#ffffff' : '#2f5d62', notes: ctx.edit }) }); break;
      case 'sub': if (e.text) node = h('div', { class: 'ac-sub' }, e.text); break;
      case 'summary': if (info.summary) node = h('div', { class: 'ac-sum' }, info.summary); break;
      case 'when': if (t) node = h('div', { class: 'ac-meta' }, mi('time', (t.date ? dayLabel(t.date) + ' ' : '') + hm0(t.time) + (t.end ? '–' + hm0(t.end) : ''))); break;
      case 'sessions':
        if ((info.times || []).length) node = h('div', { class: 'ac-meta' }, info.times.length > 1 ? h('div', { class: 'ac-lbl' }, '時段') : null, info.times.map(function (x) { return h('div', null, mi('time', (x.date ? dayLabel(x.date) + ' ' : '') + hm0(x.time) + (x.end ? '–' + hm0(x.end) : ''))); }));
        break;
      case 'place': if (info.place) node = h('div', { class: 'ac-meta' }, mi('place', info.place)); break;
      case 'myrot':
        if ((info.myrot || []).length) node = h('div', { class: 'ac-meta' }, h('div', { class: 'ac-lbl' }, '我們小隊的關卡順序'), h('ol', { class: 'ac-rot' }, info.myrot.map(function (r) { return h('li', null, r.t ? h('span', { class: 'ac-rt' }, r.t) : null, r.st); })));
        break;
      case 'button': {
        var go = e.go || 'res', label = e.text;
        if (go === 'res') { if (info.page || ctx.edit) node = btn(label || '活動資源', info.page ? function () { closeAct(); env.nav(info.page); } : null); }
        else if (go === 'map') { var q = e.q || info.place; if (q) node = btn(label || '地圖', null, 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q)); else if (ctx.edit) node = btn(label || '地圖（還沒有地點）'); }
        else if (go === 'page') { if (e.page && (pageById(env, e.page) || ctx.edit)) node = btn(label || '前往', function () { closeAct(); env.nav(e.page); }); }
        else if (okUrl(e.url)) node = btn(label || '前往', null, e.url);
        else if (ctx.edit) node = btn((label || '連結') + '（還沒填網址）');
        if (node) node = h('div', { class: 'ac-btns' }, node);
        break;
      }
      case 'divider': node = h('hr', { class: 'ac-hr', style: e.c ? { borderTopColor: e.c, opacity: 1 } : null }); break;
      case 'image': if (okUrl(e.img)) node = h('img', { class: 'ac-img', src: e.img, alt: '', loading: 'lazy', style: { width: (e.r || 100) + '%' } }); break;
      case 'spacer': node = h('div', { style: { height: (e.n || 16) + 'px' } }); break;
    }
    return node ? h('div', { class: 'ac-el al-' + (e.al || 'l') + (ctx.edit ? ' ed' : ''), 'data-i': ctx.i }, node) : null;
  }
  /**
   * 活動卡片。mode：cover 封面、detail 點開的詳細、theme 現在主題（封面樣式＋「現在主題」字樣）
   * o = { label 現在主題那一行, edit 編輯預覽（空的元件也顯示提示）, card 用這份設定（編輯中） }
   */
  function actCard(info, env, mode, o) {
    o = o || {};
    var c = o.card || actCardOf(info), fg = actFg(c, info.id), t = (info.times || [])[0];
    var el = h('div', { class: 'ac ac-' + mode + ' ac-h-' + (c.h || 'md') + (fg === '#1d2521' ? ' light' : '') + ((c.bg || {}).type === 'img' && (c.bg.mask === 'none' || (c.bg.mk || 0) < 0.25) ? ' shade' : ''), style: { color: fg } }, actBg(c, info.id));
    var inner = h('div', { class: 'ac-in' });
    if (mode === 'theme') inner.appendChild(h('div', { class: 'ac-k' }, h('i', { class: 'live-dot', 'aria-hidden': 'true' }), o.label || '現在主題'));
    var title = h(mode === 'detail' ? 'h2' : 'h3', { class: 'ac-title' }, mode === 'theme' ? waveText(info.name || '') : info.name || '');
    inner.appendChild(h('div', { class: 'ac-top' }, title, mode === 'detail' && t ? h('div', { class: 'ac-when' }, actTime(t, false)) : null));
    var list = (mode === 'detail' ? c.detail : c.cover) || [];
    list.forEach(function (e, i) { var n = actEl(e, info, env, { fg: fg, edit: o.edit, i: i }); if (n) inner.appendChild(n); });
    if (mode === 'cover' && (t || !o.noChev)) inner.appendChild(h('div', { class: 'ac-foot' }, t ? h('span', { class: 'ac-when' }, actTime(t, false)) : null, h('span', { class: 'ac-chev' }, '›')));
    if (mode === 'theme') { if (o.prog) inner.appendChild(o.prog); inner.appendChild(h('div', { class: 'ac-foot' }, h('span', { class: 'ac-chev' }, '查看活動 ›'))); }
    el.appendChild(inner);
    if (mode !== 'detail' && !o.edit) el.addEventListener('click', function () { openAct(info, env, el); });
    return el;
  }
  /** 現在主題的標題：每個字輪流跳一下 */
  function waveText(s) {
    return h('span', { class: 'wave' }, Array.from(String(s)).map(function (ch, i) { return h('span', { style: '--d:' + i }, ch); }));
  }
  /** 現在主題的進度條：已經進行多久、還剩幾分鐘（有結束時間才有；每 30 秒自己更新） */
  function themeProg(d) {
    if (!/^\d\d:\d\d$/.test(d.time || '') || !/^\d\d:\d\d$/.test(d.end || '')) return null;
    var day = taipei(nowDate()).ymd, s0 = Date.parse(day + 'T' + d.time + ':00+08:00'), e0 = Date.parse(day + 'T' + d.end + ':00+08:00');
    if (e0 <= s0) e0 += 86400000;
    var fill = h('i'), txt = h('span'), box = h('div', { class: 'th-prog' }, h('div', { class: 'th-bar' }, fill), txt);
    var upd = function () {
      var t = nowDate().getTime(), p = Math.max(0, Math.min(1, (t - s0) / (e0 - s0))), left = Math.ceil((e0 - t) / 60000);
      fill.style.width = (p * 100).toFixed(1) + '%';
      txt.textContent = t < s0 ? '還沒開始' : left > 0 ? '還有 ' + (left >= 60 ? Math.floor(left / 60) + ' 小時 ' + (left % 60 ? left % 60 + ' 分' : '') : left + ' 分鐘') : '快結束了';
    };
    upd();
    var iv = setInterval(function () { if (!box.isConnected) { if (box.dataset.seen) clearInterval(iv); return; } box.dataset.seen = 1; upd(); }, 30000);
    return box;
  }
  /** 點開活動卡片：蓋在畫面上（管理端手機預覽時蓋在手機框裡） */
  var ACT_SHEET = null;
  function closeAct() {
    var sh = ACT_SHEET;
    if (!sh) return;
    ACT_SHEET = null;
    if (!motionOk()) { sh.remove(); return; }
    sh.classList.add('out');
    setTimeout(function () { sh.remove(); }, 200);
  }
  /** 往下滑關掉活動卡片（卡片捲到最上面時才算） */
  function swipeClose(sheet, card) {
    var y0 = null, dy = 0;
    sheet.addEventListener('touchstart', function (e) { y0 = sheet.scrollTop <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
    sheet.addEventListener('touchmove', function (e) {
      if (y0 === null) return;
      dy = e.touches[0].clientY - y0;
      if (dy <= 0) { card.style.transform = ''; return; }
      card.style.transition = 'none';
      card.style.transform = 'translateY(' + dy * 0.6 + 'px)';
      sheet.style.backgroundColor = 'rgba(12, 16, 14, ' + Math.max(0.15, 0.5 - dy / 900) + ')';
    }, { passive: true });
    sheet.addEventListener('touchend', function () {
      if (y0 === null) return;
      y0 = null;
      card.style.transition = ''; sheet.style.backgroundColor = '';
      if (dy > 110) closeAct(); else card.style.transform = '';
    });
  }
  function openAct(info, env, from) {
    closeAct();
    var root = (from && from.closest && from.closest('.phone')) || document.body;
    var x = h('button', { type: 'button', class: 'ac-x', 'aria-label': '關閉' }, '✕');
    var sheet = h('div', { class: 'ac-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': info.name || '活動' }, h('div', { class: 'ac-sheet-in' }, x, actCard(info, env, 'detail')));
    sheet.addEventListener('click', function (e) { if (e.target === sheet || e.target === x) closeAct(); });
    var onKey = function (e) { if (e.key === 'Escape') { closeAct(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
    swipeClose(sheet, sheet.firstChild);
    root.appendChild(sheet);
    ACT_SHEET = sheet;
    x.focus();
  }

  var COURSE_LAYOUTS = { list: '清單＋小照片', profile: '講者名片（大頭照）', cover: '封面大圖', plain: '時間軸（不顯示照片）' };
  function courseMins(n) { return n >= 60 ? Math.floor(n / 60) + ' 小時' + (n % 60 ? ' ' + (n % 60) + ' 分' : '') : n + ' 分鐘'; }
  function courseCard(c, lay, by) {
    var pic = c.photo && lay !== 'plain' && okUrl(c.photo);
    var tm = c.start ? c.start + (c.end ? '–' + c.end : '') : '';
    var meta = h('div', { class: 'cs-meta' },
      by === 'date' ? h('span', { class: 'tag' }, c.type) : null,
      (c.date || tm) && lay !== 'plain' ? mi('time', [by === 'date' ? '' : (c.date ? dayLabel(c.date) : ''), tm].filter(String).join(' ')) : null,
      c.dur ? h('span', null, courseMins(c.dur)) : null,
      c.place ? mi('place', c.place) : null);
    var who = c.speaker ? h('div', { class: 'cs-who' }, c.speaker) : null;
    var files = (c.files || []).filter(function (f) { return okUrl(f.url); });
    var more = c.desc || files.length;
    var body = more ? h('div', { class: 'cs-body' }, c.desc ? h('div', { class: 'rich', html: md(c.desc) }) : null,
      files.length ? h('div', { class: 'cs-files' }, files.map(function (f) { return h('a', { class: 'btn sm', href: f.url, target: '_blank', rel: 'noopener' }, (f.kind === 'pdf' ? '📄 ' : f.kind === 'slides' ? '📊 ' : '📎 ') + (f.name || '檔案')); })) : null) : null;
    var head;
    if (lay === 'cover') {
      head = h('div', { class: 'cs-head' }, pic ? photo(c.photo, c.photoPos, 'wide') : null, h('div', { class: 'cs-txt' }, h('div', { class: 'cs-title' }, c.title), who, meta));
    } else if (lay === 'plain') {
      head = h('div', { class: 'cs-head' }, h('div', { class: 'cs-time' }, h('b', null, c.start || '—'), c.end ? h('small', null, c.end) : null), h('div', { class: 'cs-txt' }, h('div', { class: 'cs-title' }, c.title), who, meta));
    } else {
      head = h('div', { class: 'cs-head' }, pic ? photo(c.photo, c.photoPos, c.frame, lay === 'profile' ? 76 : 48) : null, h('div', { class: 'cs-txt' }, h('div', { class: 'cs-title' }, c.title), who, meta));
    }
    if (!more) return h('div', { class: 'cs' }, head);
    return h('details', { class: 'cs' }, h('summary', null, head, h('span', { class: 'cs-chev', 'aria-hidden': 'true' }, '›')), body);
  }
  function hmOf(t, add) { var m = String(t || '').match(/^(\d{1,2}):(\d{2})$/); if (!m) return ''; var n = (Number(m[1]) * 60 + Number(m[2]) + (Number(add) || 0)) % 1440; return pad2(Math.floor(n / 60)) + ':' + pad2(n % 60); }
  /** 日期＋時間 → 毫秒（台北時間） */
  function tms(date, time) { if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{1,2}:\d{2}$/.test(time || '')) return 0; var t = Date.parse(date + 'T' + (time.length === 4 ? '0' + time : time) + ':00+08:00'); return isFinite(t) ? t : 0; }
  /** 標出現在進行中的時程（data-s、data-e），已經過去的變淡；每分鐘重跑一次 */
  function markNow(root) {
    var t = nowDate().getTime();
    $all('[data-s]', root || document).forEach(function (el) {
      var s0 = Number(el.dataset.s), e0 = Number(el.dataset.e) || s0 + 3600000;
      el.classList.toggle('now', s0 <= t && t < e0);
      el.classList.toggle('past', t >= e0);
    });
    // 時程清單裡畫一條「現在」的線：放在第一個還沒開始的項目前面（只在今天有行程的時候）
    $all('.sched', root || document).forEach(function (list) {
      $all('.now-line', list).forEach(function (x) { x.remove(); });
      var its = $all(':scope > .it[data-s]', list), today = taipei().ymd;
      var td = its.filter(function (el) { return taipei(new Date(Number(el.dataset.s))).ymd === today; });
      if (!td.length) return;
      var nx = td.filter(function (el) { return Number(el.dataset.s) > t; })[0];
      var line = h('div', { class: 'now-line' }, nowRun(), h('span', null, nowLabel(nx && Number(nx.dataset.s))));
      if (nx && nx.previousElementSibling && nx.previousElementSibling.classList.contains('par-label')) nx = nx.previousElementSibling;   // 「同時進行」的標題跟著那一組
      if (nx) list.insertBefore(line, nx); else { var last = td[td.length - 1]; last.after(line); }
    });
    // 活動細流的表格（時間表、跑關）也畫一條「現在」的線
    $all('table.dt > tbody', root || document).forEach(function (tb) {
      $all('tr.now-tr', tb).forEach(function (x) { x.remove(); });
      var trs = $all(':scope > tr[data-s]', tb), today = taipei().ymd;
      var td = trs.filter(function (el) { return taipei(new Date(Number(el.dataset.s))).ymd === today; });
      if (!td.length) return;
      var n = 0; $all('td', td[0]).forEach(function (c) { n += Number(c.getAttribute('colspan')) || 1; });
      var nx = td.filter(function (el) { return Number(el.dataset.s) > t; })[0];
      if (nx && trs.indexOf(nx) > 0 && $all('td[rowspan]', tb).some(function (c) { var r0 = trs.indexOf(c.parentNode), rs = Number(c.getAttribute('rowspan')); return r0 >= 0 && r0 < trs.indexOf(nx) && r0 + rs > trs.indexOf(nx); })) return;   // 合併的格子中間不插
      var line = h('tr', { class: 'now-tr' }, h('td', { colspan: n }, nowRun(), h('span', null, nowLabel(nx && Number(nx.dataset.s)))));
      if (nx) tb.insertBefore(line, nx); else td[td.length - 1].after(line);
    });
  }
  /** 時程清單只露出 3–4 項（現在的在中間），可以展開全天 */
  function schedWin(list, win) {
    if (!win) return list;
    var box = h('div', { class: 'sched-win' }, list);
    var btn = h('button', { class: 'btn sm ghost sched-all', type: 'button', onclick: function () {
      var all = box.classList.toggle('all'); btn.textContent = all ? '收起' : '展開全部';
      if (!all) centerNow(box, true);
    } }, '展開全部');
    return h('div', { class: 'sched-wrap' }, box, h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '6px' } }, btn));
  }
  /** 把現在的項目（沒有的話是「現在」的線）捲到視窗中間 */
  function centerNow(root, force) {
    $all('.sched-win', root || document).forEach(function (box) {
      if (box.classList.contains('all') || (!force && box.dataset.centered)) return;
      var n = box.querySelector('.it.now') || box.querySelector('.now-line');
      if (!n) return;
      box.dataset.centered = 1;
      box.scrollTop = Math.max(0, n.offsetTop - box.clientHeight / 2 + n.offsetHeight / 2);
    });
  }
  /** 活動配色：同一個活動永遠同一個顏色（依名稱） */
  var ACT_COLORS = ['#e4efff', '#e3f5e6', '#fff0d2', '#f1e4ff', '#ffe3e8', '#dcf4f1', '#fbe7d7', '#e9ecf8', '#eef5d3', '#e6e1ff', '#fde8f6', '#e0f0fa'];
  function actColor(name) { var x = 0; String(name || '').split('').forEach(function (c) { x = (x * 31 + c.charCodeAt(0)) >>> 0; }); return ACT_COLORS[x % ACT_COLORS.length]; }
  /** 活動細流的格子顏色 */
  var CELL_COLORS = { yellow: '#fff59a', cyan: '#9ff0f3', green: '#d6ecd2', blue: '#d3e3f5', purple: '#ddd5ee', orange: '#fde2c8', pink: '#fbd3e6', red: '#f6c4bf', gray: '#e6e6e6' };

  /** 地圖：底圖＋標點、文字、文字卡片、連線（座標是 0–1 的比例）。o.edit 時每個元素可以拿到 data-id 給編輯器用 */
  var SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs, kids) { var e = document.createElementNS(SVGNS, tag); Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]); }); (kids || []).forEach(function (k) { if (k) e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); }); return e; }
  var MAP_ANGLES = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];
  function mapView(map, o) {
    o = o || {};
    var wrap = h('div', { class: 'map-wrap' }), W = 1000, H = o.aspect ? Math.round(W * o.aspect) : 700;
    var img = h('img', { src: map.img, alt: '地圖', draggable: false });
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'map-svg' });
    wrap.appendChild(img); wrap.appendChild(svg);
    var draw = function () {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      var defs = sv('defs');
      svg.appendChild(defs);
      var byId = {}, items = map.items || [];
      items.forEach(function (x) { if (x.t !== 'line') byId[x.id] = x; });
      var P = function (x, y) { return [x * W, y * H]; };
      var route = function (u) {
        var out = [{ p: u[0], k: 0 }];
        for (var i = 1; i < u.length; i++) {
          var p = out[out.length - 1].p, q = u[i], dx = q[0] - p[0], dy = q[1] - p[1];
          var ang = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
          var near = MAP_ANGLES.reduce(function (m, a) { var d = Math.abs(((ang - a + 540) % 360) - 180); return d < m.d ? { a: a, d: d } : m; }, { a: 0, d: 999 });
          var elbow = null;
          if (near.d > 0.5) {
            // 兩段湊起來：p + s·u1 + t·u2 = q（s、t > 0），取最短的；太小的轉角（< 8）直接畫直線
            var best = null;
            MAP_ANGLES.forEach(function (a1) { MAP_ANGLES.forEach(function (a2) {
              if (a1 === a2) return;
              var u1 = [Math.cos(a1 * Math.PI / 180), Math.sin(a1 * Math.PI / 180)], u2 = [Math.cos(a2 * Math.PI / 180), Math.sin(a2 * Math.PI / 180)];
              var det = u1[0] * u2[1] - u1[1] * u2[0]; if (Math.abs(det) < 1e-6) return;
              var s1 = (dx * u2[1] - dy * u2[0]) / det, t1 = (u1[0] * dy - u1[1] * dx) / det;
              if (s1 <= 0 || t1 <= 0) return;
              var ortho2 = a2 % 90 === 0 ? 0 : 0.01, len = s1 + t1 + ortho2 * (s1 + t1);
              if (!best || len < best.len - 1e-6) best = { len: len, c: [p[0] + s1 * u1[0], p[1] + s1 * u1[1]], small: Math.min(s1, t1) };
            }); });
            if (best && best.small >= 8) elbow = best.c;
          }
          if (elbow) out.push({ p: elbow, k: i - 1 });
          out.push({ p: q, k: i - 1 });
        }
        return out;
      };
      var boxOf = function (x) {
        var fs = 26 * (x.size || 1), lines = String(x.text || '').split('\n');
        if (x.t === 'pin') return { w: 13 * (x.size || 1) + 4, h: 13 * (x.size || 1) + 4 };
        var w = Math.max.apply(null, lines.map(function (ln) { return ln.length; })) * fs;
        return x.t === 'card' ? { w: (w + 34) / 2 + 4, h: (lines.length * fs * 1.2 + 24) / 2 + 4 } : { w: w / 2 + 4, h: lines.length * fs * 0.6 + 4 };
      };
      var edge = function (it, p, q) {
        var dx = q[0] - p[0], dy = q[1] - p[1], d = Math.sqrt(dx * dx + dy * dy); if (!d) return p;
        var b = boxOf(it), t = it.t === 'pin' ? b.w / d : Math.min(dx ? b.w / Math.abs(dx) : Infinity, dy ? b.h / Math.abs(dy) : Infinity);
        t = Math.min(t, 0.45);
        return [p[0] + dx * t, p[1] + dy * t];
      };
      var mk = {};
      var marker = function (c) { var id = 'ar' + c.replace('#', ''); if (!mk[id]) { mk[id] = 1; defs.appendChild(sv('marker', { id: id, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }, [sv('path', { d: 'M0,0 L10,5 L0,10 z', fill: c })])); } return 'url(#' + id + ')'; };
      items.filter(function (x) { return x.t === 'line'; }).forEach(function (x) {
        var a = byId[x.a], b = byId[x.b];
        if (!a || !b) return;
        var c = x.color || '#c62828', user = [P(a.x, a.y)].concat((x.pts || []).map(function (p) { return P(p[0], p[1]); }), [P(b.x, b.y)]);
        // 每一段都只走水平、鉛直或 30°、45°、60°…；不合的自動加一個轉角
        var rt = route(user), pts = rt.map(function (r) { return r.p; });
        // 線頭線尾停在標點／卡片的邊上，箭頭才不會被蓋住
        pts[0] = edge(a, pts[0], pts[1]); pts[pts.length - 1] = edge(b, pts[pts.length - 1], pts[pts.length - 2]);
        var g = sv('g', { 'data-id': o.edit ? x.id : null, class: 'm-line' + (o.sel === x.id ? ' sel' : '') });
        g.appendChild(sv('polyline', { points: pts.map(function (p) { return p.join(','); }).join(' '), fill: 'none', stroke: 'transparent', 'stroke-width': 22 }));
        g.appendChild(sv('polyline', { points: pts.map(function (p) { return p.join(','); }).join(' '), fill: 'none', stroke: c, 'stroke-width': 6, 'stroke-linejoin': 'round', 'stroke-dasharray': x.style === 'dash' ? '4 14' : null, 'stroke-linecap': 'round', 'marker-end': x.arrow !== false ? marker(c) : null }));
        svg.appendChild(g);
        if (o.edit && o.sel === x.id) {
          // 每一段中間有 ＋：按住拖曳就多一個轉折點
          for (var k = 1; k < rt.length; k++) {
            var m0 = [(pts[k - 1][0] + pts[k][0]) / 2, (pts[k - 1][1] + pts[k][1]) / 2];
            if (Math.abs(pts[k][0] - pts[k - 1][0]) + Math.abs(pts[k][1] - pts[k - 1][1]) < 50) continue;
            svg.appendChild(sv('g', { class: 'm-add', 'data-add': x.id + ':' + rt[k].k + ':' + (m0[0] / W) + ':' + (m0[1] / H), transform: 'translate(' + m0[0] + ',' + m0[1] + ')' }, [sv('circle', { r: 10 }), sv('path', { d: 'M-5,0H5M0,-5V5' })]));
          }
          (x.pts || []).forEach(function (p, i) { var q = P(p[0], p[1]); svg.appendChild(sv('circle', { cx: q[0], cy: q[1], r: 11, class: 'm-bend', 'data-bend': x.id + ':' + i })); });
        }
      });
      items.filter(function (x) { return x.t !== 'line'; }).forEach(function (x) {
        var q = P(x.x, x.y), fs = 26 * (x.size || 1), c = x.color || (x.t === 'text' ? '#c62828' : '#c62828');
        var g = sv('g', { 'data-id': o.edit ? x.id : null, class: 'm-it m-' + x.t + (o.sel === x.id ? ' sel' : ''), transform: 'translate(' + q[0] + ',' + q[1] + ')' });
        var lines = String(x.text || '').split('\n');
        if (x.t === 'pin') {
          g.appendChild(sv('circle', { r: 13 * (x.size || 1), fill: c, stroke: '#fff', 'stroke-width': 4 }));
          if (x.text) lines.forEach(function (ln, i) { g.appendChild(sv('text', { x: 20 * (x.size || 1), y: 8 + i * fs * 1.15, 'font-size': fs, 'font-weight': 700, fill: c, class: 'm-halo' }, [ln])); });
        } else if (x.t === 'text') {
          lines.forEach(function (ln, i) { g.appendChild(sv('text', { x: 0, y: i * fs * 1.15, 'font-size': fs, 'font-weight': 700, fill: c, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'm-halo' }, [ln])); });
        } else {
          var w = Math.max.apply(null, lines.map(function (ln) { return ln.length; })) * fs + 34, hh = lines.length * fs * 1.2 + 24;
          g.appendChild(sv('rect', { x: -w / 2, y: -hh / 2, width: w, height: hh, rx: 6, fill: '#fff', 'fill-opacity': 0.9, stroke: c, 'stroke-width': 3 }));
          lines.forEach(function (ln, i) { g.appendChild(sv('text', { x: 0, y: -hh / 2 + 12 + fs * 0.95 + i * fs * 1.2, 'font-size': fs, 'font-weight': 700, fill: c, 'text-anchor': 'middle' }, [ln])); });
        }
        svg.appendChild(g);
      });
    };
    // 外框用 aspect-ratio 撐開：底圖還沒載好（或載不到）也能畫、能編輯
    var fit = function () { if (img.naturalWidth) { var nh = Math.round(W * img.naturalHeight / img.naturalWidth); if (nh !== H) { H = nh; wrap.style.aspectRatio = W + ' / ' + H; draw(); if (o.onAspect) o.onAspect(H / W); } } };
    wrap.style.aspectRatio = W + ' / ' + H;
    img.addEventListener('load', fit);
    img.addEventListener('error', function () { wrap.classList.add('map-noimg'); });
    draw();
    if (img.complete) setTimeout(fit, 0);
    return { el: wrap, svg: svg, redraw: function (sel) { o.sel = sel; draw(); }, size: function () { return { W: W, H: H }; } };
  }

  /** 活動細流整頁：時間表或跑關表＋地圖；表格可以縮放（按鈕或兩指） */
  /** 活動細流全頁；list（[{id, date, rot}]，id 是目前這個）有兩個以上時，上面可以切換看其他活動的細流 */
  function rotPage(r, date, list, id) {
    var holder = h('div', { class: 'col', style: { gap: '12px' } });
    var tabs = list && list.length > 1 ? h('div', { class: 'chips rot-tabs' }) : null;
    var draw = function (r2, date2) {
      var mapEl = r2.map && okUrl(r2.map.img) ? mapView(r2.map).el : null;
      var el = r2.kind === 'table' ? detailTable(r2, date2) : rotTable(r2, date2);
      clear(holder).appendChild(h('div', { class: 'col', style: { gap: '12px' } },
        r2.kind !== 'table' && r2.len ? h('div', { class: 'small muted' }, '每關 ' + r2.len + ' 分' + (r2.turn ? '、換關 ' + r2.turn + ' 分' : '')) : null, zoomBox(el), mapEl));
      var t = document.querySelector('.modal.full .modal-head h2'); if (t) t.textContent = '活動細流：' + r2.name;
      if (tabs) [].forEach.call(tabs.children, function (c) { c.classList.toggle('on', c._rot === r2); });
      markNow(holder);
    };
    if (tabs) {
      // 目前這個活動用傳進來的那份（有最新的日期）；其他照清單
      list.forEach(function (x) {
        var same = id ? x.id === id : x.rot.name === r.name;
        var rr = same ? r : x.rot, dd = same ? date : x.date;
        var c = h('span', { class: 'chip' }, (x.date ? dayLabel(x.date).replace(/（.）/, '') + ' ' : '') + x.rot.name);
        c._rot = rr;
        c.addEventListener('click', function () { draw(rr, dd); });
        tabs.appendChild(c);
      });
    }
    modal({ title: '活動細流：' + r.name, full: true, body: h('div', { class: 'col', style: { gap: '12px' } }, tabs, holder) });
    draw(r, date);
  }
  function zoomBox(el) {
    var z = 1, lab = h('span', { class: 'zm-lab' }, '100%');
    var set = function (v) { z = Math.max(0.5, Math.min(2.5, Math.round(v * 100) / 100)); el.style.zoom = z; lab.textContent = Math.round(z * 100) + '%'; };
    var d0 = 0, z0 = 1, dist = function (e) { var a = e.touches[0], b = e.touches[1]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); };
    el.addEventListener('touchstart', function (e) { if (e.touches.length === 2) { d0 = dist(e); z0 = z; } }, { passive: true });
    el.addEventListener('touchmove', function (e) { if (e.touches.length === 2 && d0) { e.preventDefault(); set(z0 * dist(e) / d0); } }, { passive: false });
    el.addEventListener('touchend', function (e) { if (e.touches.length < 2) d0 = 0; });
    return h('div', { class: 'col zm', style: { gap: '6px' } }, h('div', { class: 'zm-bar' },
      h('button', { class: 'btn sm', type: 'button', 'aria-label': '縮小', onclick: function () { set(z - 0.15); } }, '－'), lab,
      h('button', { class: 'btn sm', type: 'button', 'aria-label': '放大', onclick: function () { set(z + 0.15); } }, '＋'),
      h('button', { class: 'btn sm ghost', type: 'button', onclick: function () { set(1); } }, '還原'), h('span', { class: 'small muted' }, '也可以兩指縮放')), el);
  }
  /** 時間表型的活動細流（賭場、晚會）：格子 < 併到左邊、^ 併到上面；第一欄的顏色跟著列的顏色 */
  function detailTable(r, date) {
    var cols = r.cols || [], rows = r.rows || [], n = cols.length;
    var mm = function (t) { var m = String(t || '').match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
    // 先算每格屬於哪一格（< 跟左邊、^ 跟上面），再算每個主格的 colspan、rowspan
    var own = rows.map(function () { return []; }), span = rows.map(function () { return []; });
    rows.forEach(function (row, i) {
      for (var j = 0; j < n; j++) {
        var v = String((row.cells || [])[j] || '').trim();
        own[i][j] = v === '<' && j > 0 ? own[i][j - 1] : v === '^' && i > 0 ? own[i - 1][j] : [i, j];
        if (own[i][j][0] === i && own[i][j][1] === j) span[i][j] = { v: (row.cells || [])[j] || '', r1: i, c1: j };
        else span[i][j] = { skip: true };
      }
    });
    rows.forEach(function (row, i) { for (var j = 0; j < n; j++) { var o2 = own[i][j], m = span[o2[0]][o2[1]]; m.r1 = Math.max(m.r1, i); m.c1 = Math.max(m.c1, j); } });
    rows.forEach(function (row, i) { for (var j = 0; j < n; j++) { var m = span[i][j]; if (!m.skip) { m.rs = m.r1 - i + 1; m.cs = m.c1 - j + 1; } } });
    var tb = h('tbody'), hasPlace = rows.some(function (x) { return x.place; });
    rows.forEach(function (row, i) {
      var a = mm(row.start), b = mm(row.end), tr = h('tr');
      if (date && row.start) { var s0 = tms(date, row.start); tr.dataset.s = s0; tr.dataset.e = row.end ? tms(date, row.end) : s0 + 600000; }
      tr.appendChild(h('td', { class: 'dt-tm' }, h('b', null, row.start), row.end ? h('div', { class: 'small' }, '–' + row.end) : null));
      tr.appendChild(h('td', { class: 'dt-dur' }, a !== null && b !== null && b > a ? String(b - a) : ''));
      if (hasPlace) tr.appendChild(h('td', { class: 'dt-pl' }, row.place ? h('span', { class: 'clamp', title: row.place, onclick: function (e) { e.currentTarget.classList.toggle('open'); } }, row.place) : ''));
      for (var j = 0; j < n; j++) {
        var c = span[i][j];
        if (!c || c.skip) continue;
        var td = h('td', { colspan: c.cs > 1 ? c.cs : null, rowspan: c.rs > 1 ? c.rs : null, class: j === 0 ? 'dt-main' : '' });
        String(c.v || '').split('\n').forEach(function (ln, k) { if (k) td.appendChild(h('br')); td.appendChild(document.createTextNode(ln)); });
        if (j === 0 && row.color && CELL_COLORS[row.color]) td.style.background = CELL_COLORS[row.color];
        tr.appendChild(td);
      }
      tb.appendChild(tr);
    });
    return h('div', { class: 'tbl-wrap' }, h('table', { class: 't dt' }, h('thead', null, h('tr', null, h('th', null, '時間'), h('th', null, '分'), hasPlace ? h('th', { class: 'dt-pl' }, '場地') : null, cols.map(function (c, j) { return h('th', { class: j === 0 ? 'dt-main' : '' }, c); }))), tb));
  }
  /** 跑關／對抗：一列一個時段（像 Excel 那種），自由列（開關、移動、結關）整列橫跨所有小隊；最右邊是備註 */
  function rotTable(r, date) {
    var mm = function (t) { var m = String(t || '').match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
    var hm = function (n) { n = ((n % 1440) + 1440) % 1440; return ('0' + Math.floor(n / 60)).slice(-2) + ':' + ('0' + n % 60).slice(-2); };
    var rows = (r.slots || []).map(function (t, k) { return { k: k, start: t, end: r.len && mm(t) !== null ? hm(mm(t) + r.len) : '', note: (r.notes || [])[k] || '' }; })
      .concat((r.free || []).map(function (x) { return { free: true, start: x.start, end: x.end, text: x.text, place: x.place, note: x.note || '' }; }))
      .sort(function (a, b) { return (mm(a.start) === null ? 9999 : mm(a.start)) - (mm(b.start) === null ? 9999 : mm(b.start)) || (b.free ? 1 : 0) - (a.free ? 1 : 0); });
    var sq = r.rows || [], hasNote = rows.some(function (x) { return x.note; });
    var cellOf = function (row, x) {
      var c = row.cells[x.k] || '', i = (r.stations || []).indexOf(c), opp = r.vs && c ? sq.filter(function (o2) { return o2 !== row && o2.cells[x.k] === c; }).map(function (o2) { return o2.squad; }) : [];
      return { st: c, place: c ? (r.places || [])[i] || '' : '', opp: opp };
    };
    var timeTd = function (x) {
      var a = mm(x.start), b = mm(x.end);
      return h('td', { class: 'dt-tm' }, h('b', null, x.start), x.end ? h('div', { class: 'small' }, '–' + x.end + (a !== null && b !== null && b > a ? ' · ' + (b - a) + ' 分' : '')) : null);
    };
    var mark = function (tr, x) { if (date && x.start) { var s0 = tms(date, x.start); tr.dataset.s = s0; tr.dataset.e = x.end ? tms(date, x.end) : s0 + 600000; } return tr; };
    // 全部小隊：一列一個時段、一欄一個小隊（手機可以左右滑，時間欄固定）
    var tb = h('tbody');
    rows.forEach(function (x) {
      var tr = mark(h('tr', { class: x.free ? 'rt-free' : '' }), x);
      tr.appendChild(timeTd(x));
      if (x.free) tr.appendChild(h('td', { colspan: Math.max(1, sq.length), class: 'rt-span' }, h('b', null, x.text), x.place ? h('div', { class: 'small muted' }, x.place) : null));
      else sq.forEach(function (row) {
        var c = cellOf(row, x);
        tr.appendChild(h('td', { class: c.st ? 'rt-st' : 'rt-none' }, c.st ? h('b', null, c.st) : '休息', c.place ? h('div', { class: 'rt-pl' }, c.place) : null, c.opp.length ? h('div', { class: 'rt-vs' }, '對 ' + c.opp.join('、')) : null));
      });
      if (hasNote) tr.appendChild(h('td', { class: 'rt-note' }, x.note));
      tb.appendChild(tr);
    });
    var all = h('div', { class: 'tbl-wrap rt-wrap' }, h('table', { class: 't dt rt' }, h('thead', null, h('tr', null, h('th', { class: 'dt-tm' }, '時間'), sq.map(function (row) { return h('th', null, row.squad); }), hasNote ? h('th', null, '備註') : null)), tb));
    // 只看一隊：照時間往下列，像自己的行程
    var one = function (row) {
      return h('div', { class: 'sched rt-one' }, rows.map(function (x) {
        var c = x.free ? null : cellOf(row, x);
        var it = mark(h('div', { class: 'it' + (x.free ? ' rt-free' : '') }, h('span', { class: 'tm' }, x.start, x.end ? h('small', null, x.end) : null),
          h('div', { class: 'grow' }, h('b', null, x.free ? x.text : c.st || '休息'), (x.free ? x.place : c.place) ? h('span', { class: 'pill-place' }, x.free ? x.place : c.place) : null,
            c && c.opp.length ? h('div', { class: 'small vs-line' }, '對手：' + c.opp.join('、')) : null, x.note ? h('div', { class: 'small muted' }, x.note) : null)), x);
        return it;
      }));
    };
    if (sq.length < 2) return all;
    var view = h('div'), chips = h('div', { class: 'rt-chips' });
    var pick = function (i) {
      [].forEach.call(chips.children, function (b, k) { b.classList.toggle('on', k === i + 1); });
      clear(view).appendChild(i < 0 ? all : one(sq[i]));
      if (typeof markNow === 'function') markNow(view);
    };
    chips.appendChild(h('button', { type: 'button', class: 'chip on', onclick: function () { pick(-1); } }, '全部小隊'));
    sq.forEach(function (row, i) { chips.appendChild(h('button', { type: 'button', class: 'chip', onclick: function () { pick(i); } }, row.squad)); });
    view.appendChild(all);
    return h('div', { class: 'col rt-box', style: { gap: '8px' } }, h('div', { class: 'small muted' }, '每一格是那一隊在這個時段去的關卡；點小隊只看那一隊的順序。'), chips, view);
  }
  function card(title, body, extra) { return h('div', { class: 'fb' }, title ? h('h2', null, title) : null, body, extra || null); }
  /** 團隊計分明細：每個 Game 與加減分 */
  function sbParts(parts) {
    parts = parts || [];
    return h('div', { class: 'sched' }, parts.map(function (p) {
      return h('div', { class: 'it' }, h('span', { class: 'grow' }, p.name), h('b', { style: { color: p.score < 0 ? 'var(--bad)' : 'var(--ok)' } }, (p.score > 0 ? '+' : '') + p.score));
    }), !parts.length ? h('div', { class: 'muted small' }, '還沒有分數') : null);
  }
  function contactRow(name, sub, phone, sos) {
    return h('div', { class: 'contact' }, h('div', { class: 'who' }, h('b', null, name), sub ? h('small', null, sub) : null),
      phone ? h('a', { class: 'call' + (sos ? ' sos' : ''), href: 'tel:' + String(phone).replace(/[^\d+]/g, '') }, icon('phone', 16), ' 撥打') : null);
  }
  function schedList(items, onItem) {
    var out = h('div', { class: 'sched' }), day = '';
    items.forEach(function (it) {
      if (it.date !== day && it.showDay) { day = it.date; out.appendChild(h('div', { class: 'day' }, dayLabel(it.date))); }
      var row = h('div', { class: 'it' + (onItem && it.page ? ' link' : '') }, h('span', { class: 'tm' }, (it.time || '—') + (it.end ? '–' + it.end : '')), h('div', { class: 'grow' }, h('span', { class: 'nm' }, it.title), it.note ? h('div', { class: 'small muted' }, it.note) : null));
      var s0 = tms(it.date, it.time);
      if (s0) { row.dataset.s = s0; var nx = items.filter(function (y) { return y.date === it.date && y.time > it.time; })[0]; row.dataset.e = it.end ? tms(it.date, it.end) : nx ? tms(nx.date, nx.time) : s0 + 3600000; }
      if (onItem && it.page) row.addEventListener('click', function () { onItem(it, row); });
      out.appendChild(row);
    });
    if (!items.length) out.appendChild(h('div', { class: 'muted small' }, '目前沒有行程'));
    markNow(out);
    return schedWin(out, items.length > 5);
  }

  /* ---------------- Package 畫面 ---------------- */
  var FLOW_SEL = {};   // 營期流程區塊目前看的流程（展延後重畫不要跳回第一份）
  var VIEWS = {
    schedule: {
      theme: function (d, b, env) {
        if (d.act && d.mode && d.mode !== 'none') return actCard(Object.assign({}, d.act, { name: d.name || d.act.name }), env, 'theme', { label: '現在主題 · ' + hm0(d.time || '') + (d.end ? '–' + hm0(d.end) : ''), prog: themeProg(d) });
        if (d.mode === 'none' || !d.mode) return h('div', { class: 'theme-card free' }, h('div', { class: 'k' }, '現在'), h('h2', null, '自由時間'), h('div', { style: { opacity: 0.85 } }, '有需要請找隊輔'));
        return h('div', { class: 'theme-card' }, h('div', { class: 'k' }, h('i', { class: 'live-dot', 'aria-hidden': 'true' }), '現在主題 · ' + (d.time || '') + (d.end ? '–' + d.end : '')), h('h2', null, waveText(d.name || '')),
          d.place ? h('div', { style: { opacity: 0.9 } }, mi('place', d.place)) : null, d.summary ? h('div', { style: { opacity: 0.9, marginTop: '4px', whiteSpace: 'pre-line' } }, d.summary) : null,
          themeProg(d), d.page ? h('button', { class: 'btn', onclick: function () { env.nav(d.page); } }, '查看活動') : null);
      },
      activities: function (d, b, env) {
        var list = d.list || [];
        if (!list.length) return card('活動列表', h('div', { class: 'muted small' }, env.side === 'student' ? '活動公開後會出現在這裡' : '還沒有活動'));
        // 每個活動一張卡片，點開看詳細；工作人員端另外標學員看不看得到
        return h('div', { class: 'col ac-list' }, list.map(function (a) {
          var c = actCard(a, env, 'cover');
          if (env.side !== 'worker') return c;
          return h('div', { class: 'col', style: { gap: '4px' } }, c, h('div', { class: 'small muted', style: { padding: '0 8px' } }, (a.when ? '' : '未排入流程 · ') + (a.public ? '學員看得到' : ({ hidden: '學員看不到', auto: '自動公開（未到時間）', manual: '手動公開（尚未公開）' }[a.mode] || '學員看不到'))));
        }));
      },
      flow: function (d, b, env) {
        var flows = d.flows || [], cf = d.customFields || [];
        var wrap = h('div', { class: 'col' }), cur = { f: null, day: '' }, extBar = h('div');
        var tabs = h('div', { class: 'chips' }), dayTabs = h('div', { class: 'chips day-tabs' }), body = h('div');
        var mins = function (t) { var m = String(t || '').match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
        var hm = function (n) { n = ((n % 1440) + 1440) % 1440; return pad2(Math.floor(n / 60)) + ':' + pad2(n % 60); };
        var addDay = function (ymd, n) { var t = Date.parse(ymd + 'T12:00:00+08:00') + n * 86400000; return taipei(new Date(t)).ymd; };
        // 每天分開；凌晨（05:00 前）而且前一天有行程的，算前一天的（例如 12/26 01:00 接在 12/25 晚上後面）
        var prep = function (f) {
          var dates = {}; f.items.forEach(function (it) { if (it.date) dates[it.date] = 1; });
          var its = f.items.map(function (it) {
            var s0 = mins(it.time), d0 = Number(it.dur) || 0, ld = it.date || '';
            if (ld && s0 !== null && s0 < 300 && dates[addDay(ld, -1)]) ld = addDay(ld, -1);
            var k = s0 === null ? 99999 : s0 + (ld !== it.date ? 1440 : 0);
            return { it: it, s: s0, e: s0 === null ? null : s0 + d0, d: d0, ld: ld, k: k, late: ld !== it.date };
          });
          its.sort(function (a, b) { return a.ld.localeCompare(b.ld) || a.k - b.k || b.d - a.d; });
          its.forEach(function (x) { x.inner = x.s !== null && x.d > 0 && !x.it.gone && its.some(function (y) { return y !== x && !y.it.gone && y.it.date === x.it.date && y.s !== null && y.d > x.d && y.s <= x.s && x.e <= y.e; }); });
          return its;
        };
        var todayKey = function () { var t = taipei(nowDate()); return Number(t.hm.slice(0, 2)) < 5 ? addDay(t.ymd, -1) : t.ymd; };
        var ppl = function (lab, arr) { return arr && arr.length ? h('div', { class: 'ppl' }, h('span', { class: 'ppl-k' }, lab), arr.join('、')) : null; };
        // 點卡片：另外跳出詳細（地點、人員、機動、備註、細流…）
        var detail = function (x) {
          var it = x.it, places = String(it.place || '').split(/[、,，]/).map(function (y) { return y.trim(); }).filter(String);
          var m = modal({ title: it.name, body: h('div', { class: 'col it-detail', style: { gap: '8px' } },
            h('div', { class: 'row wrap', style: { gap: '6px' } }, h('b', null, (it.date ? dayLabel(it.date) + ' ' : '') + (it.time || '') + (x.d ? '–' + hm(x.e) : '')), it.tone === 'crit' ? h('span', { class: 'tag bad' }, '極重要') : null, it.activity && it.public === false ? h('span', { class: 'tag warn' }, '學員未公開') : null),
            places.length ? h('div', { class: 'row wrap', style: { gap: '6px' } }, places.map(function (pl) { return h('span', { class: 'pill-place' }, pl); })) : null,
            ppl('負責', it.owner), ppl('人員', it.staff), ppl('機動', it.backup),
            cf.map(function (k) { return it.custom && it.custom[k] ? h('div', { class: 'small' }, k + '：' + it.custom[k]) : null; }),
            it.note ? h('div', { class: 'small', style: { whiteSpace: 'pre-wrap' } }, it.note) : null,
            okUrl(it.link) ? h('a', { class: 'small', href: it.link, target: '_blank', rel: 'noopener' }, '相關連結') : null,
            goLink(it.go, it.date, function () { m.close(); }),
            it.ext ? h('div', { class: 'diff ext' }, it.gone ? '這段緩衝已被快速展延吸收' : '快速展延改過：原定 ' + it.ext.time + (Number(it.ext.dur) ? '–' + hm(mins(it.ext.time) + Number(it.ext.dur)) : '')) : null,
            it.diff ? h('div', { class: 'diff' }, '與既定行程不同：原訂 ' + it.diff.planned.date.slice(5) + ' ' + it.diff.planned.time + (it.diff.planned.place ? ' ' + it.diff.planned.place : '') + (it.diff.by ? '（' + it.diff.by + ' ' + fmt(it.diff.at) + ' 調整）' : '')) : null) });
        };
        var show = function (f, user, day) {
          cur.f = f;
          $all('.chip', tabs).forEach(function (c) { c.classList.toggle('on', c.dataset.id === f.id); });
          var its = prep(f), days = [];
          its.forEach(function (x) { if (days.indexOf(x.ld) < 0) days.push(x.ld); });
          if (!day || days.indexOf(day) < 0) { var tk = todayKey(); day = days.indexOf(tk) >= 0 ? tk : (days.filter(function (y) { return y && y > tk; })[0] || days[0] || ''); }
          cur.day = day;
          clear(dayTabs);
          if (days.length > 1) days.forEach(function (y) { var c = h('span', { class: 'chip' + (y === day ? ' on' : ''), 'data-day': y }, y ? dayLabel(y) : '未定'); c.addEventListener('click', function () { show(f, true, y); }); dayTabs.appendChild(c); });
          clear(body);
          var list = h('div', { class: 'sched flow' });
          var dayIts = its.filter(function (x) { return x.ld === day; });
          // 同時開始的（不是包在別項裡面的）併成一組，標「同時進行」，不要看起來像連續三個時程
          var parN = {};
          dayIts.forEach(function (x) { if (!x.inner && x.s !== null) parN[x.k] = (parN[x.k] || 0) + 1; });
          var parSeen = {};
          dayIts.forEach(function (x) {
            var it = x.it;
            // 卡片只放時間、名稱、負責（手機寬度有限）；其他點開看
            // 快速展延改過的：橘色＋原定時間；整段被吸收的緩衝：劃掉
            var ex = it.ext, exS = ex ? mins(ex.time) : null;
            var row = h('div', { class: 'it has-more' + (it.tone ? ' tone-' + it.tone : '') + (x.inner ? ' inner' : '') + (it.gone ? ' ext-gone' : ex ? ' ext-chg' : '') }, h('span', { class: 'tm' }, it.time, x.d ? h('small', null, hm(x.e)) : null, x.late ? h('small', { class: 'late' }, '隔天') : null,
                ex && !it.gone && exS !== null ? h('small', { class: 'ext-orig' }, '原 ' + ex.time + (Number(ex.dur) ? '–' + hm(exS + Number(ex.dur)) : '')) : null), h('div', { class: 'grow it-main' },
              h('div', { class: 'it-hd' }, h('b', { class: 'nm', title: it.name }, it.name), it.gone ? h('span', { class: 'tag' }, '已被展延吸收') : null,
                it.activity && it.public === false ? h('span', { class: 'tag warn' }, '學員未公開') : null),
              (it.owner || []).length ? h('div', { class: 'it-sub' }, h('span', { class: 'own', title: it.owner.join('、') }, h('span', { class: 'ppl-k' }, '負責'), it.owner.join('、'))) : null,
              it.note ? h('div', { class: 'it-note' }, it.note) : null),
              h('span', { class: 'it-chev', 'aria-hidden': 'true' }, '›'));
            row.addEventListener('click', function () { detail(x); });
            if (it.tone === 'act') row.style.background = actColor(it.activity || it.name);
            var s0 = tms(it.date, it.time);
            if (s0 && !it.gone) { row.dataset.s = s0; row.dataset.e = s0 + (x.d || 60) * 60000; }
            if (!x.inner && parN[x.k] > 1) {
              var pi = parSeen[x.k] = (parSeen[x.k] || 0) + 1;
              row.classList.add('par', pi === 1 ? 'par-first' : pi === parN[x.k] ? 'par-last' : 'par-mid');
              if (pi === 1) list.appendChild(h('div', { class: 'par-label' }, '同時進行 ' + parN[x.k] + ' 項'));
            }
            list.appendChild(row);
          });
          if (!f.items.length) list.appendChild(h('div', { class: 'muted small' }, '這份流程還沒有項目'));
          extTools(f, day);
          body.appendChild(schedWin(list, list.children.length > 4));
          markNow(body);
          if (user) setTimeout(function () { centerNow(body, true); }, 0);
        };
        // 快速展延（工作人員端、人員與分隊勾了「可快速展延」的人）：只對今天、以伺服器的現在時間為準
        function extTools(f, day) {
          clear(extBar);
          if (f.kind === 'rehearsal') extBar.appendChild(h('div', { class: 'rh-note' }, h('span', { class: 'tag info' }, '驗收中'), ' 使用「' + f.name + '」'));
          var exs = (d.extends || []).filter(function (x) { return x.flow === f.id; });
          var today = taipei(nowDate()).ymd, can = d.canExtend && env && env.action && day === today;
          if (!can && !exs.length) return;
          var run = function (btn, name, data, msg) {
            // 預覽：照預覽的模擬時間展延（可以測不同時段）
            return busy(btn, function () { return env.action('schedule', name, Object.assign({ flow: f.id }, data || {}, env.preview && simNow() ? { sim: simNow() } : {})); }).then(function (r) {
              FLOW_SEL[b.id] = f.id;
              toast(msg(r || {}));
              if (env.reload) env.reload();
            }).catch(function () {});
          };
          var ask = function (btn) {
            var n = h('input', { type: 'number', min: 1, max: 240, step: 1, inputmode: 'numeric', class: 'input ext-min', value: '10' });
            var quick = h('div', { class: 'chips' }, [5, 10, 15, 20, 30].map(function (k) { var c = h('span', { class: 'chip' }, k + ' 分'); c.addEventListener('click', function () { n.value = k; }); return c; }));
            modal({ title: '快速展延', body: h('div', { class: 'col', style: { gap: '10px' } },
              h('div', { class: 'small muted' }, '現在進行中的活動延長，後面的時間往後推；遇到緩衝時間或空檔會先吸收。'), quick, h('label', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, n, '分鐘')),
              actions: [{ text: '取消' }, { text: '展延', cls: 'primary', onClick: function (close) {
                var v = Math.floor(Number(n.value));
                if (!(v >= 1 && v <= 240)) { toast('請輸入 1～240 分鐘', true); return false; }
                close();
                run(btn, 'extend', { minutes: v }, function (r) { return '「' + (r.target || '') + '」延長 ' + v + ' 分，' + (r.changed || 0) + ' 項時間改變'; });
                return false;
              } }] });
            setTimeout(function () { n.focus(); n.select(); }, 30);
          };
          if (can) {
            var go = h('button', { class: 'btn sm ext-go', type: 'button' }, '快速展延');
            go.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>');
            go.addEventListener('click', function () { ask(go); });
            var bar = h('div', { class: 'row wrap ext-bar' }, go);
            if (exs.length) {
              var un = h('button', { class: 'btn sm', type: 'button' }, '取消上一次'), rs = h('button', { class: 'btn sm', type: 'button' }, '恢復原定時間');
              un.addEventListener('click', function () { run(un, 'extend.undo', {}, function () { return '已取消上一次展延'; }); });
              rs.addEventListener('click', function () { confirmBox('恢復原定時間', '今天這份流程的 ' + exs.length + ' 次展延全部取消，時間回到原定。', '恢復').then(function (ok) { if (ok) run(rs, 'extend.restore', {}, function () { return '已恢復原定時間'; }); }); });
              bar.appendChild(un); bar.appendChild(rs);
            }
            extBar.appendChild(bar);
          }
          if (exs.length && day === today) extBar.appendChild(h('div', { class: 'ext-log small' }, '今日展延：' + exs.map(function (x) { return x.at + '「' + x.target + '」+' + x.minutes + ' 分（' + x.by + '）'; }).join('；')));
        }
        // 完整細流上方切換用：所有活動細流，照流程裡第一次連到它的時間排，沒連到的放最後
        function rotList() {
          var at = {};
          flows.forEach(function (f) { (f.items || []).forEach(function (it) { var m2 = String(it.go || '').match(/^rot:(.+)$/); if (m2 && !it.gone && (!at[m2[1]] || (it.date + it.time) < at[m2[1]])) at[m2[1]] = (it.date || '') + ' ' + (it.time || ''); }); });
          return Object.keys(d.rots || {}).map(function (id) { var w = at[id] || ''; return { id: id, date: w.split(' ')[0], k: w, rot: d.rots[id] }; })
            .sort(function (a, b) { return (a.k ? 0 : 1) - (b.k ? 0 : 1) || a.k.localeCompare(b.k); });
        }
        // 連到別的流程：切過去；連到活動細流：另外開一個畫面看（時間表、跑關順序、地圖）
        function goLink(go, date, done) {
          var m = String(go || '').match(/^(flow|rot):(.+)$/);
          if (!m) return null;
          if (m[1] === 'flow') {
            var f2 = flows.filter(function (x) { return x.id === m[2]; })[0];
            return f2 ? h('button', { class: 'btn sm go-btn', type: 'button', onclick: function () { if (done) done(); show(f2, true); window.scrollTo(0, wrap.getBoundingClientRect().top + window.scrollY - 60); } }, '→ 流程：' + f2.name) : null;
          }
          var r = (d.rots || {})[m[2]];
          if (!r) return null;
          return h('button', { class: 'btn sm go-btn', type: 'button', onclick: function () { rotPage(r, date, rotList(), m[2]); } }, '→ 活動細流：' + r.name);
        }
        flows.forEach(function (f) { var c = h('span', { class: 'chip', 'data-id': f.id }, f.name); c.addEventListener('click', function () { show(f, true); }); tabs.appendChild(c); });
        wrap.appendChild(flows.length > 1 ? tabs : h('div'));
        wrap.appendChild(dayTabs);
        wrap.appendChild(extBar);
        wrap.appendChild(body);
        var keep = flows.filter(function (f) { return f.id === FLOW_SEL[b.id]; })[0];
        if (flows.length) show(keep || flows[0]); else body.appendChild(h('div', { class: 'muted small' }, '還沒有流程'));
        return card('營期流程', wrap);
      }
    },
    studentflow: {
      today: function (d, b, env, pub) { return sfView(pub, 'today', env, d); },
      tomorrow: function (d, b, env, pub) { return sfView(pub, 'tomorrow', env, d); },
      all: function (d, b, env, pub) { return sfView(pub, 'all', env, d); }
    },
    scoreboard: {
      mini: function (d) {
        var open = function () { if (d.mine) modal({ title: d.mine.name + ' · ' + d.mine.score + ' 分', body: sbParts(d.mine.parts) }); };
        return h('div', { class: 'fb row sb-mini' + (d.mine ? ' sb-click' : ''), onclick: open, role: d.mine ? 'button' : null }, h('div', { class: 'grow' }, h('div', { class: 'small muted' }, (d.title || '團隊積分') + (d.provisional ? '（暫定）' : '')),
          d.mine ? h('div', null, h('b', { style: { fontSize: '18px' } }, d.mine.name), '　第 ' + d.mine.rank + ' 名 · ', h('b', { 'data-count': d.mine.score }, d.mine.score), ' 分') : h('div', { class: 'muted' }, '你還沒有分到小隊')),
          d.top ? h('div', { style: { textAlign: 'right' } }, h('div', { class: 'small muted' }, '目前第一'), h('b', null, d.top.name), h('div', { class: 'small' }, d.top.score + ' 分')) : null);
      },
      team: function (d) {
        if (!d.mine) return card('我的隊伍分數', h('div', { class: 'muted small' }, '你還沒有分到小隊'));
        return card(d.mine.name + ' · ' + d.mine.score + ' 分' + (d.provisional ? '（暫定）' : ''), sbParts(d.mine.parts), h('div', { class: 'small muted', style: { marginTop: '6px' } }, '目前第 ' + d.mine.rank + ' 名'));
      },
      full: function (d, b, env) {
        var my = env.me && env.me.squad;
        return card((d.title || '團隊積分') + (d.provisional ? '（暫定排名）' : ''), h('div', { class: 'board' }, (d.rows || []).map(function (r) {
          // 點一隊展開分數明細
          return h('details', { class: 'r-wrap' }, h('summary', { class: 'r' + (String(r.no) === String(my) ? ' me' : '') }, h('span', { class: 'rk' }, r.rank), h('span', { class: 'grow' }, r.name), h('span', { class: 'sc', 'data-count': r.score }, r.score), h('span', { class: 'cs-chev' }, '›')), h('div', { class: 'r-parts' }, sbParts(r.parts)));
        })), d.provisional ? h('div', { class: 'small muted', style: { marginTop: '6px' } }, '有關卡成績還沒公布，排名可能會變') : null);
      }
    },
    people: {
      me: function (d) {
        return card('我的資料', h('div', { class: 'col' },
          h('div', { class: 'kv' }, h('span', null, '姓名'), h('b', null, d.name || ''), h('span', null, '小隊'), h('b', null, d.squadName || '尚未分隊')),
          d.leaders && d.leaders.length ? h('div', null, h('div', { class: 'small muted' }, '我的隊輔'), d.leaders.map(function (l) { return contactRow(l.name, l.dept, l.phone); })) : null,
          d.room ? h('div', null, h('div', { class: 'small muted' }, '我的房間'), h('div', null, h('b', null, d.room.no), d.room.label ? '　' + d.room.label : ''), d.room.note ? h('div', { class: 'small muted' }, d.room.note) : null,
            d.room.mates && d.room.mates.length ? h('div', { class: 'small' }, '室友：' + d.room.mates.join('、')) : null) : null,
          okUrl(d.line) ? h('a', { class: 'btn', href: d.line, target: '_blank', rel: 'noopener' }, '小隊群組') : null));
      },
      mywork: function (d) {
        var box = h('div', { class: 'col' });
        box.appendChild(card('你好，' + (d.name || ''), h('div', { class: 'kv' }, h('span', null, '股別'), h('span', null, d.dept || (d.preview ? '（預覽）' : '')), h('span', null, '帶隊'), h('span', null, d.squadName || '—'))));
        var whenTxt = function (w) { return (w.date ? dayLabel(w.date) + ' ' : '') + (w.time || '') + (w.dur && w.time ? '–' + hmOf(w.time, w.dur) : ''); };
        var placeTags = function (pl) { return String(pl || '').split(/[、,，]/).map(function (y) { return y.trim(); }).filter(String).map(function (y) { return h('span', { class: 'pill-place' }, y); }); };
        // 一隊的跑關順序（第幾站、關卡、場地、對手、備註）
        var stepList = function (steps, date, turn) {
          var list = h('div', { class: 'sched' }, steps.map(function (s, i) {
            var row = h('div', { class: 'it' }, h('span', { class: 'tm' }, s.time, s.end ? h('small', null, s.end) : null), h('div', { class: 'grow' }, h('div', { class: 'it-hd wrap' }, s.free ? null : h('span', { class: 'muted small' }, '第 ' + (steps.slice(0, i + 1).filter(function (y) { return !y.free; }).length) + ' 站'), h('b', null, s.station || '休息'), placeTags(s.place)), s.vs && s.vs.length ? h('div', { class: 'small vs-line' }, '對手：' + s.vs.join('、')) : null, s.note ? h('div', { class: 'small muted' }, s.note) : null));
            if (s.free) row.classList.add('rt-free');
            var s0 = tms(date, s.time); if (s0) { row.dataset.s = s0; row.dataset.e = s.end ? tms(date, s.end) : s0 + 1800000; }
            return row;
          }), turn ? h('div', { class: 'small muted' }, '每站之間換關 ' + turn + ' 分鐘') : null);
          markNow(list);
          return list;
        };
        if (d.focus) {
          // 正在進行或接下來、有活動細流的活動（結束了就換下一個）；點按鈕看完整細流
          d.focus.forEach(function (f) {
            var r = f.rot || {}, when = (f.date ? dayLabel(f.date) + ' ' : '') + f.time + (f.end ? '–' + f.end : '');
            var body = h('div', { class: 'col', style: { gap: '10px' } }, h('div', { class: 'row wrap fc-hd' }, h('span', { class: 'tag ' + (f.state === 'now' ? 'warn' : 'info') }, f.state === 'now' ? '進行中' : '接下來'), h('span', { class: 'small muted' }, when), placeTags(f.place)));
            if (f.mine) {
              if (r.map && okUrl(r.map.img)) body.appendChild(mapView(r.map).el);
              body.appendChild(stepList(f.mine, f.date, r.turn));
            } else if (r.kind === 'table') {
              // 時間表：只列現在和接下來幾列
              var t = nowDate().getTime(), rows = (r.rows || []).filter(function (x) { return x.start; }), cols = r.cols || [];
              var from = rows.filter(function (x) { var e0 = x.end ? tms(f.date, x.end) : tms(f.date, x.start) + 600000; return e0 > t; });
              var pick = (from.length ? from : rows).slice(0, 4);
              body.appendChild(h('div', { class: 'sched' }, pick.map(function (x) {
                var main = String((x.cells || [])[0] || '').replace(/^[<^]$/, ''), rest = (x.cells || []).slice(1).filter(function (c) { return c && !/^[<^]$/.test(c); }).join('　');
                var row = h('div', { class: 'it' }, h('span', { class: 'tm' }, x.start, x.end ? h('small', null, x.end) : null), h('div', { class: 'grow' }, h('div', { class: 'it-hd wrap' }, h('b', null, main || (cols[0] || '')), placeTags(x.place)), rest ? h('div', { class: 'small muted note-clamp' }, rest) : null));
                var s0 = tms(f.date, x.start); if (s0) { row.dataset.s = s0; row.dataset.e = x.end ? tms(f.date, x.end) : s0 + 600000; }
                return row;
              })));
              markNow(body);
            }
            body.appendChild(h('button', { class: 'btn sm', type: 'button', onclick: function () { rotPage(r, f.date, d.allRots, f.id); } }, '查看完整細流'));
            box.appendChild(card((f.mine ? r.name + '：' + d.squadName + '的順序' : '活動細流：' + (r.name || f.name)), body));
          });
        }
        if (d.route) {
          if (!d.focus) (d.route.rotations || []).forEach(function (r) {
            var list = stepList(r.steps, r.date, r.turn);
            box.appendChild(card(r.activity + '：' + d.squadName + '的順序', h('div', { class: 'col' }, r.map && okUrl(r.map.img) ? mapView(r.map).el : r.mode === 'map' && okUrl(r.image) ? h('img', { src: r.image, alt: '跑關地圖' }) : null, list)));
          });
          if ((d.route.items || []).length) box.appendChild(card('我的帶隊流程', schedList(d.route.items.map(function (x) { return { date: x.date, time: x.time, title: x.name, note: x.place, showDay: true }; }))));
        }
        // 我的工作：點開看同組的人、活動時間地點
        box.appendChild(card('我的工作', (d.tasks || []).length ? h('div', { class: 'col', style: { gap: '6px' } }, d.tasks.map(function (t) {
          return h('details', { class: 'job' }, h('summary', null, h('div', { class: 'grow' }, h('b', null, (t.activity ? t.activity + '　' : '') + t.role), h('div', { class: 'small muted' }, [t.date ? dayLabel(t.date) : '', t.detail].filter(String).join(' · '))), h('span', { class: 'cs-chev' }, '›')),
            h('div', { class: 'job-body' },
              t.detail ? h('div', null, h('span', { class: 'ppl-k' }, '內容'), t.detail) : null,
              (t.when || []).length ? h('div', null, h('span', { class: 'ppl-k' }, '時間'), h('div', { class: 'col', style: { gap: '2px' } }, t.when.map(function (w) { return h('div', null, whenTxt(w), ' ', placeTags(w.place)); }))) : null,
              h('div', null, h('span', { class: 'ppl-k' }, '同組'), (t.with || []).length ? t.with.join('、') : '只有你' + (t.need ? '（需要 ' + t.need + ' 人）' : ''))));
        })) : h('div', { class: 'muted small' }, d.preview ? '預覽時不會帶入個人工作' : '目前沒有分配到工作')));
        // 所有人的工作（依活動分）
        if ((d.allWork || []).length) box.appendChild(card('所有人的工作', h('div', { class: 'col', style: { gap: '6px' } }, d.allWork.map(function (g) {
          return h('details', { class: 'job' }, h('summary', null, h('div', { class: 'grow' }, h('b', null, g.activity || '一般工作事項'), h('div', { class: 'small muted' }, g.jobs.length + ' 個工作' + ((g.when || [])[0] ? ' · ' + whenTxt(g.when[0]) : ''))), h('span', { class: 'cs-chev' }, '›')),
            h('div', { class: 'job-body' }, g.jobs.map(function (j) {
              return h('div', { class: 'job-row' + (j.mine ? ' mine' : '') }, h('div', null, h('b', null, j.role), j.detail ? h('span', { class: 'muted' }, '　' + j.detail) : null, j.date ? h('span', { class: 'muted small' }, '　' + dayLabel(j.date)) : null), h('div', { class: 'small' }, j.people.length ? j.people.join('、') : h('span', { class: 'muted' }, '還沒有人')));
            })));
        }))));
        return box;
      },
      rooms: function (d) {
        var list = d.rooms || [];
        return card('分房表', list.length ? h('div', { class: 'col' }, list.map(function (r) {
          return h('details', { class: 'fb', style: { boxShadow: 'none', padding: '10px 12px' } }, h('summary', { style: { cursor: 'pointer', fontWeight: 700 } }, r.no + (r.label ? '　' + r.label : '') + '（' + r.people.length + ' 人）' + (r.sex ? '　' + r.sex : '')),
            r.note ? h('div', { class: 'small muted', style: { marginTop: '6px' } }, r.note) : null,
            h('div', { class: 'small', style: { marginTop: '6px' } }, r.people.length ? r.people.map(function (p) { return p.name + (p.squad ? '（' + p.squad + '）' : ''); }).join('、') : '還沒有人'));
        }), d.unassigned ? h('div', { class: 'small muted' }, '還有 ' + d.unassigned + ' 位學員沒有分房') : null) : h('div', { class: 'muted small' }, '還沒有分房資料（在報名後台分房後，按「從報名後台同步」）'));
      },
      squads: function (d) {
        var list = d.squads || [];
        return card('小隊資料', list.length ? h('div', { class: 'col' }, list.map(function (s) {
          return h('details', { class: 'fb', style: { boxShadow: 'none', padding: '10px 12px' } }, h('summary', { style: { cursor: 'pointer', fontWeight: 700 } }, s.name + '（' + s.students.length + ' 人）'),
            h('div', { class: 'small muted', style: { marginTop: '6px' } }, '專輔、隨輔'), s.leaders.length ? s.leaders.map(function (l) { return contactRow(l.name, l.dept, l.phone); }) : h('div', { class: 'small' }, '尚未安排'),
            h('div', { class: 'small muted', style: { marginTop: '6px' } }, '學員'), h('div', { class: 'small' }, s.students.join('、') || '—'),
            okUrl(s.line) ? h('a', { class: 'small', href: s.line, target: '_blank', rel: 'noopener' }, '小隊群組') : null);
        })) : h('div', { class: 'muted small' }, '還沒有小隊資料'));
      }
    },
    courses: {
      list: function (d) {
        var list = d.list || [], by = d.groupBy === 'date' ? 'date' : 'type', lay = COURSE_LAYOUTS[d.layout] ? d.layout : 'list';
        if (!list.length) return card(d.title || '課程簡介', h('div', { class: 'muted small' }, '還沒有課程'));
        var keys = by === 'date' ? list.map(function (c) { return c.date; }).filter(function (x, i, a) { return a.indexOf(x) === i; }) : (d.types || []).filter(function (t) { return list.some(function (c) { return c.type === t; }); });
        return card(d.title || '課程簡介', h('div', { class: 'col cs-list cs-' + lay }, keys.map(function (k) {
          return h('div', { class: 'col', style: { gap: '8px' } }, h('div', { class: 'cs-grp' }, by === 'date' ? (k ? dayLabel(k) : '未定日期') : k), list.filter(function (c) { return (by === 'date' ? c.date : c.type) === k; }).map(function (c) { return courseCard(c, lay, by); }));
        })));
      }
    },
    emergency: {
      student: function (d, b, env) { return emergencyView(d, env, false); },
      worker: function (d, b, env) { return emergencyView(d, env, true); },
      form: function (d, b, env) { return selfAssess(d, env); },
      formWorker: function (d, b, env) { return selfAssessStaff(d, env); }
    }
  };

  function sfView(pub, which, env, live) {
    var t = taipei(), tm = taipei(new Date(nowDate().getTime() + 86400000));
    // 驗收中看那次驗收的學員行程（後端即時給，不用等發布），平常看發布的正式行程
    var rh = ((pub && pub.rehearsals) || []).filter(function (r) { return r.start <= t.ymd && t.ymd <= r.end; })[0];
    var items = live && live.rh ? live.rh.items || [] : ((pub && pub.items) || []).filter(function (x) { return rh ? x.rh === rh.id : !x.rh; });
    var title = (pub && pub.title) || '行程表';
    var acts = (live && live.acts) || {};
    var pageOf = function (it) { var p = it.activity ? env.pages.filter(function (x) { return x.activity === it.activity; })[0] : null; return p ? p.id : ''; };
    // 連到活動的行程：點了打開活動卡片（活動還沒公開就沒有卡片，有活動頁時照舊到那一頁）
    var map = function (arr, showDay) { return arr.map(function (x) { var a = acts[x.activity]; return { date: x.date, time: x.time, end: x.end, title: x.title, note: x.note, act: a || null, page: a ? 'act' : pageOf(x), showDay: showDay }; }); };
    var go = function (it, row) { if (it.act) openAct(it.act, env, row); else env.nav(it.page); };
    if (which === 'today') return card('今日行程 · ' + dayLabel(t.ymd), schedList(map(items.filter(function (x) { return x.date === t.ymd; })), go));
    if (which === 'tomorrow') return card('明日行程 · ' + dayLabel(tm.ymd), schedList(map(items.filter(function (x) { return x.date === tm.ymd; })), go));
    return card(title, schedList(map(items, true), go));
  }

  /** 流程圖：steps 由上往下，有 branches 的步驟分岔成並排的幾欄，分岔後的下一步是匯合點 */
  function flowChart(flow) {
    var seq = function (steps, top) {
      return h('div', { class: 'fc-seq' + (top ? ' top' : '') }, (steps || []).map(function (st, i, arr) {
        var br = st.branches || [];
        var box = h('div', { class: 'fc-box' + (br.length ? ' q' : '') }, h('span', null, st.text),
          st.phone ? h('a', { class: 'fc-call', href: 'tel:' + String(st.phone).replace(/[^\d+]/g, '') }, icon('phone', 13), ' ' + st.phone) : null);
        return h('div', { class: 'fc-step' + (br.length && i < arr.length - 1 ? ' merge' : '') }, box, st.note ? h('div', { class: 'fc-note' }, st.note) : null,
          br.length ? h('div', { class: 'fc-branches' }, br.map(function (b) {
            return h('div', { class: 'fc-br' }, b.label ? h('div', { class: 'fc-label' + (b.tone === 'bad' ? ' bad' : '') }, b.label) : null, seq(b.steps), h('div', { class: 'fc-tail' }, h('span', { class: 'fc-bar' })));
          })) : null);
      }));
    };
    return h('div', { class: 'fc' }, seq(flow && flow.steps, true));
  }

  function emergencyView(d, env, worker) {
    var box = h('div', { class: 'col' });
    if (env && env.night !== undefined ? env.night : d.night) box.appendChild(h('div', { class: 'night-banner' }, icon('moon'), h('div', null, h('b', null, '夜間模式'), h('div', { class: 'small' }, '有狀況請先找隊輔或守夜人員'))));
    var calls = h('div');
    if (d.show119) calls.appendChild(contactRow('119', '有生命危險時直接撥打', '119', true));
    if (d.hq && (d.hq.phone || d.hq.name)) calls.appendChild(contactRow(d.hq.name || '營隊指揮中心', '營隊指揮中心', d.hq.phone));
    (d.leaders || []).forEach(function (l) { calls.appendChild(contactRow(l.name, (l.dept || '隊輔') + '（我的隊輔）', l.phone)); });
    (d.watchers || []).forEach(function (w) { calls.appendChild(contactRow(w.name, '今晚守夜 · ' + (w.dept || ''), w.phone)); });
    (d.contacts || []).forEach(function (c) { if (worker || c.side !== 'worker') calls.appendChild(contactRow(c.name, c.role, c.phone)); });
    box.appendChild(card(worker ? '緊急聯絡' : '緊急聯絡', calls));
    var guide = worker ? d.sop : d.guide;
    if (d.flow && (d.flow.steps || []).length) box.appendChild(card(d.flow.title || '事件處理流程', flowChart(d.flow)));
    if (guide && !(worker && d.flow)) box.appendChild(card(worker ? '事件處理流程' : '緊急處理', h('div', { class: 'rich', html: md(guide) })));
    if (worker && (d.submissions || []).length) {
      box.appendChild(card('最近的自我評估切結書', h('div', { class: 'col', style: { gap: '4px' } }, d.submissions.map(function (s) {
        return h('details', null, h('summary', { style: { cursor: 'pointer' } }, fmt(s.at) + '　' + s.name + '（第 ' + s.squad + ' 小隊）· ' + (s.answers.needs || '')),
          h('div', { class: 'small', style: { padding: '6px 0 6px 14px' } }, '事件時間：' + (s.answers.eventTime || '').replace('T', ' '), h('br'), '狀況：' + (s.answers.condition || ''), h('br'), '評估：' + (s.answers.canContinue || '') + (s.assessor ? '（評估人員：' + s.assessor + '）' : '')));
      }))));
    }
    return box;
  }

  function selfAssess(d, env) {
    var form = d.form;
    if (!form) return null;
    var vals = {}, box = h('div', { class: 'col' });
    form.fields.forEach(function (f) {
      var el;
      if (f.type === 'textarea') el = area('', { rows: 3 });
      else if (f.type === 'datetime') { var t = taipei(); el = inp(t.ymd + 'T' + t.hm, { type: 'datetime-local' }); }
      else if (f.type === 'choice') el = sel([{ value: '', label: '請選擇' }].concat(f.options.map(function (o) { return { value: o, label: o }; })), '');
      else if (f.type === 'check') { el = h('input', { type: 'checkbox' }); vals[f.key] = el; box.appendChild(h('label', { class: 'check' }, el, h('span', null, f.label))); return; }
      vals[f.key] = el;
      box.appendChild(field(f.label + (f.required ? ' *' : ''), el));
    });
    var msg = h('div', { class: 'small muted' }, (d.mine || []).length ? '你已送出 ' + d.mine.length + ' 次，最近一次 ' + fmt(d.mine[d.mine.length - 1].at) : '');
    var btn = h('button', { class: 'btn primary' }, '送出');
    btn.addEventListener('click', function () {
      if (env.preview) { toast('預覽中不會真的送出'); return; }
      var data = {};
      Object.keys(vals).forEach(function (k) { data[k] = vals[k].type === 'checkbox' ? vals[k].checked : vals[k].value; });
      busy(btn, function () { return env.action('emergency', 'selfAssess', data); }).then(function (r) {
        toast('已送出，隊輔會收到通知');
        msg.textContent = '已送出（' + fmt(r && r.at) + '）';
        Object.keys(vals).forEach(function (k) { if (vals[k].type === 'checkbox') vals[k].checked = false; else if (vals[k].tagName !== 'INPUT') vals[k].value = ''; });
      }, function () {});
    });
    box.appendChild(h('div', { class: 'row' }, btn, msg));
    return card('自我評估切結書', box);
  }

  /** 工作人員幫學員填自我評估：選學員（自己帶的小隊排前面）、學員簽名、評估人員打名字 */
  function selfAssessStaff(d, env) {
    var form = d.form;
    if (!form) return null;
    var mine = (d.mySquads || []).map(Number), sqName = {};
    (d.squads || []).forEach(function (q) { sqName[q.no] = q.name; });
    var studs = (d.students || []).slice().sort(function (a, b) { return (mine.indexOf(Number(a.squad)) >= 0 ? 0 : 1) - (mine.indexOf(Number(b.squad)) >= 0 ? 0 : 1) || Number(a.squad) - Number(b.squad) || String(a.name).localeCompare(String(b.name)); });
    var groups = {}, order = [];
    studs.forEach(function (x) { var k = String(x.squad); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(x); });
    var who = h('select', { class: 'input' }, h('option', { value: '' }, '請選學員'), order.map(function (k) {
      return h('optgroup', { label: (sqName[k] || ('第 ' + k + ' 小隊')) + (mine.indexOf(Number(k)) >= 0 ? '（我帶的）' : '') }, groups[k].map(function (x) { return h('option', { value: x.id }, x.name); }));
    }));
    var vals = {}, box = h('div', { class: 'col' });
    box.appendChild(field('學員 *', who));
    form.fields.forEach(function (f) {
      var el;
      if (f.type === 'check') return;   // 改成學員簽名
      if (f.type === 'textarea') el = area('', { rows: 3 });
      else if (f.type === 'datetime') { var t = taipei(); el = inp(t.ymd + 'T' + t.hm, { type: 'datetime-local' }); }
      else if (f.type === 'choice') el = sel([{ value: '', label: '請選擇' }].concat(f.options.map(function (o) { return { value: o, label: o }; })), '');
      vals[f.key] = el;
      box.appendChild(field(f.label + (f.required ? ' *' : ''), el));
    });
    var pad = signPad({ title: '學員簽名', placeholder: '學員在這裡簽名（確認以上內容屬實）', hint: '請學員本人簽名，確認以上內容屬實' });
    box.appendChild(h('div', { class: 'field' }, h('span', null, '學員簽名 *（確認以上內容屬實）'), pad.el));
    var assessor = inp(d.me || '', { placeholder: '你的名字' });
    box.appendChild(field('評估人員 *（不用簽名）', assessor));
    var msg = h('div', { class: 'small muted' });
    var btn = h('button', { class: 'btn primary' }, '送出');
    btn.addEventListener('click', function () {
      if (!who.value) { toast('請選學員', true); return; }
      if (!pad.isSigned()) { toast('請學員簽名', true); return; }
      if (!assessor.value.trim()) { toast('請填評估人員', true); return; }
      if (env.preview) { toast('預覽中不會真的送出'); return; }
      var data = { sid: who.value, sign: pad.get(), assessor: assessor.value.trim() };
      Object.keys(vals).forEach(function (k) { data[k] = vals[k].value; });
      busy(btn, function () { return env.action('emergency', 'selfAssessStaff', data); }).then(function (r) {
        toast('已送出');
        msg.textContent = '已送出 ' + who.options[who.selectedIndex].textContent + '（' + fmt(r && r.at) + '）';
        who.value = ''; pad.clear();
        Object.keys(vals).forEach(function (k) { if (vals[k].tagName !== 'INPUT') vals[k].value = ''; });
      }, function () {});
    });
    box.appendChild(h('div', { class: 'row' }, btn, msg));
    return card('自我評估切結書', box);
  }

  /** 畫出一頁：區塊 ＋ 底下的子頁面清單 */
  function page(container, pageId, env) {
    clear(container);
    var p = pageById(env, pageId);
    if (!p) { container.appendChild(h('div', { class: 'empty' }, '這一頁不存在或還沒公開')); return; }
    blocksOf(env, pageId).forEach(function (b) { var n = block(b, env); if (n) { n.dataset.bid = b.id; container.appendChild(n); } });
    var ks = kids(env, pageId);
    if (ks.length) container.appendChild(h('div', { class: 'fb', style: { padding: '6px 14px' } }, ks.map(function (k) {
      var row = h('div', { class: 'contact', style: { cursor: 'pointer' } }, icon(k.icon || 'page'), h('div', { class: 'who' }, h('b', null, k.title)), h('span', { class: 'muted' }, '›'));
      row.addEventListener('click', function () { env.nav(k.id); });
      return row;
    })));
    if (!container.children.length) container.appendChild(h('div', { class: 'empty' }, '這一頁還沒有內容'));
  }

  /** 這一頁要向伺服器拿動態資料的 Package 區塊 */
  function liveBlocks(env, pageId, extra) {
    return env.blocks.filter(function (b) { return b.type === 'pkg' && (b.page === pageId || (extra && extra.indexOf(b.id) >= 0)); })
      .map(function (b) { return { id: b.id, pkg: b.data.pkg, view: b.data.view, config: b.data.config || {} }; });
  }

  return { page: page, block: block, liveBlocks: liveBlocks, VIEWS: VIEWS, kids: kids, pageById: pageById, flowChart: flowChart, markNow: markNow, centerNow: centerNow, actColor: actColor, mapView: mapView, detailTable: detailTable, rotTable: rotTable, MAP_ANGLES: MAP_ANGLES, CELL_COLORS: CELL_COLORS, photo: photo, FRAMES: FRAMES, COURSE_LAYOUTS: COURSE_LAYOUTS, courseCard: courseCard,
    actCard: actCard, openAct: openAct, closeAct: closeAct, actCardOf: actCardOf, actDefault: actDefault, ACT_GRADS: ACT_GRADS, ACT_ELS: ACT_ELS, ACT_VARS: ACT_VARS };
})();
