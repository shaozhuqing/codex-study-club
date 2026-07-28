# SEO Static Topic Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an opt-in SEO topic generator that scans public Markdown, creates reviewable AI-assisted drafts in `content/seo/`, renders static `/topics/[slug]` pages, and measures search-to-community conversion without changing existing site behavior by default.

**Architecture:** Offline Node scripts discover and rank public source documents against `config/seo-topics.json`. The generator requests strict JSON Schema output from the existing Responses API endpoint, validates source references, and atomically writes draft Markdown. Next.js reads the files during the existing content generation step and renders isolated topic pages; a server-only feature flag and per-page draft state control discovery and indexing.

**Tech Stack:** Node.js 20, `node:test`, `gray-matter`, OpenAI Responses API over `fetch`, Next.js 16 App Router, React 19, TypeScript, MarkdownIt, optional GA4.

---

## File Map

**Create**

- `config/seo-topics.json`: canonical topic and keyword ownership.
- `scripts/seo/sources.mjs`: public Markdown discovery and route mapping.
- `scripts/seo/planner.mjs`: scoring, source selection, content hashes, plan creation.
- `scripts/seo/drafts.mjs`: frontmatter validation, Markdown rendering, atomic write protection.
- `scripts/seo/openai.mjs`: Responses endpoint, strict JSON schema, retries, response extraction.
- `scripts/seo/cli.mjs`: shared argument, config, report, and exit-code behavior.
- `scripts/seo/plan.mjs`: `seo:plan` entry point.
- `scripts/seo/generate.mjs`: `seo:generate` entry point.
- `scripts/seo/check.mjs`: `seo:check` entry point.
- `scripts/seo/seo.test.mjs`: scanner, planner, validation, write protection, and API tests.
- `scripts/seo/fixtures/codex-cli-response.json`: offline response fixture for local UI verification only.
- `content/seo/codex-cli.md`: generated local preview draft; later regenerable with a configured API key.
- `app/topics/page.tsx`: published topic index.
- `app/topics/[slug]/page.tsx`: static topic detail and structured data.
- `components/seo-community-link.tsx`: source-aware community CTA and event emission.
- `components/site-analytics.tsx`: optional GA4 loader and typed event helper.
- `lib/seo-topics.ts`: server-only feature flag and visible-topic selectors.

**Modify**

- `package.json`: SEO commands and smoke command.
- `.gitignore`: SEO reports and atomic temporary files.
- `.env.example`: feature flag, verification, and optional GA4 settings.
- `scripts/generate-content-data.mjs`: parse SEO Markdown into generated content.
- `lib/content.ts`: SEO topic type and selectors.
- `app/layout.tsx`: optional verification metadata and analytics.
- `app/sitemap.ts`: feature-gated published topic URLs.
- `app/page.tsx`: published topic entry only when enabled.
- `app/cases/[slug]/page.tsx`: optional owning-topic link.
- `app/start/[slug]/page.tsx`: optional owning-topic link.
- `components/community-link.tsx`: accept source context without changing existing callers.
- `app/community/page.tsx`: preserve the topic source for conversion events.
- `app/globals.css`: compact topic index, topic metadata, source links, and CTA styles.
- `content/README.md`: SEO frontmatter and review workflow.
- `README.md`: operating and measurement commands.

## Task 1: Capture the Existing Behavior Baseline

**Files:**

- Create after implementation: `scripts/smoke-site.mjs`
- Verify: existing app and API files only

- [ ] **Step 1: Run current static checks before code changes**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands exit 0. Save the build route list in the task log; do not modify `next-env.d.ts` if Next updates it during the command.

- [ ] **Step 2: Start the existing development server**

Run:

```bash
npm run dev
```

Expected: Next reports a local URL and remains running.

- [ ] **Step 3: Verify current public routes and chat fallback**

Run in another shell:

```bash
curl -fsS http://localhost:3000/ > /dev/null
curl -fsS http://localhost:3000/start/01-what-is-codex > /dev/null
curl -fsS http://localhost:3000/cases > /dev/null
curl -fsS http://localhost:3000/community/updates > /dev/null
curl -fsS -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  --data '{"messages":[{"role":"user","content":"Codex CLI 如何安装？"}]}'
```

