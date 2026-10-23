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
      if (data === undefined) return h('div', { class: 'fb muted small' }, '載入中…');
      if (data && data.maintenance === true) return h('div', { class: 'maint' }, '這個功能維護中，稍後再回來看看');
      if (data && data.error) return h('div', { class: 'maint' }, '這個區塊暫時無法顯示');
    }
    try {
      var node = view(data || {}, b, env, meta && meta.data);
      if (node && data && data.maintenance && data.maintenance !== true) return h('div', { class: 'col', style: { gap: '6px' } }, h('div', { class: 'small muted', style: { padding: '0 6px' } }, '這個功能維護中，內容可能不是最新的'), node);
      return node;
    } catch (e) {
      return h('div', { class: 'maint' }, '這個區塊暫時無法顯示');
    }
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
  var COURSE_LAYOUTS = { list: '清單＋小照片', profile: '講者名片（大頭照）', cover: '封面大圖', plain: '時間軸（不顯示照片）' };
  function courseMins(n) { return n >= 60 ? Math.floor(n / 60) + ' 小時' + (n % 60 ? ' ' + (n % 60) + ' 分' : '') : n + ' 分鐘'; }
  function courseCard(c, lay, by) {
    var pic = c.photo && lay !== 'plain' && okUrl(c.photo);
    var tm = c.start ? c.start + (c.end ? '–' + c.end : '') : '';
    var meta = h('div', { class: 'cs-meta' },
      by === 'date' ? h('span', { class: 'tag' }, c.type) : null,
      (c.date || tm) && lay !== 'plain' ? h('span', null, '🕘 ' + [by === 'date' ? '' : (c.date ? dayLabel(c.date) : ''), tm].filter(String).join(' ')) : null,
      c.dur ? h('span', null, courseMins(c.dur)) : null,
      c.place ? h('span', null, '📍 ' + c.place) : null);
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
      var line = h('div', { class: 'now-line' }, h('span', null, '現在 ' + taipei().hm));
      if (nx) list.insertBefore(line, nx); else { var last = td[td.length - 1]; last.after(line); }
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
      tr.appendChild(h('td', { class: 'dt-tm' }, row.start + (row.end ? '–' + row.end : '')));
      tr.appendChild(h('td', { class: 'dt-dur' }, a !== null && b !== null && b > a ? String(b - a) : ''));
      if (hasPlace) tr.appendChild(h('td', { class: 'dt-pl' }, row.place || ''));
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
    return h('div', { class: 'tbl-wrap' }, h('table', { class: 't dt' }, h('thead', null, h('tr', null, h('th', null, '時間'), h('th', null, '分'), hasPlace ? h('th', null, '場地') : null, cols.map(function (c) { return h('th', null, c); }))), tb));
  }
  function card(title, body, extra) { return h('div', { class: 'fb' }, title ? h('h2', null, title) : null, body, extra || null); }
  function contactRow(name, sub, phone, sos) {
    return h('div', { class: 'contact' }, h('div', { class: 'who' }, h('b', null, name), sub ? h('small', null, sub) : null),
      phone ? h('a', { class: 'call' + (sos ? ' sos' : ''), href: 'tel:' + String(phone).replace(/[^\d+]/g, '') }, icon('phone', 16), ' 撥打') : null);
  }
  function schedList(items, onItem) {
    var out = h('div', { class: 'sched' }), day = '';
    items.forEach(function (it) {
      if (it.date !== day && it.showDay) { day = it.date; out.appendChild(h('div', { class: 'day' }, dayLabel(it.date))); }
      var row = h('div', { class: 'it' + (onItem && it.page ? ' link' : '') }, h('span', { class: 'tm' }, it.time || '—'), h('div', { class: 'grow' }, h('span', { class: 'nm' }, it.title), it.note ? h('div', { class: 'small muted' }, it.note) : null));
      var s0 = tms(it.date, it.time);
      if (s0) { row.dataset.s = s0; var nx = items.filter(function (y) { return y.date === it.date && y.time > it.time; })[0]; row.dataset.e = it.end ? tms(it.date, it.end) : nx ? tms(nx.date, nx.time) : s0 + 3600000; }
      if (onItem && it.page) row.addEventListener('click', function () { onItem(it); });
      out.appendChild(row);
    });
    if (!items.length) out.appendChild(h('div', { class: 'muted small' }, '目前沒有行程'));
    markNow(out);
    return schedWin(out, items.length > 5);
  }

  /* ---------------- Package 畫面 ---------------- */
  var VIEWS = {
    schedule: {
      theme: function (d, b, env) {
        if (d.mode === 'none' || !d.mode) return h('div', { class: 'theme-card' }, h('div', { class: 'k' }, '現在'), h('h2', null, '自由時間'), h('div', { style: { opacity: 0.85 } }, '有需要請找隊輔'));
        return h('div', { class: 'theme-card' }, h('div', { class: 'k' }, '現在主題 · ' + (d.time || '')), h('h2', null, d.name || ''),
          d.place ? h('div', { style: { opacity: 0.9 } }, '📍 ' + d.place) : null, d.summary ? h('div', { style: { opacity: 0.9, marginTop: '4px' } }, d.summary) : null,
          d.page ? h('button', { class: 'btn', onclick: function () { env.nav(d.page); } }, '查看活動') : null);
      },
      activities: function (d, b, env) {
        var list = d.list || [];
        return card('活動列表', list.length ? h('div', { class: 'col', style: { gap: '8px' } }, list.map(function (a) {
          var row = h('div', { class: 'contact', style: { cursor: a.page ? 'pointer' : 'default' } }, h('div', { class: 'who' }, h('b', null, a.name), a.summary ? h('small', null, a.summary) : null,
            env.side === 'worker' ? h('small', null, (a.when || '未排入流程') + ' · ' + (a.public ? '學員看得到' : ({ hidden: '不公開', auto: '自動公開（未到時間）', manual: '手動公開（尚未公開）' }[a.mode] || '不公開'))) : null),
            a.page ? h('span', { class: 'muted' }, '›') : null);
          if (a.page) row.addEventListener('click', function () { env.nav(a.page); });
          return row;
        })) : h('div', { class: 'muted small' }, env.side === 'student' ? '活動公開後會出現在這裡' : '還沒有活動'));
      },
      flow: function (d) {
        var flows = d.flows || [], cf = d.customFields || [];
        var wrap = h('div', { class: 'col' }), cur = { f: null, day: '' };
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
          its.forEach(function (x) { x.inner = x.s !== null && x.d > 0 && its.some(function (y) { return y !== x && y.it.date === x.it.date && y.s !== null && y.d > x.d && y.s <= x.s && x.e <= y.e; }); });
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
          its.filter(function (x) { return x.ld === day; }).forEach(function (x) {
            var it = x.it;
            // 卡片只放時間、名稱、負責（手機寬度有限）；其他點開看
            var row = h('div', { class: 'it has-more' + (it.tone ? ' tone-' + it.tone : '') + (x.inner ? ' inner' : '') }, h('span', { class: 'tm' }, it.time, x.d ? h('small', null, hm(x.e)) : null, x.late ? h('small', { class: 'late' }, '隔天') : null), h('div', { class: 'grow it-main' },
              h('div', { class: 'it-hd' }, h('b', { class: 'nm', title: it.name }, it.name),
                it.activity && it.public === false ? h('span', { class: 'tag warn' }, '學員未公開') : null),
              (it.owner || []).length ? h('div', { class: 'it-sub' }, h('span', { class: 'own', title: it.owner.join('、') }, h('span', { class: 'ppl-k' }, '負責'), it.owner.join('、'))) : null),
              h('span', { class: 'it-chev', 'aria-hidden': 'true' }, '›'));
            row.addEventListener('click', function () { detail(x); });
            if (it.tone === 'act') row.style.background = actColor(it.activity || it.name);
            var s0 = tms(it.date, it.time);
            if (s0) { row.dataset.s = s0; row.dataset.e = s0 + (x.d || 60) * 60000; }
            list.appendChild(row);
          });
          if (!f.items.length) list.appendChild(h('div', { class: 'muted small' }, '這份流程還沒有項目'));
          body.appendChild(schedWin(list, list.children.length > 4));
          markNow(body);
          if (user) setTimeout(function () { centerNow(body, true); }, 0);
        };
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
          return h('button', { class: 'btn sm go-btn', type: 'button', onclick: function () { rotPage(r, date); } }, '→ 活動細流：' + r.name);
        }
        function rotPage(r, date) {
          var mapEl = r.map && okUrl(r.map.img) ? mapView(r.map).el : null, el;
          if (r.kind === 'table') el = detailTable(r, date);
          else el = h('div', { class: 'tbl-wrap' }, h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, '小隊'), r.slots.map(function (t) { return h('th', null, t); }))),
            h('tbody', null, r.rows.map(function (row) { return h('tr', null, h('td', null, row.squad), row.cells.map(function (c, k) {
              var i = r.stations.indexOf(c), opp = r.vs && c ? r.rows.filter(function (o2) { return o2 !== row && o2.cells[k] === c; }).map(function (o2) { return o2.squad; }) : [];
              return h('td', null, c || '—', c && r.places[i] ? h('div', { class: 'muted' }, r.places[i]) : null, opp.length ? h('div', { class: 'small vs-line' }, '對 ' + opp.join('、')) : null);
            })); }))));
          modal({ title: '活動細流：' + r.name, full: true, body: h('div', { class: 'col', style: { gap: '12px' } },
            r.kind !== 'table' && r.len ? h('div', { class: 'small muted' }, '每關 ' + r.len + ' 分' + (r.turn ? '、換關 ' + r.turn + ' 分' : '')) : null, el, mapEl) });
          markNow(document.querySelector('.modal.full'));
        }
        flows.forEach(function (f) { var c = h('span', { class: 'chip', 'data-id': f.id }, f.name); c.addEventListener('click', function () { show(f, true); }); tabs.appendChild(c); });
        wrap.appendChild(flows.length > 1 ? tabs : h('div'));
        wrap.appendChild(dayTabs);
        wrap.appendChild(body);
        if (flows.length) show(flows[0]); else body.appendChild(h('div', { class: 'muted small' }, '還沒有流程'));
        return card('營期流程', wrap);
      }
    },
    studentflow: {
      today: function (d, b, env, pub) { return sfView(pub, 'today', env); },
      tomorrow: function (d, b, env, pub) { return sfView(pub, 'tomorrow', env); },
      all: function (d, b, env, pub) { return sfView(pub, 'all', env); }
    },
    scoreboard: {
      mini: function (d) {
        return h('div', { class: 'fb row' }, h('div', { class: 'grow' }, h('div', { class: 'small muted' }, (d.title || '團隊積分') + (d.provisional ? '（暫定）' : '')),
          d.mine ? h('div', null, h('b', { style: { fontSize: '18px' } }, d.mine.name), '　第 ' + d.mine.rank + ' 名 · ', h('b', null, d.mine.score), ' 分') : h('div', { class: 'muted' }, '你還沒有分到小隊')),
          d.top ? h('div', { style: { textAlign: 'right' } }, h('div', { class: 'small muted' }, '目前第一'), h('b', null, d.top.name), h('div', { class: 'small' }, d.top.score + ' 分')) : null);
      },
      team: function (d) {
        if (!d.mine) return card('我的隊伍分數', h('div', { class: 'muted small' }, '你還沒有分到小隊'));
        return card(d.mine.name + ' · ' + d.mine.score + ' 分' + (d.provisional ? '（暫定）' : ''), h('div', { class: 'sched' }, (d.mine.parts || []).map(function (p) {
          return h('div', { class: 'it' }, h('span', { class: 'grow' }, p.name), h('b', { style: { color: p.score < 0 ? 'var(--bad)' : 'var(--ok)' } }, (p.score > 0 ? '+' : '') + p.score));
        }), !(d.mine.parts || []).length ? h('div', { class: 'muted small' }, '還沒有分數') : null), h('div', { class: 'small muted', style: { marginTop: '6px' } }, '目前第 ' + d.mine.rank + ' 名'));
      },
      full: function (d, b, env) {
        var my = env.me && env.me.squad;
        return card((d.title || '團隊積分') + (d.provisional ? '（暫定排名）' : ''), h('div', { class: 'board' }, (d.rows || []).map(function (r) {
          return h('div', { class: 'r' + (String(r.no) === String(my) ? ' me' : '') }, h('span', { class: 'rk' }, r.rank), h('span', { class: 'grow' }, r.name), h('span', { class: 'sc' }, r.score));
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
        if (d.route) {
          (d.route.rotations || []).forEach(function (r) {
            var list = h('div', { class: 'sched' }, r.steps.map(function (s, i) {
              var row = h('div', { class: 'it' }, h('span', { class: 'tm' }, s.time, s.end ? h('small', null, s.end) : null), h('div', { class: 'grow' }, h('div', { class: 'it-hd' }, h('span', { class: 'muted small' }, '第 ' + (i + 1) + ' 站'), h('b', null, s.station || '休息'), placeTags(s.place)), s.vs && s.vs.length ? h('div', { class: 'small vs-line' }, '對手：' + s.vs.join('、')) : null));
              var s0 = tms(r.date, s.time); if (s0) { row.dataset.s = s0; row.dataset.e = s.end ? tms(r.date, s.end) : s0 + 1800000; }
              return row;
            }), r.turn ? h('div', { class: 'small muted' }, '每站之間換關 ' + r.turn + ' 分鐘') : null);
            markNow(list);
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
      form: function (d, b, env) { return selfAssess(d, env); }
    }
  };

  function sfView(pub, which, env) {
    var items = (pub && pub.items) || [], t = taipei(), tm = taipei(new Date(nowDate().getTime() + 86400000));
    var title = (pub && pub.title) || '行程表';
    var pageOf = function (it) { var p = it.activity ? env.pages.filter(function (x) { return x.activity === it.activity; })[0] : null; return p ? p.id : ''; };
    var map = function (arr, showDay) { return arr.map(function (x) { return { date: x.date, time: x.time, title: x.title, note: x.note, page: pageOf(x), showDay: showDay }; }); };
    var go = function (it) { env.nav(it.page); };
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
    if (d.night) box.appendChild(h('div', { class: 'night-banner' }, icon('moon'), h('div', null, h('b', null, '夜間模式'), h('div', { class: 'small' }, '有狀況請先找隊輔或守夜人員'))));
    var calls = h('div');
    if (d.show119) calls.appendChild(contactRow('119', '有生命危險時直接撥打', '119', true));
    if (d.hq && (d.hq.phone || d.hq.name)) calls.appendChild(contactRow(d.hq.name || '營隊指揮中心', '營隊指揮中心', d.hq.phone));
    (d.leaders || []).forEach(function (l) { calls.appendChild(contactRow(l.name, (l.dept || '隊輔') + '（我的隊輔）', l.phone)); });
    (d.watchers || []).forEach(function (w) { calls.appendChild(contactRow(w.name, '今晚守夜 · ' + (w.dept || ''), w.phone)); });
    if (worker) (d.contacts || []).forEach(function (c) { calls.appendChild(contactRow(c.name, c.role, c.phone)); });
    box.appendChild(card(worker ? '緊急聯絡' : '緊急聯絡', calls));
    var guide = worker ? d.sop : d.guide;
    if (d.flow && (d.flow.steps || []).length) box.appendChild(card(d.flow.title || '事件處理流程', flowChart(d.flow)));
    if (guide && !(worker && d.flow)) box.appendChild(card(worker ? '事件處理流程' : '緊急處理', h('div', { class: 'rich', html: md(guide) })));
    if (worker && (d.submissions || []).length) {
      box.appendChild(card('最近的自我評估切結書', h('div', { class: 'col', style: { gap: '4px' } }, d.submissions.map(function (s) {
        return h('details', null, h('summary', { style: { cursor: 'pointer' } }, fmt(s.at) + '　' + s.name + '（第 ' + s.squad + ' 小隊）· ' + (s.answers.needs || '')),
          h('div', { class: 'small', style: { padding: '6px 0 6px 14px' } }, '事件時間：' + (s.answers.eventTime || '').replace('T', ' '), h('br'), '狀況：' + (s.answers.condition || ''), h('br'), '評估：' + (s.answers.canContinue || '')));
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
    return env.blocks.filter(function (b) { return b.type === 'pkg' && (b.page === pageId || (extra && extra.indexOf(b.id) >= 0)) && b.data.pkg !== 'studentflow'; })
      .map(function (b) { return { id: b.id, pkg: b.data.pkg, view: b.data.view, config: b.data.config || {} }; });
  }

  return { page: page, block: block, liveBlocks: liveBlocks, VIEWS: VIEWS, kids: kids, pageById: pageById, flowChart: flowChart, markNow: markNow, centerNow: centerNow, actColor: actColor, mapView: mapView, detailTable: detailTable, MAP_ANGLES: MAP_ANGLES, CELL_COLORS: CELL_COLORS, photo: photo, FRAMES: FRAMES, COURSE_LAYOUTS: COURSE_LAYOUTS, courseCard: courseCard };
})();
