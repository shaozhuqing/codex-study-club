import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { checkSeoContent } from "./check.mjs";
import { parseSeoArgs } from "./cli.mjs";
import {
  renderTopicDraft,
  validateDraft,
  validateDraftCollection,
  writeTopicDraft,
} from "./drafts.mjs";
import { generateSeoDrafts } from "./generate.mjs";
import { requestTopicDraft } from "./openai.mjs";
import { buildPlan, validateTopicConfig } from "./planner.mjs";
import { discoverSources } from "./sources.mjs";
import { runSiteSmoke } from "../smoke-site.mjs";
import { extractFaqItems } from "../../lib/seo-faq.mjs";

const sourceIndex = new Map([
  [
    "start:10-cli-installation",
    {
      id: "start:10-cli-installation",
      title: "安装 CLI",
      href: "/start/10-cli-installation",
    },
  ],
]);
const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

function validDraft(overrides = {}) {
  return {
    title: "Codex CLI 中文教程",
    description: "从安装到首次运行的 Codex CLI 中文教程。",
    slug: "codex-cli",
    primaryKeyword: "Codex CLI 教程",
    secondaryKeywords: ["Codex CLI 安装"],
    intent: "tutorial",
    priority: "P0",
    sourceIds: ["start:10-cli-installation"],
    draft: true,
    generatedAt: "2026-07-27T00:00:00.000Z",
    contentHash: "a".repeat(64),
    markdown: "## 直接答案\n\n先安装 CLI。",
    ...overrides,
  };
}

function validModelOutput(overrides = {}) {
  return {
    title: "Codex CLI 中文教程",
    description: "从安装到首次运行的 Codex CLI 中文教程。",
    directAnswer: {
      text: "先安装 CLI，再运行一次最小任务。",
      sourceIds: ["start:10-cli-installation"],
    },
    sections: [
      {
        heading: "安装步骤",
        body: "按系统环境选择安装方式。",
        sourceIds: ["start:10-cli-installation"],
      },
    ],
    faq: [
      {
        question: "安装后怎么验证？",
        answer: "运行版本检查和一个最小任务。",
        sourceIds: ["start:10-cli-installation"],
      },
    ],
    ...overrides,
  };
}

test("parseSeoArgs reads explicit SEO command paths and topic", () => {
  assert.deepEqual(
    parseSeoArgs([
      "--content",
      "fixtures/content",
      "--config",
      "fixtures/topics.json",
      "--output",
      "fixtures/output",
      "--report",
      "fixtures/report.json",
      "--fixture",
      "fixtures/response.json",
      "--topic",
      "codex-cli",
    ]),
    {
      content: "fixtures/content",
      config: "fixtures/topics.json",
      output: "fixtures/output",
      report: "fixtures/report.json",
      fixture: "fixtures/response.json",
      topic: "codex-cli",
    },
  );
});

