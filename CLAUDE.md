# 營隊互動系統（camp-interact）— 給 Claude 的架構地圖

先讀這份，需要細節再開對應檔案；不要整包重讀。回覆 Daniel 一律繁體中文、簡短、步驟在前。

## 程式放在哪

| 位置 | 內容 |
| --- | --- |
| 這個 repo（GitHub Pages 根目錄） | **只有前端**：`*.html`、`assets/`、`games/`、`sw.js`、`manifest.webmanifest`、圖示。改前端走 PR。 |
| `/mnt/project-files/camp-interact/backend/*.gs` | 後端 Apps Script。**不在 repo**，Daniel 手動貼到 Apps Script 再「管理部署作業 → 新版本」。回覆要列「這次改了哪些 .gs」。 |
| `/mnt/project-files/camp-interact/test/` | 測試與本機預覽。`mock.js` 載入 `../backend`，`preview-server.js` 讀 `../frontend`。 |
| `/mnt/project-files/camp-interact/HANDOFF.md`、`README.md` | 逐日交接紀錄（每次改動、測試數）與部署說明。 |
| `/mnt/project-files/camp-interact/frontend/` | 前端的工作副本；**以 repo 為準**（repo 多了 `manifest.webmanifest`，`config.js` 已填正式網址）。在專案資料夾跑測試前先把 repo 的前端同步過去。 |
| `/mnt/project-files/camp-interact/registration-patch/` | 10/22 舊的報名系統修改，已合進 camp-system。**不要用**，以 camp-system／更新包為準。 |

交付規則：不覆蓋 `assets/config.js`（API_URL 是正式 /exec）、不給 zip、不動圖示 png。

## 整體架構

- Google 試算表當資料庫 ＋ Apps Script 後端 ＋ GitHub Pages 前端；部署在系統帳號 campmanager（和報名系統同帳號，但是**兩套獨立**的 Apps Script／網址）。
- **全域資料庫**＝Apps Script 綁定的試算表，活頁（`Config.gs` 的 `G`）：帳號、營隊、授權、邀請碼、通知、操作紀錄、備份、設定。
- **營隊資料庫**＝每個營隊一份試算表（ID 記在「營隊」活頁），活頁（`C`）：`_meta _ops _pkglog _pages _blocks _history _snapshots _templates _locks _handoffs _events _eventuser _instances _pkgstate _migrations _data`。所有 Package 資料都在 `_data`（pkg, coll, id, version, data JSON…），用 `pkgList_/pkgRow_` 讀。
- 雲端硬碟：備份資料夾「營隊互動系統備份」（`Backup.gs`）、上傳根目錄「營隊互動系統檔案/營隊名（ID）」（`Registry.gs pkgUpload`，ID 存在設定 `uploadRootId`）。
- 遊戲密鑰金鑰在指令碼屬性 `gamekey_營隊ID`。
- 和報名系統（camp-system）用串接金鑰連：每小時拉名單（`Bridge.gs`），學員從報名系統學員專區帶 5 分鐘入場券進來。

## 前端 → 後端呼叫

- `core.js api(fn, ...args)`：POST `text/plain` 到 `INTERACT_CONFIG.API_URL`，body `{fn, args}`，回 `{ok, result|error}`。「系統忙碌中」自動重試 4 次。
- `WebApp.gs api_()` 是**白名單**；新增後端 API 一定要加進去。讀取各有函式；**所有寫入只走 `op`**（`core.js op(kind, o)` → `Ops.gs`：operation_id 去重、階段代碼 `OP_STAGES`、版本檢查、權限在後端）。
- 唯讀 API（`READ_FNS_`：frontBoot、frontLive、campPublicInfo、workerDepts）走 `Util.gs` 快取（CacheService 存原始表格 60 秒，任何寫入換世代）。唯讀中要寫入會丟 RETRY 改一般模式重跑。
- 前台打開：`frontBoot(..., {live:true})` 一次拿發布快照＋所有動態區塊；之後 `frontLive` 50–70 秒更新。
- 遊戲：`sync / gameSubmit / gameInbox / gameMe / gameSign / gameMaster / gameHandoff / gameHandoffUse`（`Sync.gs`）。

## 前端檔案

| 檔案 | 角色 |
| --- | --- |
| `index.html` | 編輯者登入、邀請碼註冊；註冊 sw.js |
| `camps.html` + `assets/camps.js` | 我的營隊、建立營隊、報名後台連線 |
| `admin.html?c=` + `assets/admin.js` | 管理端外殼：總覽、成員、警示通知、操作紀錄、營隊設定與備份 |
| `assets/editor.js` | 兩端頁面編輯器（頁面樹／區塊／手機預覽、編輯鎖、儲存、發布） |
| `assets/pkgadmin.js`（最大，~2700 行） | 各 Package 管理畫面（人員、流程與活動、遊戲資源包分頁、計分、緊急、課程、Package 管理） |
| `assets/fxadmin.js` | 學員端動畫開關 |
| `app.html?c=&s=student\|worker[&preview=draft\|pub]` + `assets/app.js` | 前台：登入、boot、即時更新、離線顯示上次資料 |
| `assets/render.js` | 前台區塊與 Package 畫面（`Front`／`VIEWS`），前台與編輯器預覽共用；遊戲按鈕 `gameBtn` |
| `assets/core.js` | 共用：api、op、彈窗、圖示、gameSync／gameSubmit 離線佇列（localStorage `ia_gsq`） |
| `assets/staff.js` | 編輯者頁面共用（登入狀態等） |
| `assets/richtext.js` | 格式文字 `RT`（和報名系統信件編輯器同語法） |
| `game.html?c=&g=&a=&s=` + `assets/game.js` | 遊戲載入頁：提供 `host`、下載資源包到 Cache Storage（`ia-game-<id>`）、測試模式、關主通行碼、QR 掃描 |
| `assets/config.js` | 後端 API 網址（不要改） |
| `sw.js` | 離線打開：快取 `ia-shell-vN`（SHELL 清單＋jsQR CDN）；網路優先、斷網用快取；不管 API 與 `games/` |

