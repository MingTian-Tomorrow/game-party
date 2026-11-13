# 一起上场 · GAME-PARTY

面向手机浏览器的排球约球试运营版。Node.js + Express + PostgreSQL（推荐 Neon），部署到 Render。没有支付功能。

## 已连接的 Neon 项目

当前目录已关联 `weathered-sky-23843987`（组织 `org-delicate-union-18577704`）的 `production` 分支。Neon CLI 将连接池地址 `DATABASE_URL` 和直连地址 `DATABASE_URL_UNPOOLED` 写入本地 `.env.local`，该文件已被 Git 忽略，切勿上传或分享。

`npm start`、`npm run dev`、`npm run db:init` 都会读取 `.env` 和 `.env.local`；同名配置以 `.env.local` 为准，系统环境变量优先于两个文件。管理员 ID 等自定义配置可放 `.env`。Neon 项目配置保存在 `.neon` 和 `neon.ts`。

正式数据库模式的首次启动：`npm run db:init`，然后 `npm start`。`node scripts/preview.js` 仍然是临时内存预览，不使用 Neon；此前预览数据不会自动迁移。Render 上仍需在平台环境变量中单独配置 `DATABASE_URL`，本地文件不会随 Git 上传。

Neon MCP 已写入项目的 `.codex/config.toml`，限定为该项目；重启 Codex 加载后，首次使用可能需要 OAuth 登录。

## 已实现

- 账户注册、登录、退出；密码 scrypt 加盐哈希，数据库仅保存会话令牌哈希，7 天过期。
- 发局、报名、退出、顺序候补、手动递补、取消球局；组织者自动占一个名额。
- 开场后组织者可确认到场；结束后报告缺席，本场组织者和管理员均可核实缺席并影响信誉。
- 实际共同到场者在结束后 1 小时内选评技术、球品；提交或修改即计入分数。
- 个人首页、按年打球热力日历、四项评分趋势、四项榜单、反馈申诉、出勤变更审计。
- 参数化 SQL、输入检查、接口限流、名额事务锁、唯一评价约束。

## 第 1 步：安装工具

如果 PowerShell 提示找不到 `npm`：当前电脑可能只有应用内置的 Node.js，未安装包含 npm 的完整 Node.js。请从 https://nodejs.org/en/download 下载 Windows 的 LTS 安装包（`.msi`），保留 npm 和 Add to PATH 选项，安装完成后关闭并重新打开 PowerShell，再运行 `node --version` 和 `npm.cmd --version`。`npm.cmd` 也可避免 PowerShell 对 `npm.ps1` 的执行策略限制，无需修改执行策略。

本项目依赖已由开发过程安装时，可以先双击 `start-preview.cmd`（或在 PowerShell 执行 `.\start-preview.cmd`），它会尝试使用现有 Node.js 打开临时预览，不依赖 npm 命令。这个便捷入口不替代正式 Node.js 安装；依赖缺失时仍需先执行 `npm.cmd ci`。

在 Windows 安装 Node.js 24 LTS（包含 npm）和 Git，安装后重新打开终端。

```powershell
cd D:\04Ideas\GAME-PARTY
node --version
npm --version
npm ci
```

本项目没有前端编译步骤。`public/` 就是完整前端。

## 第 2 步：先看本地页面（不需要注册云服务）

```powershell
node scripts/preview.js
```

打开 http://localhost:3000 。可注册测试账户、发局和报名。这个脚本使用仅供开发的 PostgreSQL WASM 内存数据库，关闭进程即丢弃全部数据，不支持生产并发保障，绝对不要把此命令用于 Render。用 Ctrl+C 退出。

## 第 3 步：创建 Neon 数据库

1. 打开 https://console.neon.tech 注册 / 登录。
2. 创建项目 `game-party`，选择免费方案。区域尽量靠近之后选择的 Render 区域。
3. 在项目的 Connect 面板复制 PostgreSQL 连接串，优先使用 pooled connection。
4. 在本地复制环境模板：

```powershell
Copy-Item .env.example .env
```

5. 用编辑器打开 `.env`，把 `DATABASE_URL` 换成完整连接串，保留 Neon 提供的 SSL 参数。连接串属于密码，不要贴到群里或提交 GitHub。
6. 初始化表并启动：

```powershell
npm run db:init
npm start
```

打开 http://localhost:3000 。从此使用 Neon 持久化数据。先停止第 2 步的预览进程，避免端口冲突。

## 第 4 步：验证流程与创建管理员

1. 注册自己的正式账户，在“我的”复制用户 ID。
2. 把此 ID 填入 `.env` 的 `ADMIN_USER_ID`，重启服务器。管理员由服务器环境配置指定，不能在网页上自封。
3. 注册另一测试账户（可使用另一个浏览器），验证发局 → 报名 → 退出 → 候补。
4. 开场后，组织者在详情页确认到场；结束后双方即可互评，满 1 小时截止。
5. 报告缺席后，组织者或管理员点击顶部“审核中心”，核实双方情况，再选择“确认缺席”或“误报，已到场”，填写核实说明。组织者仅能处理自己的球局，管理员可以处理全站记录。申诉仍由管理员处理，说明与出勤更正是两个操作。
6. 运行自动测试：

