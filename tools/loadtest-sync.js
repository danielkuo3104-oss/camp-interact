// 壓力測試（同步與同時寫入）：給之後的遊戲資源包、很多人同時送出用。
//
// 兩種模式：
//   sync   很多人在同一個頻道一起玩：每個人每隔幾秒送一個事件，一邊照 App 的節奏同步（有動靜時快、安靜時慢）。
//          量：每次同步多久、失敗／忙碌多少、每個人有沒有收到別人的每個事件（完整度）、從送出到別人收到要多久（傳遞延遲）。
//   write  很多人「同時送出」（例如一起交表單、關主同時計分）：走一般寫入的同一把鎖，真的寫一列到營隊資料庫的「壓力測試」分頁。
//          量：成功率、排隊等鎖多久、寫入多久、整體回應時間、被擋（系統忙碌）多少。測完自動刪掉「壓力測試」分頁。
//
//   node test/loadtest-sync.js sync  <後端網址 /exec> <營隊ID> <管理者 Email> [人數=50] [秒數=60] [每人幾秒送一次=3] [--rooms=1] [--keep]
//   node test/loadtest-sync.js write <後端網址 /exec> <營隊ID> <管理者 Email> [人數=50] [幾秒內全部送出=5] [每人送幾次=1] [--keep]
//
// 例：node test/loadtest-sync.js sync https://script.google.com/macros/s/xxx/exec C2026XXXX me@gmail.com 80 60 2 --rooms=4
// --rooms=N：把人平均分到 N 個頻道（例如分組比賽）。--keep：測完不刪腳本產生的測試資料。
// 執行後會問密碼（也可以用環境變數 LT_PW）。和 loadtest.js 一樣用測試資料的虛擬人員，請用測試營隊、在沒人用的時間跑。
// 結果印在終端機，也存一份「同步壓力測試結果-日期.json」。需要 Node 18 以上。
const flags = process.argv.slice(2).filter(a => /^--/.test(a)), argv = process.argv.slice(2).filter(a => !/^--/.test(a));
const [MODE, URL_, CAMP, EMAIL] = argv;
const N = Number(argv[4]) || 50;
const KEEP = flags.includes('--keep'), ROOMS = Math.max(1, Number((flags.find(f => /^--rooms=/.test(f)) || '=1').split('=')[1]) || 1);
if (!/^(sync|write)$/.test(MODE || '') || !URL_ || !CAMP || !/@/.test(EMAIL || '')) {
  console.log('用法：\n  node loadtest-sync.js sync  <後端網址> <營隊ID> <管理者Email> [人數=50] [秒數=60] [每人幾秒送一次=3] [--rooms=1] [--keep]\n  node loadtest-sync.js write <後端網址> <營隊ID> <管理者Email> [人數=50] [幾秒內全部送出=5] [每人送幾次=1] [--keep]');
  process.exit(1);
}
const BUSY_RE = /系統忙碌中|too many|simultaneous|invoked too many|Service .*(timed out|unavailable|error)|Exceeded maximum|請稍後再試/i;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pct = (arr, p) => { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const sec = ms => (ms / 1000).toFixed(2) + ' 秒';
const line3 = arr => arr.length ? `中位數 ${sec(pct(arr, 0.5))}、90% 在 ${sec(pct(arr, 0.9))} 內、最久 ${sec(pct(arr, 1))}（${arr.length} 次）` : '—';

async function once(fn, args) {
  const t0 = Date.now();
  try {
    const r = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn, args }), redirect: 'follow' });
    const text = await r.text();
    let j; try { j = JSON.parse(text); } catch (e) { return { ok: false, ms: Date.now() - t0, err: 'HTTP ' + r.status + '（不是 JSON）', retry: true }; }
    if (j.ok && !('result' in j)) return { ok: false, ms: Date.now() - t0, err: '伺服器沒有正確回應', retry: true };
    if (!j.ok) return { ok: false, ms: Date.now() - t0, err: String(j.error).slice(0, 120), retry: BUSY_RE.test(String(j.error)), busy: BUSY_RE.test(String(j.error)) };
    return { ok: true, ms: Date.now() - t0, result: j.result, srv: j._t || null };
  } catch (e) { return { ok: false, ms: Date.now() - t0, err: '連線失敗：' + e.message, retry: true }; }
}
// 和 App 一樣：忙碌或連線失敗時隨機等一下再試（最多 4 次）
async function call(fn, args, st) {
  const t0 = Date.now();
  for (let i = 0; ; i++) {
    const r = await once(fn, args);
    if (!r.ok && st) { st.fails = st.fails || {}; st.fails[r.err] = (st.fails[r.err] || 0) + 1; }
    if (r.ok || !r.retry || i >= 4) { r.total = Date.now() - t0; r.tries = i + 1; return r; }
    if (st) st.retries = (st.retries || 0) + 1;
    await sleep(1500 * Math.pow(2, i) * (0.5 + Math.random()));
  }
}
const peopleOp = (tok, name, data) => call('op', [tok, { op_id: 'lt' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10), camp_id: CAMP, stage: 'data', action: 'run', kind: 'pkg.data', data, target: { pkg: 'people', op: name } }]);

