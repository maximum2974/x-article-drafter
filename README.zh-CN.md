<div align="center">

# x-article-drafter

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen)](https://nodejs.org)
[![Playwright](https://img.shields.io/badge/Playwright-latest-blue)](https://playwright.dev)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[English](README.md) | **中文**

</div>

将本地 Markdown 文件通过可见的持久浏览器会话转换为 **X 文章云端草稿**。

> **本工具绝不发布文章，仅创建或更新草稿。**

---

## 目录

- [功能特性](#功能特性)
- [环境要求](#环境要求)
- [安装](#安装)
- [快速开始](#快速开始)
- [命令说明](#命令说明)
- [Markdown 格式规范](#markdown-格式规范)
- [选项参考](#选项参考)
- [工作原理](#工作原理)
- [常见问题](#常见问题)

---

## 功能特性

- **`check`** — 验证 Markdown 格式并预览解析结构，无需打开浏览器
- **`preview`** — 生成接近 X 文章实际样式的本地 HTML 预览文件
- **`draft`** — 创建新的 X 文章云端草稿，或更新已有草稿；绝不发布
- 持久化浏览器配置 — 跨次运行保持登录状态，无需反复登录
- 自动上传封面图片并在正文中依次插入图片
- 保存后自动校验，确保所有文字段落和图片均已正确写入

---

## 环境要求

| 依赖 | 版本要求 |
|---|---|
| Node.js | 18 或更高 |
| Google Chrome | 最新版（推荐） |
| Chromium | 可用的替代选项 |
| X 账号 | 须具备 [X 文章](https://x.com/compose/articles) 功能权限 |

> X 文章功能仅对特定账号开放（已认证账号或粉丝数达到一定门槛）。使用本工具前，请先确认您的账号可以访问 `x.com/compose/articles`。

---

## 安装

```bash
git clone https://github.com/YOUR_USERNAME/x-article-drafter.git
cd x-article-drafter
npm install
npm link
```

执行 `npm link` 后，`x-article-drafter` 命令即可在终端全局使用。

---

## 快速开始

```bash
# 1. 验证 Markdown 格式（不打开浏览器）
x-article-drafter check my-article.md

# 2. 本地预览
x-article-drafter preview my-article.md
open my-article.md.preview.html

# 3. 推送到 X 创建云端草稿
x-article-drafter draft my-article.md
```

---

## 命令说明

### `check` — 仅验证格式

```bash
x-article-drafter check <article.md>
```

解析 Markdown 并打印标题、封面、内容块数量、图片数量的摘要信息。不打开浏览器。在运行 `draft` 之前使用此命令可提前发现格式错误。

示例输出：

```
Title: 我的文章标题
Cover: /path/to/cover.jpg
Body blocks: 12
Body images: 3
Editor segments: 5
```

---

### `preview` — 本地 HTML 预览

```bash
x-article-drafter preview <article.md> [--output <preview.html>]
```

生成一个接近 X 文章实际排版样式的 HTML 文件，用任意浏览器打开即可预览效果。

- 默认输出：`<article>.preview.html`（与源文件同目录）
- 使用 `--output` 可指定自定义输出路径

---

### `draft` — 创建或更新 X 文章草稿

```bash
# 创建新草稿
x-article-drafter draft <article.md>

# 通过草稿 ID 更新已有草稿
x-article-drafter draft <article.md> --draft 1234567890

# 通过完整 URL 更新已有草稿
x-article-drafter draft <article.md> --draft https://x.com/compose/articles/edit/1234567890
```

此命令的执行流程：

1. 以持久配置启动 Chrome 浏览器
2. 导航至 `x.com/compose/articles`
3. 创建新草稿或打开指定草稿
4. 填写标题、上传封面图片、粘贴正文内容、逐一上传正文图片
5. 等待 X 自动保存
6. 校验所有内容是否已正确写入
7. 保持浏览器开启，供您手动审阅后再发布

草稿创建成功后，终端将输出：

```
Draft created: 我的文章标题
Editor URL: https://x.com/compose/articles/edit/1234567890
The tool did not publish the article.
The browser will stay open for manual edits. Press Enter to close it...
```

**首次运行登录**

首次运行 `draft` 时，可能会弹出 X 的登录页面。在浏览器中完成登录后，回到终端按回车键继续。您的登录会话将保存至 `~/.x-article-drafter/chrome-profile`，后续运行无需重复登录。

---

## Markdown 格式规范

### 前置元数据（可选）

在文件最顶部添加 YAML 前置元数据：

```markdown
---
title: 我的文章标题
cover: ./images/cover.jpg
cover_alt: 封面图片描述
---
```

| 字段 | 说明 |
|---|---|
| `title` | 文章标题（与 `# H1` 二选一，不可同时使用） |
| `cover` | 封面图片的相对路径 |
| `cover_alt` | 封面图片的替代文本 |

### 文档结构示例

```markdown
![封面图片](./cover.jpg)

# 文章标题

正文段落，支持**粗体**、_斜体_和[链接](https://example.com)。

## 第一节

正文段落内容。

> 单段落引用块。

- 无序列表项一
- 无序列表项二

1. 有序列表项一
2. 有序列表项二

\`\`\`javascript
const greeting = "你好，X！";
console.log(greeting);
\`\`\`

---

![正文图片](./images/photo.jpg)

## 第二节

更多内容。
```

### 支持与不支持的内容块

| 内容块类型 | 支持情况 |
|---|---|
| `# H1` — 文章标题（每篇仅一个，置于正文前） | ✅ |
| `## H2` — 章节标题 | ✅ |
| 段落（行内粗体、斜体、链接、行内代码） | ✅ |
| 无序列表（单层） | ✅ |
| 有序列表（单层） | ✅ |
| 单段落引用块 | ✅ |
| 代码块（支持语言标识） | ✅ |
| 分割线（`---`） | ✅ |
| 本地图片（独占一行） | ✅ |
| `### H3` 及更深层级标题 | ❌ |
| 原始 HTML | ❌ |
| Markdown 表格 | ❌ |
| 任务列表（`- [ ] 项目`） | ❌ |
| 嵌套列表 | ❌ |
| 远程图片（`https://...`） | ❌ |
| 与文字混排的行内图片 | ❌ |

**封面图片规则**

- 在 `# H1` 标题*之前*放置一个独占一行的图片（`![描述](路径)`），即作为封面。
- 或者在前置元数据中设置 `cover: 路径`。
- 仅支持本地图片文件。如需使用网络图片，请先将其下载到 Markdown 文件所在目录。

**格式验证是强制性的。** 不支持的内容块会导致工具退出并输出清晰的错误信息，而不是静默地丢弃内容。

---

## 选项参考

### `draft` 命令选项

| 选项 | 说明 | 默认值 |
|---|---|---|
| `--draft <ID或URL>` | 通过数字 ID 或完整编辑 URL 更新已有草稿 | 创建新草稿 |
| `--profile <目录>` | 自定义浏览器配置目录路径 | `~/.x-article-drafter/chrome-profile` |
| `--browser chrome\|chromium` | 要启动的浏览器类型 | `chrome` |
| `--close` | 草稿保存后自动关闭浏览器 | 浏览器保持开启 |

### `preview` 命令选项

| 选项 | 说明 | 默认值 |
|---|---|---|
| `--output <路径>` | 生成 HTML 文件的输出路径 | `<article>.preview.html` |

---

## 工作原理

```
Markdown 文件
     │
     ▼
┌─────────────┐    MarkdownValidationError
│   解析器    │ ──────────────────────────▶ 退出 1
│ (markdown)  │
└─────────────┘
     │ 文章对象
     ▼
┌─────────────┐
│   渲染器    │ ──▶ HTML 段落 + 图片占位符
│  (render)   │
└─────────────┘
     │
     ▼
┌─────────────┐
│   浏览器    │ ──▶ Playwright（持久化 Chrome 配置）
│  (browser)  │         │
└─────────────┘         ├── 填写标题
                        ├── 上传封面图片
                        ├── 粘贴正文 HTML
                        ├── 用实际图片替换占位符
                        ├── 等待自动保存
                        └── 校验所有内容段落
```

1. **解析** — 读取 Markdown 文件，提取前置元数据，对正文进行词法分析，并对每个内容块进行合规性验证。
2. **渲染** — 将内容块转换为 HTML 段落；图片被替换为唯一占位符 Token，便于后续在编辑器中定位并替换。
3. **启动** — 以非无头模式打开 Chrome 窗口（使用持久化配置），您可以实时看到整个操作过程。
4. **登录检测** — 轮询 X 已登录状态的 UI 元素；若 10 秒内未检测到，则提示您手动登录。
5. **填写内容** — 输入标题，点击封面上传按钮，通过模拟剪贴板事件粘贴正文 HTML，然后从后往前逐一将占位符替换为实际上传的图片。
6. **校验** — 等待自动保存后，扫描编辑器 DOM，确认所有文字段落和图片数量均与预期一致。
7. **交还控制权** — 输出草稿 URL，等待您按回车键后关闭浏览器。

---

## 常见问题

**生成了 `x-article-drafter-error.png` 文件**

发生意外错误时，工具会截取全页截图并保存为当前工作目录下的 `x-article-drafter-error.png`。打开截图可以看到失败时浏览器的具体状态。

**"X Article editor selectors changed or the editor did not load within 30 seconds"（编辑器选择器已变更或编辑器未在 30 秒内加载）**

X 偶尔会更新其编辑器 UI，导致元素选择器失效。如果遇到此问题，请提交 Issue 并附上错误截图。

**"X login was not detected"（未检测到 X 登录状态）**

请确保已在浏览器窗口中完成完整的登录流程，并等待 X 文章页面完全加载后，再在终端按回车键。

**`Invalid Markdown: ...`（Markdown 格式无效）**

Markdown 文件包含 X 文章不支持的内容块。错误信息会包含具体的块编号和类型，请参照[支持的内容块列表](#支持与不支持的内容块)进行修改。

**浏览器已打开但什么都没有输入**

通常是因为 Chrome 已在使用相同的配置目录运行。请关闭所有使用默认配置的 Chrome 窗口，或通过 `--profile` 参数指定一个独立的配置目录。
