# Codex Study Club 自动内容更新设计

日期：2026-07-28

## 1. 背景与目标

Codex Study Club 当前是一个由仓库内容驱动的 Next.js 站点。编辑源位于 `content/`，`scripts/generate-content-data.mjs` 将 Markdown 与 HTML 汇总到 `lib/generated-content.json`，页面和首页知识助手再读取这份生成数据。

本设计在不引入生产数据库和 CMS 的前提下，为网站增加每日自动内容更新能力：定时从 OpenAI 官方资料、CodexGuide、指定 GitHub 仓库、新闻站、博客和 RSS 采集候选内容，完成确定性去重和安全检查，再由 AI 负责筛选、分类与中文写作。所有结果先进入 GitHub Pull Request，人工审核并合并到 `origin/vshao` 后，服务器才自动部署到 Cloudflare。

系统需要同时支持 Linux 和 macOS，但同一时间只允许一个内容采集节点和一个生产部署节点处于启用状态。

## 2. 已确认决策

- 每日北京时间 `03:00` 运行一次内容更新。
- Linux 使用 Cron，macOS 使用 `launchd`。
- 自动任务在宿主机直接运行，不使用 Docker、托管 CI 或自托管 GitHub Actions Runner。
- 正式采集只允许固定白名单；AI 可以在报告中推荐新来源，但不能自行启用来源。
- AI 同时负责候选内容筛选、分类和中文草稿写作。
- 每日最多生成 5 篇内容草稿。
- 所有内容通过 PR 提交到 `origin/vshao`，由人工审核和合并。
- AI、采集任务和部署任务均无权自动合并 PR。
- 合并后由独立任务每 10 分钟检查一次 `origin/vshao`，有新提交时执行生产验证和 `npm run deploy`。
- 只保留服务器本地日志，不发送邮件、Webhook 或 GitHub Issue 通知。

## 3. 范围

### 3.1 本次包含

- 配置化来源白名单和来源推荐报告。
- OpenAI 官方页面、GitHub、RSS/Atom 和 CodexGuide 采集器。
- 统一候选数据模型、URL 规范化、内容哈希和已发布内容去重。
- AI 结构化评分、内容类型判断、主题分类和中文草稿生成。
- 实战案例、产品或社区动态、教程三种内容类型。
- 问题排查、新手入门、开发与自动化、内容与设计、知识与协作、工具与设备六个主题分类。
- Markdown Frontmatter、来源、许可、引用和发布日期校验。
- 独立工作目录、每日分支、提交和 PR 创建。
- Linux Cron 与 macOS `launchd` 安装模板。
- 合并后轮询、验证、Cloudflare 部署和生产冒烟检查。
- 本地状态、互斥锁、日志轮换、失败重试和安全边界。
- 离线 fixtures、单元测试、集成测试和验收命令。

### 3.2 本次不包含

- 未经人工审核直接发布 AI 内容。
- AI 自动把候选来源加入白名单。
- 自动抓取任意搜索结果、登录后页面、付费内容或私人社区内容。
- 复制普通新闻、博客和 RSS 的完整正文。
- 自动合并 PR、修改仓库保护规则或扩大 GitHub Token 权限。
- 多节点分布式调度、生产数据库、管理后台或 CMS。
- 邮件、飞书、钉钉、企业微信、Slack 或 GitHub Issue 告警。
- 排名、流量或每日内容数量保证；没有合格候选时不创建内容。

## 4. 内容分类模型

系统采用内容类型与主题分类两个独立维度。`实战案例` 是内容类型，不与六个主题分类并列。

### 4.1 内容类型

| 类型 | ID | 判断标准 | 输出位置 |
| --- | --- | --- | --- |
| 实战案例 | `case` | 有明确任务、输入、执行步骤、实际结果和验证证据 | `content/cases/<topicCategory>/` |
| 产品或社区动态 | `update` | Release、官方公告、新闻、博客或 RSS 摘要 | `content/community-updates/` |
| 教程 | `tutorial` | 基于稳定的官方或许可来源，具有连续、可执行的教学步骤 | `content/start/` 或 `content/tutorials/` |