async function fixtureContent() {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-seo-test-"));
  await Promise.all([
    mkdir(path.join(root, "start"), { recursive: true }),
    mkdir(path.join(root, "cases", "troubleshooting"), { recursive: true }),
    mkdir(path.join(root, "assistant"), { recursive: true }),
    mkdir(path.join(root, "seo"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      path.join(root, "start", "10-cli-installation.md"),
      `---\ndescription: "安装 Codex CLI"\ncheckedAt: "2026-07-20"\n---\n# 安装 CLI\n\n使用 npm 安装 Codex CLI。\n`,
    ),
    writeFile(
      path.join(root, "cases", "troubleshooting", "fix-network.md"),
      `---\ntitle: "修复 Codex 网络问题"\ndescription: "排查网络和权限"\n---\n\n## 检查网络\n\n先保留错误日志。\n`,
    ),
    writeFile(path.join(root, "assistant", "private.md"), "# 不公开的助手资料\n"),
    writeFile(path.join(root, "seo", "generated.md"), "# 已生成专题\n"),
  ]);
  return root;
}

test("discoverSources excludes assistant and generated SEO content", async () => {
  const contentRoot = await fixtureContent();
  const sources = await discoverSources(contentRoot);

  assert.deepEqual(
    sources.map(({ id, href }) => ({ id, href })),
    [
      { id: "case:fix-network", href: "/cases/fix-network" },
      { id: "start:10-cli-installation", href: "/start/10-cli-installation" },
    ],
  );
  assert.equal(sources[1].title, "安装 CLI");
  assert.deepEqual(sources[0].headings, ["检查网络"]);
});

test("buildPlan prefers pinned sources and keeps stable ordering", () => {
  const topics = [
    {
      slug: "codex-cli",
      primaryKeyword: "Codex CLI 教程",
      secondaryKeywords: ["Codex CLI 安装"],
      intent: "tutorial",
      priority: "P0",
      minSources: 2,
      maxSources: 3,
      pinnedSourceIds: ["start:10-cli-installation"],
      matchTerms: ["Codex CLI", "CLI"],
      requiredEvidenceGroups: [],
    },
  ];
  const sources = [
    {
      id: "case:cli-workflow",
      title: "Codex CLI 工作流",
      description: "常用命令",
      headings: [],
      category: "development",
      markdown: "CLI 验证",
    },
    {
      id: "start:10-cli-installation",
      title: "安装 CLI",
      description: "安装 Codex CLI",
      headings: [],
      category: "start",
      markdown: "npm install",
    },
  ];

  const plan = buildPlan(topics, sources, new Map());

  assert.equal(plan.topics[0].status, "ready");
  assert.deepEqual(plan.topics[0].sourceIds, ["start:10-cli-installation", "case:cli-workflow"]);
  assert.match(plan.topics[0].contentHash, /^[a-f0-9]{64}$/);
});

test("buildPlan skips comparison topics without both evidence groups", () => {
  const topics = [
    {
      slug: "codex-vs-claude-code",
      primaryKeyword: "Codex vs Claude Code",
      secondaryKeywords: [],
      intent: "comparison",
      priority: "P2",
      minSources: 2,
      maxSources: 6,
      pinnedSourceIds: [],
      matchTerms: ["Codex", "Claude Code"],
      requiredEvidenceGroups: [["Codex"], ["Claude Code"]],
    },
  ];
  const sources = [
    {
      id: "start:01-what-is-codex",
      title: "Codex 是什么",
      description: "OpenAI Codex",
      headings: [],
      category: "start",
      markdown: "Codex 使用入口",
    },
  ];

  const plan = buildPlan(topics, sources, new Map());

  assert.equal(plan.topics[0].status, "insufficient_sources");
  assert.equal(plan.topics[0].action, "skip");
});

test("buildPlan assigns each shared source to one owning topic", () => {
  const topicDefaults = {
    secondaryKeywords: [],
    intent: "tutorial",
    minSources: 1,
    maxSources: 2,
    requiredEvidenceGroups: [],
  };
  const plan = buildPlan(
    [
      {
        ...topicDefaults,
        slug: "codex-tutorial",
        primaryKeyword: "Codex 教程",
        priority: "P0",
        pinnedSourceIds: [],
        matchTerms: ["Codex"],
      },
      {
        ...topicDefaults,
        slug: "codex-skills",
        primaryKeyword: "Codex Skills 教程",
        priority: "P0",
        pinnedSourceIds: ["case:shared"],
        matchTerms: ["Skill"],
      },
    ],
    [
      {
        id: "case:shared",
        title: "Codex Skill",
        description: "",
        headings: [],
        category: "development",
        markdown: "",
      },
    ],
  );

  assert.deepEqual(plan.sourceOwners, { "case:shared": "codex-skills" });
});

test("validateTopicConfig rejects duplicate primary keywords", () => {
  const topicDefaults = {
    secondaryKeywords: [],
    intent: "tutorial",
    priority: "P0",
    minSources: 1,
    maxSources: 2,
    pinnedSourceIds: [],
    matchTerms: ["Codex"],
    requiredEvidenceGroups: [],
  };
  const duplicateTopics = [
    { ...topicDefaults, slug: "one", primaryKeyword: "Codex 教程" },
    { ...topicDefaults, slug: "two", primaryKeyword: "codex 教程" },
  ];

  assert.throws(() => validateTopicConfig(duplicateTopics), /duplicate_primary_keyword/);
});

test("topic config contains the ten approved keyword owners", async () => {
  const configPath = new URL("../../config/seo-topics.json", import.meta.url);
  const topics = JSON.parse(await readFile(configPath, "utf8"));

  validateTopicConfig(topics);
  assert.deepEqual(
    topics.map((topic) => topic.slug),
    [
      "codex-tutorial",
      "codex-app",
      "codex-cli",
      "codex-troubleshooting",
      "codex-skills",
      "codex-mcp",
      "agents-md",
      "codex-workflows",
      "codex-api-config",
      "codex-vs-claude-code",
    ],
  );
});

test("plan marks changed published topics as stale without replacing content", async () => {
  const publishedPath = path.join(await mkdtemp(path.join(os.tmpdir(), "codex-seo-draft-")), "topic.md");
  await writeFile(
    publishedPath,
    `---\nslug: topic\ndraft: false\nreviewedAt: "2026-07-20"\ncontentHash: old\n---\nPublished body\n`,
  );
  const existing = new Map([["topic", await readFile(publishedPath, "utf8")]]);
  const plan = buildPlan(
    [
      {
        slug: "topic",
        primaryKeyword: "Codex Topic",
        secondaryKeywords: [],
        intent: "tutorial",
        priority: "P0",
        minSources: 1,
        maxSources: 2,
        pinnedSourceIds: ["case:topic"],
        matchTerms: ["Topic"],
        requiredEvidenceGroups: [],
      },
    ],
    [
      {
        id: "case:topic",
        title: "Topic",
        description: "Topic",
        headings: [],
        category: "development",
        markdown: "Changed source",
      },
    ],
    existing,
  );

  assert.equal(plan.topics[0].status, "published_stale");
  assert.equal(plan.topics[0].action, "report_only");
});

test("validateDraft rejects unknown source ids", () => {
  assert.throws(
    () => validateDraft(validDraft({ sourceIds: ["start:missing"] }), sourceIndex),
    /unknown_source_id:start:missing/,
  );
});

test("validateDraft rejects path traversal and Markdown H1", () => {
  assert.throws(
    () => validateDraft(validDraft({ slug: "../outside" }), sourceIndex),
    /invalid_topic_slug/,
  );
  assert.throws(
    () => validateDraft(validDraft({ markdown: "# Duplicate title" }), sourceIndex),
    /markdown_h1_forbidden/,
  );
});

test("validateDraft requires reviewedAt for a published page", () => {
  assert.throws(
    () => validateDraft(validDraft({ draft: false }), sourceIndex),
    /published_reviewed_at_required/,
  );
});

test("validateDraftCollection rejects duplicate primary keywords", () => {
  assert.throws(
    () =>
      validateDraftCollection(
        [validDraft(), validDraft({ slug: "codex-cli-two", primaryKeyword: "codex cli 教程" })],
        sourceIndex,
      ),
    /duplicate_primary_keyword/,
  );
});

test("renderTopicDraft uses only resolver-provided source links", () => {
  const markdown = renderTopicDraft({
    topic: validDraft(),
    model: {
      title: "Codex CLI 中文教程",
      description: "从安装到首次运行的 Codex CLI 中文教程。",
      directAnswer: {
        text: "先安装 CLI，再运行一次最小任务。",
        sourceIds: ["start:10-cli-installation"],
      },
      sections: [
        {
          heading: "安装步骤",
          body: "按系统环境选择安装方式。",
          sourceIds: ["start:10-cli-installation"],
        },
      ],
      faq: [
        {
          question: "安装后怎么验证？",
          answer: "运行版本检查和一个最小任务。",
          sourceIds: ["start:10-cli-installation"],
        },
      ],
    },
    sourceIndex,
  });

  assert.doesNotMatch(markdown, /^#\s/m);
  assert.match(markdown, /\[安装 CLI\]\(\/start\/10-cli-installation\)/);
  assert.doesNotMatch(markdown, /https?:\/\//);
});

test("writeTopicDraft reports published stale content without overwriting it", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "codex-seo-output-"));
  const published = validDraft({
    draft: false,
    reviewedAt: "2026-07-27T01:00:00.000Z",
    contentHash: "b".repeat(64),
    markdown: "## 已审核内容\n\n不要覆盖。",
  });
  const publishedMarkdown = renderTopicDraft({
    topic: published,
    model: {
      title: published.title,
      description: published.description,
      directAnswer: { text: "不要覆盖。", sourceIds: published.sourceIds },
      sections: [],
      faq: [],
    },
    sourceIndex,
  });
  const target = path.join(outputDir, "codex-cli.md");
  await writeFile(target, publishedMarkdown);

  const generatedMarkdown = renderTopicDraft({
    topic: validDraft(),
    model: {
      title: "Codex CLI 新草稿",
      description: "新的草稿描述。",
      directAnswer: { text: "新的草稿。", sourceIds: ["start:10-cli-installation"] },
      sections: [],
      faq: [],
    },
    sourceIndex,
  });
  const result = await writeTopicDraft(outputDir, generatedMarkdown, sourceIndex);

  assert.equal(result.status, "published_stale");
  assert.equal(await readFile(target, "utf8"), publishedMarkdown);
});

