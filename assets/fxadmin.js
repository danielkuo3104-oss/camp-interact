/* 動畫管理：學員端所有動畫的開關集中在這一頁（換頁翻牌／滑入、定時翻列、白天四種背景、夜間星空、團隊積分級距動畫、第一名裝飾） */
(function () {
  var TIER_FX = ['微光（柔光＋閃點）', '泡泡（往上冒）', '彩帶（飄落）', '煙火（不定時綻放）', '金光（掃光＋金粉）'];
  var TIER_DF = [{ min: 0, name: '起步' }, { min: 100, name: '加溫' }, { min: 200, name: '火熱' }, { min: 350, name: '閃耀' }, { min: 500, name: '傳奇' }];
  var DFLT = { cardFlip: true, slide: true, rowFlip: true, rowDelay: 30, rowEvery: 3, dayBg: true, dawnEnd: '08:00', morningEnd: '11:00', noonEnd: '13:00', nightSky: true, tierFx: true, firstDeco: true };

  function check(on, label, hint) {
    var el = h('input', { type: 'checkbox', checked: !!on });
    return { el: el, row: h('label', { class: 'check' }, el, h('span', null, label, hint ? h('span', { class: 'small muted' }, '　' + hint) : null)) };
  }

  /** 小隊分數級距：五級，各填名稱和最低分數；每一級在學員端有不同的卡片背景動畫 */
  function tiersEditor(list, onChange) {
    var rows = [0, 1, 2, 3, 4].map(function (i) { var x = list[i] || TIER_DF[i]; return { name: x.name || TIER_DF[i].name, min: i ? Number(x.min) : 0 }; });
    var warn = h('div', { class: 'small', style: { color: 'var(--bad)' } });
    var bad = function () { return rows.some(function (r, i) { return i && !(r.min > rows[i - 1].min); }); };
    var upd = function () { warn.textContent = bad() ? '最低分數要一級比一級高' : ''; onChange(); };
    var el = h('div', { class: 'col', style: { gap: '2px' } });
    rows.forEach(function (r, i) {
      var n = inp(r.name, { placeholder: '名稱', maxlength: 12, style: { flex: '1 1 0', minWidth: '0' } }), m = inp(String(r.min), { type: 'number', style: { width: '90px', flex: 'none' } });
      n.oninput = function () { r.name = n.value; onChange(); }; m.oninput = function () { r.min = Number(m.value) || 0; upd(); };
      var demo = h('div', { class: 'fb tier tier-' + (i + 1) + ' tier-demo' }, h('span', { class: 'tier-badge tb-' + (i + 1) }, 'Lv.' + (i + 1)));
      demo.insertBefore(Front.tierLayer(i), demo.firstChild);
      el.appendChild(h('div', { class: 'tier-row' }, demo, h('div', { class: 'col grow', style: { gap: '4px', minWidth: '0' } },
        h('div', { class: 'row', style: { gap: '6px', alignItems: 'center' } }, n, i === 0 ? h('span', { class: 'small muted', style: { flex: 'none' } }, '0 分起') : m, i === 0 ? null : h('span', { class: 'small muted', style: { flex: 'none' } }, '分起')),
        h('div', { class: 'small muted' }, '動畫：' + TIER_FX[i]))));
    });
    el.appendChild(warn);
    return { el: el, bad: bad, get: function () { return rows.map(function (r, i) { return { name: String(r.name || '').trim() || TIER_DF[i].name, min: i ? r.min : 0 }; }); } };
  }

  /** 白天四種背景＋夜間的預覽，時段跟著上面填的時間即時更新 */
  function todPreview(t) {
    var V = function (k) { return t[k].value; };
    var tiles = [['dawn', '清晨', 'nightEnd', 'dawnEnd'], ['morning', '早上', 'dawnEnd', 'morningEnd'], ['noon', '中午', 'morningEnd', 'noonEnd'], ['afternoon', '午後', 'noonEnd', 'nightStart'], ['night', '夜間', 'nightStart', 'nightEnd']];
    var labels = [], warn = h('div', { class: 'small', style: { color: 'var(--bad)' } });
    var wrap = h('div', { class: 'tod-pv' }, tiles.map(function (x) {
      var scene;
      if (x[0] === 'night') {
        scene = h('div', { class: 'sky' });
        for (var i = 0; i < 26; i++) { var z = 1 + Math.random() * 2; scene.appendChild(h('i', { style: { left: (Math.random() * 100).toFixed(1) + '%', top: (Math.random() * 80).toFixed(1) + '%', width: z.toFixed(1) + 'px', height: z.toFixed(1) + 'px', animationDelay: (Math.random() * 4).toFixed(2) + 's' } })); }
        scene.appendChild(h('b', { class: 'meteor' }));
      } else {
        scene = h('div', { class: 'amb tod-' + x[0] }, h('i'), h('i'), h('i'), h('b', { class: 'sun' }), h('b', { class: 'cloud' }), h('b', { class: 'cloud c2' }));
        for (var j = 0; j < 6; j++) scene.appendChild(h('span', { class: 'pt', style: { left: (8 + j * 16) + '%', width: '7px', height: '7px', background: 'rgba(200, 128, 58, .4)', animationDuration: (8 + j) + 's', animationDelay: '-' + j * 1.4 + 's' } }));
      }
      var lb = h('div', { class: 'small muted' });
      labels.push(function () { lb.textContent = V(x[2]) + '–' + V(x[3]); });
      return h('div', { class: 'tod-tile' + (x[0] === 'night' ? ' is-night' : '') }, h('div', { class: 'tod-scene' }, scene), h('div', { class: 'tod-cap' }, h('b', null, x[1]), lb));
    }));
    var bad = function () {
      var q = {}; Object.keys(t).forEach(function (k) { q[k] = V(k); });
      return !(q.nightEnd < q.dawnEnd && q.dawnEnd < q.morningEnd && q.morningEnd < q.noonEnd && (q.noonEnd < q.nightStart || q.nightStart < q.nightEnd));
    };
    var upd = function () { labels.forEach(function (f) { f(); }); warn.textContent = bad() ? '時間要依序：夜間結束 < 清晨到 < 早上到 < 中午到 < 夜間開始' : ''; };
    Object.keys(t).forEach(function (k) { t[k].addEventListener('input', upd); });
    upd();
    return { el: h('div', { class: 'col', style: { gap: '6px' } }, wrap, warn), bad: bad, upd: upd };
  }

  /** 換頁示範：照目前勾的設定播一次（流程卡翻牌、其他卡滑入） */
  function motionDemo(get) {
    var stage = h('div', { class: 'fx-demo app-body' });
    var play = function () {
      var f = get();
      clear(stage);
      var c = h('div', { class: 'col page-content', style: { gap: '8px' } },
        h('div', { class: 'fb fx-demo-card' }, h('b', null, '公告'), h('div', { class: 'small muted' }, '一般卡片')),
        h('div', { class: 'fb fx-demo-card' }, h('b', null, '今日行程'), h('div', { class: 'sched' }, h('div', { class: 'it' }, h('span', { class: 'tm' }, '09:00'), h('span', null, '大地遊戲')))),
        h('div', { class: 'fb fx-demo-card' }, h('b', null, '活動介紹'), h('div', { class: 'small muted' }, '一般卡片')));
      stage.appendChild(c);
      if (!motionOk()) return;
      $all(':scope > *', c).forEach(function (el, i) {
        el.style.setProperty('--i', i);
        if (f.cardFlip && el.querySelector('.sched')) { el.style.setProperty('--fi', i); el.classList.add('flip'); }
      });
      if (f.slide) c.classList.add('pg-in', 'from-r');
    };
    play();
    return { el: h('div', { class: 'col', style: { gap: '6px' } }, stage, h('div', null, h('button', { class: 'btn sm', type: 'button', onclick: play }, '▶ 播放示範'))), play: play };
  }

  A.views.fx = function (m) {
    var f = Object.assign({}, DFLT, A.info.fx || {}), tiers = (A.info.fx && A.info.fx.tiers) || TIER_DF;
    A.title(m, '動畫管理', '學員端的動畫都在這裡開關。改完按最下面的「儲存」，學員下次打開或重新整理就會套用。');
    var dirty = false, saveBtn, status = h('span', { class: 'small muted' });
    var touch = function () { dirty = true; status.textContent = '● 尚未儲存'; status.style.color = 'var(--warn, #b26b00)'; };

    // 換頁與翻牌
    var cf = check(f.cardFlip, '流程與分數的卡片翻牌', '換頁、重新整理時'), sl = check(f.slide, '其他卡片滑進來', '換頁、重新整理時（工作人員端也是）'), rf = check(f.rowFlip, '定時翻列', '流程、排行一列一列像時刻表一樣翻');
    var rd = inp(String(f.rowDelay), { type: 'number', min: 0, max: 600, style: { width: '90px' } }), re = inp(String(f.rowEvery), { type: 'number', min: 1, max: 60, style: { width: '90px' } });
    var demo = motionDemo(function () { return { cardFlip: cf.el.checked, slide: sl.el.checked }; });
    [cf.el, sl.el].forEach(function (x) { x.addEventListener('change', function () { touch(); demo.play(); }); });
    [rf.el, rd, re].forEach(function (x) { x.addEventListener('input', touch); x.addEventListener('change', touch); });
    m.appendChild(h('div', { class: 'card col' }, h('h2', null, '換頁與翻牌'), cf.row, sl.row, rf.row,
      h('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', paddingLeft: '26px' } }, h('span', { class: 'small' }, '打開'), rd, h('span', { class: 'small' }, '秒後開始翻，之後每'), re, h('span', { class: 'small' }, '分鐘一輪')),
      field('示範', demo.el)));

    // 背景
    var db = check(f.dayBg, '白天背景動畫', '光暈、陽光、雲、小光點，依時段換風格'), ns = check(f.nightSky, '夜間星空', '星星閃爍、流星');
    var times = { nightEnd: inp('06:30', { type: 'time', disabled: true }), dawnEnd: inp(f.dawnEnd, { type: 'time' }), morningEnd: inp(f.morningEnd, { type: 'time' }), noonEnd: inp(f.noonEnd, { type: 'time' }), nightStart: inp('22:30', { type: 'time', disabled: true }) };
    var night0 = null, tp = todPreview(times);
    [db.el, ns.el].forEach(function (x) { x.addEventListener('change', touch); });
    Object.keys(times).forEach(function (k) { times[k].addEventListener('input', touch); });
    // 夜間開始／結束存在緊急聯絡的設定；有安裝才能在這裡改
    api('getPkgAdmin', A.camp, 'emergency').then(function (r) {
      var c = (r && r.config) || {};
      night0 = { nightStart: c.nightStart || '22:30', nightEnd: c.nightEnd || '06:30' };
      times.nightStart.value = night0.nightStart; times.nightEnd.value = night0.nightEnd;
      times.nightStart.disabled = times.nightEnd.disabled = false; tp.upd();
    }, function () {});
    m.appendChild(h('div', { class: 'card col' }, h('h2', null, '背景'), db.row,
      h('div', { class: 'fx-times' }, field('清晨（夜間結束）', times.nightEnd), field('早上從', times.dawnEnd), field('中午從', times.morningEnd), field('午後從', times.noonEnd), field('夜間從', times.nightStart)),
      h('div', { class: 'hint' }, '五個時段：清晨 → 早上 → 中午 → 午後 → 夜間。夜間時段學員端會換成夜間模式（和「緊急聯絡」的夜間設定是同一個）。'),
      ns.row, field('預覽（學員端白天四種、夜間一種）', tp.el)));

    // 團隊積分
    var tf = check(f.tierFx, '分數級距動畫', '卡片依小隊分數換背景動畫，顯示 Lv 和升級進度'), fd = check(f.firstDeco, '第一名隊伍特殊裝飾', '皇冠＋金色流光邊框');
    var te = tiersEditor(tiers, touch);
    var firstBox = h('div');
    var drawFirst = function () {
      clear(firstBox);
      var fx = { tiers: te.get(), tierFx: tf.el.checked, firstDeco: fd.el.checked };
      firstBox.appendChild(Front.VIEWS.scoreboard.mini({ title: '團隊積分', mine: { name: '飛魚隊', score: 380, rank: 1, parts: [] }, fx: fx }, {}, {}));
    };
    [tf.el, fd.el].forEach(function (x) { x.addEventListener('change', function () { touch(); drawFirst(); }); });
    drawFirst();
    m.appendChild(h('div', { class: 'card col' }, h('h2', null, '團隊積分'), tf.row, field('五個級距（名稱、最低分數）', te.el), fd.row, field('第一名的樣子（示範）', firstBox)));

    var get = function () {
      return { cardFlip: cf.el.checked, slide: sl.el.checked, rowFlip: rf.el.checked, rowDelay: Number(rd.value), rowEvery: Number(re.value), dayBg: db.el.checked,
        dawnEnd: times.dawnEnd.value, morningEnd: times.morningEnd.value, noonEnd: times.noonEnd.value, nightSky: ns.el.checked, tierFx: tf.el.checked, firstDeco: fd.el.checked, tiers: te.get() };
    };
    saveBtn = h('button', { class: 'btn primary', onclick: function (e) {
      if (tp.bad() || te.bad()) { toast('請先修正標紅字的地方', true); return; }
      var d = { fx: get() };
      if (night0 && (times.nightStart.value !== night0.nightStart || times.nightEnd.value !== night0.nightEnd)) { d.nightStart = times.nightStart.value; d.nightEnd = times.nightEnd.value; }
      busy(e.target, function () { return A.op('camp.fx', { data: d }); }).then(function (r) {
        if (r && r.night) night0 = r.night;
        dirty = false; status.textContent = '✓ 已儲存'; status.style.color = 'var(--ok)'; toast('動畫設定已儲存');
        if (r && r.fx) A.info.fx = r.fx;
      }, function () {});
    } }, '儲存');
    m.appendChild(h('div', { class: 'row fx-save' }, saveBtn, status));
    A.leaving = null;
    window.addEventListener('beforeunload', function (ev) { if (dirty && location.hash === '#fx') { ev.preventDefault(); ev.returnValue = ''; } });
  };
})();