没有实际过程和验证证据的内容不能标记为 `case`。新闻稿和 Release 默认属于 `update`。教程若依赖频繁变化的信息，则降级为 `update`，避免把时效性资讯包装成长期教程。

CodexGuide 的 `docs/start` 继续映射到 `content/start/`，`docs/recipes` 继续映射到 `content/cases/`。其他来源生成的新教程默认写入 `content/tutorials/`；只有更新现有 CodexGuide 入门序列时才修改 `content/start/`，避免自动任务重排现有 14 篇顺序教程。

### 4.2 主题分类

| 中文分类 | ID | 典型内容 |
| --- | --- | --- |
| 问题排查 | `troubleshooting` | 权限、网络、错误、任务跑偏和结果验证 |
| 新手入门 | `getting-started` | 安装、账号、首次任务和基础使用 |
| 开发与自动化 | `development` | 编码、测试、CI、部署、浏览器和脚本 |
| 内容与设计 | `content-design` | 图片、视频、PPT、网页和设计协作 |
| 知识与协作 | `knowledge` | 知识库、研究、文档、数据和团队协作 |
| 工具与设备 | `tools-devices` | 插件、Skills、MCP、IDE、移动端和桌面扩展 |

每条内容只有一个主主题，可以有多个次级标签。AI 分类置信度低于配置阈值时，候选只进入 PR 报告的“待人工分类”部分，不写入正式内容目录。

## 5. 系统架构

```text
Linux Cron / macOS launchd（北京时间 03:00）
                     |
                     v
           scripts/updates/daily.mjs
                     |
        +------------+-------------+
        |            |             |
        v            v             v
   OpenAI 官方     GitHub       RSS / Atom
        |            |             |
        +------------+-------------+
                     |
              CodexGuide 同步
                     |
                     v
          标准化、许可检查、去重
                     |
                     v
          AI 评分、筛选、分类、写作
                     |
                     v
        Markdown / 资源的临时输出目录
                     |
                     v
       内容校验、测试、lint、生产构建
                     |
                     v
     automation/daily-YYYY-MM-DD -> PR
                     |
                人工审核和合并
                     |
                     v
       deploy-if-changed（每 10 分钟）
                     |
                     v
       npm run deploy -> Cloudflare
                     |
                     v
               生产冒烟检查
```

## 6. 建议文件结构

### 6.1 新增文件

- `config/update-sources.json`：白名单来源、来源类型、许可、信任级别和采集参数。
- `scripts/updates/daily.mjs`：每日更新编排入口。
- `scripts/updates/cli.mjs`：参数、环境检查、日志、退出码和共享 CLI 行为。
- `scripts/updates/collectors/official.mjs`：白名单官方 HTML 页面采集。
- `scripts/updates/collectors/github.mjs`：GitHub Releases、Commit 或 Atom 采集。
- `scripts/updates/collectors/feed.mjs`：RSS 和 Atom 采集。
- `scripts/updates/collectors/codexguide.mjs`：CodexGuide 仓库同步与现有导入器适配。
- `scripts/updates/normalize.mjs`：统一候选数据结构、URL 和时间格式。
- `scripts/updates/dedupe.mjs`：URL、来源 ID、内容哈希和已发布来源去重。
- `scripts/updates/classify.mjs`：内容类型、主题分类和置信度校验。
- `scripts/updates/openai.mjs`：Responses API 请求、严格 JSON Schema、超时和重试。
- `scripts/updates/write.mjs`：Frontmatter 和 Markdown 渲染、资源写入、原子替换。
- `scripts/updates/validate.mjs`：内容、来源、许可、路径和项目命令校验。
- `scripts/updates/publish-pr.mjs`：分支、提交、推送和 PR 创建。
- `scripts/updates/deploy-if-changed.mjs`：合并检测、部署和生产检查。
- `scripts/updates/update.test.mjs`：采集、去重、AI 契约、写入和编排测试。
- `scripts/updates/fixtures/`：不联网、不调用模型的固定测试样本。
- `scripts/updates/schemas/selection.schema.json`：模型输出 JSON Schema。
- `app/learn/[slug]/page.tsx`：承接 `content/tutorials/` 中除现有 `getting-started` 外的教程页面。
- `ops/cron/codex-study-club-update.cron`：Linux 每日更新模板。
- `ops/cron/codex-study-club-deploy.cron`：Linux 部署轮询模板。
- `ops/launchd/com.codex-study-club.update.plist`：macOS 每日更新模板。
- `ops/launchd/com.codex-study-club.deploy.plist`：macOS 部署轮询模板。