test("writeTopicDraft removes temporary files when validation fails", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "codex-seo-invalid-"));
  const validMarkdown = renderTopicDraft({
    topic: validDraft(),
    model: {
      title: "Codex CLI 中文教程",
      description: "从安装到首次运行的 Codex CLI 中文教程。",
      directAnswer: { text: "先安装 CLI。", sourceIds: ["start:10-cli-installation"] },
      sections: [],
      faq: [],
    },
    sourceIndex,
  });
  const invalidMarkdown = validMarkdown.replace("slug: codex-cli", 'slug: "../outside"');

  await assert.rejects(
    writeTopicDraft(outputDir, invalidMarkdown, sourceIndex),
    /invalid_topic_slug/,
  );
  assert.deepEqual(await readdir(outputDir), []);
});

test("requestTopicDraft uses the Responses strict JSON schema contract", async () => {
  const calls = [];
  const fetchImpl = async (...args) => {
    calls.push(args);
    return {
      ok: true,
      status: 200,
      json: async () => ({ output_text: JSON.stringify(validModelOutput()) }),
    };
  };

  const result = await requestTopicDraft(
    {
      topic: validDraft(),
      sources: [
        {
          id: "start:10-cli-installation",
          title: "安装 CLI",
          href: "/start/10-cli-installation",
          markdown: "使用 npm 安装。",
        },
      ],
    },
    {
      fetchImpl,
      apiKey: "test-secret",
      baseUrl: "https://example.com/v1/",
      model: "test-model",
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "https://example.com/v1/responses");
  assert.equal(calls[0][1].headers.Authorization, "Bearer test-secret");
  const body = JSON.parse(calls[0][1].body);
  assert.equal(body.model, "test-model");
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.additionalProperties, false);
  assert.equal(result.sections[0].sourceIds[0], "start:10-cli-installation");
});

