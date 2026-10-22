/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 各 Package 的資料畫面（#data/<pkg>/<分頁>）。資料寫入一律走 pkg.data（Package 的 adminOps）。
 * 同一筆資料被別人先改了會回 CONFLICT，畫面會重新載入讓你看到最新內容。
 */

var PkgAdmin = (function () {
  var R = null, M = null, TAB = '', Q = {};

  function open(m, pkg, tab, q) {
    M = m; TAB = tab; Q = q || {};
    m.appendChild(h('div', { class: 'empty' }, '載入中…'));
    load(pkg, true);
  }
  /** cached：剛打開這頁時先用上次的資料（改完資料後的重新載入一定抓最新的） */
  function load(pkg, cached) {
    pkg = pkg || R.pkg;
    var m0 = M, show = function (r) { if (M !== m0) return; R = r; render(); };
    var p = cached ? apiCached('getPkgAdmin', [A.camp, pkg], show) : api('getPkgAdmin', A.camp, pkg).then(function (r) { apiCachePut('getPkgAdmin', [A.camp, pkg], r); show(r); });
    return p.then(null, function (e) { clear(M).appendChild(h('div', { class: 'card' }, h('h2', null, '無法開啟'), h('p', null, e.message))); });
  }
  function reload() { return load(R.pkg); }

  /** 送出 Package 操作；成功後重新載入 */
  function run(name, data, o) {
    o = o || {};
    return A.op('pkg.data', { action: o.action || 'update', target: { pkg: R.pkg, op: name }, data: data, ver: o.ver }).then(function (x) {
      if (o.msg !== false) toast(o.msg || '已儲存');
      reload();
      A.poll();
      return x;
    }, function (e) {
      if (e.code === 'CONFLICT') { toast(e.message, true); reload(); return; }
      throw e;
    });
  }
  function del(name, data, label) {
    return confirmBox('刪除', '確定要刪除「' + label + '」嗎？', '刪除', true).then(function (ok) { if (ok) return run(name, data, { action: 'delete', msg: '已刪除' }).catch(fail); });
  }

  var TABS = {
    people: [['workers', '工作人員'], ['squads', '小隊'], ['students', '學員'], ['rooms', '分房'], ['assign', '工作分配'], ['config', '設定']],
    schedule: [['items', '營期流程'], ['activities', '活動'], ['rotations', '跑關'], ['places', '場地'], ['flows', '流程清單'], ['config', '設定']],
    studentflow: [['items', '學員行程'], ['pending', '待處理變更'], ['config', '設定']],
    emergency: [['config', '聯絡與夜間設定'], ['watch', '守夜人員'], ['submissions', '自我評估切結書'], ['form', '表單格式']],
    scoreboard: [['board', '排行榜'], ['results', 'Game 結果'], ['adjust', '加／扣分'], ['games', 'Game 清單'], ['config', '設定']]
  };

  function render() {
    var m = clear(M), tabs = TABS[R.pkg] || [['config', '設定']];
    var tab = TAB && tabs.some(function (t) { return t[0] === TAB; }) ? TAB : tabs[0][0];
    A.title(m, R.name, 'v' + R.version + (R.maintenance ? '　🔧 維護中：' + (R.reason || '') : ''), h('a', { class: 'btn sm', href: '#packages' }, 'Package 管理'));
    if (!R.canEdit) m.appendChild(h('div', { class: 'recall-banner', style: { marginBottom: '12px' } }, '你只能查看這個 Package，沒有編輯權限。'));
    if (R.maintenance) m.appendChild(h('div', { class: 'fb-notice', style: { marginBottom: '12px' } }, '模組維護中：暫停寫入（緊急應變的切結書仍可送出）。到「Package 管理」解除維護。'));
    m.appendChild(h('div', { class: 'chips', style: { marginBottom: '14px' } }, tabs.map(function (t) {
      return h('a', { class: 'chip' + (t[0] === tab ? ' on' : ''), href: '#data/' + R.pkg + '/' + t[0], style: { textDecoration: 'none' } }, t[1]);
    })));
    if (R.pkg === 'people') m.appendChild(syncBar());
    var box = h('div');
    m.appendChild(box);
    var fn = (VIEWS[R.pkg] || {})[tab] || (tab === 'config' ? config : null);
    if (fn) fn(box, R.data); else box.appendChild(h('div', { class: 'empty' }, '沒有這個分頁'));
  }

  /** 人員與分隊每個分頁上方：從報名後台同步（學員、小隊、專輔隨輔、分房），每小時也會自動同步 */
  function syncBar() {
    var I = A.info, linked = I.regUrl && I.regPrefix && I.secretSet;
    var btn = R.canEdit && linked ? h('button', { class: 'btn primary', onclick: function (e) {
      busy(e.target, function () { return run('sync', {}, { action: 'run', msg: false }); }).then(function (x) {
        if (x) { toast('已同步：學員 ' + x.total + ' 位（更新 ' + x.changed + '）、專輔隨輔 ' + (x.staff || 0) + ' 位（新增 ' + (x.staffAdded || 0) + '）、房間 ' + (x.rooms || 0) + ' 間'); A.reload().then(function () { A.route(); }); }
      }, function () {});
    } }, '從報名後台同步') : null;
    return h('div', { class: 'card row wrap', style: { padding: '10px 14px', marginBottom: '12px' } }, btn,
      h('span', { class: 'hint grow' }, linked ? '同步學員（小隊、房間）、各隊專輔隨輔（自動成為工作人員）、分房。每小時會自動同步，報名後台改了想馬上看到就按這裡。' + (I.lastSync ? '　上次同步 ' + fmt(I.lastSync) : '　尚未同步')
        : '還沒和報名後台串接，到「營隊設定與備份」設定後就能同步。'));
  }

  /* ---------------- 共用小工具 ---------------- */
  function bar() { var b = h('div', { class: 'row wrap', style: { marginBottom: '10px' } }); for (var i = 0; i < arguments.length; i++) if (arguments[i]) b.appendChild(arguments[i]); return b; }
  function addBtn(text, fn) { return R.canEdit ? h('button', { class: 'btn primary', onclick: fn }, text) : null; }
  function table(heads, rows, empty) {
    if (!rows.length) return h('div', { class: 'card empty' }, empty || '還沒有資料');
    return h('div', { class: 'tbl-wrap' }, h('table', { class: 't' }, h('thead', null, h('tr', null, heads.map(function (x) { return h('th', null, x); }))), h('tbody', null, rows)));
  }
  function actions(edit, remove) {
    if (!R.canEdit) return h('td');
    return h('td', null, h('div', { class: 'row', style: { gap: '4px' } }, edit ? h('button', { class: 'btn sm', onclick: edit }, '編輯') : null, remove ? h('button', { class: 'btn sm ghost', onclick: remove }, '刪除') : null));
  }
  function form(title, fields, onSave, wide) {
    modal({ title: title, wide: wide, body: h('div', { class: 'col' }, fields), actions: [{ text: '取消' }, { text: '儲存', cls: 'primary', onClick: onSave }] });
  }
  function workerItems(list) { return (list || []).map(function (w) { return { value: w.id, label: w.data.name + (w.data.dept ? '（' + w.data.dept + '）' : '') }; }); }
  function nameOf(list, ids) { var m = {}; (list || []).forEach(function (w) { m[w.id] = w.data.name; }); return (ids || []).map(function (i) { return m[i] || '（已移除）'; }).join('、'); }
  function hl(tr, id) { if (Q.id && Q.id === id) { tr.style.background = 'var(--warn-soft)'; setTimeout(function () { tr.scrollIntoView({ block: 'center' }); }, 50); } return tr; }

  /* ---------------- 設定（各 Package 共用） ---------------- */
  function config(box) {
    var vals = {}, card = h('div', { class: 'card col' });
    if (!R.configFields.length) { box.appendChild(h('div', { class: 'card empty' }, '這個 Package 沒有可以調整的設定')); return; }
    R.configFields.forEach(function (f) {
      var v = R.config[f.key], el;
      if (f.type === 'bool') { el = h('input', { type: 'checkbox', checked: !!v, disabled: !R.canEdit }); vals[f.key] = function () { return el.checked; }; card.appendChild(h('label', { class: 'check' }, el, h('span', null, f.label))); return; }
      if (f.type === 'select') el = sel(f.options, v, { disabled: !R.canEdit });
      else if (f.type === 'textarea') el = area(v, { rows: 5, disabled: !R.canEdit });
      else if (f.type === 'json') {
        if (R.pkg === 'emergency' && f.key === 'contacts') { var ed = contactsEditor(v || []); vals[f.key] = ed.get; card.appendChild(field('其他聯絡人', ed.el)); return; }
        el = area(JSON.stringify(v, null, 1), { rows: 4, disabled: !R.canEdit });
      }
      else el = inp(v, { type: f.type === 'number' ? 'number' : f.type === 'time' ? 'time' : 'text', disabled: !R.canEdit });
      vals[f.key] = function () { return el.value; };
      card.appendChild(field(f.label, el));
    });
    if (R.canEdit) card.appendChild(h('div', null, h('button', { class: 'btn primary', onclick: function (e) {
      var cfg = {};
      Object.keys(vals).forEach(function (k) { cfg[k] = vals[k](); });
      busy(e.target, function () { return A.op('pkg.config', { target: { inst: R.inst }, data: { config: cfg } }); }).then(function () { toast('設定已儲存'); reload(); A.poll(); }, function () {});
    } }, '儲存設定')));
    box.appendChild(card);
  }
  function contactsEditor(list) {
    var rows = list.map(function (c) { return { name: c.name || '', role: c.role || '', phone: c.phone || '' }; });
    var el = h('div', { class: 'col', style: { gap: '6px' } });
    var draw = function () {
      clear(el);
      rows.forEach(function (c, i) {
        var a = inp(c.name, { placeholder: '姓名', disabled: !R.canEdit }), b = inp(c.role, { placeholder: '職稱', disabled: !R.canEdit }), p = inp(c.phone, { placeholder: '電話', disabled: !R.canEdit });
        a.oninput = function () { c.name = a.value; }; b.oninput = function () { c.role = b.value; }; p.oninput = function () { c.phone = p.value; };
        el.appendChild(h('div', { class: 'row' }, a, b, p, R.canEdit ? h('button', { class: 'btn sm ghost', onclick: function () { rows.splice(i, 1); draw(); } }, '✕') : null));
      });
      if (R.canEdit) el.appendChild(h('div', null, h('button', { class: 'btn sm', onclick: function () { rows.push({ name: '', role: '', phone: '' }); draw(); } }, '＋ 聯絡人')));
    };
    draw();
    return { el: el, get: function () { return rows.filter(function (c) { return c.name || c.phone; }); } };
  }

  /* ---------------- 各 Package ---------------- */
  var VIEWS = {};

  VIEWS.people = {
    workers: function (box, D) {
      var edit = function (w) {
        w = w || { id: '', data: {} };
        var d = w.data, name = inp(d.name), dept = inp(d.dept), squad = inp(d.squad, { type: 'number', min: 1 }), phone = inp(d.phone, { type: 'tel' }), note = inp(d.note), off = h('input', { type: 'checkbox', checked: !!d.inactive });
        form(w.id ? '編輯工作人員' : '新增工作人員', [h('div', { class: 'grid2' }, field('姓名', name), field('股別', dept)), h('div', { class: 'grid2' }, field('帶的小隊（隊輔才填）', squad), field('電話', phone)), field('備註', note), h('label', { class: 'check' }, off, h('span', null, '停用（不能登入、不出現在名單）'))],
          function () { return run('worker.save', { id: w.id, name: name.value, dept: dept.value, squad: squad.value, phone: phone.value, note: note.value, inactive: off.checked }, { ver: w.id ? w.version : undefined }); });
      };
      var imp = function () {
        var t = area('', { rows: 8, placeholder: '王小明,輔導,1,0912345678\n李大華,活動' });
        form('貼上多位工作人員', [field('每行一位：姓名,股別,小隊,電話（小隊和電話可省略）', t, '同名同股別已存在的會略過')], function () { return run('worker.import', { text: t.value }, { action: 'create', msg: false }).then(function (x) { if (x) toast('新增 ' + x.added + ' 位'); }); });
      };
      box.appendChild(bar(addBtn('新增工作人員', function () { edit(); }), R.canEdit ? h('button', { class: 'btn', onclick: imp }, '一次貼上多位') : null,
        h('span', { class: 'hint' }, '工作人員用「姓名＋股別＋營隊通行碼」登入工作人員端；同名同股別會無法登入。報名後台的專輔、隨輔會自動加進來（股別「輔導」）。')));
      var list = D.workers.slice().sort(function (a, b) { return (a.data.dept + a.data.name).localeCompare(b.data.dept + b.data.name); });
      var sqText = function (w) { var a = []; if (w.data.squad !== '' && w.data.squad !== undefined && w.data.squad !== null) a.push(String(w.data.squad)); (w.data.regSquads || []).forEach(function (n) { if (a.indexOf(String(n)) < 0) a.push(String(n)); }); return a.join('、'); };
      box.appendChild(table(['姓名', '股別', '小隊', '電話', '備註', ''], list.map(function (w) {
        return hl(h('tr', { style: w.data.inactive ? { opacity: 0.5 } : null }, h('td', null, w.data.name, w.data.inactive ? h('span', { class: 'tag', style: { marginLeft: '4px' } }, '停用') : null, w.data.title ? h('span', { class: 'tag info', style: { marginLeft: '4px' }, title: '從報名後台同步' }, w.data.title) : null), h('td', null, w.data.dept), h('td', null, sqText(w)), h('td', null, w.data.phone || ''), h('td', { class: 'small' }, w.data.note || ''),
          actions(function () { edit(w); }, function () { del('worker.delete', { id: w.id }, w.data.name); })), w.id);
      }), '還沒有工作人員'));
    },
    squads: function (box, D) {
      var edit = function (s) {
        s = s || { data: {} };
        var no = inp(s.data.no, { type: 'number', min: 1, max: 99, disabled: !!s.id }), name = inp(s.data.name), line = inp(s.data.line, { placeholder: 'https://line.me/…' });
        form(s.id ? '編輯小隊' : '新增小隊', [h('div', { class: 'grid2' }, field('小隊號碼', no), field('隊名', name)), field('小隊群組連結（學員端會顯示）', line)], function () { return run('squad.save', { no: no.value, name: name.value, line: line.value }); });
      };
      box.appendChild(bar(addBtn('新增小隊', function () { edit(); }), h('span', { class: 'hint' }, '和報名系統串接時，同步名單會自動補上報名系統的小隊。')));
      var staffOf = function (no) {
        var out = [];
        D.workers.forEach(function (w) { if (w.data.inactive) return; var sq = (w.data.regSquads || []).map(Number); if (String(w.data.squad) === String(no) || sq.indexOf(Number(no)) >= 0) out.push(w.data.name + ((w.data.titles || {})[String(no)] ? '（' + w.data.titles[String(no)] + '）' : '')); });
        return out.join('、');
      };
      var cnt = function (no) { return D.students.filter(function (x) { return x.data.active !== false && String(x.data.squad) === String(no); }).length; };
      box.appendChild(table(['號碼', '隊名', '專輔、隨輔', '學員', '群組', ''], D.squads.map(function (s) {
        return h('tr', null, h('td', null, s.data.no), h('td', null, s.data.name), h('td', { class: 'small' }, staffOf(s.data.no) || h('span', { class: 'tag warn' }, '未安排')), h('td', null, cnt(s.data.no)), h('td', { class: 'small' }, s.data.line ? '有' : ''), actions(function () { edit(s); }, function () { del('squad.delete', { no: s.data.no }, s.data.name); }));
      }), '還沒有小隊'));
    },
    students: function (box, D) {
      var active = D.students.filter(function (s) { return s.data.active !== false; });
      var add = addBtn('手動新增（測試用）', function () {
        var name = inp(''), squad = inp('', { type: 'number', min: 1 });
        form('手動新增學員', [field('姓名', name), field('小隊', squad), h('div', { class: 'hint' }, '正式學員請從報名系統同步；手動新增的學員不能從學員專區進入，只用於測試畫面。')], function () { return run('student.save', { name: name.value, squad: squad.value }, { action: 'create' }); });
      });
      box.appendChild(bar(add, h('span', { class: 'hint' }, '有效 ' + active.length + ' 位')));
      box.appendChild(h('div', { class: 'hint', style: { marginBottom: '8px' } }, '報名系統是正式資料來源：互動系統只保存學員代碼、姓名、小隊、房間與是否有效，分隊、分房要在報名系統改。'));
      box.appendChild(table(['學員代碼', '姓名', '小隊', '房間', '狀態'], D.students.slice().sort(function (a, b) { return (Number(a.data.squad) || 99) - (Number(b.data.squad) || 99); }).map(function (s) {
        return h('tr', null, h('td', { class: 'small' }, s.id), h('td', null, s.data.name), h('td', null, s.data.squad || '—'), h('td', null, s.data.room || '—'), h('td', null, s.data.active === false ? h('span', { class: 'tag' }, '無效（取消／候補）') : h('span', { class: 'tag ok' }, '有效'), s.data.manual ? h('span', { class: 'tag info', style: { marginLeft: '4px' } }, '手動') : null));
      }), '還沒有學員。到「營隊設定」完成串接後按「從報名後台同步」。'));
    },
    rooms: function (box, D) {
      var act = D.students.filter(function (s) { return s.data.active !== false; });
      var none = act.filter(function (s) { return !s.data.room; }).length;
      box.appendChild(h('div', { class: 'hint', style: { marginBottom: '8px' } }, '分房在報名後台設定，這裡只顯示同步來的結果。工作人員端可以放「分房表（工作人員）」畫面；學員端「我的資料」會顯示自己的房間（報名後台有公布分房時）。' + (none ? '　還有 ' + none + ' 位學員沒有分房。' : '')));
      box.appendChild(table(['房號', '名稱', '性別', '備註', '學員'], (D.rooms || []).map(function (r) {
        var ppl = act.filter(function (s) { return s.data.room === r.no; }).map(function (s) { return s.data.name; });
        return h('tr', null, h('td', null, h('b', null, r.no)), h('td', null, r.label || ''), h('td', null, r.sex || '不限'), h('td', { class: 'small' }, r.note || ''), h('td', { class: 'small' }, ppl.length + ' 人：' + (ppl.join('、') || '—')));
      }), '還沒有分房資料。在報名後台分房後，按上面的「從報名後台同步」。'));
    },
    assign: function (box, D) {
      var edit = function (a) {
        a = a || { id: '', data: {} };
        var d = a.data, act = inp(d.activity), role = inp(d.role, { placeholder: '例如：關主、守夜、機動' }), detail = inp(d.detail), date = inp(d.date, { type: 'date' });
        var ppl = chips(workerItems(D.workers), d.people);
        form(a.id ? '編輯工作分配' : '新增工作分配', [h('div', { class: 'grid2' }, field('活動', act), field('角色', role)), h('div', { class: 'grid2' }, field('詳細工作', detail), field('日期（守夜要填）', date)), field('人員', ppl.el)],
          function () { return run('assign.save', { id: a.id, activity: act.value, role: role.value, detail: detail.value, date: date.value, people: ppl.get() }, { ver: a.id ? a.version : undefined }); }, true);
      };
      box.appendChild(bar(addBtn('新增工作分配', function () { edit(); }), h('span', { class: 'hint' }, '活動 → 角色 → 詳細工作 → 人員。角色含「守夜」的會自動成為當晚的守夜人員。')));
      box.appendChild(table(['活動', '角色', '詳細工作', '日期', '人員', ''], D.assign.map(function (a) {
        return hl(h('tr', null, h('td', null, a.data.activity), h('td', null, a.data.role), h('td', null, a.data.detail || ''), h('td', null, a.data.date || ''), h('td', { class: 'small' }, nameOf(D.workers, a.data.people) || h('span', { class: 'tag warn' }, '未指派')),
          actions(function () { edit(a); }, function () { del('assign.delete', { id: a.id }, a.data.activity + '／' + a.data.role); })), a.id);
      }), '還沒有工作分配'));
    }
  };

  var PUB = { public: '公開', hidden: '不公開', auto: '自動公開', manual: '手動公開' };
  VIEWS.schedule = {
    items: function (box, D) {
      var flows = D.flows.slice().sort(function (a, b) { return (a.data.order || 0) - (b.data.order || 0); });
      var cur = Q.flow || (flows[0] && flows[0].id) || 'main';
      var cf = String(R.config.customFields || '').split(/[、,，]/).map(function (x) { return x.trim(); }).filter(String);
      var acts = [{ value: '', label: '（不連活動）' }].concat(D.activities.map(function (a) { return { value: a.id, label: a.data.name }; }));
      var edit = function (it) {
        it = it || { id: '', data: { flow: cur } };
        var d = it.data;
        var flow = sel(flows.map(function (f) { return { value: f.id, label: f.data.name }; }), d.flow || cur), date = inp(d.date, { type: 'date' }), time = inp(d.time, { type: 'time' }), dur = inp(d.dur || '', { type: 'number', min: 0, placeholder: '分鐘' });
        var name = inp(d.name), place = inp(d.place, { list: 'placeList' }), act = sel(acts, d.activity || ''), note = area(d.note, { rows: 2 }), link = inp(d.link, { placeholder: 'https://' });
        var wi = workerItems(D.workers), owner = chips(wi, d.owner), staff = chips(wi, d.staff), backup = chips(wi, d.backup);
        var sq = chips(D.squads.map(function (s) { return { value: s.no, label: s.name }; }), d.squads);
        var custom = {};
        var dl = h('datalist', { id: 'placeList' }, D.places.map(function (p) { return h('option', { value: p.data.name }); }));
        form(it.id ? '編輯流程項目' : '新增流程項目', [dl, h('div', { class: 'grid2' }, field('流程', flow), field('活動名稱', name)), h('div', { class: 'grid2' }, h('div', { class: 'grid2' }, field('日期', date), field('時間', time)), h('div', { class: 'grid2' }, field('時長', dur), field('場地', place))),
          field('連到活動（決定學員看不看得到、現在主題）', act), field('負責人員', owner.el), field('關主／參與人員', staff.el), field('機動人員', backup.el), field('參與小隊（隊輔的帶隊流程會顯示）', sq.el),
          cf.map(function (k) { var x = inp((d.custom || {})[k]); custom[k] = x; return field(k, x); }), field('備註', note), field('連結', link)],
          function () {
            var c = {};
            Object.keys(custom).forEach(function (k) { c[k] = custom[k].value; });
            return run('item.save', { id: it.id, flow: flow.value, date: date.value, time: time.value, dur: dur.value, name: name.value, place: place.value, activity: act.value, owner: owner.get(), staff: staff.get(), backup: backup.get(), squads: sq.get(), note: note.value, link: link.value, custom: c }, { ver: it.id ? it.version : undefined });
          }, true);
      };
      var csv = function () {
        var rows = [['流程', '日期', '時間', '時長', '活動名稱', '場地', '負責人員', '關主／參與人員', '機動人員', '備註', '連結'].concat(cf)];
        var fname = {};
        flows.forEach(function (f) { fname[f.id] = f.data.name; });
        D.items.forEach(function (it) { var d = it.data; rows.push([fname[d.flow] || d.flow, d.date, d.time, d.dur || '', d.name, d.place, nameOf(D.workers, d.owner), nameOf(D.workers, d.staff), nameOf(D.workers, d.backup), d.note || '', d.link || ''].concat(cf.map(function (k) { return (d.custom || {})[k] || ''; }))); });
        var text = '﻿' + rows.map(function (r) { return r.map(function (c) { c = String(c === undefined ? '' : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
        var a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: A.info.name + '-營期流程.csv' });
        document.body.appendChild(a); a.click(); a.remove();
      };
      box.appendChild(bar(addBtn('新增流程項目', function () { edit(); }), h('button', { class: 'btn', onclick: csv }, '匯出 Excel（CSV）'),
        A.isAdmin() && R.canEdit ? h('button', { class: 'btn', onclick: function () {
          confirmBox('鎖定既定行程', '把目前所有項目的日期、時間、時長、場地記為「既定行程」。之後的修改會在工作人員端顯示「與既定行程不同」（原訂、調整者、時間）。', '鎖定').then(function (ok) { if (ok) run('baseline', {}, { action: 'run', msg: '已鎖定既定行程' }).catch(fail); });
        } }, '鎖定既定行程') : null));
      box.appendChild(h('div', { class: 'chips', style: { marginBottom: '10px' } }, flows.map(function (f) { return h('a', { class: 'chip' + (f.id === cur ? ' on' : ''), href: '#data/schedule/items?flow=' + f.id, style: { textDecoration: 'none' } }, f.data.name); })));
      var items = D.items.filter(function (it) { return (it.data.flow || 'main') === cur; });
      var actName = {};
      D.activities.forEach(function (a) { actName[a.id] = a.data; });
      box.appendChild(table(['日期', '時間', '活動名稱', '場地', '人員', ''], items.map(function (it) {
        var d = it.data, moved = d.planned && ['date', 'time', 'dur', 'place'].some(function (k) { return String(d.planned[k] || '') !== String(d[k] || ''); });
        var a = d.activity ? actName[d.activity] : null;
        return hl(h('tr', null, h('td', { style: { whiteSpace: 'nowrap' } }, d.date ? dayLabel(d.date) : h('span', { class: 'tag bad' }, '沒日期')), h('td', null, d.time || h('span', { class: 'tag bad' }, '沒時間'), d.dur ? h('div', { class: 'small muted' }, d.dur + ' 分') : null),
          h('td', null, h('b', null, d.name), a ? h('div', { class: 'small' }, h('span', { class: 'tag info' }, '活動：' + a.name + '（' + PUB[a.publicMode] + '）')) : null, moved ? h('div', { class: 'diff' }, '與既定行程不同：原訂 ' + (d.planned.date || '').slice(5) + ' ' + d.planned.time + (d.changedBy ? '（' + d.changedBy + '）' : '')) : null),
          h('td', null, d.place || h('span', { class: 'tag warn' }, '沒場地')), h('td', { class: 'small' }, [d.owner && d.owner.length ? '負責：' + nameOf(D.workers, d.owner) : '', d.staff && d.staff.length ? '人員：' + nameOf(D.workers, d.staff) : '', d.backup && d.backup.length ? '機動：' + nameOf(D.workers, d.backup) : ''].filter(String).join('\n')),
          actions(function () { edit(it); }, function () { del('item.delete', { id: it.id }, d.name); })), it.id);
      }), '這份流程還沒有項目'));
    },
    activities: function (box, D) {
      var canReveal = A.can('publish_student');
      var edit = function (a) {
        a = a || { id: '', data: { publicMode: 'hidden' } };
        var d = a.data, name = inp(d.name), mode = sel(Object.keys(PUB).map(function (k) { return { value: k, label: PUB[k] }; }), d.publicMode), at = inp(d.autoAt ? d.autoAt.slice(0, 16) : '', { type: 'datetime-local' }), sum = area(d.summary, { rows: 2 });
        var atWrap = field('自動公開時間（台灣時間）', at);
        var tog = function () { atWrap.classList.toggle('hidden', mode.value !== 'auto'); };
        mode.addEventListener('change', tog);
        tog();
        form(a.id ? '編輯活動' : '新增活動', [field('活動名稱', name), field('學員端公開', mode, '已排程 ≠ 學員已知道。秘密活動選「手動公開」，到時候再按「公開」。'), atWrap, field('簡介（現在主題與活動列表會顯示）', sum)],
          function () { return run('activity.save', { id: a.id, name: name.value, publicMode: mode.value, autoAt: at.value ? at.value + ':00+08:00' : '', summary: sum.value }, { ver: a.id ? a.version : undefined }); });
      };
      box.appendChild(bar(addBtn('新增活動', function () { edit(); }), h('span', { class: 'hint' }, '活動卡片頁：在編輯器裡把頁面連到活動，活動還沒公開時學員端看不到那一頁。')));
      box.appendChild(table(['活動', '公開設定', '學員現在看得到', '簡介', ''], D.activities.map(function (a) {
        var d = a.data, now = Date.now(), vis = d.publicMode === 'public' || (d.publicMode === 'auto' && Date.parse(d.autoAt) <= now) || (d.publicMode === 'manual' && d.revealed);
        return hl(h('tr', null, h('td', null, h('b', null, d.name)), h('td', null, PUB[d.publicMode], d.publicMode === 'auto' ? h('div', { class: 'small muted' }, d.autoAt ? fmt(d.autoAt) : '未設定時間') : null),
          h('td', null, vis ? h('span', { class: 'tag ok' }, '看得到') : h('span', { class: 'tag' }, '看不到'), d.publicMode === 'manual' && canReveal ? h('button', { class: 'btn sm', style: { marginLeft: '6px' }, onclick: function (e) {
            busy(e.target, function () { return run('activity.reveal', { id: a.id, revealed: !d.revealed }, { msg: d.revealed ? '已收回' : '已公開' }); }).catch(function () {});
          } }, d.revealed ? '收回' : '公開') : null, d.revealedBy ? h('div', { class: 'small muted' }, (d.revealed ? '公開' : '收回') + '：' + d.revealedBy + ' ' + fmt(d.revealedAt)) : null),
          h('td', { class: 'small' }, d.summary || ''), actions(function () { edit(a); }, function () { del('activity.delete', { id: a.id }, d.name); })), a.id);
      }), '還沒有活動'));
    },
    rotations: function (box, D) {
      var acts = [{ value: '', label: '（不連活動）' }].concat(D.activities.map(function (a) { return { value: a.id, label: a.data.name }; }));
      var edit = function (r) {
        r = r || { id: '', data: { stations: [], slots: [], grid: {}, mode: 'table' } };
        var d = JSON.parse(JSON.stringify(r.data));
        d.grid = d.grid || {};
        var act = sel(acts, d.activity || ''), name = inp(d.name), stations = inp((d.stations || []).join('、'), { placeholder: '第一關、第二關、第三關' }), slots = inp((d.slots || []).join('、'), { placeholder: '09:00、09:30、10:00' });
        var mode = sel([{ value: 'table', label: '表格' }, { value: 'map', label: '上傳地圖（圖片網址）' }], d.mode || 'table'), img = inp(d.image, { placeholder: 'https://' });
        var grid = h('div');
        var split = function (s) { return s.split(/[、,，]/).map(function (x) { return x.trim(); }).filter(String); };
        var draw = function () {
          clear(grid);
          var st = split(stations.value), sl = split(slots.value);
          if (!st.length || !sl.length || !D.squads.length) { grid.appendChild(h('div', { class: 'hint' }, D.squads.length ? '填好關卡和時段後，這裡會出現排序表' : '先到「人員與分隊」建立小隊')); return; }
          grid.appendChild(h('div', { class: 'tbl-wrap' }, h('table', { class: 't grid-rot' }, h('thead', null, h('tr', null, h('th', null, '小隊＼時段'), sl.map(function (t) { return h('th', null, t); }))),
            h('tbody', null, D.squads.map(function (s) {
              var row = d.grid[String(s.no)] = (d.grid[String(s.no)] || []).slice(0, sl.length);
              return h('tr', null, h('td', null, s.name), sl.map(function (t, i) {
                var x = sel([{ value: '', label: '—' }].concat(st.map(function (n, j) { return { value: j, label: n }; })), row[i] === undefined || row[i] === null ? '' : row[i]);
                x.addEventListener('change', function () { row[i] = x.value === '' ? '' : Number(x.value); });
                return h('td', null, x);
              }));
            })))));
          grid.appendChild(h('div', { class: 'hint' }, '兩隊同時在同一關是否算錯，在「設定」的「兩隊同時在同一關」調整。'));
        };
        stations.addEventListener('change', draw);
        slots.addEventListener('change', draw);
        draw();
        form(r.id ? '編輯跑關' : '新增跑關', [h('div', { class: 'grid2' }, field('活動', act), field('名稱', name)), h('div', { class: 'grid2' }, field('關卡（用、分隔）', stations), field('時段（用、分隔）', slots)), h('div', { class: 'grid2' }, field('顯示方式', mode), field('地圖圖片', img)), grid],
          function () { return run('rotation.save', { id: r.id, activity: act.value, name: name.value, stations: split(stations.value), slots: split(slots.value), grid: d.grid, mode: mode.value, image: img.value }, { ver: r.id ? r.version : undefined }); }, true);
      };
      var an = {};
      D.activities.forEach(function (a) { an[a.id] = a.data.name; });
      box.appendChild(bar(addBtn('新增跑關', function () { edit(); }), h('span', { class: 'hint' }, '時段 × 小隊 → 關卡。隊輔在工作人員端「主頁」會看到自己小隊的順序。')));
      box.appendChild(table(['跑關', '關卡', '時段', ''], D.rotations.map(function (r) {
        return hl(h('tr', null, h('td', null, h('b', null, r.data.name || an[r.data.activity] || '跑關')), h('td', { class: 'small' }, (r.data.stations || []).join('、')), h('td', { class: 'small' }, (r.data.slots || []).join('、')),
          actions(function () { edit(r); }, function () { del('rotation.delete', { id: r.id }, r.data.name || '跑關'); })), r.id);
      }), '還沒有跑關'));
    },
    places: function (box, D) {
      box.appendChild(bar(addBtn('新增場地', function () {
        var name = inp(''), cat = inp('', { placeholder: '例如：室內、戶外' });
        form('新增場地', [field('場地名稱', name), field('分類', cat)], function () { return run('place.save', { name: name.value, cat: cat.value }, { action: 'create' }); });
      }), h('span', { class: 'hint' }, '流程項目填新場地時會自動加進來。')));
      box.appendChild(table(['場地', '分類', ''], D.places.map(function (p) { return h('tr', null, h('td', null, p.data.name), h('td', null, p.data.cat || ''), actions(null, function () { del('place.delete', { id: p.id }, p.data.name); })); }), '還沒有場地'));
    },
    flows: function (box, D) {
      box.appendChild(bar(addBtn('新增流程', function () {
        var name = inp('', { placeholder: '例如：一驗、二驗、總驗、某活動細流' }), order = inp(D.flows.length, { type: 'number' });
        form('新增流程', [field('名稱', name), field('排序', order)], function () { return run('flow.save', { name: name.value, kind: 'detail', order: order.value }, { action: 'create' }); });
      }), h('span', { class: 'hint' }, '「總流程」決定學員首頁的現在主題；其他流程（驗收、細流）只給工作人員看。')));
      box.appendChild(table(['流程', '種類', '項目數', ''], D.flows.map(function (f) {
        var n = D.items.filter(function (it) { return it.data.flow === f.id; }).length;
        return h('tr', null, h('td', null, f.data.name), h('td', null, f.data.kind === 'main' ? '總流程' : '細流'), h('td', null, n), f.data.kind === 'main' ? h('td') : actions(null, function () { del('flow.delete', { id: f.id }, f.data.name); }));
      })));
    }
  };

  VIEWS.studentflow = {
    items: function (box, D) {
      var sch = D.schedule.map(function (s) { return { value: s.id, label: (s.data.date || '').slice(5) + ' ' + (s.data.time || '') + ' ' + s.data.name }; });
      var acts = [{ value: '', label: '（不連活動）' }].concat((D.activities || []).map(function (a) { return { value: a.id, label: a.data.name }; }));
      var edit = function (it) {
        it = it || { id: '', data: {} };
        var d = it.data, date = inp(d.date, { type: 'date' }), time = inp(d.time, { type: 'time' }), title = inp(d.title), note = inp(d.note), act = sel(acts, d.activity || ''), ref = sel([{ value: '', label: '（不引用）' }].concat(sch), d.ref || '');
        ref.addEventListener('change', function () {
          var s = D.schedule.filter(function (x) { return x.id === ref.value; })[0];
          if (s && !it.id) { date.value = s.data.date; time.value = s.data.time; title.value = title.value || s.data.name; if (s.data.activity) act.value = s.data.activity; }
        });
        form(it.id ? '編輯學員行程' : '新增學員行程', [field('引用營期流程項目（時間參考，不會硬性同步）', ref), h('div', { class: 'grid2' }, field('日期', date), field('時間', time)), field('名稱', title), field('說明', note), field('連到活動（點了會開活動卡片）', act)],
          function () { return run('item.save', { id: it.id, date: date.value, time: time.value, title: title.value, note: note.value, activity: act.value, ref: ref.value }, { ver: it.id ? it.version : undefined }); });
      };
      box.appendChild(bar(addBtn('新增學員行程', function () { edit(); }), h('span', { class: 'hint' }, '放進這裡＝學員看得到（要保密就先不要放）。內容跟著學員端一起發布。')));
      if (D.pending.length) box.appendChild(h('a', { class: 'fb-notice', href: '#data/studentflow/pending', style: { display: 'block', marginBottom: '10px' } }, '營期流程有 ' + D.pending.length + ' 項變更還沒處理 →'));
      box.appendChild(table(['日期', '時間', '名稱', '說明', '引用', ''], D.items.map(function (it) {
        var d = it.data;
        return h('tr', null, h('td', null, d.date ? dayLabel(d.date) : h('span', { class: 'tag bad' }, '沒日期')), h('td', null, d.time), h('td', null, h('b', null, d.title)), h('td', { class: 'small' }, d.note || ''), h('td', { class: 'small' }, d.ref ? '🔗 ' + ((d.refSnap || {}).name || '') : ''),
          actions(function () { edit(it); }, function () { del('item.delete', { id: it.id }, d.title); }));
      }), '還沒有學員行程'));
    },
    pending: function (box, D) {
      if (!D.pending.length) { box.appendChild(h('div', { class: 'card empty' }, '沒有待處理的變更 👍')); return; }
      var rows = D.pending.map(function (p) {
        var ck = h('input', { type: 'checkbox', checked: true }), ch = sel([{ value: 'apply', label: p.type === 'add' ? '加入學員行程' : p.type === 'delete' ? '從學員行程刪除' : '套用' }, { value: 'keep', label: p.type === 'add' ? '不加入' : '維持現狀' }].concat(p.type === 'time' || p.type === 'add' ? [{ value: 'custom', label: '自訂時間' }] : []), 'apply');
        var d = inp(p.date || '', { type: 'date' }), t = inp(p.time || '', { type: 'time' }), cw = h('div', { class: 'row hidden' }, d, t);
        ch.addEventListener('change', function () { cw.classList.toggle('hidden', ch.value !== 'custom'); });
        return { p: p, ck: ck, ch: ch, d: d, t: t, tr: h('tr', null, h('td', null, ck), h('td', null, h('b', null, p.title), h('div', { class: 'small' }, p.text)), h('td', null, ch, cw)) };
      });
      box.appendChild(h('div', { class: 'hint', style: { marginBottom: '8px' } }, '營期流程改了不會自動改到學員行程。勾選要處理的項目、選擇處理方式，一次送出。引用關係會保留，之後流程再變還會出現在這裡。'));
      box.appendChild(table(['', '變更', '處理方式'], rows.map(function (r) { return r.tr; })));
      if (R.canEdit) box.appendChild(h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn primary', onclick: function (e) {
        var list = rows.filter(function (r) { return r.ck.checked; }).map(function (r) { return { key: r.p.key, choice: r.ch.value, date: r.d.value, time: r.t.value }; });
        if (!list.length) { toast('請至少勾選一項', true); return; }
        busy(e.target, function () { return run('pending.apply', { list: list }, { action: 'run', msg: false }); }).then(function (x) { if (x) toast('已處理 ' + x.handled + ' 項'); }, function () {});
      } }, '處理勾選的項目')));
    }
  };

  VIEWS.emergency = {
    watch: function (box, D) {
      var dates = [];
      if (A.info.start && A.info.end) for (var d = new Date(A.info.start + 'T12:00:00+08:00'); taipei(d).ymd < A.info.end; d = new Date(d.getTime() + 86400000)) dates.push(taipei(d).ymd);
      D.watch.forEach(function (w) { if (dates.indexOf(w.id) < 0) dates.push(w.id); });
      dates.sort();
      box.appendChild(h('div', { class: 'card col', style: { marginBottom: '12px' } }, h('h2', null, '今晚（' + D.tonightDate + '）守夜'), D.tonight.length ? D.tonight.map(function (w) { return h('div', null, w.name + '（' + w.dept + '）' + (w.phone ? '　' + w.phone : '')); }) : h('div', { class: 'muted' }, '還沒有守夜人員')));
      box.appendChild(h('div', { class: 'hint', style: { marginBottom: '8px' } }, '預設從「工作分配」裡角色含「守夜」的人抓；臨時換班或代班可以在這裡另外指定當晚的守夜人員（指定後以這裡為準）。'));
      var other = inp('', { type: 'date' });
      box.appendChild(bar(R.canEdit ? h('span', { class: 'row' }, other, h('button', { class: 'btn', onclick: function () { if (other.value && dates.indexOf(other.value) < 0) { dates.push(other.value); dates.sort(); clear(list); draw(); } } }, '加一個日期')) : null));
      var list = h('div', { class: 'col' });
      var draw = function () {
        dates.forEach(function (dt) {
          var ov = D.watch.filter(function (w) { return w.id === dt; })[0];
          var ch = chips(workerItems(D.workers), ov ? ov.data.wids : []);
          list.appendChild(h('div', { class: 'card col' }, h('div', { class: 'row' }, h('b', { class: 'grow' }, dayLabel(dt) + ' 晚上'), ov && (ov.data.wids || []).length ? h('span', { class: 'tag info' }, '已另外指定') : h('span', { class: 'tag' }, '依工作分配')), ch.el,
            R.canEdit ? h('div', null, h('button', { class: 'btn sm', onclick: function (e) { busy(e.target, function () { return run('watch.save', { date: dt, wids: ch.get() }); }).catch(function () {}); } }, '儲存這一晚')) : null));
        });
        if (!dates.length) list.appendChild(h('div', { class: 'card empty' }, '在「營隊設定」填營期日期後，這裡會列出每一晚'));
      };
      draw();
      box.appendChild(list);
    },
    submissions: function (box, D) {
      box.appendChild(h('div', { class: 'hint', style: { marginBottom: '8px' } }, '學員在學員端送出的自我評估切結書（固定格式）。送出時有編輯工作人員端權限的人會收到通知。'));
      box.appendChild(table(['送出時間', '學員', '小隊', '事件時間', '身體狀況', '自我評估', '需要的協助'], D.submissions.map(function (s) {
        var a = s.data.answers || {};
        return h('tr', null, h('td', null, fmt(s.data.at)), h('td', null, s.data.name), h('td', null, s.data.squad), h('td', { class: 'small' }, String(a.eventTime || '').replace('T', ' ')), h('td', { class: 'small' }, a.condition), h('td', null, a.canContinue), h('td', null, a.needs));
      }), '還沒有人送出'));
    },
    form: function (box, D) {
      box.appendChild(h('div', { class: 'card col' }, h('div', { class: 'hint' }, '自我評估切結書是固定格式的系統表單（第 ' + D.form.version + ' 版），欄位寫在程式裡，營隊不能修改，確保每個營隊的紀錄格式一致。'),
        h('ol', { style: { margin: 0, paddingLeft: '20px' } }, D.form.fields.map(function (f) { return h('li', null, f.label + (f.options ? '（' + f.options.join('／') + '）' : '') + (f.required ? '　必填' : '')); }))));
    }
  };

  VIEWS.scoreboard = {
    board: function (box, D) {
      var b = D.board;
      box.appendChild(h('div', { class: 'card' }, h('h2', null, (R.config.title || '團隊積分') + (b.provisional ? '（暫定排名）' : '')),
        h('div', { class: 'board' }, b.rows.map(function (r) { return h('details', { class: 'r', style: { display: 'block' } }, h('summary', { class: 'row', style: { cursor: 'pointer' } }, h('span', { class: 'rk' }, r.rank), h('span', { class: 'grow' }, r.name), h('span', { class: 'sc' }, r.score)),
          h('div', { class: 'small', style: { padding: '6px 0 0 40px' } }, r.parts.length ? r.parts.map(function (p) { return h('div', null, p.name + '：' + (p.score > 0 ? '+' : '') + p.score); }) : '還沒有分數')); })),
        b.provisional ? h('div', { class: 'hint', style: { marginTop: '8px' } }, '有 Game 結果還沒發布，所以是暫定排名。到「Game 清單」發布。') : null));
    },
    games: function (box, D) {
      var REL = { immediate: '立即發布', all: '所有隊伍到齊後發布', manual: '手動發布' };
      var canPub = A.info.isRoot || ((A.info.pkgPerms || {})[R.pkg] || []).indexOf('publish') >= 0;
      var edit = function (g) {
        g = g || { id: '', data: { release: 'immediate' } };
        var name = inp(g.data.name), rel = sel(Object.keys(REL).map(function (k) { return { value: k, label: REL[k] }; }), g.data.release);
        form(g.id ? '編輯 Game' : '新增 Game', [field('名稱', name), field('結果發布方式', rel)], function () { return run('game.save', { id: g.id, name: name.value, release: rel.value }, { ver: g.id ? g.version : undefined }); });
      };
      box.appendChild(bar(addBtn('新增 Game', function () { edit(); })));
      box.appendChild(table(['Game', '發布方式', '已收到', '狀態', ''], D.games.map(function (g) {
        var n = D.results.filter(function (r) { return r.data.game === g.id; }).length, ok = D.board.released[g.id];
        return h('tr', null, h('td', null, h('b', null, g.data.name)), h('td', null, REL[g.data.release]), h('td', null, n + '／' + D.teams.length + ' 隊'),
          h('td', null, ok ? h('span', { class: 'tag ok' }, '已發布') : h('span', { class: 'tag' }, '未發布'), canPub && R.canEdit ? h('button', { class: 'btn sm', style: { marginLeft: '6px' }, onclick: function (e) {
            busy(e.target, function () { return run('game.publish', { id: g.id, published: !g.data.published }, { msg: g.data.published ? '已收回' : '已發布' }); }).catch(function () {});
          } }, g.data.published ? '收回手動發布' : '手動發布') : null),
          actions(function () { edit(g); }, n ? null : function () { del('game.delete', { id: g.id }, g.data.name); }));
      }), '還沒有 Game'));
    },
    results: function (box, D) {
      if (R.canEdit && D.games.length) {
        var g = sel(D.games.map(function (x) { return { value: x.id, label: x.data.name }; }), D.games[0].id), t = sel(D.teams.map(function (x) { return { value: x.no, label: x.name }; }), D.teams[0] && D.teams[0].no), s = inp('', { type: 'number' }), note = inp('');
        box.appendChild(h('div', { class: 'card col', style: { marginBottom: '12px' } }, h('h2', null, '提交 Game 結果'), h('div', { class: 'hint' }, '同一個 Game 同一隊再送一次是「更新結果」（最新的生效），不是加分；修正請用新的分數覆蓋或到「加／扣分」。'),
          h('div', { class: 'grid2' }, field('Game', g), field('隊伍', t)), h('div', { class: 'grid2' }, field('分數', s), D.categories ? field('備註', note) : h('span')),
          h('div', null, h('button', { class: 'btn primary', onclick: function (e) { busy(e.target, function () { return run('result.submit', { game: g.value, team: t.value, score: s.value, note: note.value }, { action: 'create', msg: false }); }).then(function (x) { if (x) { toast(x.updated ? '已更新這一隊的結果' : '已送出'); } }, function () {}); } }, '送出'))));
      }
      var gn = {};
      D.games.forEach(function (x) { gn[x.id] = x.data.name; });
      box.appendChild(table(['Game', '隊伍', '分數', '時間', '提交者'], D.results.slice().sort(function (a, b) { return String(b.data.at).localeCompare(String(a.data.at)); }).map(function (r) {
        return h('tr', null, h('td', null, gn[r.data.game] || '（已刪除）'), h('td', null, r.data.team), h('td', null, h('b', null, r.data.score)), h('td', { class: 'small' }, fmt(r.data.at)), h('td', { class: 'small' }, r.data.by || ''));
      }), D.games.length ? '還沒有結果' : '先到「Game 清單」新增 Game'));
    },
    adjust: function (box, D) {
      if (R.canEdit) {
        var t = sel(D.teams.map(function (x) { return { value: x.no, label: x.name }; }), D.teams[0] && D.teams[0].no), dl = inp('', { type: 'number', placeholder: '+100 或 -100' }), note = inp('', { placeholder: '可空白' });
        var cat = D.categories ? sel(D.categories, D.categories[0]) : null;
        box.appendChild(h('div', { class: 'card col', style: { marginBottom: '12px' } }, h('h2', null, '手動加／扣分'), h('div', { class: 'hint' }, '每一筆都是獨立的修正事件，立即生效；要更正就再加一筆反向的。'),
          h('div', { class: 'grid2' }, field('隊伍', t), field('分數', dl)), h('div', { class: 'grid2' }, cat ? field('類別', cat) : h('span'), field('理由', note)),
          h('div', null, h('button', { class: 'btn primary', onclick: function (e) { busy(e.target, function () { return run('adjust.add', { team: t.value, delta: dl.value, note: note.value, category: cat ? cat.value : '' }, { action: 'create', msg: '已記錄' }); }).catch(function () {}); } }, '記錄'))));
      }
      box.appendChild(table(['時間', '隊伍', '分數', D.categories ? '類別' : '', '理由', '記錄者'].filter(String), D.adjust.map(function (a) {
        return h('tr', null, h('td', { class: 'small' }, fmt(a.data.at)), h('td', null, a.data.team), h('td', null, h('b', { style: { color: a.data.delta < 0 ? 'var(--bad)' : 'var(--ok)' } }, (a.data.delta > 0 ? '+' : '') + a.data.delta)), D.categories ? h('td', null, a.data.category || '') : null, h('td', { class: 'small' }, a.data.note || ''), h('td', { class: 'small' }, a.data.by || ''));
      }), '還沒有加減分'));
    }
  };

  return { open: open };
})();
