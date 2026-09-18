# luxury-cdk

luxury-cdk 是一个卡密（CDK）批量发放管理系统，为 CDK 管理者与分发人员提供快速、安全、便捷的卡密分发能力。支持多用户（管理员 + 普通用户）、项目归属隔离、批量导入去重、领取追踪与 CSV 导出，具备完善的权限管理与风控（封禁、同 IP 限制）。

## 功能特性

### 后台管理（密码登录）
- **多账号体系**：管理员（admin）可新增普通用户；普通用户登录后只能管理自己的项目与卡密，管理员可管理全部。
- **用户管理（仅管理员）**：新增用户、封禁/解封、重置密码、删除用户（连带其项目与记录）、查看每个用户的项目/卡密/领取统计。被封禁的用户无法登录。
- **概览看板**：问候语标题、统计卡片（卡密总量/剩余库存/累计领取/今日领取，含环比）、近 14 天领取面积图、领取排行、项目领取分布环形图、最近领取列表；普通用户仅看自己的数据。
- **项目管理**：创建项目（"新建项目"弹窗 = 基本设置 + 分发内容两个 tab），含项目名称（≤32 字符）、关联标签（0–10）、起止时间、**限制相同 IP** 开关、项目描述；分发方式支持**一码一用**。
- **批量导入卡密**：粘贴文本批量导入，自动去重并统计剩余库存。
- **领取记录**：按项目筛选 + 按卡密 / 领取 IP 搜索。
- **导出 CSV**：按项目导出卡密清单（卡密/状态/领取IP/领取时间）。

### 前台领取页
- 用户输入卡密即可领取，实时校验：卡密是否存在、是否已被领取（一码一用）、是否处于可领取时间、同 IP 限制。

## 关键设计：卡密唯一去重
- 数据库层对 `cards.code` 建立 **UNIQUE 索引** 作为去重兜底。
- 导入时三重防重：文本内去重 → 应用层查库剔除 → 插入时捕获唯一约束冲突，保证任意并发下卡密严格唯一。
- 领取采用事务，确保"一码一用"不被并发绕过。

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

## 目录结构

```
card-system/
├── src/
│   ├── server.js            # 服务入口
│   ├── db.js                # 数据库初始化与迁移
│   ├── auth.js              # 登录/鉴权/JWT
│   ├── utils.js             # 公共工具
│   └── routes/
│       ├── batches.js       # 项目（批次）管理 + 导入去重 + 导出
│       ├── claims.js        # 前台领取
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
| POST | `/api/batches/:id/cards/import` | 批量导入卡密（去重） | 项目归属者/管理员 |
| GET  | `/api/batches/:id/claims` | 项目领取记录 | 项目归属者/管理员 |
| GET  | `/api/batches/:id/export` | 导出 CSV | 项目归属者/管理员 |
| DELETE | `/api/batches/:id` | 删除项目 | 项目归属者/管理员 |
| GET/POST | `/api/users` | 用户列表 / 新增用户 | 管理员 |
| PATCH/DELETE | `/api/users/:id` | 封禁/解封/重置密码 / 删除 | 管理员 |
| POST | `/api/claims` | 前台领取卡密 | 公开 |