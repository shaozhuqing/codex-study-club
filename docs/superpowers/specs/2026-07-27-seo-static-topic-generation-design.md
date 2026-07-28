# Codex Study Club SEO 静态专题页生成设计

日期：2026-07-27

## 1. 背景与目标

Codex Study Club 当前是一个面向中文用户的 Next.js 内容站，已有 44 篇可索引文档，包括 14 篇系统入门文章、23 个实战案例、5 篇社区更新、1 篇教程和 1 个主题页。站点已经具备 canonical、sitemap、robots、Open Graph 和部分结构化数据，但内容主要按栏目和发布时间组织，尚未形成稳定的搜索意图专题体系。

本项目的 SEO 首要目标是获取全球中文 Codex 自然搜索流量，次要目标是将高意向开发者转化为付费社群用户。目标用户是独立开发者和程序员；搜索市场以 Google 为主，同时兼顾百度收录。

本次设计的核心交付是一个可重复运行的 SEO 静态页生成流程。脚本每次全量扫描项目文章，按照明确的关键词策略选择来源，调用 OpenAI Responses API 组织专题正文，把可审查的 Markdown 草稿写入 `content/seo/`，再由 Next.js 在 `/topics/[slug]` 生成静态页面。

## 2. 范围

### 2.1 本次包含

- 项目关键词、关联长尾词和产品竞品词的配置化管理。
- 对 `content/start/`、`content/cases/`、`content/tutorials/`、`content/community-updates/` 和 `content/themes/` 的全量扫描、标准化、匹配和来源选择。没有公开落地页的 `content/assistant/` 以及生成目录 `content/seo/` 不作为专题来源。
- 规则引擎与 AI 协作生成 SEO 专题 Markdown。
- 草稿、审核、发布和来源过期提示机制。
- `/topics/[slug]` 静态专题页及其 metadata、结构化数据和内链。
- sitemap、导航曝光、索引控制和发布保护。
- 生成计划、生成执行、校验报告和自动化测试。
- 问题解决后的克制型社群转化入口。

### 2.2 本次不包含

- 自动发布未经人工审核的 AI 内容。
- 自动抓取搜索引擎结果或第三方网站正文。
- 批量生成缺少本地事实来源的竞品比较页。
- 购买外链、关键词堆砌、隐藏内容或其他高风险 SEO 手段。
- 在生产构建期间临时调用模型生成页面。
- 用 `meta keywords` 作为搜索排名手段。

## 3. 方案选择

SEO 资源采用以下组合：

- 60%：问题驱动内容，覆盖权限、网络、配置、任务跑偏和结果验证等具体问题。
- 25%：教程主题集群，覆盖 App、CLI、Skills、MCP 和新手路径。
- 15%：精选竞品比较页，优先覆盖 Codex 与 Claude Code；其余比较页只有在本地材料充分后才生成。

该方案优先复用现有内容，通过专题聚合提供学习路径、选择建议和问题索引，而不是继续生产互相竞争的泛教程文章。

## 4. 关键词与首期页面

首期生成 10 个专题。每个主关键词只能绑定一个可索引 canonical 页面。

| 优先级 | Slug | 主关键词 | 关联关键词 | 最低来源数 |
| --- | --- | --- | --- | --- |
| P0 | `codex-tutorial` | Codex 教程 | Codex 中文教程、Codex 新手教程、Codex 使用教程、Codex 官方教程 | 5 |
| P0 | `codex-app` | Codex App | Codex 桌面版、Codex App 下载、Codex App 安装、macOS、Windows | 4 |
| P0 | `codex-cli` | Codex CLI 教程 | Codex CLI 安装、命令、登录、配置、常用参数 | 3 |
| P0 | `codex-troubleshooting` | Codex 问题排查 | 网络连接失败、权限设置、命令被拦、任务跑偏、结果验证 | 3 |
| P0 | `codex-skills` | Codex Skills 教程 | Skill 安装、SKILL.md、制作 Skill、Skill 使用方法 | 3 |
| P1 | `codex-mcp` | Codex MCP | MCP 配置、MCP Server、Playwright MCP、Figma MCP、Notion MCP | 3 |
| P1 | `agents-md` | AGENTS.md | AGENTS.md 怎么写、AGENTS.md 示例、项目指令、Skill 区别 | 3 |
| P1 | `codex-workflows` | Codex 工作流 | CI 自动修复、代码审查、GitHub Actions、Codex 自动化 | 3 |
| P1 | `codex-api-config` | Codex 第三方 API | base_url、API Key、模型配置、Codex 配置文件 | 3 |
| P2 | `codex-vs-claude-code` | Codex vs Claude Code | Claude Code 替代品、CLI AI 编程助手、AI Coding Agent 对比 | 3 |

