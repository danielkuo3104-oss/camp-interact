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
      if (onItem && it.page) row.addEventListener('click', function () { onItem(it); });
      out.appendChild(row);
    });
    if (!items.length) out.appendChild(h('div', { class: 'muted small' }, '目前沒有行程'));
    return out;
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
        var wrap = h('div', { class: 'col' });
        var tabs = h('div', { class: 'chips' }), body = h('div');
        var show = function (f) {
          $all('.chip', tabs).forEach(function (c) { c.classList.toggle('on', c.dataset.id === f.id); });
          clear(body);
          var day = '';
          var list = h('div', { class: 'sched' });
          f.items.forEach(function (it) {
            if (it.date !== day) { day = it.date; list.appendChild(h('div', { class: 'day' }, dayLabel(it.date))); }
            var people = [it.owner.length ? '負責：' + it.owner.join('、') : '', it.staff.length ? '人員：' + it.staff.join('、') : '', it.backup.length ? '機動：' + it.backup.join('、') : ''].filter(String).join('　');
            list.appendChild(h('div', { class: 'it' }, h('span', { class: 'tm' }, it.time), h('div', { class: 'grow' },
              h('b', null, it.name), it.place ? h('span', { class: 'muted' }, '　📍' + it.place) : null,
              it.activity && it.public === false ? h('span', { class: 'tag warn', style: { marginLeft: '6px' } }, '學員未公開') : null,
              people ? h('div', { class: 'small muted' }, people) : null,
              cf.map(function (k) { return it.custom && it.custom[k] ? h('div', { class: 'small' }, k + '：' + it.custom[k]) : null; }),
              it.note ? h('div', { class: 'small' }, it.note) : null,
              okUrl(it.link) ? h('a', { class: 'small', href: it.link, target: '_blank', rel: 'noopener' }, '相關連結') : null,
              it.diff ? h('div', { class: 'diff' }, '與既定行程不同：原訂 ' + it.diff.planned.date.slice(5) + ' ' + it.diff.planned.time + (it.diff.planned.place ? ' ' + it.diff.planned.place : '') + (it.diff.by ? '（' + it.diff.by + ' ' + fmt(it.diff.at) + ' 調整）' : '')) : null)));
          });
          if (!f.items.length) list.appendChild(h('div', { class: 'muted small' }, '這份流程還沒有項目'));
          body.appendChild(list);
        };
        flows.forEach(function (f) { var c = h('span', { class: 'chip', 'data-id': f.id }, f.name); c.addEventListener('click', function () { show(f); }); tabs.appendChild(c); });
        wrap.appendChild(tabs);
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
        if (d.route) {
          (d.route.rotations || []).forEach(function (r) {
            box.appendChild(card(r.activity + '：' + d.squadName + '的順序', r.mode === 'map' && okUrl(r.image) ? h('img', { src: r.image, alt: '跑關地圖' }) :
              h('div', { class: 'sched' }, r.steps.map(function (s, i) { return h('div', { class: 'it' }, h('span', { class: 'tm' }, s.time), h('span', null, '第 ' + (i + 1) + ' 站　', h('b', null, s.station || '休息'))); }))));
          });
          if ((d.route.items || []).length) box.appendChild(card('我的帶隊流程', schedList(d.route.items.map(function (x) { return { date: x.date, time: x.time, title: x.name, note: x.place, showDay: true }; }))));
        }
        box.appendChild(card('我的工作', (d.tasks || []).length ? h('div', { class: 'col', style: { gap: '6px' } }, d.tasks.map(function (t) {
          return h('div', { class: 'contact' }, h('div', { class: 'who' }, h('b', null, t.activity + '　' + t.role), h('small', null, [t.date ? dayLabel(t.date) : '', t.detail].filter(String).join(' · '))));
        })) : h('div', { class: 'muted small' }, d.preview ? '預覽時不會帶入個人工作' : '目前沒有分配到工作')));
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
        var list = d.list || [], by = d.groupBy === 'date' ? 'date' : 'type';
        if (!list.length) return card(d.title || '課程簡介', h('div', { class: 'muted small' }, '還沒有課程'));
        var keys = by === 'date' ? list.map(function (c) { return c.date; }).filter(function (x, i, a) { return a.indexOf(x) === i; }) : (d.types || []).filter(function (t) { return list.some(function (c) { return c.type === t; }); });
        var mins = function (n) { return n >= 60 ? Math.floor(n / 60) + ' 小時' + (n % 60 ? ' ' + (n % 60) + ' 分' : '') : n + ' 分鐘'; };
        var one = function (c) {
          var when = [c.date ? dayLabel(c.date) : '', c.start ? c.start + (c.end ? '–' + c.end : '') : '', c.dur ? '（' + mins(c.dur) + '）' : ''].filter(String).join(' ');
          return h('details', { class: 'cs' }, h('summary', null, c.photo ? h('img', { class: 'cs-av', src: c.photo, alt: '', loading: 'lazy' }) : null,
            h('div', { class: 'grow' }, h('b', null, c.title), by === 'date' ? h('span', { class: 'tag', style: { marginLeft: '6px' } }, c.type) : null, h('div', { class: 'small muted' }, when), (c.speaker || c.place) ? h('div', { class: 'small muted' }, [c.speaker, c.place ? '📍 ' + c.place : ''].filter(String).join('　')) : null)),
            h('div', { class: 'cs-body' }, c.photo ? h('img', { class: 'cs-big', src: c.photo, alt: c.title, loading: 'lazy' }) : null, c.desc ? h('div', { class: 'rich', html: md(c.desc) }) : null,
              (c.files || []).length ? h('div', { class: 'col', style: { gap: '4px', marginTop: '6px' } }, c.files.map(function (f) { return okUrl(f.url) ? h('a', { class: 'btn sm', href: f.url, target: '_blank', rel: 'noopener', style: { justifyContent: 'flex-start' } }, (f.kind === 'pdf' ? '📄 ' : f.kind === 'slides' ? '📊 ' : '📎 ') + (f.name || '檔案')) : null; })) : null));
        };
        return card(d.title || '課程簡介', h('div', { class: 'col' }, keys.map(function (k) {
          return h('div', { class: 'col', style: { gap: '6px' } }, h('div', { class: 'cs-grp' }, by === 'date' ? (k ? dayLabel(k) : '未定日期') : k), list.filter(function (c) { return (by === 'date' ? c.date : c.type) === k; }).map(one));
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
    var items = (pub && pub.items) || [], t = taipei(), tm = taipei(new Date(Date.now() + 86400000));
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

  return { page: page, block: block, liveBlocks: liveBlocks, VIEWS: VIEWS, kids: kids, pageById: pageById, flowChart: flowChart };
})();