### 6.2 修改文件

- `package.json`：增加 `update:*`、`deploy:check` 和更新测试命令，并增加 `cheerio` 与 `fast-xml-parser` 依赖。
- `package-lock.json`：锁定新增的 HTML 与 RSS/Atom 解析依赖。
- `.env.example`：增加更新、GitHub、Cloudflare、运行路径和生产 URL 变量说明。
- `.gitignore`：忽略 `var/` 下的状态、锁、临时文件和日志。
- `content/README.md`：补充自动生成内容 Frontmatter、分类和人工审核规则。
- `scripts/import-codexguide.mjs`：允许由更新编排器安全调用，并把固定导入日期改为运行时日期。
- `scripts/generate-content-data.mjs`：读取自动生成内容新增的来源与分类字段。
- `lib/content.ts`：暴露必要的来源元数据和主题类型。
- `app/sitemap.ts`：加入新增教程的动态 URL，并使用来源审核时间作为更新时间依据。
- `scripts/smoke-site.mjs`：支持生产 URL 和部署后的完整检查。
- `README.md`：补充运行、调度、审核、部署、回滚和日志检查说明。

### 6.3 运行时目录

`var/` 不提交 Git，位于专用自动化工作目录中：

```text
var/
  state/update-state.json
  state/deploy-state.json
  locks/update.lock
  locks/deploy.lock
  cache/
  worktrees/
  logs/daily-update/YYYY-MM-DD.log
  logs/deploy/YYYY-MM-DD.log
```

本地状态只用于游标、ETag、重试和性能优化。是否已经发布的最终判断必须同时检查仓库内文章的来源 URL 与内容哈希，删除本地状态后重新运行也不能产生重复文章。

HTML 必须通过 `cheerio` 解析，RSS 与 Atom 必须通过 `fast-xml-parser` 解析；实现不得使用正则表达式解析完整 HTML 或 XML 文档。GitHub API 继续使用 Node 内置 `fetch`，不额外引入 GitHub SDK。

## 7. 来源配置契约

`config/update-sources.json` 是唯一正式白名单。每个来源包含：

```json
{
  "id": "openai-codex-docs",
  "type": "official",
  "url": "https://developers.openai.com/codex/",
  "enabled": true,
  "trustLevel": "official",
  "contentMode": "metadata",
  "language": "en",
  "license": "link-summary-only",
  "topicHints": ["getting-started", "development"],
  "maxItemsPerRun": 20
}
```

字段约束：

- `id` 在配置中唯一并满足安全 slug 格式。
- `type` 只能是 `official`、`github`、`rss` 或 `codexguide`。
- `url` 必须使用 HTTPS，重定向后的最终主机仍须在白名单内。
- `trustLevel` 只能是 `official`、`primary` 或 `secondary`。
- `contentMode` 只能是 `metadata`、`excerpt` 或 `full`。
- `full` 仅允许明确许可的开源内容；普通新闻、博客和 RSS 必须使用 `metadata` 或 `excerpt`。
- `license` 决定允许存储和生成的内容范围，未知许可默认 `link-summary-only`。
- `topicHints` 只是确定性先验，不能绕过最终分类校验。

首期配置必须启用 OpenAI Codex 官方文档、`openai/codex`、`freestylefly/CodexGuide` 和 OpenAI 官方新闻或发布源。第三方新闻与博客通过后续人工修改白名单添加；实现会提供禁用的示例项，但不会预先启用未经确认的第三方域名。