后续候选包括 `Codex vs Cursor`、`Codex vs Gemini CLI`、`Codex vs GitHub Copilot`、`Codex vs Windsurf`、`Codex 用量查询`、`Codex 插件`、`Codex 自动化` 和 `Codex 代码审查`。

竞品分为两类：

- 产品竞品：Claude Code、Cursor、Gemini CLI、GitHub Copilot、Windsurf。
- 内容竞品：知乎长文、菜鸟教程、GitHub 中文教程仓库、博客园、腾讯云开发者社区、YouTube 系统教程和 CodexGuide。

## 5. 内容匹配规则

1. 脚本每次扫描全部受支持的 Markdown，不依赖 Git diff 或上次运行状态决定扫描范围。
2. 文章通过标题、摘要、正文标题、已有主题、类别和配置中的匹配词计算相关度。
3. 一篇文章只能属于一个主专题，但可以作为多个专题的相关阅读。
4. 专题必须达到配置的最低来源数，否则标记为 `insufficient_sources`，不调用模型。
5. 比较页必须同时具有两方的可靠来源。只有 Codex 一侧内容时，不允许模型自行补齐竞品事实。
6. 来源顺序和输入内容保持确定性，保证相同输入能够得到稳定的计划与内容哈希。
7. 生成页必须提供增量价值，包括直接答案、学习路径、场景选择、问题索引和推荐顺序，不能只是摘要拼接。

## 6. 系统架构

```text
content/{start,cases,tutorials,community-updates,themes}/**/*.md
      |
      v
全量扫描与内容标准化
      |
      +---- config/seo-topics.json
      |
      v
关键词匹配、来源选择、重复意图检查
      |
      +---- reports/seo-plan.json
      |
      v
OpenAI Responses API
      |
      v
结构、来源与事实边界校验
      |
      +---- reports/seo-generation.json
      |
      v
content/seo/<slug>.md
      |
      v
lib/generated-content.json
      |
      v
app/topics/[slug]/page.tsx
      |
      v
Next.js 静态页面、metadata、结构化数据和 sitemap
```

### 6.1 新增文件

- `config/seo-topics.json`：专题、关键词、匹配规则、来源阈值和优先级。
- `scripts/seo/lib.mjs`：扫描、标准化、匹配、哈希、校验和文件保护的共享逻辑。
- `scripts/seo/plan.mjs`：只生成计划报告，不调用模型。
- `scripts/seo/generate.mjs`：调用模型并生成或更新草稿。
- `scripts/seo/check.mjs`：校验专题配置和生成文件。
- `scripts/seo/*.test.mjs`：使用 Node 内置测试运行器验证核心规则。
- `content/seo/*.md`：SEO 专题内容。
- `app/topics/[slug]/page.tsx`：专题静态路由。
- `app/topics/page.tsx`：已发布专题索引页。
- `components/site-analytics.tsx`：仅在配置 GA4 时加载统计脚本并提供无个人信息的事件接口。
- `components/seo-community-link.tsx`：保留专题来源并记录社群 CTA 点击。

### 6.2 修改文件

- `scripts/generate-content-data.mjs`：读取 `content/seo/` 并写入统一生成数据。
- `lib/content.ts`：增加 SEO 专题类型、集合和查询函数。
- `app/sitemap.ts`：只加入已发布专题页。
- 首页、案例详情、入门文章和站点导航：增加自然的专题内链。
- `package.json`：增加 SEO 计划、生成、校验和测试命令。
- `content/README.md`：补充 SEO 专题 frontmatter 和审核流程。
- `.env.example`：增加默认关闭的 `SEO_TOPICS_ENABLED`，以及可选的 `GOOGLE_SITE_VERIFICATION`、`BAIDU_SITE_VERIFICATION` 和 `NEXT_PUBLIC_GA_MEASUREMENT_ID`。
- `.gitignore`：忽略原子写入临时文件以及可重复生成的 `reports/seo-plan.json` 和 `reports/seo-generation.json`。

## 7. 命令与运行方式