Expected: pages return 2xx; the API emits NDJSON containing `sources`, one or more `delta` entries, and `done`.

## Task 2: Build Public Source Discovery with TDD

**Files:**

- Create: `scripts/seo/sources.mjs`
- Create: `scripts/seo/seo.test.mjs`

- [ ] **Step 1: Write the failing discovery test**

Add a test that creates `start`, `cases`, `assistant`, and `seo` fixtures and asserts only public sources are returned with stable IDs and routes:

```js
test("discoverSources excludes assistant and generated seo content", async () => {
  const sources = await discoverSources(fixtureRoot);
  assert.deepEqual(
    sources.map(({ id, href }) => ({ id, href })),
    [
      { id: "case:fix-network", href: "/cases/fix-network" },
      { id: "start:10-cli-installation", href: "/start/10-cli-installation" },
    ],
  );
});
```

- [ ] **Step 2: Run the test and confirm the expected failure**

Run:

```bash
node --test scripts/seo/seo.test.mjs
```

Expected: FAIL because `discoverSources` does not exist.

- [ ] **Step 3: Implement discovery and normalization**

Export these interfaces through plain JavaScript objects:

```js
export const SOURCE_DIRECTORIES = ["start", "cases", "tutorials", "community-updates", "themes"];

export async function discoverSources(contentRoot) {
  const documents = [];
  for (const directory of SOURCE_DIRECTORIES) {
    const directoryPath = path.join(contentRoot, directory);
    for (const filePath of await listMarkdownFiles(directoryPath)) {
      const document = await parseSourceFile(contentRoot, directory, filePath);
      documents.push(document);
    }
  }
  return documents.sort((left, right) => left.id.localeCompare(right.id));
}
```

Implement `listMarkdownFiles` as a recursive `.md` file walk and `parseSourceFile` as the only frontmatter-to-source conversion function in the module.

Use `gray-matter`; remove the Markdown H1 from the stored body; map routes as follows:

```js
const routeFor = {
  start: (slug) => `/start/${slug}`,
  cases: (slug) => `/cases/${slug}`,
  tutorials: (slug) => `/learn/${slug}`,
  "community-updates": (slug) => `/community/updates/${slug}`,
  themes: () => "/themes",
};
```

Normalize case IDs to `case:<slug>`, start IDs to `start:<slug>`, tutorial IDs to `tutorial:<slug>`, update IDs to `update:<slug>`, and theme IDs to `theme:<slug>`.

- [ ] **Step 4: Run tests**

Run:

```bash
node --test scripts/seo/seo.test.mjs
```

Expected: discovery test PASS.

- [ ] **Step 5: Commit the focused change**

```bash
git add scripts/seo/sources.mjs scripts/seo/seo.test.mjs
git commit -m "feat: add SEO source discovery"
```

## Task 3: Configure Topics and Build the Deterministic Planner

**Files:**

- Create: `config/seo-topics.json`
- Create: `scripts/seo/planner.mjs`
- Modify: `scripts/seo/seo.test.mjs`

- [ ] **Step 1: Write failing planner tests**

Cover stable ordering, pinned sources, scored matches, minimum sources, comparison-side requirements, one owning topic per document, duplicate primary keywords, and stable SHA-256 hashes.

```js
test("buildPlan skips comparison topics without competitor evidence", () => {
  const plan = buildPlan(comparisonConfig, codexOnlySources);
  assert.equal(plan.topics[0].status, "insufficient_sources");
  assert.equal(plan.topics[0].action, "skip");
});

test("validateTopicConfig rejects duplicate primary keywords", () => {
  assert.throws(() => validateTopicConfig(duplicateKeywords), /duplicate_primary_keyword/);
});
```

- [ ] **Step 2: Run tests and confirm failures**

Run:

```bash
node --test scripts/seo/seo.test.mjs
```

Expected: FAIL because planner exports do not exist.

