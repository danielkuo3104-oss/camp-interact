/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 格式文字（和營隊報名系統的信件編輯器同一套寫法）：工具列 RT.toolbar(textarea, {vars}) 與轉成畫面 RT.html(text, vars, opts)。
 *   **粗體**　[R]紅字[/R]（R O Y G B P K）　[#1a73e8]色號字[/#]　[hl=#色號]底色[/hl]　==螢光==
 *   [center]置中[/center]　[card]提醒卡片[/card]（[card=B] 換顏色）　[大]字級[/大]（特大、大、中、小）
 *   行首 - 條列、  - 子項、[ ] 核取　---（分隔線）　[link=https://…]文字[/link]　[button=https://… #色號]按鈕[/button]
 *   [img=說明]https://圖片[/img]　[map]地點[/map]　| 表格 | 儲存格 |　[備註]內部備註，不會顯示[/備註]　{{變數}}
 * 先跳脫再轉換，不會插入任意 HTML。
 */
var RT = (function () {
  var COLORS = [['R', '#d32f2f', '紅'], ['O', '#ef6c00', '橙'], ['Y', '#d4a106', '黃'], ['G', '#2e7d32', '綠'], ['B', '#1565c0', '藍'], ['P', '#7b1fa2', '紫'], ['K', '#111111', '黑']];
  var CODES = {}; COLORS.forEach(function (c) { CODES[c[0]] = c[1]; });
  var SIZES = { '特大': 24, '大': 19, '中': 16, '小': 12 };
  var HEX_RE = '#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})';
  var CARD_COLOR = '#b3261e';
  var PIN = '<svg class="rt-pin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg>';

  function normHex(v) {
    v = String(v || '').trim().replace(/^#?/, '#');
    if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return '';
    if (v.length === 4) v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
    return v.toLowerCase();
  }
  /** 底色夠淺就用黑字，否則白字 */
  function textOn(hex) {
    hex = normHex(hex) || '#2f5d62';
    var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#111111' : '#ffffff';
  }
  function tint(hex, ratio) {
    hex = normHex(hex) || CARD_COLOR;
    var out = '#';
    for (var i = 1; i < 7; i += 2) { var v = Math.round(parseInt(hex.substr(i, 2), 16) * ratio + 255 * (1 - ratio)); out += ('0' + v.toString(16)).slice(-2); }
    return out;
  }
  function driveImg(url) {
    var m = String(url).match(/^https:\/\/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&(?:amp;)?)?id=)([\w-]{20,})/);
    return m ? 'https://drive.google.com/thumbnail?id=' + m[1] + '&amp;sz=w1600' : url;
  }
  function unesc(s) { return String(s || '').replace(/<[^>]*>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }

  var ROW_RE = /^\s*\|(.*?)\|?\s*$/, SEP_RE = /^\s*\|?[\s:|-]*-[\s:|-]*$/;
  function table(rows) {
    var n = 0;
    rows = rows.map(function (r) { var c = r.split('|'); n = Math.max(n, c.length); return c; });
    return '<div class="rt-tbl"><table>' + rows.map(function (r, i) {
      var tag = i ? 'td' : 'th', out = '<tr>';
      for (var k = 0; k < n; k++) out += '<' + tag + '>' + String(r[k] === undefined ? '' : r[k]).trim() + '</' + tag + '>';
      return out + '</tr>';
    }).join('') + '</table></div>';
  }

  /** 行內格式（輸入已跳脫）；o.link 連結顏色、o.btn 按鈕預設底色 */
  function inline(html, o) {
    var out = String(html || '');
    for (var i = 0; i < 3; i++) {
      out = out.replace(/\[([ROYGBPK])\]([\s\S]*?)\[\/\1\]/g, function (_, k, t) { return '<span style="color:' + CODES[k] + '">' + t + '</span>'; });
      out = out.replace(new RegExp('\\[color=(' + HEX_RE + ')\\]([\\s\\S]*?)\\[\\/color\\]', 'g'), function (_, c, t) { return '<span style="color:' + normHex(c) + '">' + t + '</span>'; });
      out = out.replace(new RegExp('\\[(' + HEX_RE + ')\\]((?:(?!\\[#[0-9a-fA-F])[\\s\\S])*?)\\[\\/#\\]', 'g'), function (_, c, t) { return '<span style="color:' + normHex(c) + '">' + t + '</span>'; });
      out = out.replace(new RegExp('\\[hl=(' + HEX_RE + ')\\]([\\s\\S]*?)\\[\\/hl\\]', 'g'), function (_, c, t) { return '<span class="rt-hl" style="background:' + normHex(c) + ';color:' + textOn(c) + '">' + t + '</span>'; });
    }
    out = out.replace(/\[img(?:=([^\]]*))?\]\s*(https:\/\/[^\s"'<>\[\]]+)\s*\[\/img\]/g, function (_, cap, url) {
      cap = String(cap || '').trim();
      return '<div class="rt-img"><img src="' + driveImg(url) + '" alt="' + cap + '" loading="lazy">' + (cap ? '<div class="rt-cap">' + cap + '</div>' : '') + '</div>';
    });
    out = out.replace(/\[map(?:=(https?:\/\/[^\]\s"'<>]+))?\]([\s\S]*?)\[\/map\]/g, function (_, url, name) {
      name = name.replace(/<br>/g, ' ').trim();
      var q = encodeURIComponent(unesc(name));
      if (!q) return '';
      return '<div class="rt-map"><div class="rt-map-n">' + PIN + name + '</div><a href="' + (url || 'https://www.google.com/maps/search/?api=1&amp;query=' + q) + '" target="_blank" rel="noopener">在 Google 地圖開啟</a></div>';
    });
    out = out.replace(new RegExp('\\[(link|button)=((?:https?:\\/\\/|mailto:|tel:)[^\\]\\s"\'<>]+)(?: +(' + HEX_RE + '))?\\]([\\s\\S]*?)\\[\\/\\1\\]', 'g'), function (_, kind, url, color, text) {
      text = text || url;
      var nw = /^https?:/i.test(url) ? ' target="_blank" rel="noopener"' : '';
      if (kind === 'link') return '<a href="' + url + '"' + nw + (color ? ' style="color:' + normHex(color) + '"' : '') + '>' + text + '</a>';
      var bg = normHex(color) || o.btn || '#2f5d62';
      return '<a class="rt-btn" href="' + url + '"' + nw + ' style="background:' + bg + ';color:' + textOn(bg) + '">' + text + '</a>';
    });
    for (var j = 0; j < 3; j++) out = out.replace(/\[(特大|大|中|小)\]([\s\S]*?)\[\/\1\]/g, function (_, k, t) { return '<span style="font-size:' + SIZES[k] + 'px;line-height:1.5">' + t + '</span>'; });
    out = out.replace(/==([^=\n][\s\S]*?)==/g, '<span class="rt-hl" style="background:#fde68a;color:#111">$1</span>');
    out = out.replace(new RegExp('(?:<br>)?\\[card(?:=([ROYGBPK]|' + HEX_RE + '))?\\]([\\s\\S]*?)\\[\\/card\\](?:<br>)?', 'g'), function (_, c, t) {
      var col = c ? (CODES[c] || normHex(c)) : CARD_COLOR;
      return '<div class="rt-card" style="background:' + tint(col, 0.1) + ';color:' + col + '">' + t.replace(/^(<br>)+|(<br>)+$/g, '') + '</div>';
    });
    out = out.replace(/\[center\]([\s\S]*?)\[\/center\]/g, '<div style="text-align:center">$1</div>');
    return out.replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>');
  }

  var NOTE_RE = /\[備註\]([\s\S]*?)\[\/備註\]/g;
  function stripNotes(text) { return String(text || '').replace(/^[ \t　]*\[備註\][\s\S]*?\[\/備註\][ \t　]*(?:\r?\n|$)/gm, '').replace(NOTE_RE, ''); }

  /** 格式文字 → HTML。vars：{變數: 值}；o.notes 顯示內部備註（編輯預覽用） */
  function html(text, vars, o) {
    o = o || {};
    text = o.notes ? String(text || '').replace(NOTE_RE, function (m, x) { return '\u0001' + x.replace(/\n/g, '\u0002') + '\u0003'; }) : stripNotes(text);
    text = esc(text).replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (m, k) { return vars && vars[k] !== undefined ? esc(vars[k]) : m; });
    var out = '', list = null, last = false, tbl = null;
    var flush = function () {
      if (tbl) { out += table(tbl); tbl = null; last = true; }
      if (!list) return;
      out += '<ul class="rt-ul">' + list.map(function (it) {
        return '<li' + (it.text === null ? ' class="rt-nob"' : '') + '>' + (it.text || '') + (it.subs.length ? '<ul class="rt-sub">' + it.subs.map(function (t) { return '<li>– ' + t + '</li>'; }).join('') + '</ul>' : '') + '</li>';
      }).join('') + '</ul>';
      list = null; last = true;
    };
    text.split('\n').forEach(function (ln) {
      var tr = ln.match(ROW_RE);
      if (tr) { if (tbl && SEP_RE.test(ln)) return; if (!tbl) flush(); tbl = tbl || []; tbl.push(tr[1]); return; }
      if (tbl) flush();
      if (/^\s*(?:-{3,}|\[hr\])\s*$/.test(ln)) { flush(); out += '<hr class="rt-hr">'; last = true; return; }
      var cb = ln.match(/^\s*\[([ xXvV✓]?)\]\s+(.*)$/);
      if (cb) { flush(); out += '<div class="rt-cb"><span>' + (cb[1].trim() ? '☑' : '☐') + '</span>' + cb[2] + '</div>'; last = true; return; }
      var sub = ln.match(/^[ \t　]+(?:[-–]\s+|[•・]\s*)(.*)$/), top = sub ? null : ln.match(/^(?:[-–]\s+|[•・]\s*)(.*)$/);
      if (sub) { list = list || []; if (!list.length) list.push({ text: null, subs: [] }); list[list.length - 1].subs.push(sub[1]); return; }
      if (top) { list = list || []; list.push({ text: top[1], subs: [] }); return; }
      flush();
      if (!ln.trim()) { if (out) out += '<div class="rt-gap"></div>'; last = true; return; }
      out += (out && !last ? '<br>' : '') + ln;
      last = false;
    });
    flush();
    out = inline(out, o).replace(/(?:<br>)+(?=<(?:div|table|hr|ul)\b)/g, '').replace(/(<\/(?:div|table|ul)>|<hr[^>]*>)(?:<br>)+/g, '$1');
    return out.replace(/\u0001([\s\S]*?)\u0003/g, function (m, x) { return '<span class="rt-note">備註（學員看不到）：' + x.replace(/\u0002/g, '<br>') + '</span>'; });
  }

  /* ---------------- 工具列 ---------------- */
  function wrap(ta, a, b, ph) {
    var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value, mid = v.slice(s, e) || ph || '';
    ta.value = v.slice(0, s) + a + mid + b + v.slice(e);
    ta.focus(); ta.selectionStart = s + a.length; ta.selectionEnd = s + a.length + mid.length;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function lines(ta, mark) {
    var v = ta.value, a = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    var z = v.indexOf('\n', Math.max(ta.selectionEnd - (ta.selectionEnd > ta.selectionStart ? 1 : 0), ta.selectionStart));
    if (z < 0) z = v.length;
    var blk = v.slice(a, z).split('\n').map(function (ln) { return mark + ln.replace(/^[ \t　]*(?:[-–]\s+|[•・]\s*|\[[ xXvV✓]?\]\s+)/, ''); }).join('\n');
    ta.value = v.slice(0, a) + blk + v.slice(z);
    ta.focus(); ta.selectionStart = a; ta.selectionEnd = a + blk.length;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  /** 自成一段（圖片、地點、表格、分隔線）：前後不是換行就補上 */
  function block(ta, code) {
    var v = ta.value, a = ta.selectionStart, z = ta.selectionEnd;
    var pre = a > 0 && v[a - 1] !== '\n' ? '\n' : '', post = z < v.length && v[z] !== '\n' ? '\n' : '';
    ta.value = v.slice(0, a) + pre + code + post + v.slice(z);
    ta.focus(); ta.selectionStart = ta.selectionEnd = a + pre.length + code.length;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function hexField(val) {
    var pick = h('input', { type: 'color', value: normHex(val) || '#2f5d62', 'aria-label': '選顏色' });
    var txt = h('input', { class: 'fmt-hexin', value: val || '', placeholder: val ? '#000000' : '色號（可不填）', maxlength: '7', spellcheck: 'false', 'aria-label': '色號' });
    pick.addEventListener('input', function () { txt.value = pick.value; txt.classList.remove('bad'); });
    txt.addEventListener('input', function () { var c = normHex(txt.value); txt.classList.toggle('bad', !!txt.value.trim() && !c); if (c) pick.value = c; });
    return { el: h('span', { class: 'fmt-hex', title: '色號，例如 #1a73e8' }, pick, txt), txt: txt };
  }

  /** o.vars：插入變數選單的變數名稱 */
  function toolbar(ta, o) {
    o = o || {};
    var B = function (f, label, title, extra) { return h('button', Object.assign({ type: 'button', class: 'fmt-btn', 'data-f': f, title: title || '' }, extra || {}), label); };
    var main = hexField('#c62828'), lk = hexField('');
    var err = h('div', { class: 'small fmt-err' });
    var size = h('select', { class: 'fmt-size', 'aria-label': '字級' }, h('option', { value: '' }, '字級…'), ['特大', '大', '中', '小'].map(function (x) { return h('option', null, x); }));
    var vsel = o.vars && o.vars.length ? h('select', { class: 'fmt-var', 'aria-label': '插入變數' }, h('option', { value: '' }, '插入變數…'), o.vars.map(function (x) { return h('option', null, x); })) : null;
    var row = h('div', { class: 'fmt-row' },
      B('bold', h('b', null, 'B'), '粗體 **文字**'), h('span', { class: 'fmt-sep' }),
      COLORS.map(function (c) { return h('button', { type: 'button', class: 'fmt-swatch', 'data-color': c[0], title: c[2] + '（[' + c[0] + ']文字[/' + c[0] + ']）', style: { background: c[1] } }, c[0]); }),
      h('span', { class: 'fmt-sep' }), main.el, B('color', '文字色', '[#色號]文字[/#]'), B('bg', '底色', '[hl=#色號]文字[/hl]'), h('span', { class: 'fmt-sep' }),
      B('hl', '螢光', '==文字==', { style: { background: '#fde68a', color: '#111' } }), B('ul', '• 條列', '行首「- 」'), B('sub', '– 子項', '行首「  - 」'), B('cb', '☐ 核取', '行首「[ ] 」'),
      B('center', '置中', '[center]文字[/center]'), B('card', '卡片', '[card]文字[/card]：淡色底的提醒方塊，用左邊的色號換顏色', { class: 'fmt-btn fmt-card' }), size, B('hr', '分隔線', '一行只有 ---'), h('span', { class: 'fmt-sep' }),
      B('link', '連結'), B('button', '按鈕'), B('img', '圖片', '[img]https://圖片網址[/img]'), B('map', '地點', '[map]地址[/map]'), B('table', '表格', '每行 | 儲存格 | 儲存格 |'),
      h('span', { class: 'fmt-sep' }), B('note', '備註', '[備註]…[/備註]：給之後維護的人看，學員看不到', { class: 'fmt-btn fmt-note' }),
      vsel ? h('span', { class: 'fmt-sep' }) : null, vsel);
    // 連結／按鈕
    var kindL = h('input', { type: 'radio', name: 'fmtk' + Math.random(), value: 'link', checked: true }), kindB = h('input', { type: 'radio', name: kindL.name, value: 'button' });
    var lText = h('input', { class: 'input', placeholder: '顯示文字，例如：活動地圖' }), lUrl = h('input', { class: 'input', placeholder: '網址 https://…' }), lErr = h('div', { class: 'small fmt-err' });
    var linkP = h('div', { class: 'fmt-link hidden' }, h('div', { class: 'seg sm' }, h('label', null, kindL, h('span', null, '文字連結')), h('label', null, kindB, h('span', null, '按鈕'))), lText, lUrl, lk.el,
      h('button', { type: 'button', class: 'btn sm primary', 'data-f': 'insert' }, '插入'), h('button', { type: 'button', class: 'btn sm ghost', 'data-f': 'close' }, '取消'), lErr);
    // 圖片、地點、表格
    var iT = h('b', { class: 'fmt-ins-title' }), iA = h('input', { class: 'input' }), iB = h('input', { class: 'input' }), iTip = h('div', { class: 'small muted fmt-ins-tip' }), iErr = h('div', { class: 'small fmt-err' }), kind = '';
    var insP = h('div', { class: 'fmt-link fmt-ins hidden' }, iT, iA, iB, h('button', { type: 'button', class: 'btn sm primary', 'data-f': 'ins-ok' }, '插入'), h('button', { type: 'button', class: 'btn sm ghost', 'data-f': 'ins-close' }, '取消'), iTip, iErr);
    var INS = {
      img: ['插入圖片', '圖片網址 https://…', '圖片說明（選填）', '可貼 Google 雲端硬碟的分享連結（要設成「知道連結的任何人都能查看」），或其他 https 開頭的圖片網址。'],
      map: ['插入地點', '地點名稱或地址，例如：清大體育館', 'Google 地圖分享網址（選填）', '會顯示成地點卡片與「在 Google 地圖開啟」連結。'],
      table: ['插入表格', '欄數（2–6）', '列數（不含標題列，1–20）', '插入後直接改文字：每行一列，儲存格用「|」分開，第一行是標題列。']
    };
    var bar = h('div', { class: 'fmt-bar' }, row, linkP, insP, err);
    var mainHex = function () { var c = normHex(main.txt.value); err.textContent = c ? '' : '色號格式是 # 加 6 碼（例如 #1a73e8）或 3 碼（例如 #f00）'; return c; };
    var ok = function () {
      var A = iA.value.trim(), Bv = iB.value.trim();
      if (kind === 'img') { if (!/^https:\/\/[^\s"'<>\[\]]+$/.test(A)) { iErr.textContent = '圖片網址需以 https:// 開頭，且不能有空白'; return; } block(ta, '[img' + (Bv ? '=' + Bv.replace(/[\[\]]/g, '') : '') + ']' + A + '[/img]'); }
      if (kind === 'map') { if (!A) { iErr.textContent = '請填地點名稱或地址'; return; } if (Bv && !/^https?:\/\/[^\s"'<>\]]+$/.test(Bv)) { iErr.textContent = '地圖網址需以 https:// 開頭，且不能有空白'; return; } block(ta, '[map' + (Bv ? '=' + Bv : '') + ']' + A.replace(/[\[\]]/g, '') + '[/map]'); }
      if (kind === 'table') {
        var c = Math.min(6, Math.max(2, parseInt(A, 10) || 2)), r = Math.min(20, Math.max(1, parseInt(Bv, 10) || 3)), rows = [], i, cells = [];
        for (i = 0; i < c; i++) cells.push(i ? '說明' : '項目'); rows.push('| ' + cells.join(' | ') + ' |');
        cells = []; for (i = 0; i < c; i++) cells.push('內容');
        for (i = 0; i < r; i++) rows.push('| ' + cells.join(' | ') + ' |');
        block(ta, rows.join('\n'));
      }
      insP.classList.add('hidden');
    };
    iA.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
    iB.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
    bar.addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });   // 不讓按鈕搶走選取範圍
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var f = b.getAttribute('data-f'), color = b.getAttribute('data-color');
      if (f === 'bold') wrap(ta, '**', '**', '粗體文字');
      if (f === 'hl') wrap(ta, '==', '==', '標記文字');
      if (f === 'center') wrap(ta, '[center]', '[/center]', '置中文字');
      if (f === 'card') { var cc = mainHex(); if (cc) wrap(ta, cc === '#c62828' ? '[card]' : '[card=' + cc + ']', '[/card]', '提醒文字'); }
      if (f === 'note') wrap(ta, '[備註]', '[/備註]', '給之後維護的人看的說明');
      if (f === 'hr') block(ta, '---');
      if (f === 'ul' || f === 'sub' || f === 'cb') lines(ta, f === 'ul' ? '- ' : f === 'sub' ? '  - ' : '[ ] ');
      if (color) wrap(ta, '[' + color + ']', '[/' + color + ']', '彩色文字');
      if (f === 'color' || f === 'bg') { var hx = mainHex(); if (hx) { if (f === 'color') wrap(ta, '[' + hx + ']', '[/#]', '彩色文字'); else wrap(ta, '[hl=' + hx + ']', '[/hl]', '標記文字'); } }
      if (f === 'link' || f === 'button') {
        insP.classList.add('hidden'); linkP.classList.remove('hidden');
        (f === 'button' ? kindB : kindL).checked = true;
        var s0 = ta.value.slice(ta.selectionStart, ta.selectionEnd);
        lText.value = s0; lUrl.value = ''; lk.txt.value = ''; lErr.textContent = '';
        (s0 ? lUrl : lText).focus();
      }
      if (f === 'img' || f === 'map' || f === 'table') {
        kind = f; linkP.classList.add('hidden'); insP.classList.remove('hidden');
        var c = INS[f]; iT.textContent = c[0]; iA.placeholder = c[1]; iB.placeholder = c[2]; iTip.textContent = c[3]; iErr.textContent = '';
        iA.value = f === 'table' ? '2' : f === 'map' ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : ''; iB.value = f === 'table' ? '3' : '';
        iA.focus();
      }
      if (f === 'ins-ok') ok();
      if (f === 'ins-close') insP.classList.add('hidden');
      if (f === 'close') linkP.classList.add('hidden');
      if (f === 'insert') {
        var u = lUrl.value.trim();
        if (!/^(https?:\/\/|mailto:|tel:)[^\s"'<>\]]+$/i.test(u)) { lErr.textContent = '網址需以 https://、http://、mailto: 或 tel: 開頭，且不能有空白'; return; }
        var raw = lk.txt.value.trim(), lc = normHex(raw);
        if (raw && !lc) { lErr.textContent = '色號格式是 # 加 6 碼或 3 碼；不填就用預設顏色'; return; }
        var kd = kindB.checked ? 'button' : 'link', a = ta.selectionStart, z = ta.selectionEnd, v = ta.value, t = lText.value.trim();
        var code = '[' + kd + '=' + u + (lc ? ' ' + lc : '') + ']' + (t || (kd === 'button' ? '前往' : u)) + '[/' + kd + ']';
        ta.value = v.slice(0, a) + code + v.slice(z);
        ta.focus(); ta.selectionStart = ta.selectionEnd = a + code.length;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        linkP.classList.add('hidden');
      }
    });
    main.txt.addEventListener('input', function () { err.textContent = ''; });
    size.addEventListener('change', function () { if (size.value) wrap(ta, '[' + size.value + ']', '[/' + size.value + ']', size.value + '字'); size.value = ''; });
    if (vsel) vsel.addEventListener('change', function () { if (vsel.value) wrap(ta, '{{' + vsel.value + '}}', '', ''); vsel.value = ''; });
    return bar;
  }

  return { html: html, toolbar: toolbar, normHex: normHex, textOn: textOn, stripNotes: stripNotes };
})();