```powershell
npm test
```

测试使用内存 PostgreSQL 引擎，不会操作 Neon。覆盖鉴权、报名候补、评价窗口、出勤权限、分数发布和申诉。正式 PostgreSQL 并发压力和真实云服务网络行为需要上线前另外实测。

## 第 5 步：放到你自己的 GitHub 仓库

在 GitHub 新建空的私有仓库 `game-party`，不要预生成 README。在项目目录运行：

```powershell
git init
git add .
git status
git commit -m "Build volleyball meetup MVP"
git branch -M main
git remote add origin https://github.com/你的用户名/game-party.git
git push -u origin main
```

`git status` 中应没有 `.env`、`node_modules/`、备份文件。`.gitignore` 已配置。替换仓库地址，登录 GitHub 的操作由你完成；无需向别人提供密码或 token。

## 第 6 步：部署 Render 后端（同时提供网页）

为减少第一次配置，可以先用一个 Web Service 同时提供网页和 API。后续第 7 步可拆出静态前端。

1. 打开 https://dashboard.render.com ，连接 GitHub 仓库。
2. New → Web Service → 选 `game-party`。
3. 填写：

| 配置 | 内容 |
| --- | --- |
| Runtime | Node |
| Branch | main |
| Root Directory | 留空 |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm run db:init && npm start` |
| Instance Type | Free |
| Health Check Path | `/health` |

4. 添加环境变量：`NODE_ENV=production`；`DATABASE_URL=你的 Neon 连接串`；`ADMIN_USER_ID=第 4 步的用户 ID`。`PORT` 让 Render 自动提供。
5. Create Web Service，等待日志出现“数据库结构初始化完成”和服务启动信息。
6. 打开平台实际分配的 `https://xxx.onrender.com`，完成手机上的注册、登录、发局、报名检查。

也可用仓库内 `render.yaml` 从 New → Blueprint 创建，按提示填相同环境变量。两种方式选一个，不必重复创建服务。初始化脚本可重复运行；未来修改已有表需要正式迁移，不能仅修改 CREATE TABLE。

## 第 7 步（可选）：独立静态前端

这样页面本身不随后端休眠，但登录与报名仍可能等待后端唤醒。

1. 修改 `public/config.js`：`window.API_BASE = 'https://实际后端地址.onrender.com';`，提交并推送。
2. Render → New → Static Site，连接同一仓库。
3. Build Command 填 `echo static-ready`，Publish Directory 填 `public`，不需要 npm 构建。
4. 创建完成后，把静态网站完整地址填入后端环境变量 `FRONTEND_ORIGIN`（不带末尾 `/`）。保存并重新部署后端。
5. 使用静态网站地址给球友分享，验证跨域登录和报名。

连接串只在后端环境变量里；`public/config.js` 只放 API 地址。

## 第 8 步：试运营与备份

- 先邀请一个球友群。用微信浏览器、移动网络、Wi-Fi 测打开速度和报名体验。
- 免费 Render 后端可能休眠，首次唤醒约一分钟；免费套餐有用量限制。不要使用 Render 的 30 天免费数据库长期保存用户数据，也不要把 SQLite 或上传文件放在服务本地磁盘。
- 查看 Render / Neon 用量。免费不等于无限，收费能力或绑定支付方式后需留意账单。
- 每周及重要改动前做数据库备份。安装 PostgreSQL 客户端后，可让 `pg_dump` 交互提示密码（不把密码写进命令历史）：

```powershell
New-Item -ItemType Directory -Force backups
# 替换主机、用户名、数据库名；建议备份使用 Neon 直连端点
$env:PGSSLMODE='verify-full'
pg_dump -h 你的Neon主机 -U 你的数据库用户名 -d 你的数据库名 -W -Fc -f backups/game-party.dump
```

保存备份至另一个安全位置，定期在单独测试数据库恢复验证。备份含用户数据，不能公开。生产恢复前先保留当前快照。

## 第一版规则与边界

