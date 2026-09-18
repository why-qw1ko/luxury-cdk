# luxury-cdk

luxury-cdk 是一个 CDK 批量发放管理系统：管理员在项目中维护「分发内容」（兑换码 / 链接 / 文本）并批量生成「领取 CDK」，用户在前台凭 CDK 领取其中一份内容。支持多用户（管理员 + 普通用户）、项目归属隔离、批量导入去重、领取追踪与 CSV 导出，具备完善的权限管理（封禁、强制下线、项目归属隔离）。

## 双层模型（重要）

系统把「用户输入的凭证」和「管理员要发出去的内容」拆成两个独立实体，二者通过项目关联：

| 实体 | 表 | 说明 |
| ---- | ---- | ---- |
| 领取 CDK | `claim_codes` | 系统批量生成（也可手动导入）的随机凭证，全局唯一，用户在前台输入的就是它 |
| 分发内容 | `contents` | 管理员导入的兑换码 / 链接 / 文本，构成该项目的发放内容池 |

领取流程：用户输入 CDK → 校验 CDK 状态与项目时间窗 → 事务内锁定 CDK 并确定要发放的内容 → 记录「哪个 CDK 领走了哪份内容」。
因此每个 CDK 只会发放一份内容，内容池空了就会提示「暂无可发放内容」，不会重复发放同一份内容。

每个项目可选两种领取模式（`batches.bind_mode`）：

| 模式 | 说明 |
| ---- | ---- |
| `dynamic` 动态发放（默认） | CDK 不绑定内容，用户领取时从内容池按顺序取一份，先到先得 |
| `bound` 一码一内容绑定 | 生成 / 导入 CDK 时按内容顺序一对一绑定，用户领取时发放其绑定的那一份；绑定数量受「尚未被占用的内容」数量约束 |

模式可随时在项目详情里切换，且不影响已生成 CDK 的绑定状态（已绑定的 CDK 继续按绑定发放，未绑定的继续动态取号）。

> 旧版本是单层模型（管理员导入的卡密就是用户输入的卡密）。升级后首次启动会自动迁移：每条旧卡密同时生成一份内容和一个同码 CDK，老用户手里的码继续可用、兑换结果与旧行为一致。

## 功能特性

### 后台管理（密码登录）
- **多账号体系**：管理员（admin）可新增普通用户；普通用户登录后只能管理自己的项目与卡密，管理员可管理全部。
- **用户管理（仅管理员）**：新增用户、封禁/解封、重置密码、删除用户（连带其项目与记录）、查看每个用户的项目/卡密/领取统计。被封禁的用户无法登录。
- **概览看板**：问候语标题、统计卡片（卡密总量/剩余库存/累计领取/今日领取，含环比）、近 14 天领取面积图、领取排行、项目领取分布环形图、最近领取列表；普通用户仅看自己的数据。
- **项目管理**：创建项目（"新建项目"弹窗 = 基本设置 + 分发内容 + 领取 CDK 三个 tab），含项目名称（≤32 字符）、关联标签（0–10）、起止时间、项目描述、**领取模式（动态发放 / 一码一内容绑定）**；一码一用。
- **分发内容管理**：粘贴文本批量导入（自动去重、自动识别兑换码/链接/文本）、单条删除、内容维度 CSV 导出。
- **领取 CDK 管理**：批量生成（默认 16 位随机码，不含易混淆字符，支持自定义前缀）、手动导入已有 CDK（全局去重）、单条删除、CDK 清单 CSV / TXT 导出（用于对外分发）。
  - **生成后立即弹出结果面板**，支持一键复制全部 / 单条复制 / 导出 TXT：服务端会一并返回本次生成的每一个码。
  - 列表支持**按 CDK 或绑定内容搜索**、按状态（未使用 / 已使用）过滤、分页加载更多；另有「复制全部未使用」「复制全部」按钮。