- [ ] **Step 3: Add all ten approved topics**

Each topic contains exactly these keys:

```json
{
  "slug": "codex-cli",
  "primaryKeyword": "Codex CLI 教程",
  "secondaryKeywords": ["Codex CLI 安装", "Codex CLI 命令", "Codex CLI 登录", "Codex CLI 配置"],
  "intent": "tutorial",
  "priority": "P0",
  "minSources": 3,
  "maxSources": 8,
  "pinnedSourceIds": ["start:10-cli-installation", "start:11-cli-first-run", "start:12-cli-options"],
  "matchTerms": ["Codex CLI", "CLI", "命令行", "安装 CLI"],
  "requiredEvidenceGroups": []
}
```

The comparison topic uses two evidence groups, one matching Codex and one matching Claude Code. It remains skipped with current local content.

- [ ] **Step 4: Implement scoring and plan output**

Use fixed weights:

```js
const WEIGHTS = {
  pinned: 100,
  title: 24,
  description: 12,
  heading: 8,
  category: 6,
  body: 2,
};
```

Count body matches once per term, sort by score descending then ID ascending, cap at `maxSources`, and compute a content hash from the topic fields plus selected source IDs and source Markdown.

- [ ] **Step 5: Run tests and the local plan**

Run:

```bash
node --test scripts/seo/seo.test.mjs
```

Expected: tests PASS; the in-memory plan marks the five P0 topics ready and comparison content skipped unless evidence exists.

- [ ] **Step 6: Commit**

```bash
git add config/seo-topics.json scripts/seo/planner.mjs scripts/seo/seo.test.mjs
git commit -m "feat: plan SEO topic sources"
```

## Task 4: Add Draft Validation and Published-Page Protection

**Files:**

- Create: `scripts/seo/drafts.mjs`
- Modify: `scripts/seo/seo.test.mjs`

- [ ] **Step 1: Write failing draft lifecycle tests**

```js
test("writeTopicDraft never overwrites a published page", async () => {
  await assert.rejects(
    writeTopicDraft(outputDir, generatedDraft, publishedMarkdown),
    /published_page_protected/,
  );
});

test("validateDraft rejects unknown source ids", () => {
  assert.throws(
    () => validateDraft(draftWithUnknownSource, sourceIndex),
    /unknown_source_id/,
  );
});
```

Also test invalid slugs, path traversal, duplicate primary keywords, missing `reviewedAt` for published pages, H1 in Markdown, atomic temp cleanup, and `published_stale` reporting.

- [ ] **Step 2: Run tests and confirm failures**

```bash
node --test scripts/seo/seo.test.mjs
```

Expected: lifecycle tests FAIL because draft functions do not exist.

- [ ] **Step 3: Implement the draft schema and renderer**

Required frontmatter keys:

```js
const REQUIRED_DRAFT_KEYS = [
  "title", "description", "slug", "primaryKeyword", "secondaryKeywords",
  "intent", "priority", "sourceIds", "draft", "generatedAt", "contentHash",
];
```

Render model sections into Markdown without H1. After each section, emit a visible source line using only resolver-provided titles and hrefs. Reject model-provided URLs.

- [ ] **Step 4: Implement atomic writes**

Resolve the final path under the configured output root, write `<slug>.md.tmp`, validate the complete temporary document, then rename it to `<slug>.md`. If a published target exists, return `published_stale` or `unchanged` without writing.

- [ ] **Step 5: Run tests**

```bash
node --test scripts/seo/seo.test.mjs
```