- 不在线收费，不提供聊天、短信、邮件找回、自动提醒、图片上传。默认头像由昵称生成。
- 候补不是正式报名，不计出勤义务；当前队首手动确认，**没有超时自动跳过**，需要组织者在群里协调。以后可加入带确认期限的递补通知。
- 开始前允许退出；没有迟到和临近退出扣分。组织者和管理员可在开场前修改标题、时间、场地、人数、水平、费用与说明；人数上限不能低于正式报名人数。修改后保留报名，请在群里通知参与者。新球局默认场地为“34号楼豪华露天室外场”，可手动更改。
- 未满员也会在原定时间开场；组织者和管理员还可点击“提前开场”。提前开场使用当前时间，保留结束时间，停止报名与编辑，候补不会自动转正。取消或已开始的球局不能再编辑或提前开场。
- 不自动将“无签到”认作缺席；报告缺席只暂存，本场组织者或管理员核实后才计分。真实到场由组织者确认，并非身份或定位验证。
- 技术、球品是 1～5 的简易量表；先对同一评价者的历史反馈取平均，技术以 5 份 3 分、球品以 5 份 4 分基础权重平滑，再乘 20 得百分制。无评价时技术 60、球品 80。此规则只限制单个账户重复评价的权重，不能消除选择偏差或小号互刷。
- 评价窗口 1 小时；提交或修改立即计分，若出勤被纠正为非到场，相应评价不再计分。
- 信誉初始 80，按 `min(100, 80 + 3 × 到场 − 20 × 已核实缺勤)` 计算，下限不封底，可为负数。综合权重 40/30/30，初始综合 74。所有注册用户立即进入四项榜单，同分并列；初始分不代表已验证能力。已有账户也自动适用，无需重建数据库。
- 暂未实现随机抽样邀请评价、评分规则版本迁移、独立邀请限制、封禁账户、自助数据删除。正式开放陌生人注册前应补充这些运营能力。目前适合小圈子验证。
- 评分由原始记录动态计算。首页曲线按球局结束顺序累计重算，不是历史时刻的评分快照；修改评价、纠正出勤后历史节点也会更新。出勤和申诉处理有审计日志。
- 会话令牌存于浏览器 sessionStorage，关标签页后需要重新登录。仅 HTTPS 上线，避免添加不可信脚本。
- 忘记密码、数据导出或删除由管理员人工处理，尚无自助按钮。不要公开发布未经核实的个人指控。

## 文件位置

| 文件 | 用途 |
| --- | --- |
| `public/` | 页面、样式、浏览器交互、API 地址配置 |
| `server/app.js` | API、权限与事务 |
| `server/rules.js` | 评分与评价时间规则 |
| `server/schema.sql` | 数据表与约束 |
| `server/migrate.js` | 初始化数据库 |
| `server/index.js` | 生产入口 |
| `test/app.test.js` | 业务集成测试 |
| `scripts/preview.js` | 临时本地预览，禁止上线 |
| `render.yaml` | Render 部署配置 |

参考：https://render.com/docs/deploy-node-express-app 、https://render.com/docs/free 、https://neon.com/docs/connect/connect-from-any-app

## 个人首页与本次更新

- 默认首页为“我的球场”。登录后按近况显示欢迎语；近 7 天打球至少 3 天时显示活力提示。
- 上方日历按北京时间的**开场日期**归日，只统计已结束且确认到场的正式参加记录；同一天可累计多场，候补、取消和待核实不计入。手机可左右滑动，默认定位近期。
- 下方可切换综合、信誉、技术、球品折线；点击日期色块或曲线节点可查看关联球局。初始分为 74 / 80 / 60 / 80。
- 榜单每 10 秒刷新，也可以手动刷新；后端每次读取即时计算。个人看板提供刷新按钮。
- 组织者发起球局后自动出现“审核中心”，无需配置管理员 ID。全站管理员仍用 Render 环境变量 `ADMIN_USER_ID` 指定，负责全站申诉。
- 中文正文为系统黑体，标题为本地宋体子集，宣传语为本地手写体。绿色描边排球同时用作页头标识与 favicon。
- 无数据库结构改动，已有数据自动适用。更新 GitHub 后需等 Render 的新版本部署成功。

本地演示（临时数据，退出丢弃，不连接 Neon）：

```powershell
$env:PORT = '3001'
node scripts/preview.js --demo
```

演示账户 `demo_host`（组织者）、`demo_new`（新用户）、`demo_admin`（管理员），密码均为 `preview-only-123`。这些账户只由演示脚本创建，正式服务不会创建。


## 管理员重置密码

管理员在“审核中心 → 账户密码重置”输入用户账户名，确认已线下核实身份后生成链接，私下发给用户。链接有效期 30 分钟、仅可使用一次，重新生成会作废旧链接。用户打开链接自行填写两遍新密码（10～128 位），成功后所有旧会话失效。组织者不具有此权限，数据库仅保存重置凭证的哈希。生成及完成操作均保留审计记录。

部署前执行 `npm run db:init` 创建 `password_resets` 表；默认 Render 启动命令已包含这一步。没有绑定邮件服务，链接需要管理员手动发送。

榜单头像及昵称可点击查看资料卡：信誉、技术、球品、累计与近 30 天核实缺勤、近 30 天确认到场场次及活跃天数。近 30 天按结束时间滚动统计，活跃日期按北京时间开场日去重。信誉新规则应用于历史有效记录，分数和历史曲线会重算。