## 8. 候选数据契约

所有采集器返回同一结构：

```js
{
  sourceId,
  externalId,
  sourceType,
  sourceName,
  trustLevel,
  license,
  title,
  url,
  author,
  publishedAt,
  updatedAt,
  fetchedAt,
  excerpt,
  body,
  contentHash,
  topicHints,
  rawMetadata
}
```

规范化规则：

- 时间统一为带时区的 ISO 8601；无法确认发布时间的候选不得进入 AI 写作。
- URL 移除追踪参数、片段和无意义尾斜杠，但保留影响内容身份的查询参数。
- `contentHash` 使用稳定字段和规范化正文的 SHA-256。
- `rawMetadata` 只保存非敏感、可序列化的采集信息，不能包含 Cookie 或请求头。
- 单条正文、响应体、重定向次数和下载资源大小均有配置上限。

## 9. 采集器行为

### 9.1 OpenAI 官方资料

- 只访问配置中的明确页面或官方 Feed。
- 使用 `ETag` 和 `Last-Modified` 减少重复下载。
- 页面结构变化导致标题、日期或正文边界无法解析时，该主源失败并终止当日任务。
- 官方事实必须保留原始 URL 和抓取时间，AI 不得补充页面中不存在的价格、版本或能力。

### 9.2 GitHub

- 使用 GitHub API 或明确的 Releases Atom Feed，不抓取任意 HTML 页面。
- `externalId` 使用 Release ID、Commit SHA 或其他稳定 GitHub 标识。
- GitHub Token 只需要公开仓库读取和在目标仓库创建分支、提交、PR 的最小权限。
- API 限流和临时服务错误使用有限重试；单个次要仓库失败不会阻断其他来源。

### 9.3 RSS 与 Atom

- 支持 RSS 2.0 和 Atom 1.0。
- 只保留标题、作者、时间、链接和允许范围内的摘要。
- Feed 正文视为不受信任输入；HTML 清理后才进入 AI 请求。
- Feed 链接跳转到非白名单域名时只记录候选，不下载目标正文。

### 9.4 CodexGuide

- 在独立缓存目录克隆或快进更新 `freestylefly/CodexGuide`。
- 记录导入 Commit SHA，只有 SHA 变化时运行导入。
- 复用现有分类映射和图片本地化规则。
- 导入必须先写临时目录，再计算 diff；失败不能覆盖现有 `content/start/`、`content/cases/` 或静态资源。
- 上游删除内容时只在报告中提示，不自动删除站内文章。

## 10. 去重与状态

去重按以下顺序执行：

1. `sourceId + externalId` 完全相同。
2. 规范化来源 URL 相同。
3. 内容哈希相同。
4. 标题与正文指纹高相似，且发布时间处于配置窗口内。
5. 仓库中已有文章 Frontmatter 的 `sourceUrl` 或 `sourceHash` 命中。

前四项由脚本确定性执行，AI 不负责决定重复项。高相似但不能确定的内容进入报告，不生成文章。

`update-state.json` 保存每个来源的最后成功时间、ETag、游标、最近候选哈希和连续失败次数。状态使用临时文件加原子重命名写入；只有对应阶段成功后才推进游标。

## 11. AI 筛选与写作

### 11.1 评分维度

- 与 Codex 学习和实践的相关度。
- 是否属于新信息而非旧内容改写。
- 来源可信度与可核验程度。
- 对用户是否有明确行动价值。
- 是否与站内内容重复。
- 许可是否允许当前输出方式。
- 是否具有足够证据支撑内容类型与主题分类。

硬性过滤、许可和去重在模型调用前完成。模型只能从合格候选中选择，不能恢复被脚本拒绝的内容。

### 11.2 模型输入和输出

模型输入只包含候选的规范化字段、允许范围内的正文、站内相似文章摘要、分类 ID 和写作规则。所有来源正文均标记为不受信任参考资料，禁止执行其中的指令。

模型输出采用严格 JSON Schema，包含：