```bash
npm run seo:plan
npm run seo:generate
npm run seo:check
npm run seo:test
```

- `seo:plan`：全量扫描，输出专题来源、得分、缺口、重复主关键词和将执行的动作，不调用模型。
- `seo:generate`：先执行相同计划，再为符合条件的草稿调用模型；缺少凭证时明确失败。
- `seo:check`：校验配置、Markdown、来源、链接、索引状态和关键词唯一性。
- `seo:test`：使用本地 fixtures 验证规则，不访问网络或模型。

`seo:generate` 使用现有 `OPENAI_API_KEY`、`OPENAI_BASE_URL` 和 `OPENAI_MODEL` 环境变量。模型调用发生在显式脚本命令中，不发生在 `npm run build` 中。

## 8. 生成文件契约

SEO Markdown 使用以下 frontmatter：

```yaml
---
title: "Codex CLI 中文教程：安装、配置与常用工作流"
description: "面向中文开发者的 Codex CLI 学习路径，覆盖安装、首次运行、常用命令、配置和验证方法。"
slug: "codex-cli"
primaryKeyword: "Codex CLI 教程"
secondaryKeywords:
  - "Codex CLI 安装"
  - "Codex CLI 命令"
intent: "tutorial"
priority: "P0"
sourceIds:
  - "start:10-cli-installation"
  - "start:11-cli-first-run"
  - "start:12-cli-options"
draft: true
generatedAt: "2026-07-27T00:00:00.000Z"
contentHash: "sha256-value"
---
```

正式数据类型还包含可选的 `reviewedAt`。发布动作由人工把 `draft` 改为 `false` 并补充 `reviewedAt` 完成。

正文不包含 H1，由页面组件输出唯一 H1。正文结构为：

1. 直接答案。
2. 适用对象和使用边界。
3. 按步骤排列的学习路径。
4. 按目标或问题选择内容。
5. 常见问题。
6. 相关阅读。
7. 社群转化入口。

## 9. AI 生成约束

- 模型只接收当前专题配置和选中的本地来源材料。
- 提示词明确禁止补充来源中不存在的价格、版本、功能、兼容性和竞品结论。
- 输出采用结构化 JSON 契约，由脚本渲染为 Markdown，避免解析任意自由文本。
- 模型返回的每个事实段落必须关联一个或多个由脚本提供的 `sourceIds`，格式为 `类型:slug`；脚本把这些来源渲染为段落后的可见站内“相关资料”链接。
- 页面链接只能引用已解析的站内路径，模型不能自行创建 URL。
- 模型不得生成隐藏关键词、重复段落、虚构评价或未经来源支持的优势结论。
- 模型输出不满足契约时最多重试一次；再次失败则保留旧草稿并记录错误。

## 10. 草稿与发布生命周期

### 10.1 新专题

新文件统一为 `draft: true`。页面可以通过直接 URL 预览，但必须输出 `noindex, nofollow`，不得进入专题索引、导航或 sitemap。

### 10.2 草稿更新

每次全量扫描后，脚本可以根据最新来源重新生成草稿。写入前必须通过全部校验，成功后使用原子替换更新文件。

### 10.3 已发布专题

脚本绝不覆盖 `draft: false` 的文件。如果当前来源哈希与文件中的 `contentHash` 不一致，报告将其标记为 `published_stale`，列出变化来源，等待人工更新。

### 10.4 来源不足或专题停用

来源不足时不生成新页。已有草稿如果失去最低来源覆盖，报告标记为 `insufficient_sources`，页面继续保持 noindex。已发布页出现该状态时只报告，不自动删除或下线。

## 11. 页面 SEO 与结构化数据

每个专题页包含：

- 唯一 title、description、canonical 和 Open Graph 信息。
- `BreadcrumbList`、`CollectionPage` 和 `ItemList` 结构化数据。
- 页面真实显示问答时才输出 `FAQPage`。
- 唯一 H1，以及符合语义层级的 H2/H3。
- 来源文章、相邻专题和相关问题的站内链接。
- 发布或审核日期，不伪造内容新鲜度。

专题 sitemap 只包含 `draft: false` 页面。配置中的关键词用于内容治理和页面生成，不依赖 `meta keywords` 获取排名。

## 12. 内链和转化设计

