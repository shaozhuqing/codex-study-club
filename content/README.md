# Codex Study Club 内容目录

网站的可维护内容统一存放在本目录。页面组件只负责读取和展示，不在 TSX 文件中保存文章正文。

## 目录结构

```text
content/
├── assistant/             # 首页对话助手的本地知识
├── cases/                 # 实战案例
│   ├── getting-started/   # 新手入门
│   ├── troubleshooting/   # 问题排查
│   ├── development/       # 开发与自动化
│   ├── content-design/    # 内容与设计
│   ├── knowledge/         # 知识与协作
│   └── tools-devices/     # 工具与设备
├── community-updates/     # 社群动态
├── seo/                   # 审核后发布的 SEO 专题草稿
├── themes/                # Codex 桌面主题
└── tutorials/             # 系统教程
```

## 案例格式

```yaml
---
title: "案例标题"
description: "用于列表和 SEO 的摘要"
level: "初学者"
surface: "Codex App"
duration: "15 分钟"
cover: "/cases/example.webp"
imageAlt: "封面图片说明"
checkedAt: "2026-07-20"
---
```

文件所在的一级子目录就是案例分类。新增案例时不需要修改 TypeScript 数据表。

## 社群动态格式

```yaml
---
title: "动态标题"
excerpt: "列表摘要"
date: "2026-07-20"
displayDate: "07.20"
topics:
  - "主题一"
  - "主题二"
---
```

## 主题页面格式

`themes/` 中每个文件是一套独立的主题介绍。正文可以使用 Markdown；需要图片网格时使用带 `theme-gallery` 类名的 HTML `div`，图片仍放在 `public/themes/` 下。

```yaml
---
title: "主题名称"
description: "用于页面和 SEO 的摘要"
checkedAt: "2026-07-20"
---
```

## 对话知识格式

`assistant/` 中每个文件代表一个可匹配的知识主题。`terms` 用于本地问题匹配，`sources` 用于回答后的来源链接。

```yaml
---
title: "知识主题"
terms:
  - "关键词"
sources:
  - label: "来源名称"
    href: "/站内路径或外部地址"
---
```

## 首页 Agent 如何使用内容

`lib/knowledge-base.ts` 会把以下 Markdown 自动加入本地资料库：

- `assistant/` 中的定向问答。
- `tutorials/` 中的教程。
- `themes/` 中的主题教程与图库说明。
- `cases/` 下所有分类案例。
- `community-updates/` 中的社群动态。

用户在首页提问后，系统先用标题、摘要、关键词和正文进行本地相关度检索，只把最相关的文档交给回答模型。

- 配置 `OPENAI_API_KEY` 时：模型根据召回的本地 Markdown 正文生成回答；需要使用兼容服务时可通过服务端 `OPENAI_BASE_URL` 修改请求地址。
- 未配置 `OPENAI_API_KEY` 时：系统直接返回最相关文档的本地答案或摘要。
- 两种模式都会返回对应的站内资料链接。

不需要为案例、教程或社群动态额外建立索引记录。新增 Markdown 后，构建或重启服务即可进入资料库。

## SEO 专题格式与审核

`seo/` 由 `npm run seo:generate` 显式生成，不会在构建期间调用模型，也不会进入首页对话助手的知识库。专题正文不写 H1，页面组件负责输出唯一 H1。

```yaml
---
title: "Codex CLI 中文教程：安装、配置与常用工作流"
description: "面向中文开发者的 Codex CLI 学习路径。"
slug: "codex-cli"
primaryKeyword: "Codex CLI 教程"
secondaryKeywords:
  - "Codex CLI 安装"
intent: "tutorial"
priority: "P0"
sourceIds:
  - "start:10-cli-installation"
draft: true
generatedAt: "2026-07-27T00:00:00.000Z"
contentHash: "sha256-value"
---
```

审核发布流程：

1. 运行 `npm run seo:plan` 和 `npm run seo:generate` 创建或更新草稿。
2. 核对正文事实、来源链接、搜索意图和重复内容，再运行 `npm run seo:check`。
3. 人工把 `draft` 改为 `false`，并添加 ISO 格式的 `reviewedAt`。
4. 设置 `SEO_TOPICS_ENABLED=true` 后重新构建和部署。

草稿可能被后续显式生成覆盖。脚本不会覆盖 `draft: false` 的已发布文件；来源变化时只报告 `published_stale`，等待人工处理。

## 写作规则

- 每篇内容只保留一个一级标题。
- 页面标题和摘要放在 frontmatter，完整正文写在标题之后。
- 图片放在 `public/` 下，Markdown 使用以 `/` 开头的站内路径。
- 外部产品事实需要注明核对日期，并优先引用官方资料。
- 不在公开内容中写入 API Key、密码、真实用户数据或未经脱敏的群聊信息。