test("requestTopicDraft extracts nested output text and retries one invalid response", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: attempts === 1 ? "not json" : JSON.stringify(validModelOutput()),
              },
            ],
          },
        ],
      }),
    };
  };

  const result = await requestTopicDraft(
    { topic: validDraft(), sources: [] },
    { fetchImpl, apiKey: "test-secret" },
  );

  assert.equal(attempts, 2);
  assert.equal(result.title, "Codex CLI 中文教程");
});

test("requestTopicDraft retries one rate-limited response", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts === 1) return { ok: false, status: 429, json: async () => ({}) };
    return {
      ok: true,
      status: 200,
      json: async () => ({ output_text: JSON.stringify(validModelOutput()) }),
    };
  };

  await requestTopicDraft(
    { topic: validDraft(), sources: [] },
    { fetchImpl, apiKey: "test-secret" },
  );
  assert.equal(attempts, 2);
});

test("requestTopicDraft does not retry authentication errors", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    return { ok: false, status: 401, json: async () => ({}) };
  };

  await assert.rejects(
    requestTopicDraft(
      { topic: validDraft(), sources: [] },
      { fetchImpl, apiKey: "invalid-secret" },
    ),
    /openai_request_failed:401/,
  );
  assert.equal(attempts, 1);
});

test("requestTopicDraft fails before fetch when the API key is missing", async () => {
  let requested = false;

  await assert.rejects(
    requestTopicDraft(
      { topic: validDraft(), sources: [] },
      {
        fetchImpl: async () => {
          requested = true;
        },
        apiKey: "",
      },
    ),
    /OPENAI_API_KEY is required/,
  );
  assert.equal(requested, false);
});

test("generateSeoDrafts fails before writing when the API key is missing", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "codex-seo-no-key-"));

  await assert.rejects(
    generateSeoDrafts({
      plannedTopics: [{ ...validDraft(), status: "ready", action: "generate" }],
      sources: [
        {
          ...sourceIndex.get("start:10-cli-installation"),
          description: "安装说明",
          headings: [],
          markdown: "使用 npm 安装。",
        },
      ],
      outputDir,
      apiOptions: { apiKey: "" },
    }),
    /OPENAI_API_KEY is required/,
  );
  assert.deepEqual(await readdir(outputDir), []);
});