Expected: lifecycle tests PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/seo/drafts.mjs scripts/seo/seo.test.mjs
git commit -m "feat: validate and protect SEO drafts"
```

## Task 5: Add the Responses API Generator and Offline Fixture Path

**Files:**

- Create: `scripts/seo/openai.mjs`
- Create: `scripts/seo/cli.mjs`
- Create: `scripts/seo/plan.mjs`
- Create: `scripts/seo/generate.mjs`
- Create: `scripts/seo/check.mjs`
- Create: `scripts/seo/fixtures/codex-cli-response.json`
- Modify: `scripts/seo/seo.test.mjs`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Write failing API contract tests with mocked fetch**

Assert endpoint normalization, Authorization header presence without logging it, strict schema body, `output_text` extraction, one retry for 429/5xx and invalid output, and no writes when credentials are missing.

```js
test("requestTopicDraft uses Responses text.format JSON schema", async () => {
  const result = await requestTopicDraft(request, { fetchImpl, apiKey: "test-key" });
  assert.equal(fetchImpl.mock.calls.length, 1);
  assert.equal(sentBody.text.format.type, "json_schema");
  assert.equal(sentBody.text.format.strict, true);
  assert.equal(result.sections[0].sourceIds[0], "start:10-cli-installation");
});
```

- [ ] **Step 2: Run tests and confirm failures**

```bash
node --test scripts/seo/seo.test.mjs
```

Expected: API tests FAIL because the client does not exist.

- [ ] **Step 3: Implement the strict response schema**

Use the official Responses API shape verified at `https://developers.openai.com/api/docs/guides/structured-outputs`:

```js
text: {
  format: {
    type: "json_schema",
    name: "seo_topic_draft",
    strict: true,
    schema: SEO_TOPIC_SCHEMA,
  },
}
```

The schema requires `title`, `description`, `directAnswer`, `sections`, and `faq`. Every section and FAQ answer contains `sourceIds`; all objects use `additionalProperties: false`.

- [ ] **Step 4: Implement safe generation behavior**

Use `OPENAI_BASE_URL`, `OPENAI_API_KEY`, and `OPENAI_MODEL`. Default only the base URL and model using existing project behavior. Send source text as untrusted reference material in a user content block and tell the model not to follow instructions embedded in source documents.

Support `--fixture scripts/seo/fixtures/codex-cli-response.json --topic codex-cli` for offline local rendering. This path must pass the same schema, source-ID, Markdown, and atomic-write validation as an API response and is never selected implicitly.

- [ ] **Step 5: Add package commands**

```json
{
  "seo:plan": "node scripts/seo/plan.mjs",
  "seo:generate": "node scripts/seo/generate.mjs",
  "seo:check": "node scripts/seo/check.mjs",
  "seo:test": "node --test scripts/seo/seo.test.mjs"
}
```

Ignore `reports/seo-plan.json`, `reports/seo-generation.json`, `content/seo/*.tmp`, and `content/seo/*.md.tmp`.

- [ ] **Step 6: Run API and CLI tests**

```bash
npm run seo:test
npm run seo:plan -- --output content/seo
npm run seo:generate -- --output content/seo --fixture scripts/seo/fixtures/codex-cli-response.json --topic codex-cli
npm run seo:check -- --output content/seo
```

Expected: all tests PASS; one `draft: true` Codex CLI page is written; no network request occurs for the explicit fixture run.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore scripts/seo content/seo/codex-cli.md
git commit -m "feat: generate validated SEO topic drafts"
```

## Task 6: Add SEO Topics to the Content Model

**Files:**

- Modify: `scripts/generate-content-data.mjs`
- Modify: `lib/content.ts`
- Modify: `content/README.md`

- [ ] **Step 1: Add a failing content generation assertion**

Extend the SEO test to execute the content generator against a fixture and assert that `seoTopics` contains `draft`, `sourceIds`, and Markdown.

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm run seo:test
```

Expected: FAIL because generated content has no `seoTopics` collection.

- [ ] **Step 3: Implement SEO parsing**

Add `readSeoTopics()` in `generate-content-data.mjs`, preserving the frontmatter contract and sorting by priority then slug. Add this TypeScript type:

```ts
export type SeoTopic = {
  slug: string;
  title: string;
  description: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  intent: string;
  priority: "P0" | "P1" | "P2";
  sourceIds: string[];
  draft: boolean;
  generatedAt: string;
  reviewedAt?: string;
  contentHash: string;
  markdown: string;
};
```

Export `seoTopics`, `getSeoTopic(slug)`, `publishedSeoTopics()`, and `findSeoTopicForSource(sourceId)`.