- **领取记录**：按项目筛选 + 按 CDK / 发放内容 / 领取 IP 搜索，含「哪个 CDK 领走了哪份内容」。
- **导出 CSV**：内容发放明细（内容类型/内容/状态/领取CDK/领取IP/领取时间）与 CDK 清单。

### 前台领取页
- 用户输入领取 CDK 即可领取，实时校验：CDK 是否存在、是否已被使用（一码一用）、项目是否处于可领取时间、内容库存是否充足。
- 领取结果按类型展示（兑换码 / 链接 / 文本），提供**一键复制**与链接直达；无需选择项目，CDK 自身即确定项目归属。
- 内容排版按长度自适应：短兑换码放大居中，长链接 / 长文本自动回落为左对齐小字号并限高滚动，不会撑破卡片。

## 界面文本适配约定
- 栅格轨道统一使用 `minmax(0, 1fr)`（默认 `1fr` 不会收缩到内容宽度以下，长文本会撑破整行）。
- 复用零侵入的工具类：`.trunc`（单行截断）、`.clamp-2`（两行截断）、`.break-any`（强制断行）、`.limit` / `.limit-sm`（表格单元格限宽）。
- 凡是做截断的元素都必须带 `title` 属性，保证鼠标悬停仍能看到全文。
- `.btn` 带 `flex-shrink: 0`，与长文本同行时不会被挤扁。
- CDK 展示格式为每 4 位一组（任意长度都分组，带前缀的 19+ 位码同样可读）。

## 关键设计：唯一性与并发
- 数据库层对 `claim_codes.code` 建立 **UNIQUE 索引** 作为去重兜底；`contents(batch_id, payload)` 同样唯一，避免同一份内容被重复导入而重复发放。
- 导入时三重防重：文本内去重 → 应用层查库剔除 → 插入时捕获唯一约束冲突，保证任意并发下 CDK 严格唯一。
- 领取采用事务：先以 `UPDATE ... WHERE status='available'` 抢占 CDK，再从内容池抢占一份内容，任一步失败整体回滚，确保"一码一用"且不会重复发放内容。
- 时间戳统一使用本地时间格式（`YYYY-MM-DD HH:MM:SS`），看板统计不再出现时区偏移。

## 技术栈
- 后端：Node.js + Express
- 数据库：SQLite（better-sqlite3，单文件、免安装）
- 前端：原生 HTML + CSS + JS + SVG 图表（无构建步骤），Tremor 风格浅色企业看板
- 认证：JWT；密码：bcrypt 加密存储

## 快速开始

```bash
cd card-system
npm install
npm start
```

启动后：
- 前台领取页：http://localhost:8598/
- 后台管理：http://localhost:8598/admin/
- 默认管理员账号：用户名 `admin` / 密码 `admin123`

> 首启会自动创建数据库文件 `card-system/data/card.db`。

### 自定义管理员密码
启动前设置环境变量即可修改默认管理员初始密码（仅在首次建库时生效）：

```bash
ADMIN_PASSWORD=你的密码 npm start
```

如需固定 JWT 密钥，可设置环境变量 `JWT_SECRET`。

### 反向代理与客户端 IP

默认**不信任**任何代理头，客户端 IP 取 TCP 连接来源地址，因此伪造 `X-Forwarded-For` 不会生效。
部署在 Nginx / Cloudflare 等代理后面时，按需开启（否则记录的领取 IP 会是代理地址）：

```bash
TRUST_PROXY=1             # 信任一层代理
TRUST_PROXY=loopback      # 只信任本机代理
TRUST_PROXY=10.0.0.0/8    # 信任指定网段
```

## 目录结构