- 首页增加已发布专题入口，但不替代现有新手入口与案例导航。
- `/cases` 和 `/start` 文章根据主专题配置展示一个所属专题链接。
- 专题页按搜索意图串联具体教程、实战案例和问题排查内容。
- 同一正文位置不堆叠多个相似链接，链接文案描述目标页内容。
- 社群 CTA 位于用户获得完整答案之后，不使用弹窗或阅读遮挡。
- 问题页 CTA 使用开发者语境，例如“仍无法定位时，带上错误日志和复现步骤参与讨论”。
- CTA 点击需要保留来源专题标识，便于后续评估专题到社群的转化。

## 13. 错误处理与安全

- 缺少 `OPENAI_API_KEY`：`seo:plan` 和 `seo:check` 正常工作，`seo:generate` 在写文件前失败。
- API 超时或限流：进行有限次数重试，失败写入报告，不覆盖已有文件。
- JSON 不合法或字段缺失：拒绝输出，最多进行一次契约修复重试。
- 来源链接失效：校验失败，不发布相关草稿。
- 主关键词重复：`seo:check` 失败并列出冲突 slug。
- 输出路径必须解析在配置的 `content/seo/` 目录内，拒绝路径穿越。
- 临时文件写在目标目录内，校验通过后原子替换。
- 日志和报告不得包含 API Key、完整请求头或其他凭证。
- 已发布页面、人工编辑内容和工作区内无关改动不会被脚本覆盖。

## 14. 测试与验收

### 14.1 自动化测试

使用 Node 内置测试运行器覆盖：

- Markdown 全量发现与稳定排序。
- 标题、摘要、正文标题和类别的关键词匹配。
- 主专题唯一性和相关阅读复用。
- 最低来源数和比较页双方来源约束。
- 草稿可更新、已发布页不可覆盖。
- 内容哈希和 `published_stale` 检测。
- 输出目录边界、无效 slug 和路径穿越拒绝。
- frontmatter、内部链接、结构化输出和索引状态校验。
- API 错误、无效 JSON 和部分失败报告。

### 14.2 完成验证

```bash
npm run seo:plan
npm run seo:check
npm run seo:test
npm run lint
npm run build
```

随后使用浏览器检查首页、专题索引、一个 P0 专题、一个问题专题和移动端布局，并核对 metadata、canonical、robots、结构化数据、sitemap 和所有新增链接。

### 14.3 接受标准

- 同一主关键词只有一个可索引页面。
- 每个生成专题达到配置的最低真实来源数。
- 新页面默认 `draft: true`、`noindex, nofollow`，不进入 sitemap 和正式导航。
- AI 输出不包含来源材料之外的产品事实。
- 已发布页面不会被生成脚本覆盖。
- 缺少凭证、API 错误或校验失败时不留下半成品。
- 所有内部链接、canonical 和 sitemap URL 都可解析。
- `SEO_TOPICS_ENABLED=false` 时，首页、原文章页、`/api/chat`、原 sitemap URL 和原有页面 metadata 行为保持不变。
- 上述自动化命令和浏览器检查全部通过。

## 15. 实施阶段

### 第一阶段：生成基础设施与 P0 草稿

- 建立专题配置、扫描匹配、计划报告和测试 fixtures。
- 建立 AI 结构化生成、校验、草稿保护和生成报告。
- 扩展内容数据模型并实现 `/topics` 静态路由。
- 生成 5 个 P0 专题草稿。

### 第二阶段：站内 SEO 和 P1/P2 草稿

- 增加专题索引、站内内链、社群 CTA 和结构化数据。
- 扩展 sitemap 和发布状态控制。
- 生成 4 个 P1 专题草稿。
- 只有来源充分时才生成 `codex-vs-claude-code` 草稿。

### 第三阶段：人工审核与上线监测

- 逐页核对事实、搜索意图、标题、摘要、内链和转化文案。
- 将通过审核的页面改为 `draft: false` 并补充 `reviewedAt`。
- 提交 sitemap，使用 Google Search Console 和百度搜索资源平台观察收录。
- 建立每月检查：曝光、点击、查询词、索引状态、专题 CTA 点击和来源过期报告。

没有可靠流量基线前，不设武断的排名承诺。上线后以前 28 天建立基线，再按专题比较后续 28 天的有效曝光、非品牌点击、进入前 20 名的查询数量和社群 CTA 点击率。

## 16. 原功能兼容性、灰度与回滚

在实施和验证完成前，不能仅凭设计承诺零影响。本方案通过以下兼容性契约把影响限制为可验证、可关闭的增量：