- [ ] **Step 4: Document the authoring and review contract**

Explain all fields, the `draft`/`reviewedAt` transition, published protection, and the fact that manual edits to a draft may be replaced by a later explicit generation.

- [ ] **Step 5: Run tests and content generation**

```bash
npm run seo:test
npm run generate:content
```

Expected: tests PASS and `lib/generated-content.json` includes `seoTopics`.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-content-data.mjs lib/content.ts lib/generated-content.json content/README.md
git commit -m "feat: load SEO topic content"
```

## Task 7: Render Static Topic Pages with Indexing Controls

**Files:**

- Create: `app/topics/page.tsx`
- Create: `app/topics/[slug]/page.tsx`
- Create: `lib/seo-topics.ts`
- Modify: `app/sitemap.ts`
- Modify: `app/globals.css`
- Modify: `.env.example`

- [ ] **Step 1: Add the feature flag and metadata behavior**

Create the server helper exactly as:

```ts
import "server-only";
import { seoTopics } from "@/lib/content";

export function seoTopicsEnabled() {
  return process.env.SEO_TOPICS_ENABLED === "true";
}

export function visibleSeoTopics() {
  if (!seoTopicsEnabled()) return [];
  return seoTopics.filter((topic) => !topic.draft && Boolean(topic.reviewedAt));
}
```

Draft or globally disabled detail pages return:

```ts
robots: { index: false, follow: false }
```

Only enabled, reviewed, non-draft pages appear in `/topics`, navigation, and sitemap.

- [ ] **Step 2: Render topic pages**

Reuse `SiteHeader`, `SiteFooter`, and `MarkdownContent`. Render breadcrumb navigation, primary keyword metadata, generated/reviewed date, article content, related source links, and the source-aware community CTA. Do not nest cards inside cards.

- [ ] **Step 3: Add structured data**

Output a single JSON-LD graph with `BreadcrumbList`, `CollectionPage`, and `ItemList`. Add `FAQPage` only when parsed visible FAQ headings and answers exist in the Markdown.

- [ ] **Step 4: Add restrained responsive styles**

Follow existing typography and colors. Keep topic navigation dense, use an 8px-or-less radius, ensure long English keywords wrap, and verify no text overlap at mobile widths.

- [ ] **Step 5: Verify draft and disabled states**

Run:

```bash
SEO_TOPICS_ENABLED=false npm run build
SEO_TOPICS_ENABLED=true npm run build
```

Expected: both builds PASS; the topic detail is present but noindex as a draft; the sitemap has no draft topic URL; existing routes remain in the build output.

- [ ] **Step 6: Commit**

```bash
git add app/topics app/sitemap.ts app/globals.css .env.example
git commit -m "feat: render static SEO topic pages"
```

## Task 8: Add Conditional Internal Links and Conversion Measurement

**Files:**

- Create: `components/site-analytics.tsx`
- Create: `components/seo-community-link.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`
- Modify: `app/cases/[slug]/page.tsx`
- Modify: `app/start/[slug]/page.tsx`
- Modify: `components/community-link.tsx`
- Modify: `app/community/page.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Add opt-in verification and analytics**

Render Google and Baidu verification metadata only when their server environment values exist. Load the GA4 script only when `NEXT_PUBLIC_GA_MEASUREMENT_ID` exists.

- [ ] **Step 2: Define the event contract**

Expose a browser-only helper:

```ts
export type SeoEventName =
  | "community_cta_click"
  | "community_landing_view"
  | "community_join_click";

export function trackSeoEvent(name: SeoEventName, params: {
  topic_slug?: string;
  primary_keyword?: string;
  intent?: string;
}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}
```

Declare the optional `window.gtag` signature in the same module so TypeScript remains strict without adding an analytics dependency.

Never include chat content, search content, logs, contact details, or user identifiers.

- [ ] **Step 3: Preserve topic attribution**

The topic CTA links to `/community?from=topic:<slug>#join`. The community page reads only a validated `topic:<slug>` value, emits landing and join-intent events, and does not persist it beyond the current page.