function askPassword(q) {
  if (process.env.LT_PW) return Promise.resolve(process.env.LT_PW);
  return new Promise(resolve => {
    const stdin = process.stdin; let pw = '';
    process.stdout.write(q);
    if (!stdin.isTTY) { let buf = ''; stdin.setEncoding('utf8'); stdin.on('data', c => buf += c); stdin.on('end', () => resolve(buf.split(/\r?\n/)[0])); return; }
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    const onData = ch => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData); process.stdout.write('\n'); return resolve(pw); }
        if (c === '\u0003') { process.stdout.write('\n'); process.exit(1); }
        if (c === '\u007f' || c === '\b') { if (pw) { pw = pw.slice(0, -1); process.stdout.write('\b \b'); } continue; }
        pw += c; process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

// ---------- sync：很多人一起玩 ----------
async function runSync(users) {
  const DUR = (Number(argv[5]) || 60) * 1000, EVERY = (Number(argv[6]) || 3) * 1000, FAST = 1500, SLOW = 8000;
  const tag = 'lt' + Date.now().toString(36);
  const st = { retries: 0 }, calls = [], t0 = Date.now();
  const sent = {};                     // 'room|序號' -> { at: 送出時間, room, from: 使用者編號 }
  const people = users.map((u, i) => ({ u, i, room: tag + '-' + (i % ROOMS), dev: 'p' + i, cursor: null, out: [], got: {}, delays: [], joinedAt: null, me: null, gaps: 0, wait: FAST, seq: 0 }));
  console.log(`\n開始：${users.length} 人分 ${ROOMS} 個頻道，玩 ${DUR / 1000} 秒，每人約每 ${EVERY / 1000} 秒送一個事件…\n`);
  await Promise.all(people.map(async p => {
    await sleep(Math.random() * 3000);         // 3 秒內陸續加入
    let nextSend = Date.now() + Math.random() * EVERY;
    while (Date.now() - t0 < DUR) {
      if (Date.now() >= nextSend) { const k = p.i + '.' + (++p.seq); p.out.push({ k, at: Date.now() }); sent[k] = { at: Date.now(), room: p.room, from: p.i }; nextSend += EVERY * (0.7 + Math.random() * 0.6); }
      const batch = p.out.splice(0, 20);
      const r = await call('sync', [p.u.token, CAMP, p.room, batch, p.cursor, { dev: p.dev }], st);
      const now = Date.now();
      calls.push({ ok: r.ok, ms: r.total, srv: r.srv ? r.srv.ms : null, n: batch.length, tries: r.tries });
      if (!r.ok) { p.out = batch.concat(p.out); process.stdout.write('x'); await sleep(p.wait); continue; }
      if (p.joinedAt === null) p.joinedAt = now;
      p.me = r.result.me; p.cursor = r.result.cursor; p.gaps += r.result.gaps.length;
      r.result.events.forEach(e => { if (e.d && e.d.k && !p.got[e.d.k]) { p.got[e.d.k] = now; p.delays.push(now - e.d.at); } });
      p.wait = batch.length || r.result.events.length ? FAST : Math.min(SLOW, Math.round(p.wait * 1.4));
      if (calls.length % 20 === 0) process.stdout.write('.');
      await sleep(Math.min(p.wait, Math.max(150, nextSend - Date.now())));
    }
    // 收尾：再同步一次把最後的事件送出、收到
    for (let k = 0; k < 2; k++) {
      const r = await call('sync', [p.u.token, CAMP, p.room, p.out.splice(0, 20), p.cursor, { dev: p.dev }], st);
      if (r.ok) { const now = Date.now(); p.cursor = r.result.cursor; r.result.events.forEach(e => { if (e.d && e.d.k && !p.got[e.d.k]) { p.got[e.d.k] = now; p.delays.push(now - e.d.at); } }); }
    }
  }));
  // 最後大家再拉一次（不送），確定該收的都收到了
  await Promise.all(people.map(async p => {
    const r = await call('sync', [p.u.token, CAMP, p.room, [], p.cursor, { dev: p.dev }], st);
    if (r.ok) { const now = Date.now(); r.result.events.forEach(e => { if (e.d && e.d.k && !p.got[e.d.k]) { p.got[e.d.k] = now; p.delays.push(now - e.d.at); } }); }
  }));
  // 完整度：每個人應該收到同頻道其他人在他加入之後送的每個事件
  let should = 0, got = 0;
  people.forEach(p => {
    if (p.joinedAt === null) return;
    Object.keys(sent).forEach(k => { const s = sent[k]; if (s.room !== p.room || s.from === p.i || s.at < p.joinedAt) return; should++; if (p.got[k]) got++; });
  });
  const ok = calls.filter(c => c.ok), delays = people.flatMap(p => p.delays);
  const busy = Object.keys(st.fails || {}).filter(k => BUSY_RE.test(k)).reduce((n, k) => n + st.fails[k], 0);
  const report = {
    mode: 'sync', people: users.length, rooms: ROOMS, seconds: DUR / 1000, everySec: EVERY / 1000,
    calls: calls.length, ok: ok.length, retries: st.retries || 0, busy, fails: st.fails || {},
    callMs: { p50: pct(ok.map(c => c.ms), 0.5), p90: pct(ok.map(c => c.ms), 0.9), max: pct(ok.map(c => c.ms), 1) },
    serverMs: { p50: pct(ok.filter(c => c.srv !== null).map(c => c.srv), 0.5), p90: pct(ok.filter(c => c.srv !== null).map(c => c.srv), 0.9) },
    events: Object.keys(sent).length, delivery: { should, got, pct: should ? Math.round(got / should * 1000) / 10 : 100 },
    delayMs: { p50: pct(delays, 0.5), p90: pct(delays, 0.9), max: pct(delays, 1) }, gaps: people.reduce((n, p) => n + p.gaps, 0)
  };
  console.log('\n\n==== 同步結果 ====');
  console.log(`同步 ${calls.length} 次（約每秒 ${(calls.length / (DUR / 1000)).toFixed(1)} 次）：成功 ${ok.length}（${Math.round(ok.length / Math.max(1, calls.length) * 100)}%），自動重試 ${report.retries} 次，其中系統忙碌 ${busy} 次`);
  console.log(`每次同步：${line3(ok.map(c => c.ms))}`);
  if (ok.some(c => c.srv !== null)) console.log(`  後端實際處理：${line3(ok.filter(c => c.srv !== null).map(c => c.srv))}`);
  console.log(`送出事件 ${report.events} 個；該收到 ${should} 份、收到 ${got} 份（完整度 ${report.delivery.pct}%）${report.gaps ? `；有 ${report.gaps} 次「太久沒同步、漏掉事件」` : ''}`);
  console.log(`從送出到別人收到：${line3(delays)}`);
  if (Object.keys(st.fails || {}).length) { console.log('失敗原因：'); Object.keys(st.fails).forEach(k => console.log('  ' + st.fails[k] + ' 次　' + k)); }
  return report;
}

// ---------- write：很多人同時送出 ----------
async function runWrite(users, adminTok) {
  const WINDOW = (Number(argv[5]) || 5) * 1000, TIMES = Math.max(1, Number(argv[6]) || 1);
  const st = { retries: 0 }, res = [], t0 = Date.now();
  console.log(`\n開始：${users.length} 人在 ${WINDOW / 1000} 秒內各送出 ${TIMES} 次（共 ${users.length * TIMES} 次寫入，排同一把鎖）…\n`);
  await Promise.all(users.map(async (u, i) => {
    for (let k = 0; k < TIMES; k++) {
      await sleep(Math.random() * WINDOW / TIMES);
      const r = await call('loadtestWrite', [u.token, CAMP, 'p' + i + '#' + k], st);
      res.push({ ok: r.ok, total: r.total, tries: r.tries, wait: r.ok ? r.result.waitMs : null, write: r.ok ? r.result.writeMs : null, srv: r.srv ? r.srv.ms : null });
      process.stdout.write(r.ok ? (r.tries > 1 ? 'r' : '.') : 'x');
    }
  }));
  const all = Date.now() - t0, ok = res.filter(r => r.ok);
  const busy = Object.keys(st.fails || {}).filter(k => BUSY_RE.test(k)).reduce((n, k) => n + st.fails[k], 0);
  const cl = await call('loadtestCleanup', [adminTok, CAMP]);
  const report = {
    mode: 'write', people: users.length, windowSec: WINDOW / 1000, times: TIMES, total: res.length, ok: ok.length, retries: st.retries || 0, busy, fails: st.fails || {}, allMs: all,
    totalMs: { p50: pct(ok.map(r => r.total), 0.5), p90: pct(ok.map(r => r.total), 0.9), max: pct(ok.map(r => r.total), 1) },
    lockWaitMs: { p50: pct(ok.map(r => r.wait), 0.5), p90: pct(ok.map(r => r.wait), 0.9), max: pct(ok.map(r => r.wait), 1) },
    writeMs: { p50: pct(ok.map(r => r.write), 0.5), p90: pct(ok.map(r => r.write), 0.9) },
    rowsWritten: cl.ok ? cl.result.removed : null
  };
  console.log('\n\n==== 同時寫入結果 ====');
  console.log(`寫入 ${res.length} 次：成功 ${ok.length}（${Math.round(ok.length / Math.max(1, res.length) * 100)}%），全部跑完 ${sec(all)}，自動重試 ${report.retries} 次，其中系統忙碌 ${busy} 次`);
  console.log(`每次從送出到完成（含重試）：${line3(ok.map(r => r.total))}`);
  console.log(`  排隊等鎖：${line3(ok.map(r => r.wait))}`);
  console.log(`  真的寫入：${line3(ok.map(r => r.write))}`);
  console.log(`  一次成功：${ok.filter(r => r.tries === 1).length} 次；要重試才成功：${ok.filter(r => r.tries > 1).length} 次`);
  console.log(cl.ok ? `試算表實際多了 ${cl.result.removed} 列（應該 ${ok.length} 列），已刪掉「壓力測試」分頁` : '刪「壓力測試」分頁失敗：' + cl.err + '（請手動刪掉營隊資料庫的「壓力測試」分頁）');
  if (Object.keys(st.fails || {}).length) { console.log('失敗原因：'); Object.keys(st.fails).forEach(k => console.log('  ' + st.fails[k] + ' 次　' + k)); }
  return report;
}

(async () => {
  const PW = await askPassword(`${EMAIL} 的密碼：`);
  const lg = await call('login', [EMAIL.trim(), PW, false]);
  if (!lg.ok || !lg.result || !lg.result.token) { console.log('登入失敗：' + (lg.err || '沒有內容')); process.exit(1); }
  const tok = lg.result.token;
  // 一半學員、一半工作人員
  const nS = Math.ceil(N / 2), nW = N - nS;
  let tk = await call('loadtestTokens', [tok, CAMP, nW, nS]), made = false;
  if (!tk.ok && /改用測試資料/.test(tk.err)) {
    const want = { workers: Math.min(60, Math.max(20, nW)), students: Math.min(200, Math.max(40, nS)), squads: 4 };
    console.log(`營隊沒有測試資料，產生虛擬工作人員 ${want.workers} 位、學員 ${want.students} 位…`);
    const g = await peopleOp(tok, 'demo.on', want);
    if (!g.ok) { console.log('產生測試資料失敗：' + g.err); process.exit(1); }
    made = true;
    tk = await call('loadtestTokens', [tok, CAMP, nW, nS]);
  }
  async function cleanup() {
    if (!made) return;
    if (KEEP) { console.log('測試資料留著（--keep）'); return; }
    const r = await peopleOp(tok, 'demo.off', {});
    console.log(r.ok ? '已刪掉腳本產生的測試資料' : '刪除測試資料失敗：' + r.err + '（請到管理端「人員」頁按「改回報名後台名單」）');
  }
  if (!tk.ok) { console.log('開虛擬帳號失敗：' + tk.err); await cleanup(); process.exit(1); }
  const probe = await call(MODE === 'sync' ? 'sync' : 'loadtestCleanup', MODE === 'sync' ? [tk.result[0].token, CAMP, 'probe', [], null, { peek: true }] : [tok, CAMP]);
  if (!probe.ok && /不支援的操作/.test(probe.err)) { console.log('後端還是舊版：請把新的 Sync.gs、WebApp.gs 貼上並部署「新版本」'); await cleanup(); process.exit(1); }
  console.log(`拿到 ${tk.result.length} 個虛擬帳號`);
  const report = MODE === 'sync' ? await runSync(tk.result) : await runWrite(tk.result, tok);
  const file = `同步壓力測試結果-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.json`;
  require('fs').writeFileSync(file, JSON.stringify(report, null, 2));
  console.log('\n結果存在：' + file);
  await cleanup();
  try { await once('logout', [tok]); } catch (e) {}
})();