- SEO 计划与生成脚本是显式离线命令，不挂入 `dev`、`start`、`/api/chat` 或用户请求链路。
- `npm run build` 只读取已经落盘的 Markdown，不调用 OpenAI API。
- `content/seo/` 不存在或为空时，内容生成器返回空 `seoTopics`，现有内容集合和页面继续工作。
- SEO 专题不加入 `lib/knowledge-base.ts`，首页助手的检索语料、回答排序和接口行为保持不变。
- 现有 `/`、`/start/*`、`/cases/*`、`/themes`、`/community/*` URL、canonical 和 metadata 不改写。
- 新增内链只在存在已发布专题且全局开关开启时渲染；默认页面结构不增加空容器。
- 不修改现有 Markdown 正文。生成器只写 `content/seo/`、临时文件和忽略的报告文件。
- 不引入运行时必需的外部服务。模型不可用只影响显式的 `seo:generate` 命令。

采用双重发布条件：

1. 全局环境变量 `SEO_TOPICS_ENABLED=true`。
2. 单个专题 frontmatter 为 `draft: false` 且具有 `reviewedAt`。

任一条件不满足时，专题不进入首页、专题索引和 sitemap，并输出 `noindex, nofollow`。`SEO_TOPICS_ENABLED` 默认 `false`，所以首次部署代码不会改变原站的可索引页面集合。

### 16.1 灰度步骤

1. 记录改造前的 lint、build、主要路由和 `/api/chat` 基线。
2. 实施代码并保持 `SEO_TOPICS_ENABLED=false`，所有生成页保持草稿。
3. 重跑相同验证，确认原页面和助手接口无回归。
4. 在预览环境设置 `SEO_TOPICS_ENABLED=true`，审核专题布局、metadata、robots 和 sitemap。
5. 生产环境先发布一个 P0 专题，观察抓取、错误和转化事件 7 天。
6. 指标与运行状态正常后，再分批发布剩余 P0 和 P1 专题。

### 16.2 回滚方式

- 索引或内容异常：把对应页面改回 `draft: true` 并重新部署。
- 专题系统整体异常：设置 `SEO_TOPICS_ENABLED=false` 并重新部署；原页面继续服务。
- 代码回归：回退 SEO 实现提交。生成内容全部位于独立目录，不需要修改原文章才能回滚。
- 已被搜索引擎收录的错误页面不能仅依赖删除；先返回 noindex，待搜索引擎处理后再决定是否保留、重定向或返回 410。

## 17. 实施步骤与命令

以下命令是实现完成后的标准运行方式。

### 17.1 建立原功能基线

```bash
git status --short
npm run lint
npm run build
npm run dev
```

开发服务器启动后，在另一个终端检查主要页面：

```bash
curl -fsS http://localhost:3000/ > /dev/null
curl -fsS http://localhost:3000/start/01-what-is-codex > /dev/null
curl -fsS http://localhost:3000/cases > /dev/null
curl -fsS http://localhost:3000/community/updates > /dev/null
curl -fsS -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  --data '{"messages":[{"role":"user","content":"Codex CLI 如何安装？"}]}'
```

最后一个请求应返回 NDJSON 数据，并包含 `sources`、至少一个 `delta` 和 `done` 事件。实现后把这些请求收敛为自动化 smoke test，避免只靠人工执行。

### 17.2 查看生成计划

```bash
npm run seo:plan -- --output content/seo
```

先检查 `reports/seo-plan.json`：每个专题应列出候选来源、匹配得分、主来源、相关阅读、内容哈希和计划动作。来源不足与比较资料不完整的专题必须显示为跳过。

### 17.3 运行规则测试

```bash
npm run seo:test
npm run seo:check -- --output content/seo
```

这一步不需要 API Key，也不访问外部网络。

### 17.4 生成 SEO 草稿

先在当前 shell 或 CI Secret 中配置现有的 `OPENAI_API_KEY`、`OPENAI_BASE_URL` 和 `OPENAI_MODEL`，不要把密钥写入命令、仓库或报告，然后运行：

```bash
npm run seo:generate -- --output content/seo
npm run seo:check -- --output content/seo
```

检查生成状态与 frontmatter：

```bash
rg -n '^title:|^primaryKeyword:|^sourceIds:|^draft:|^contentHash:' content/seo
```

### 17.5 人工审核与发布