- [ ] **Step 4: Add conditional internal links**

Only when the global flag is enabled and the owning topic is published:

- show a compact topic entry on the homepage;
- show one “所属专题” link on case and start detail pages;
- render no container at all when no eligible topic exists.

- [ ] **Step 5: Verify no-config behavior**

Run without analytics and with topics disabled:

```bash
SEO_TOPICS_ENABLED=false npm run build
```

Expected: no GA scripts, no topic links, no SEO topic sitemap entries, existing pages and chat behavior unchanged.

- [ ] **Step 6: Commit**

```bash
git add components/site-analytics.tsx components/seo-community-link.tsx components/community-link.tsx app/layout.tsx app/page.tsx 'app/cases/[slug]/page.tsx' 'app/start/[slug]/page.tsx' app/community/page.tsx app/globals.css
git commit -m "feat: connect SEO topics to community analytics"
```

## Task 9: Add Automated Smoke Checks and Operator Documentation

**Files:**

- Create: `scripts/smoke-site.mjs`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Write the smoke script**

Accept `--base-url`, fetch `/`, `/start/01-what-is-codex`, `/cases`, `/community/updates`, `/robots.txt`, `/sitemap.xml`, and POST the known chat question. Fail on non-2xx pages or missing NDJSON event types. Allow `/topics/codex-cli` to be checked as a noindex draft.

- [ ] **Step 2: Add the command**

```json
{
  "smoke": "node scripts/smoke-site.mjs"
}
```

- [ ] **Step 3: Document operations and measurement**

Add the exact `seo:plan`, fixture preview, live generation, review, feature flag, build, deploy, rollback, Search Console, Baidu, GA4, and 7/28/56-day reporting procedures from the design spec. State that the static WeChat QR cannot prove paid conversion.

- [ ] **Step 4: Run smoke checks**

With the dev server running:

```bash
npm run smoke -- --base-url http://localhost:3000
```

Expected: all existing routes, chat fallback, and draft metadata checks PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-site.mjs package.json README.md
git commit -m "docs: add SEO operations and smoke checks"
```

## Task 10: Final Verification and Local Handoff

**Files:**

- Verify all changed files

- [ ] **Step 1: Run the complete offline verification suite**

```bash
npm run seo:plan -- --output content/seo
npm run seo:check -- --output content/seo
npm run seo:test
npm run lint
SEO_TOPICS_ENABLED=false npm run build
SEO_TOPICS_ENABLED=true npm run build
```

Expected: every command exits 0; comparison topic remains explicitly skipped if Claude Code evidence is absent.

- [ ] **Step 2: Verify missing-key failure**

Run in an environment without `OPENAI_API_KEY`:

```bash
npm run seo:generate -- --output content/seo --topic codex-app
```

Expected: non-zero exit with `OPENAI_API_KEY is required`; no target or temporary file is written.

- [ ] **Step 3: Generate the local preview draft through the fixture path**

```bash
npm run seo:generate -- --output content/seo --fixture scripts/seo/fixtures/codex-cli-response.json --topic codex-cli
npm run seo:check -- --output content/seo
```

Expected: `content/seo/codex-cli.md` is a validated `draft: true` page with only known source IDs.

- [ ] **Step 4: Start the local site and inspect browser behavior**

```bash
SEO_TOPICS_ENABLED=true npm run dev
```

Verify desktop and mobile views for `/topics/codex-cli`, `/`, `/cases`, and one start article. Inspect title, description, canonical, robots, JSON-LD, wrapping, source links, CTA attribution, console errors, and network failures.

- [ ] **Step 5: Compare the final worktree against the scope**

Run:

```bash
git status --short
git diff --check
git diff --stat
```

Expected: no unrelated files are staged; the existing user change in `next-env.d.ts` remains untouched and uncommitted unless the user separately requests it.

- [ ] **Step 6: Record the live-generation limitation**

Report that the local fixture demonstrates the full validation and rendering path. Do not claim real OpenAI generation until `OPENAI_API_KEY` is configured and a non-fixture `seo:generate` run succeeds.