新增前端檔案要加進 `sw.js` 的 `SHELL`；改了 shell 結構記得把 `CACHE` 版本加一。

## 後端 .gs

| 檔案 | 負責 |
| --- | --- |
| `Config.gs` | 全域設定、活頁與欄位定義（`G`/`C`）、權限、角色、操作代碼 |
| `Util.gs` | 試算表讀寫（`T_`, `tAppend_`…）、快取、雜湊、時間 |
| `Auth.gs` | 編輯者登入、工作人員登入（姓名＋股別＋通行碼） |
| `Ops.gs` | `op` 唯一寫入入口、操作紀錄、清理 |
| `Camps.gs` | 建立／設定／結束營隊、`campDb_`、營期判斷、驗收日程 |
| `Members.gs` | 角色、權限、邀請碼、營期鎖 |
| `Pages.gs` | 頁面與區塊、歷史、發布快照、模板 |
| `Locks.gs` | 編輯鎖、心跳、交接 |
| `Events.gs` / `Notify.gs` | 警示 / 通知中心 |
| `Registry.gs` | Package 資源庫、安裝、更新與遷移、故障隔離 `isolate_`、`pkgCtx_`、驗收標記 `rhTag_`、上傳 |
| `Backup.gs` | 整庫備份與復原 |
| `Bridge.gs` | 報名系統串接、學員登入 |
| `Front.gs` | 前台讀取 `frontBoot/frontLive`、前台送出、`viewer_`（小隊以人員名單為準） |
| `Sync.gs` | 遊戲同步頻道（`sqN` / `w-` / `in-`）、收件、密鑰、關主、測試模式範圍、交接碼 |
| `Pkg_people.gs` | 人員與分隊、工作分配 |
| `Pkg_schedule.gs` | 營期流程與活動、快速展延、驗收流程、活動連遊戲（`data.game`）、遊戲入口 view |
| `Pkg_studentflow.gs` | 學員行程 |
| `Pkg_emergency.gs` | 緊急應變與夜間模式 |
| `Pkg_courses.gs` | 課程簡介 |
| `Pkg_scoreboard.gs` | 團隊計分（遊戲上傳分數 `game.stage` → Game `gx<活動>`） |
| `WebApp.gs` | `doPost`、API 白名單、壓測 API |
| `Setup.gs` | `setupSystem`（補欄位、升級營隊庫）、每天／每小時工作 |

## 遊戲資源包 `games/`

- `games/index.json` 列出資源包；每包一個資料夾：`manifest.json`（id, version, entry, css, files, data, config）＋ `game.js`（`CampGame.register({mount(el, host)})`）＋ `README.md`（必要）＋素材。
- 遊戲只透過 `host` 溝通（me、data、ch、scope、save/load、sync、submit、inbox、score、scan、time、mode…），完整說明見 `games/README.md`。
- **改資源包任何檔案都要把 `version` 加一（manifest 和 index.json 一起）**，手機才會重新下載。
- `fogmap`（霧之校園，v0.6.x）：密鑰在手機上算（cyrb53），小隊頻道只用來補齊進度；有「2027 清大定向越野」預設；說明見 `games/fogmap/README.md`。
- 2027 測試包：`labescape`（密室級聯封鎖）、`factions`（雙陣營 RPG）、`horserace`（賭馬，不計分）。新遊戲優先用 `host.key`／`host.scoreSafe`／`host.fx`／`host.every`（host.api 2）。
- 計分自動連動：manifest `scoring: true`（或活動「🏆 計分」開關）→ `Pkg_scoreboard.gs sbLinkAct_` 自動建／改名／移除 Game `gx<活動>`（測試 `-tN`）；活動的 save/delete/game/gameTest/reveal 都會呼叫。
- 遊戲頁（game.js）：編輯者有 `ia_token` 就直接用（side `staff`；關主連結＝關主、其他＝試玩，返回鍵回管理端）；有計分的遊戲上方有「🏆 分數」（`gameBoard` 唯讀 API）、`view=board` 投影分數榜；`view=show/board` 右上角工具列（主持人畫面／全螢幕／結束投影）。

## 測試（在 `/mnt/project-files/camp-interact/` 下跑）

```
node test/run.js                                  # 後端情境測試（數百項，分段）
node test/preview-server.js 8791 > /tmp/p.log &   # 本機預覽：leader@example.com / leader1234、工作人員通行碼 camp2026、學員 /demo-student
node test/browserN.js 8791 /tmp /tmp/p.log        # 瀏覽器實測（Playwright），每支前重開預覽
REG_DIR=../camp-system node test/e2e-bridge.js    # 跨系統
node test/loadtest.js <exec> <營隊ID> <Email>     # 正式環境壓測
```

- browserN 主題：13 展延／驗收、14 六點修正、18–24 遊戲（18 寫死埠 8799；20 要獨立的預覽伺服器）、22 掃描、23 捷徑交接、24 工作人員遊戲入口、25 離線打開（sw.js）、31 計分自動連動＋密室、32 RPG、33 賭馬、34 投影工具列＋遊戲裡的分數榜＋編輯者開遊戲。
- 瀏覽器測試受實際時間影響：深夜跑 browser5/9/11/13 可能失敗，屬已知現象。
- 改完要跑相關 browserN ＋ `run.js`，並在 HANDOFF.md 加一段（日期、改了什麼、測試數、這次改的 .gs）。