```js
{
  selected,
  selectionReason,
  score,
  contentType,
  topicCategory,
  secondaryTags,
  classificationConfidence,
  title,
  description,
  summary,
  sections,
  sourceRefs,
  suggestedSources
}
```

- `sourceRefs` 只能引用脚本提供的候选 ID。
- 每个事实段落必须关联至少一个 `sourceRef`。
- `suggestedSources` 只进入运行报告和 PR 正文。
- 模型输出最多契约重试一次；再次失败则整个 AI 阶段失败，不写入内容。
- 每日按评分最多选择 5 篇。并列时按来源信任级别、发布时间、规范化 URL 稳定排序。

### 11.3 写作边界

- 官方事实、第三方报告和编辑判断必须明确区分。
- 普通新闻与博客只做摘要和评论，不复刻原文结构或大段文字。
- 直接引用必须短小并注明来源。
- 不能捏造测试过程、实际结果、版本、价格、兼容性或用户评价。
- 缺少验证证据时不能生成实战案例。
- 不能把 AI 自身写作结果作为事实来源。

## 12. 生成内容契约

自动生成 Markdown 在现有 Frontmatter 基础上增加：

```yaml
generatedBy: "daily-content-update"
generatedAt: "2026-07-28T19:00:00.000Z"
contentType: "update"
topicCategory: "development"
secondaryTags:
  - "GitHub"
sourceId: "openai-codex"
sourceName: "OpenAI Codex"
sourceUrl: "https://..."
sourcePublishedAt: "2026-07-28T00:00:00.000Z"
sourceFetchedAt: "2026-07-28T19:00:00.000Z"
sourceHash: "sha256-value"
sourceTrustLevel: "official"
sourceLicense: "link-summary-only"
aiScore: 92
classificationConfidence: 0.96
reviewedAt:
```

PR 中的自动内容保持待审核状态。只有人工核对来源、事实、分类、许可、标题和站内链接后才能合并。现有内容类型如果没有 `reviewedAt` 发布门控，则由 PR 合并本身作为发布门控；实现不得额外隐藏现有页面或改变当前路由默认行为。

## 13. 每日任务流程

1. 获取更新锁，检查另一节点是否仍在运行。
2. 验证 Node、npm、Git、GitHub CLI、凭据、时区、磁盘空间和专用目录。
3. 在专用工作目录同步 `origin/vshao`，拒绝使用含未提交改动的目录。
4. 创建或复用 `automation/daily-YYYY-MM-DD` 分支。
5. 并发采集白名单来源，但限制全局和每主机并发数。
6. 标准化、许可检查、确定性去重和来源失败分类。
7. 构建站内相似内容索引。
8. 调用 AI 完成评分、筛选、分类和结构化写作。
9. 将内容和资源写入临时目录，校验后原子移动到目标位置。
10. 运行 `npm run generate:content`、更新专项测试、SEO 检查、`npm run lint` 和 `npm run build`。
11. 检查 Git diff 只包含允许的内容、资源、生成数据和来源清单变化。
12. 没有合格变化时不创建空提交或 PR。
13. 有变化时提交、推送并创建或更新当日 PR。
14. 成功后更新采集状态并释放锁。

PR 标题为：

```text
content: YYYY-MM-DD 每日内容更新
```

PR 正文包含：

- 新增、更新、跳过、重复和失败数量。
- 每篇草稿的内容类型、主题分类、AI 分数、来源和选择理由。
- 第三方来源的许可与摘要边界。
- AI 推荐但未启用的新来源。
- 自动验证命令与结果。
- 人工审核清单。

同一天重复执行时更新原分支和原 PR，不创建重复 PR。

## 14. 错误处理

- OpenAI 官方主源或 CodexGuide 主源失败：当日任务失败，不创建或更新内容 PR。
- 单个 GitHub、新闻或 RSS 次要源失败：其他来源继续，失败项写入 PR 或本地日志。
- AI 请求、Schema 校验、引用校验或内容分类失败：不写入内容。
- 内容生成、测试、lint 或构建失败：不提交、不推送。
- Git 工作目录不干净、目标分支不可快进或当日分支包含非自动提交：停止并记录错误。
- PR 已被人工关闭但未合并：当日任务停止，不能自动重新打开或新建替代 PR。
- 连续运行遇到锁文件时，先验证 PID 和启动时间；不能仅凭文件存在就删除锁。