test("generateSeoDrafts validates an explicit fixture before writing", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "codex-seo-fixture-"));
  const result = await generateSeoDrafts({
    plannedTopics: [{ ...validDraft(), status: "ready", action: "generate" }],
    sources: [
      {
        ...sourceIndex.get("start:10-cli-installation"),
        description: "安装说明",
        headings: [],
        markdown: "使用 npm 安装。",
      },
    ],
    outputDir,
    topicSlug: "codex-cli",
    fixtureOutput: validModelOutput(),
    now: () => new Date("2026-07-27T02:00:00.000Z"),
  });

  assert.deepEqual(result, [{ slug: "codex-cli", status: "created" }]);
  const markdown = await readFile(path.join(outputDir, "codex-cli.md"), "utf8");
  assert.match(markdown, /draft: true/);
  assert.match(markdown, /generatedAt: '2026-07-27T02:00:00.000Z'/);
  assert.match(markdown, /\[安装 CLI\]\(\/start\/10-cli-installation\)/);
});

test("generateSeoDrafts reports an unchanged explicit fixture topic without rewriting", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "codex-seo-unchanged-"));
  const result = await generateSeoDrafts({
    plannedTopics: [{ ...validDraft(), status: "unchanged", action: "skip" }],
    sources: [sourceIndex.get("start:10-cli-installation")],
    outputDir,
    topicSlug: "codex-cli",
    fixtureOutput: validModelOutput(),
  });

  assert.deepEqual(result, [{ slug: "codex-cli", status: "unchanged" }]);
  assert.deepEqual(await readdir(outputDir), []);
});

test("checkSeoContent rejects a filename that differs from the frontmatter slug", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "codex-seo-check-"));
  const markdown = renderTopicDraft({
    topic: validDraft(),
    model: validModelOutput(),
    sourceIndex,
  });
  await writeFile(path.join(outputDir, "wrong-name.md"), markdown);

  await assert.rejects(
    checkSeoContent({
      topics: [
        {
          slug: "codex-cli",
          primaryKeyword: "Codex CLI 教程",
          secondaryKeywords: ["Codex CLI 安装"],
          intent: "tutorial",
          priority: "P0",
          minSources: 1,
          maxSources: 2,
          pinnedSourceIds: ["start:10-cli-installation"],
          matchTerms: ["CLI"],
          requiredEvidenceGroups: [],
        },
      ],
      sources: [sourceIndex.get("start:10-cli-installation")],
      outputDir,
    }),
    /filename_slug_mismatch:wrong-name:codex-cli/,
  );
});

test("content generation includes SEO topics without adding them to assistant knowledge", async () => {
  await execFileAsync(process.execPath, ["scripts/generate-content-data.mjs"], {
    cwd: projectRoot,
  });
  const generated = JSON.parse(
    await readFile(path.join(projectRoot, "lib", "generated-content.json"), "utf8"),
  );
  const topic = generated.seoTopics.find((item) => item.slug === "codex-cli");

  assert.equal(topic.draft, true);
  assert.deepEqual(topic.sourceIds.slice(0, 3), [
    "start:10-cli-installation",
    "start:11-cli-first-run",
    "start:12-cli-options",
  ]);
  assert.match(topic.markdown, /## 直接答案/);
  assert.equal(generated.knowledge.some((item) => item.slug === "codex-cli"), false);
});

test("extractFaqItems returns every visible FAQ without source blockquotes", async () => {
  const topicMarkdown = await readFile(path.join(projectRoot, "content", "seo", "codex-cli.md"), "utf8");
  const faqs = extractFaqItems(topicMarkdown.replace(/^---[\s\S]*?---\s*/, ""));

  assert.equal(faqs.length, 3);
  assert.equal(faqs[0].question, "Codex CLI 安装后找不到命令怎么办？");
  assert.doesNotMatch(faqs[0].answer, /相关资料/);
});

test("runSiteSmoke checks existing routes, chat events, and draft noindex", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method || "GET" });
    if (String(url).endsWith("/api/chat")) {
      return new Response(
        [
          JSON.stringify({ type: "sources", sources: [] }),
          JSON.stringify({ type: "delta", delta: "ok" }),
          JSON.stringify({ type: "done" }),
        ].join("\n"),
        { status: 200 },
      );
    }
    if (String(url).endsWith("/topics/codex-cli")) {
      return new Response('<meta name="robots" content="noindex, nofollow">', { status: 200 });
    }
    return new Response("ok", { status: 200 });
  };

  const result = await runSiteSmoke({ baseUrl: "http://127.0.0.1:3000", fetchImpl });

  assert.equal(result.pages, 7);
  assert.deepEqual(
    requests.map(({ url, method }) => `${method} ${new URL(url).pathname}`),
    [
      "GET /",
      "GET /start/01-what-is-codex",
      "GET /cases",
      "GET /community/updates",
      "GET /robots.txt",
      "GET /sitemap.xml",
      "GET /topics/codex-cli",
      "POST /api/chat",
    ],
  );
});