```
card-system/
├── src/
│   ├── server.js            # 服务入口
│   ├── db.js                # 数据库初始化与迁移
│   ├── auth.js              # 登录/鉴权/JWT
│   ├── codes.js             # 领取 CDK 生成 / 归一化 / 内容类型识别
│   ├── utils.js             # 公共工具
│   └── routes/
│       ├── batches.js       # 项目管理 + 内容导入 + CDK 生成/导入 + 导出
│       ├── claims.js        # 前台领取（CDK -> 内容发放）
│       ├── dashboard.js     # 看板统计（按归属隔离）
│       └── users.js         # 用户管理（仅管理员）
├── public/
│   ├── index.html / js/claim.js      # 前台领取页
│   ├── css/app.css                   # 设计系统（浅色主题）
│   └── admin/                        # 后台页面
│       ├── login.html
│       ├── dashboard.html            # 概览
│       ├── project.html              # 项目管理
│       ├── received.html             # 领取记录
│       ├── users.html                # 用户管理（仅管理员）
│       └── js/
└── data/ # 运行时生成的 SQLite 数据库（不入库）
```

## API 概览

| 方法 | 路径 | 说明 | 权限 |
| ---- | ---- | ---- | ---- |
| POST | `/api/auth/login` | 登录（用户名+密码） | 公开 |
| GET  | `/api/auth/me` | 当前用户信息 | 登录 |
| GET  | `/api/dashboard/*` | 概览统计数据 | 登录（按归属隔离） |
| GET  | `/api/batches` | 项目列表 | 登录 |
| POST | `/api/batches` | 新建项目 | 登录 |
| PATCH | `/api/batches/:id` | 切换领取模式（`bind_mode`） | 项目归属者/管理员 |
| GET/POST | `/api/batches/:id/contents`、`/contents/import` | 分发内容清单 / 批量导入（去重） | 项目归属者/管理员 |
| DELETE | `/api/batches/:id/contents/:contentId` | 删除未发放且未被 CDK 占用的内容 | 项目归属者/管理员 |
| POST | `/api/batches/:id/claim-codes/generate` | 批量生成领取 CDK（绑定模式下同时绑定内容） | 项目归属者/管理员 |
| POST | `/api/batches/:id/claim-codes/import` | 手动导入 CDK（全局去重） | 项目归属者/管理员 |
| GET  | `/api/batches/:id/claim-codes` | CDK 清单（支持 `keyword` / `status` / `limit` / `offset` 筛选翻页） | 项目归属者/管理员 |
| GET  | `/api/batches/:id/claim-codes/text` | CDK 纯文本清单（每行一个，`status` 可选 available/all/claimed），用于「复制全部」 | 项目归属者/管理员 |
| DELETE | `/api/batches/:id/claim-codes/:codeId` | 删除未使用 CDK | 项目归属者/管理员 |
| POST | `/api/batches/:id/claim-codes/generate` | 批量生成领取 CDK（绑定模式下同时绑定内容），返回 `codes: [{code, display}]` | 项目归属者/管理员 |
| POST | `/api/batches/:id/claim-codes/import` | 手动导入 CDK（全局去重），同样返回本次导入的 `codes` | 项目归属者/管理员 |
| GET  | `/api/batches/:id/claim-codes/export` | 导出 CDK 清单 CSV | 项目归属者/管理员 |
| GET  | `/api/batches/:id/contents` | 分发内容清单（支持 `keyword` / `status` / `limit` / `offset`） | 项目归属者/管理员 |
| GET  | `/api/batches/:id/claims` | 项目领取记录 | 项目归属者/管理员 |
| GET  | `/api/batches/:id/export` | 导出内容发放明细 CSV | 项目归属者/管理员 |
| DELETE | `/api/batches/:id` | 删除项目 | 项目归属者/管理员 |
| GET/POST | `/api/users` | 用户列表 / 新增用户 | 管理员 |
| PATCH/DELETE | `/api/users/:id` | 封禁/解封/重置密码 / 删除 | 管理员 |
| GET | `/api/claims/projects` | 可领取项目列表 | 公开 |
| POST | `/api/claims` | 前台凭 CDK 领取内容 | 公开 |