所有重试都使用有限次数和退避。脚本不得无限循环，也不得因部分成功推进未完成来源的游标。

## 15. 合并后部署

部署检查任务每 10 分钟运行：

1. 获取部署锁。
2. 查询 `origin/vshao` 最新 SHA。
3. 与 `var/state/deploy-state.json` 的成功部署 SHA 比较。
4. 没有变化时退出 0。
5. 有变化时在独立、干净的部署目录检出准确 SHA。
6. 使用锁文件安装依赖，运行内容生成、更新专项测试、SEO 检查和 lint。
7. 执行现有 `npm run deploy`；该命令自身负责 Cloudflare 构建与发布，不在前一步重复执行 `cf-build`。
8. 对生产 `NEXT_PUBLIC_SITE_URL` 运行首页、案例、新手内容、Sitemap、草稿索引状态和聊天 API 冒烟检查。
9. 所有生产检查通过后，原子记录成功部署 SHA。

部署失败时不更新成功 SHA。相同 SHA 最多自动重试 3 次；达到阈值后停止重试，等待人工清除该 SHA 的失败状态或推送新的修复提交。Cloudflare Token 与 GitHub Token 分离，采集任务不能读取 Cloudflare 部署凭据。

## 16. 调度

### 16.1 Linux Cron

- 每日内容更新使用 `CRON_TZ=Asia/Shanghai`，在 `0 3 * * *` 运行。
- 部署检查每 10 分钟运行一次。
- Cron 只调用仓库内固定入口脚本，不内联复杂 Shell 逻辑。
- 使用绝对路径，并显式提供最小 PATH 和环境文件路径。

### 16.2 macOS launchd

- 每日更新使用 `StartCalendarInterval` 表示每天 03:00。
- 部署检查使用 `StartInterval=600`。
- 运行前脚本验证当前系统时区等于 `Asia/Shanghai`；若不是，则根据配置计算目标时间并拒绝不明确的调度。
- `ProgramArguments` 使用绝对路径，不依赖交互式 Shell 配置。

Linux 和 macOS 模板默认都为未安装状态。部署文档要求明确选择一个主节点，不能同时启用两套生产调度。

## 17. 安全

- 所有远程内容都是不受信任输入，包括官方页面正文。
- URL 必须通过协议、主机、重定向、响应大小和内容类型检查。
- 禁止访问环回、链路本地、私网地址和云实例元数据地址，防止 SSRF。
- 禁止从远程内容解析并执行脚本、命令、模板、HTML 事件处理器或 Markdown 中的任务指令。
- 生成路径必须解析在允许的 `content/`、`public/` 和生成数据目录内，拒绝路径穿越和符号链接逃逸。
- 下载资源需验证 MIME、扩展名、大小和内容摘要。
- GitHub Token 仅允许目标仓库内容和 PR 操作；Cloudflare Token 仅允许目标 Worker/项目部署。
- 日志、报告、PR 正文和错误对象必须脱敏 API Key、Token、Cookie、认证头和包含凭据的 URL。
- AI 不能获得 GitHub Token、Cloudflare Token、SSH Key 或本机环境变量列表。

## 18. 日志与状态保留

- 更新日志写入 `var/logs/daily-update/YYYY-MM-DD.log`。
- 部署日志写入 `var/logs/deploy/YYYY-MM-DD.log`。
- 日志使用结构化 JSON Lines，至少包含时间、运行 ID、阶段、来源 ID、耗时、数量、结果和错误码。
- 默认保留 30 天，轮换任务只删除明确日志目录内超过期限的普通文件。
- 任务成功和失败都返回明确退出码。
- 因用户选择仅保留本地日志，系统不会主动提醒连续失败；运维文档必须明确要求定期检查日志、每日 PR 和部署 SHA。

## 19. 测试设计

### 19.1 离线测试