逐页检查事实、来源、标题、摘要、学习路径、内链和 CTA。通过审核后只修改对应页面：

```yaml
draft: false
reviewedAt: "2026-07-27"
```

然后执行完整验证：

```bash
npm run seo:check -- --output content/seo
npm run seo:test
npm run lint
npm run build
npm run dev
```

在预览环境设置 `SEO_TOPICS_ENABLED=true`，核对 `/topics`、已发布专题、一个草稿专题、首页、原文章页、`/api/chat`、`/robots.txt` 和 `/sitemap.xml`。全部通过后再运行项目已有的 Cloudflare 部署命令：

```bash
npm run deploy
```

生产环境首次只发布一个 P0 专题。确认 7 天运行与抓取数据后，再逐批发布其余页面。

## 18. SEO 效果统计

SEO 效果分为收录、搜索表现、站内行为和业务转化四层，不能只看总访问量。

### 18.1 Google 搜索表现

使用 Google Search Console：

1. 通过 DNS 验证生产域名。
2. 提交 `https://<生产域名>/sitemap.xml`。
3. 用 URL 检查工具抽查首个已发布专题的 canonical、抓取和索引状态。
4. 在“效果”报告中按页面过滤 `/topics/`，同时按查询词和国家/地区拆分。
5. 每 28 天导出一次页面与查询数据，区分站点品牌词和非品牌词。

核心指标：

- 专题收录率 = 已索引专题数 / 已发布专题数。
- 搜索点击与有效曝光。
- 搜索 CTR = 点击 / 曝光。
- 平均排名，以及进入前 10、前 20 的非品牌查询数量。
- 每个专题带来的新增查询词，而不是只看 `Codex` 总词量。

### 18.2 百度收录

使用百度搜索资源平台完成站点验证并提交同一 sitemap。每周记录索引量、抓取异常、搜索词和落地页数据。百度与 Google 的排名和收录口径不能合并，分别报告。

### 18.3 站内行为与社群漏斗

统计能力采用可选配置，未配置时不加载任何统计脚本，避免影响原站。首选实现为 Google Analytics 4：

- `NEXT_PUBLIC_GA_MEASUREMENT_ID` 存在时才加载 GA4。
- 专题页依赖标准 `page_view`，并携带 `topic_slug`、`primary_keyword` 和 `intent`。
- 点击专题页社群 CTA 时发送 `community_cta_click`。
- 到达 `/community` 时保留来源专题，发送 `community_landing_view`。
- 点击外部加入链接时发送 `community_join_click`。
- 事件不包含搜索内容、聊天内容、错误日志、微信号或其他个人信息。

漏斗指标：

- 专题 CTA 点击率 = `community_cta_click` / 专题自然搜索会话。
- 社群页到达率 = `community_landing_view` / 专题自然搜索会话。
- 加入意向率 = `community_join_click` / 专题自然搜索会话。

当前 `/community` 使用静态微信二维码，单纯扫码不会回传来源专题，因此无法准确统计最终付费转化。要闭环统计，需要在入群或支付流程中保留来源码，或者为专题流量使用可记录来源的中转链接和独立二维码；在此之前只能把 `community_join_click` 或社群页到达视为意向指标，不能宣称为付费成交。

### 18.4 技术健康与内容运营

- 使用 Search Console 和百度平台记录抓取、重复 canonical、软 404 和未索引原因。
- 使用生产监控记录 `/topics/*` 的 404、500 和响应时间。
- 每次运行 `seo:plan` 后统计 `generated`、`unchanged`、`published_stale`、`insufficient_sources` 和 `failed` 数量。
- 每月审核一次已发布页来源哈希和 `checkedAt`，不通过修改日期伪造新鲜度。

### 18.5 报告周期与判断标准

- 发布前：保存原站最近 28 天的 Search Console 与站内流量基线。
- 发布后 7 天：只判断抓取、索引、错误和事件是否正常，不急于判断排名成败。
- 发布后 28 天：比较专题曝光、点击、非品牌查询覆盖和 CTA 点击。
- 发布后 56 天：与前一个 28 天周期比较，并按专题决定扩写、合并、改标题或停止投入。

报告必须按专题和查询意图拆分。只有曝光增长但无点击时优先调整标题与摘要；有点击但无 CTA 时检查内容与社群承接；既无曝光也无索引时先处理技术与内容质量，不继续批量生成页面。
