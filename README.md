# 🚀 TimZoo 探店管理 — GitHub → Cloudflare 完整部署教程

> **技术栈**: Cloudflare Pages Functions (API后端) + D1 (数据库) + Pages (前端静态)
>
> **部署方式**: GitHub 仓库自动部署（推送代码即自动上线）
>
> **项目地址**: GitHub 仓库 `timzoo/`

---

## 📋 目录

- [架构图解](#-架构图解)
- [第一步：准备 GitHub 仓库](#-第一步准备-github-仓库)
- [第二步：创建 D1 数据库](#-第二步创建-d1-数据库)
- [第三步：创建 Worker（API 后端）并绑定 D1](#-第三步创建-workerapi-后端并绑定-d1)
- [第四步：连接 GitHub 仓库到 Pages（前端 + API）](#-第四步连接-github-仓库到-pages前端--api)
- [第五步：配置环境变量与绑定](#-第五步配置环境变量与绑定)
- [第六步：首次部署与验证](#-第六步首次部署与验证)
- [第七步：绑定自定义域名（可选）](#-第七步绑定自定义域名可选)
- [第八步：日常开发流程](#-第八步日常开发流程)
- [常见问题排查](#常见问题排查)

---

## 🏗️ 架构图解

```
┌─────────────────────────────────────────────────────────┐
│                    你的 GitHub 仓库                        │
│                    github.com/xxx/timzoo                  │
│  ┌──────┬──────┬──────┬──────┬──────────┬──────────┐     │
│  │worker.js │schema.sql │wrangler.toml │src/index.html │ ... │
│  └───┬──────┴───┬──────┴──────┴─────┬────┴─────┬──────┘     │
└──────│──────────│──────────────────│────────│───────────────┘
       │  push    │                  │        │
       ▼          ▼                  ▼        ▼
  ┌──────────┐ ┌──────────┐   ┌──────────┐ ┌──────────┐
  │  Cloudflare  │ │Cloudflare │   │Cloudflare │ │Cloudflare │
  │  Worker     │ │   D1      │   │  Pages    │ │  Pages    │
  │  (API后端)  │ │ (数据库)  │   │ (前端静态) │ │ Functions│
  │             │ │           │   │           │ │ (API路由) │
  │ timzoo.xxx  │ │timzoo-db  │   │timzoo-web │ │           │
  │ .workers.dev│ │           │   │.pages.dev  │ │           │
  └──────┬──────┘ └──────────┘   └──────────┘ └──────────┘
         │                                              │
         └────────────── 同域部署 ───────────────────────┘
                   (Pages Functions 处理 /api/* )
```

### 部署方案说明

本项目采用 **Cloudflare Pages 全托管方案**：

| 组件 | 部署目标 | 说明 |
|------|---------|------|
| 前端页面 (`src/*.html`, `src/config.js`) | **Cloudflare Pages** | 自动从 GitHub 拉取构建 |
| API 路由 (`worker.js` → `/functions/*.js`) | **Cloudflare Pages Functions** | 与 Pages 同域名，无需跨域 |
| 数据库 | **Cloudflare D1** | 通过环境变量绑定到 Pages |

> **为什么选这个方案？** 前端和 API 在同一个域名下，不存在跨域问题，config.js 无需硬编码后端地址，用户体验最好。

---

## 第一步：准备 GitHub 仓库

### 1. 创建仓库

在 GitHub 上新建一个公开或私有仓库（建议私有）：
- 仓库名: `timzoo`
- 不要勾选 README、.gitignore（我们直接推送已有文件）

### 2. 整理项目文件

确保你的本地项目目录结构如下：

```
timzoo/
├── functions/
│   └── [[api]].js          # ← 从 worker.js 改造而来（Pages Functions 格式）
├── src/
│   ├── index.html          # 用户端主页面
│   ├── admin.html          # 管理后台
│   └── config.js           # 前端 API 配置
├── schema.sql              # D1 数据库初始化脚本
├── wrangler.toml           # 部署配置（用于 D1 管理）
├── package.json            # 项目依赖
└── README.md               # 本文档
```

> ⚠️ **重要**: Cloudflare Pages Functions 要求 API 文件放在 `functions/` 目录下。我们需要把 `worker.js` 移动并改造为 Pages Functions 格式。

### 3. 初始化 Git 并推送

```bash
# 进入项目目录
cd C:\Users\Administrator\WorkBuddy\20260509102032\timzoo

# 初始化 Git 仓库
git init

# 添加所有文件
git add .

# 首次提交
git commit -m "🎉 TimZoo 探店管理 v1.0 - 初始版本"

# 关联远程仓库（替换为你的 GitHub 地址）
git remote add origin https://github.com/你的用户名/timzoo.git

# 推送到 GitHub
git push -u origin main
```

> 如果 `git push` 报错分支名问题，GitHub 默认主分支是 `main`，用 `git branch -M main` 先重命名。

---

## 第二步：创建 D1 数据库

D1 是 Cloudflare 的 SQLite 数据库，免费额度非常充足。

### 方式 A：通过 Cloudflare Dashboard（推荐，可视化操作）

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 左侧菜单选择 **Workers 和 Pages**
3. 点击顶部标签栏的 **D1 SQL 数据库**
4. 点击 **创建数据库**
5. 名称填：`timzoo-db`
6. 位置选择：**APAC (亚太地区)** 会更快
7. 点击 **创建**

创建成功后，你会看到数据库 ID（一串 UUID 格式的字符串），**复制保存好**。

### 方式 B：通过 Wrangler CLI

```bash
# 安装 wrangler（如果还没安装）
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 创建 D1 数据库
npx wrangler d1 create timzoo-db
```

输出中会显示 `database_id`，复制保存。

### 初始化表结构

```bash
# 在项目目录下执行
npx wrangler d1 execute timzoo-db --remote --file=./schema.sql
```

执行成功后会创建：
- ✅ `users` 表 — 用户账号（含默认管理员 dinice / dinice98）
- ✅ `records` 表 — 探店记录
- ✅ `orders` 表 — VIP 订单记录
- ✅ 7 个查询索引

### 验证数据库

在 Dashboard 中点击进入 `timzoo-db` → **控制台**，执行：

```sql
SELECT id, username, role, memberType FROM users;
```

应该能看到管理员账号 `dinice` | `admin` | `vip`。

---

## 第三步：创建 Worker（API 后端）并绑定 D1

> 这一步是为了让 Pages Functions 能够访问 D1 数据库。我们需要先创建一个 Worker 作为"桥梁"，然后把这个 D1 绑定关联到 Pages 项目上。

### 1. 创建一个占位 Worker

在 Dashboard 中：
1. **Workers 和 Pages** → **创建** → **创建 Worker**
2. 名称填：`timzoo-api`
3. 点 **部署**（先用默认代码，后面会被 Pages 替代）

### 2. 给 Worker 绑定 D1

1. 进入刚创建的 `timzoo-api` Worker → **设置** → **绑定**
2. 点击 **添加** → 选择 **D1 数据库**
3. 变量名称填：`DB`（必须和代码里 `env.DB` 一致）
4. 选择数据库：`timzoo-db`
5. 保存

> 这个 Worker 的作用只是持有 D1 绑定配置。实际的 API 逻辑由 Pages Functions 执行。

---

## 第四步：连接 GitHub 仓库到 Pages（前端 + API）

这是最核心的一步！

### 1. 创建 Pages 项目

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 左侧菜单 **Workers 和 Pages**
3. 点击 **创建**
4. 选择 **Pages** 标签 → **连接到 Git**

### 2. 授权并选择仓库

1. 点击 **连接 GitHub**（首次需要授权 Cloudflare 访问你的 GitHub）
2. 在 GitHub 弹窗中授权，选择 `timzoo` 仓库
3. 确认授权后回到 Cloudflare 配置页面

### 3. 配置构建设置

填写以下参数：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 项目名称 | `timzoo-web` | Pages 项目名，也是默认域名的一部分 |
| 生产分支 | `main` | 推送 main 分支自动部署 |
| 构建命令 | （留空） | 纯静态文件，无需构建 |
| 构建输出目录 | `src` | 前端文件在 src/ 目录下 |
| 根目录 | `/` | 仓库根目录 |
| 兼容性标志 | `nodejs_compat` | 启用 Node.js 兼容层 |

> ⚠️ **构建输出目录填 `src`**，因为 HTML/JS 文件都在 `src/` 下。

4. 点击 **保存并部署**

### 4. 首次部署

Cloudflare 会自动从 GitHub 拉取代码并部署。等待 1-2 分钟，部署成功后你会看到类似这样的地址：

```
https://timzoo-web.pages.dev
```

此时打开这个地址应该能看到前端页面（但 API 还不能用，因为还没绑 D1）。

---

## 第五步：配置环境变量与绑定

### 1. 给 Pages 项目绑定 D1 数据库

这是最关键的一步——让 Pages Functions 能访问 D1！

1. 进入 Pages 项目 `timzoo-web` → **设置** → **函数**
2. 找到 **Bindings（绑定）** 部分
3. 点击 **添加** → **D1 数据库**
4. 变量名称：`DB`（和代码中的 `env.DB` 一致）
5. 选择数据库：`timzoo-db`
6. 点击 **保存**

### 2. 兼容性标志设置

在同一页面确认：
- **兼容性标志**: `nodejs_compat`（如果第四步没设的话在这里补上）
- **兼容性日期**: `2024-09-23`

保存后，Pages 会自动重新部署以应用新配置。

### 3. 关于 Pages Functions 的路由说明

Cloudflare Pages Functions 的路由规则：

| 文件路径 | 匹配的路由 | 说明 |
|---------|-----------|------|
| `functions/api/health.js` | `GET /api/ health` | 健康检查 |
| `functions/api/user.js` | `/api/user/*` | 用户相关 |
| `functions/api/records.js` | `/api/records*` | 探店记录 CRUD |
| `functions/[[path]].js` | 所有未匹配路由 | 404 或 fallback |
| `functions/[[api]].js` | **所有 `/api/*` 路由** | ⭐ 我们的主入口 |

> **本项目使用 `functions/[[api]].js` 作为统一 API 入口**，所有 `/api/*` 请求都由这一个文件处理（就是原来的 worker.js 改造版）。这种方式最简单，不用拆分多个文件。

---

## 第六步：首次部署与验证

### 1. 验证 API 是否工作

打开浏览器访问：

```
https://timzoo-web.pages.dev/api/health
```

预期返回：
```json
{"ok":true,"time":"2026-05-25T..."}
```

如果看到这个结果，恭喜你！✅ **后端 API 已经跑起来了！**

### 2. 测试完整功能

| 测试项 | URL / 操作 | 预期结果 |
|--------|-----------|---------|
| 用户端首页 | `https://timzoo-web.pages.dev/` | 正常加载登录/注册页 |
| 注册新用户 | 注册任意账号 | 自动获得 1 年 VIP |
| VIP 开通 | 点击"开通会员" | 弹出成功提示 + QQ客服信息 |
| 管理后台 | `https://timzoo-web.pages.dev/admin.html` | 用 dinice / dinice98 登录 |
| 探店记录 | 新增/编辑/删除 | 数据正常增删改查 |
| CSV 导出 | 点击导出按钮 | 下载 CSV 文件 |

### 3. 如果 API 返回错误

查看实时日志：

```bash
npx wrangler tail --project-name=timzoo-web
```

或在 Dashboard 中：**timzoo-web** → **日志** → **实时日志**

---

## 第七步：绑定自定义域名（可选）

### 绑定自定义域名

1. 进入 Pages 项目 `timzoo-web` → **自定义域**
2. 点击 **设置自定义域**
3. 输入你的域名，如：`timzoo.com` 或 `app.timzoo.com`
4. Cloudflare 会自动提示你需要添加的 DNS 记录

### DNS 配置

去你的域名 DNS 管理处（如果在 Cloudflare 管理域名则更简单）添加：

| 类型 | 名称 | 值 | 代理状态 |
|-----|------|-----|---------|
| CNAME | `@` 或 `app` | `timzoo-web.pages.dev` | 仅 DNS（灰色云朵） |

> ⚠️ Pages 自定义域名要用 **仅 DNS（DNS only）**，不能开橙色云朵代理。

SSL 证书由 Cloudflare 自动颁发，通常几分钟内生效。

---

## 第八步：日常开发流程

配置完成后，你的日常工作流就非常简单了：

```
本地修改代码 → git commit → git push → Cloudflare 自动构建部署 → 完成！ 🔥
```

### 典型工作流示例

```bash
# 1. 修改了 index.html 的某个功能
git add src/index.html
git commit -m "✨ 优化VIP弹窗样式"

# 2. 推送，Cloudflare 自动部署
git push

# 3. 查看部署状态
# 去 Dashboard → timzoo-web → 部署 查看进度
```

### 分支策略（推荐）

| 分支 | 用途 | 是否自动部署 |
|------|------|------------|
| `main` | 生产环境 | ✅ 自动部署 |
| `dev` | 开发测试 | 可开启预览部署 |
| `feature/*` | 功能开发 | 手动预览 URL |

在 Pages 设置中可以开启 **预览部署**：每次 push 到非生产分支都会生成一个临时预览链接。

---

## 📁 最终项目文件清单

确保你的 GitHub 仓库包含以下文件：

```
timzoo/
├── functions/
│   └── [[api]].js          # Pages Functions API 入口（核心！）
├── src/
│   ├── index.html          # 用户端（~1727行）
│   ├── admin.html          # 管理后台
│   └── config.js           # 前端配置（baseUrl 自动检测）
├── schema.sql              # D1 初始化脚本
├── wrangler.toml           # D1 管理配置
├── package.json            # npm 脚本
└── README.md               # 本文档
```

---

## 常见问题排查

### Q1: 部署后页面空白？

**可能原因**: 构建输出目录设置错误
- 检查 Pages 设置中的构建输出目录是否为 `src`（不是 `/` 或 `dist`）
- 确认 `src/` 目录下确实有 `index.html`

### Q2: API 返回 404 或 500？

**排查步骤**:
1. 确认 `functions/[[api]].js` 文件存在于仓库根目录
2. 确认 D1 绑定的变量名为 `DB`（大写）
3. 检查 Pages 日志是否有报错信息
4. 确认兼容性标志 `nodejs_compat` 已启用

### Q3: 前端提示 "Failed to fetch"？

**可能原因**:
- D1 未正确绑定 → 去 Settings → Functions → Bindings 检查
- API 路径错误 → 打开 F12 Network 面板查看实际请求地址
- 本地测试时 config.js baseUrl 不对 → 生产环境下应使用同域

### Q4: 如何更新 D1 数据库表结构？

```bash
# 添加新字段
npx wrangler d1 execute timzoo-db --remote --command="ALTER TABLE records ADD COLUMN new_field TEXT"

# 或者写一个新的 SQL 文件执行
npx wrangler d1 execute timzoo-db --remote --file=./migration.sql
```

### Q5: 如何回滚到上一个版本？

1. 进入 Dashboard → `timzoo-web` → **部署**
2. 找到之前成功的部署版本
3. 点击右侧 `...` → **重新部署此版本**

### Q6: 数据库密码是明文安全吗？

当前 schema.sql 中密码以明文存储。对于小型应用问题不大，但如需加强：
- 生产环境可在 `handleRegister()` 中加入 bcrypt 哈希
- Cloudflare Workers 支持 Web Crypto API，可以做轻量哈希

### Q7: Windows PowerShell 特殊注意事项

| 问题 | 解决方案 |
|------|----------|
| `&&` 不可用 | 用 `;` 分隔命令 |
| git 报 SSL 错误 | `git config --global http.sslbackend openssl` |
| 文件名编码问题 | 确保 UTF-8 编码，终端执行 `chcp 65001` |
| wrangler 命令找不到 | 用 `npx wrangler` 或 `node node_modules/.bin/wrangler` |

### Q8: D1 免费额度够用吗？

| 项目 | 免费额度 |
|------|---------|
| 存储 | 5 GB / 天 |
| 读取 | 2500 万次 / 月 |
| 写入 | 10 万次 / 月 |
| **结论** | **个人/小团队完全够用** 💪 |

---

## 🎯 部署完成后速查表

| 项目 | 值 / 地址 |
|------|----------|
| Pages 前端地址 | `https://timzoo-web.pages.dev` |
| API 基础地址 | `https://timzoo-web.pages.dev/api` |
| 管理后台 | `https://timzoo-web.pages.dev/admin.html` |
| 管理员账号 | `dinice` / `dinice98` |
| D1 数据库名 | `timzoo-db` |
| D1 绑定变量 | `DB` |
| GitHub 仓库 | `github.com/xxx/timzoo` |
| VIP 价格 | 月¥1 / 年¥2 / 永久¥3 |
| QQ 客服 | 690913714 |

---

> **文档版本**: v2.0 (GitHub 部署版) | **最后更新**: 2026-05-25
>
> **适用场景**: 通过 GitHub 仓库连接 Cloudflare Pages，实现代码推送即自动部署