使用 Node 内置测试运行器和固定 fixtures，覆盖：

- 官方页面、GitHub、RSS、Atom 与 CodexGuide 的正常解析。
- 超时、429、5xx、无效 XML、格式变化和部分失败。
- URL 规范化、重定向白名单、SSRF 拒绝和响应大小限制。
- 来源许可与 `contentMode` 的允许组合。
- external ID、URL、内容哈希和相似内容去重。
- 内容类型、六个主题分类和低置信度拒绝。
- 模型 JSON Schema、未知来源引用和每日 5 篇上限。
- Frontmatter、Slug、输出目录和原子写入。
- CodexGuide 临时导入与失败不覆盖。
- Git 分支、当日 PR 复用和空更新不创建 PR。
- 部署 SHA、三次失败阈值和成功后状态更新。
- 日志脱敏和锁文件并发行为。

### 19.2 在线测试

在线模式只由显式命令或每日任务运行：

- 访问启用的白名单来源并记录状态。
- 使用真实 API Key 验证一次模型严格输出。
- 使用只读或测试仓库验证 PR 组装，生产模式才允许推送目标仓库。
- 使用生产 URL 做只读冒烟检查。

测试命令必须提供 `--fixture`、`--dry-run` 和 `--no-push` 边界，默认命令不能创建 PR 或部署。

## 20. 验证与接受标准

建议验证命令：

```bash
npm run update:test
npm run update:dry-run
npm run generate:content
npm run seo:check
npm run lint
npm run build
npm run smoke -- --base-url http://localhost:3000
```

接受标准：

- 同一批来源重复运行不产生重复内容或重复 PR。
- 正式采集不会访问白名单外的正文。
- AI 推荐来源不会自动加入白名单。
- AI 每日最多生成 5 篇，且每个事实段落具有有效来源引用。
- 实战案例必须具有任务、过程、结果和验证证据。
- 自动内容正确映射到三种内容类型和六个主题分类。
- 新闻与博客只生成摘要，不复制全文。
- 任一关键校验失败时不提交、不推送、不部署。
- 未合并 PR 的内容不会进入生产环境。
- 合并后 10 分钟内开始部署，成功后生产页面和 API 通过冒烟检查。
- 生产验证失败的 SHA 不会被记录为成功部署。
- Linux 和 macOS 使用同一核心脚本，调度适配器不会造成双节点并发。
- 日志中不包含任何凭据，并按 30 天策略轮换。

## 21. 实施阶段

### 第一阶段：确定性采集基础设施

- 建立来源配置、统一候选类型、HTTP 安全层、官方/GitHub/RSS 采集器。
- 建立本地状态、锁、日志、去重和 fixtures。
- 将 CodexGuide 导入器接入临时目录与差异流程。
- 完成离线采集和安全测试。

### 第二阶段：AI 筛选与内容生成

- 建立严格 JSON Schema、评分、每日上限和分类置信度。
- 建立三种内容类型、六个主题分类和 Markdown 渲染。
- 增加许可、引用、Frontmatter、路径和原子写入校验。
- 完成 AI fixture、契约和写入测试。

### 第三阶段：Git 与 PR 工作流

- 建立专用工作目录、每日分支、diff 边界和当日 PR 复用。
- 增加 dry-run、no-push 和 PR 报告。
- 运行完整项目验证后才允许提交和推送。

### 第四阶段：调度与部署

- 建立 Linux Cron 和 macOS `launchd` 模板。
- 建立合并轮询、部署 SHA、失败阈值和 Cloudflare 发布。
- 扩展生产冒烟检查并完成运维文档。

### 第五阶段：受控上线

- 先用 fixtures 和 `--dry-run` 验证全流程。
- 再启用真实来源但保持 `--no-push`，人工检查采集和 AI 结果。
- 启用 PR 推送，连续观察至少 3 次每日运行。
- 最后启用单一生产节点的自动部署轮询。

每一阶段都以测试、静态检查、构建和实际运行证据为完成条件。未完成上一阶段的验证前，不启用下一阶段的外部写操作。
