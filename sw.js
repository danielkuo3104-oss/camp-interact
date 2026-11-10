/* 營隊互動系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 離線打開：把網頁本身（各頁的 HTML、assets/ 的程式與樣式、圖示）存在手機裡。
 *   有網路：照樣先上網拿最新的（改版馬上生效），拿到就順便更新手機裡那份。
 *   沒網路：用手機裡的那份，頁面照樣打得開；資料由各頁自己用上次存的（app.js、game.js）。
 * 不管：後端 API（Apps Script，跨網域 POST）、games/（game.js 自己存資源包）。
 * 第一次要在有網路時打開過一次，之後才能離線打開。
 */
var CACHE = 'ia-shell-v1';
var SHELL = ['./', 'index.html', 'app.html', 'game.html', 'camps.html', 'admin.html',
  'assets/style.css', 'assets/config.js', 'assets/core.js', 'assets/richtext.js', 'assets/render.js', 'assets/app.js', 'assets/game.js',
  'assets/qrcode.min.js', 'assets/staff.js', 'assets/camps.js', 'assets/admin.js', 'assets/editor.js', 'assets/pkgadmin.js', 'assets/fxadmin.js',
  'icon-192.png', 'icon-512.png'];
// 遊戲裡掃 QR code 用的元件（iPhone 沒有內建掃描）：存起來，斷網也能掃
var CDN = ['https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'];

function scope() { return self.registration.scope; }
/** 存的時候不管網址參數（app.html?c=…&s=… 都是同一頁） */
function keyOf(url) { var u = new URL(url); return u.origin === location.origin ? u.origin + u.pathname : u.href; }

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // 一個一個存：某個檔案拿不到也不要整個失敗
    return Promise.all(SHELL.map(function (p) {
      var url = new URL(p, scope()).href;
      return fetch(url, { cache: 'reload' }).then(function (r) { if (r.ok) return c.put(keyOf(url), r); }).catch(function () {});
    }).concat(CDN.map(function (url) {
      return fetch(url, { mode: 'cors' }).then(function (r) { if (r.ok) return c.put(url, r); }).catch(function () {});
    })));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return /^ia-shell-/.test(k) && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var u = new URL(req.url);
  var same = u.origin === location.origin;
  if (same) {
    var base = new URL(scope());
    if (u.pathname.indexOf(base.pathname) !== 0) return;
    if (/^games\//.test(u.pathname.slice(base.pathname.length))) return;   // 遊戲資源包 game.js 自己管
  } else if (CDN.indexOf(u.href) < 0) return;

  var key = keyOf(req.url);
  e.respondWith(fetch(req).then(function (r) {
    if (r && r.ok && (r.type === 'basic' || r.type === 'cors')) {
      var copy = r.clone();
      e.waitUntil(caches.open(CACHE).then(function (c) { return c.put(key, copy); }).catch(function () {}));
    }
    return r;
  }, function (err) {
    return caches.open(CACHE).then(function (c) {
      return c.match(key).then(function (hit) {
        if (hit) return hit;
        // 沒存過的網址（例如 ./?xxx）：打開頁面時退回登入頁
        if (req.mode === 'navigate') return c.match(keyOf(new URL('index.html', scope()).href));
        return null;
      });
    }).then(function (hit) { if (hit) return hit; throw err; });
  }));
});
