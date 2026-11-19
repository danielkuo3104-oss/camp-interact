/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 版權聲明小彩蛋：前台頁面最下面的「© 2026 Daniel GUO」。
 *   學員端點下去會「壞掉」約 3 秒（每次隨機一種），之後自動恢復原狀；工作人員端只是文字。
 *   雜訊閃爍、頁面一張張被清空、錯誤視窗一直跳、藍色當機畫面。
 *   冷卻 1 分鐘（存在手機上，重新整理也算），避免活動中被一直點。
 *   手機設定「減少動態效果」時只用不閃爍的兩種。
 * 全部只動畫面上的樣式，不碰資料；跑完把加上去的東西拿掉。
 *
 * 第一位報名的隱藏彩蛋（只有那位學員）：第一次登入的感謝（firstThanks）、版權聲明點了變金色彩帶；
 *   其他藏在 app.js：「營」標誌發金光（點了有反應）、白天背景有一顆金色光點、夜間有一顆金色流星。
 */
var CrashFx = (function () {
  var COOL_MS = 60000, DUR = 3000, CK = 'ia_crash_at';
  var running = false, lastAt = 0;
  var KINDS = ['glitch', 'wipe', 'popups', 'bsod'];

  function now() { return Date.now(); }
  function readLast() { try { return Number(localStorage.getItem(CK)) || 0; } catch (e) { return lastAt; } }
  function writeLast(t) { lastAt = t; try { localStorage.setItem(CK, String(t)); } catch (e) {} }
  function reduced() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  /** 還要等幾秒才能再玩（0＝可以） */
  function coolLeft() { var t = readLast(); return Math.max(0, Math.ceil((t + COOL_MS - now()) / 1000)); }

  /** 蓋在最上面的一層：擋住點擊（壞掉的 3 秒內不會誤按到按鈕） */
  function layer(cls) { var n = el('div', 'crx-layer ' + (cls || '')); n.setAttribute('aria-hidden', 'true'); document.body.appendChild(n); return n; }

  var FX = {
    /** 雜訊閃爍：畫面抖動、色偏、掃描線 */
    glitch: function (root, done) {
      var ly = layer('crx-noise');
      ly.appendChild(el('div', 'crx-bars'));
      ly.appendChild(el('div', 'crx-msg crx-sig', '訊號不良 ▓▒░ NO SIGNAL'));
      root.classList.add('crx-glitch');
      setTimeout(function () { root.classList.remove('crx-glitch'); ly.remove(); done(); }, DUR);
    },
    /** 頁面一張張被清空，最後剩游標在閃 */
    wipe: function (root, done) {
      var ly = layer('crx-clear');
      var parts = [].slice.call(root.querySelectorAll('.page-content > *, .app-head, .app-tabs, .wk-menu, .app-copy, .recall-banner'));
      parts.reverse().forEach(function (p, i) {
        p.style.setProperty('--crx-r', (Math.random() * 30 - 15).toFixed(1) + 'deg');
        setTimeout(function () { p.classList.add('crx-fall'); }, 120 + i * Math.min(160, 1500 / Math.max(1, parts.length)));
      });
      var cur = el('div', 'crx-msg crx-cursor', 'C:\\營隊互動> _');
      setTimeout(function () { ly.classList.add('on'); ly.appendChild(cur); }, 1900);
      setTimeout(function () { parts.forEach(function (p) { p.classList.remove('crx-fall'); p.style.removeProperty('--crx-r'); }); ly.remove(); done(); }, DUR);
    },
    /** 錯誤視窗一直跳出來 */
    popups: function (root, done) {
      var ly = layer('crx-pops');
      var texts = ['營隊互動 沒有回應', '錯誤 0xCAMP2026：隊輔不見了', '記憶體不足：零食已吃完', '找不到檔案：作息表.xlsx', '未預期的錯誤：太好玩了', '程式已停止運作'];
      var n = 0, tm = setInterval(function () {
        var w = el('div', 'crx-win');
        w.style.left = (5 + Math.random() * 45) + '%'; w.style.top = (8 + Math.random() * 60) + '%';
        var bar = el('div', 'crx-win-bar', '⚠ 系統錯誤'); bar.appendChild(el('span', '', '✕'));
        w.appendChild(bar); w.appendChild(el('div', 'crx-win-body', texts[n % texts.length])); w.appendChild(el('div', 'crx-win-btn', '確定'));
        ly.appendChild(w);
        if (++n >= 9) clearInterval(tm);
      }, 260);
      setTimeout(function () { clearInterval(tm); ly.remove(); done(); }, DUR);
    },
    /** 藍色當機畫面＋百分比 */
    bsod: function (root, done) {
      var ly = layer('crx-bsod');
      var box = el('div', 'crx-bs');
      box.appendChild(el('div', 'crx-bs-face', ':('));
      box.appendChild(el('div', 'crx-bs-t', '你的營隊遇到問題，需要重新啟動。我們正在收集一些錯誤資訊，然後會為你重新啟動。'));
      var pct = el('div', 'crx-bs-p', '0% 完成');
      box.appendChild(pct);
      box.appendChild(el('div', 'crx-bs-s', '停止代碼：TOO_MUCH_FUN'));
      ly.appendChild(box);
      var t0 = now(), tm = setInterval(function () { pct.textContent = Math.min(100, Math.floor((now() - t0) / (DUR - 400) * 100)) + '% 完成'; }, 120);
      setTimeout(function () { clearInterval(tm); ly.remove(); done(); }, DUR);
    }
  };

  /** 開始壞掉；kind 可以指定（測試用），沒指定就隨機 */
  function run(kind, force) {
    if (running) return false;
    var left = coolLeft();
    if (left && !force) { if (window.toast) toast('系統正在自我修復，' + left + ' 秒後再試 🔧'); return false; }
    var root = document.getElementById('root') || document.body;
    var list = reduced() ? ['popups', 'bsod'] : KINDS;
    kind = FX[kind] ? kind : pick(list);
    running = true; writeLast(now());
    document.documentElement.classList.add('crx-on');
    FX[kind](root, function () {
      running = false;
      document.documentElement.classList.remove('crx-on');
      if (window.toast) toast('有些秘密，只有願意探索的人才能看見');
    });
    return kind;
  }

  /**
   * 頁尾的版權聲明。o = { crash: 學員端點了假當機（彩蛋管理可以關）, first: 第一位報名（點了變金色彩帶）, found(egg): 回報發現了彩蛋 }
   */
  function footer(side, o) {
    o = o || {};
    var f = el('footer', 'app-copy');
    var txt = '© 2026 Daniel GUO';
    if (side !== 'student' || !(o.crash || o.first)) { f.textContent = txt; return f; }
    var b = el('button', 'app-copy-btn', txt);
    b.type = 'button';
    b.addEventListener('click', function () {
      if (o.first) {   // 第一位報名：不是壞掉，是金色彩帶
        confetti(true);
        if (window.toast) toast('✨ 你果然是第一個發現的');
        if (o.found) o.found('first-copy');
        return;
      }
      if (run() && o.found) o.found('crash');
    });
    f.appendChild(b);
    return f;
  }

  /** 第一位報名：第一次登入的感謝（這支手機只出現一次；預覽每次都出現） */
  function firstThanks(camp, preview, found) {
    var k = 'ia_first_thx_' + camp, seen = false;
    try { seen = !!localStorage.getItem(k); } catch (e) {}
    if (seen && !preview) return false;
    try { if (!preview) localStorage.setItem(k, '1'); } catch (e) {}
    setTimeout(function () {
      confetti(false);
      if (window.modal) modal({ title: '🥇 謝謝你第一個報名！', body: el('p', 'fe-thx', '你是這一屆第一位報名的學員。這個營隊裡藏了幾個只有你看得到的小東西，慢慢找吧 😉'), actions: [{ text: '好，我去找找', cls: 'primary' }] });
      if (found) found('first-thanks');
    }, 600);
    return true;
  }

  /** 彩帶；gold＝全金色 */
  function confetti(gold) {
    if (reduced()) return;
    var box = el('div', 'fe-confetti'), colors = gold ? ['#f6c453', '#e9b23a', '#ffd97a', '#c9971f', '#fff1c1'] : ['#f6b93b', '#e55039', '#4a69bd', '#60a3bc', '#78e08f', '#f78fb3'];
    box.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 70; i++) {
      var p = el('i');
      p.style.left = (Math.random() * 100) + '%';
      p.style.background = colors[i % colors.length];
      p.style.setProperty('--x', (Math.random() * 160 - 80).toFixed(0) + 'px');
      p.style.setProperty('--r', (Math.random() * 900 - 450).toFixed(0) + 'deg');
      p.style.setProperty('--d', (2.2 + Math.random() * 1.8).toFixed(2) + 's');
      p.style.setProperty('--w', (Math.random() * 0.8).toFixed(2) + 's');
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 5000);
  }

  return { run: run, footer: footer, coolLeft: coolLeft, kinds: KINDS.slice(), firstThanks: firstThanks, confetti: confetti };
})();
