import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

export const REQUIRED_DRAFT_KEYS = [
  "title",
  "description",
  "slug",
  "primaryKeyword",
  "secondaryKeywords",
  "intent",
  "priority",
  "sourceIds",
  "draft",
  "generatedAt",
  "contentHash",
];

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const hashPattern = /^[a-f0-9]{64}$/;
const priorityValues = new Set(["P0", "P1", "P2"]);

function normalized(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("zh-CN");
}

function assertText(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name}_required`);
}

function assertStringArray(value, name, { allowEmpty = true } = {}) {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && value.length === 0) ||
    value.some((item) => typeof item !== "string" || !item.trim())
  ) {
    throw new Error(`invalid_${name}`);
  }
  if (new Set(value).size !== value.length) throw new Error(`duplicate_${name}`);
}

function assertIsoDate(value, name) {
  assertText(value, name);
  if (Number.isNaN(Date.parse(value))) throw new Error(`invalid_${name}`);
}

function sourceById(sourceIndex, sourceId) {
  return sourceIndex instanceof Map ? sourceIndex.get(sourceId) : sourceIndex?.[sourceId];
}

function validateSourceIds(sourceIds, sourceIndex, allowedSourceIds) {
  assertStringArray(sourceIds, "source_ids", { allowEmpty: false });
  for (const sourceId of sourceIds) {
    if (!sourceById(sourceIndex, sourceId)) throw new Error(`unknown_source_id:${sourceId}`);
    if (allowedSourceIds && !allowedSourceIds.has(sourceId)) {
      throw new Error(`source_not_selected:${sourceId}`);
    }
  }
}

function validateModelText(value, name) {
  assertText(value, name);
  if (/^#\s/m.test(value)) throw new Error(`model_h1_forbidden:${name}`);
  if (/https?:\/\/|\]\([^)]*\)/i.test(value)) throw new Error(`model_url_forbidden:${name}`);
}

export function parseTopicMarkdown(markdown) {
  assertText(markdown, "topic_markdown");
  const parsed = matter(markdown);
  return { ...parsed.data, markdown: parsed.content.trim() };
}

export function validateDraft(draft, sourceIndex) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    throw new Error("invalid_draft");
  }
  for (const key of REQUIRED_DRAFT_KEYS) {
    if (!(key in draft)) throw new Error(`missing_draft_field:${key}`);
  }

  assertText(draft.title, "title");
  assertText(draft.description, "description");
  assertText(draft.primaryKeyword, "primary_keyword");
  assertText(draft.intent, "intent");
  if (!slugPattern.test(String(draft.slug || ""))) {
    throw new Error(`invalid_topic_slug:${draft.slug || "missing"}`);
  }
  assertStringArray(draft.secondaryKeywords, "secondary_keywords");
  validateSourceIds(draft.sourceIds, sourceIndex);
  if (!priorityValues.has(draft.priority)) throw new Error(`invalid_priority:${draft.priority}`);
  if (typeof draft.draft !== "boolean") throw new Error("invalid_draft_state");
  assertIsoDate(draft.generatedAt, "generated_at");
  if (!hashPattern.test(String(draft.contentHash || ""))) throw new Error("invalid_content_hash");
  if (draft.draft === false) {
    if (!draft.reviewedAt) throw new Error("published_reviewed_at_required");
    assertIsoDate(draft.reviewedAt, "reviewed_at");
  }
  assertText(draft.markdown, "markdown");
  if (/^#\s/m.test(draft.markdown)) throw new Error("markdown_h1_forbidden");
  if (/<script\b|javascript:/i.test(draft.markdown)) throw new Error("unsafe_markdown");

  return draft;
}

export function validateDraftCollection(drafts, sourceIndex) {
  if (!Array.isArray(drafts)) throw new Error("draft_collection_required");
  const slugs = new Set();
  const primaryKeywords = new Map();

  for (const item of drafts) {
    const draft = typeof item === "string" ? parseTopicMarkdown(item) : item;
    validateDraft(draft, sourceIndex);
    if (slugs.has(draft.slug)) throw new Error(`duplicate_topic_slug:${draft.slug}`);
    slugs.add(draft.slug);

    const keyword = normalized(draft.primaryKeyword);
    if (primaryKeywords.has(keyword)) {
      throw new Error(
        `duplicate_primary_keyword:${primaryKeywords.get(keyword)},${draft.slug}`,
      );
    }
    primaryKeywords.set(keyword, draft.slug);
  }

  return drafts;
}

function validateModel(model, sourceIndex, topicSourceIds) {
  if (!model || typeof model !== "object" || Array.isArray(model)) {
    throw new Error("invalid_model_output");
  }
  validateModelText(model.title, "model_title");
  validateModelText(model.description, "model_description");
  if (!model.directAnswer || typeof model.directAnswer !== "object") {
    throw new Error("direct_answer_required");
  }
  validateModelText(model.directAnswer.text, "direct_answer");
  validateSourceIds(model.directAnswer.sourceIds, sourceIndex, topicSourceIds);
  if (!Array.isArray(model.sections)) throw new Error("invalid_sections");
  if (!Array.isArray(model.faq)) throw new Error("invalid_faq");

  for (const [index, section] of model.sections.entries()) {
    validateModelText(section?.heading, `section_heading_${index}`);
    validateModelText(section?.body, `section_body_${index}`);
    validateSourceIds(section?.sourceIds, sourceIndex, topicSourceIds);
  }
  for (const [index, item] of model.faq.entries()) {
    validateModelText(item?.question, `faq_question_${index}`);
    validateModelText(item?.answer, `faq_answer_${index}`);
    validateSourceIds(item?.sourceIds, sourceIndex, topicSourceIds);
  }
}

function sourceLine(sourceIds, sourceIndex) {
  const links = sourceIds.map((sourceId) => {
    const source = sourceById(sourceIndex, sourceId);
    return `[${source.title}](${source.href})`;
  });
  return `> 相关资料：${links.join("、")}`;
}

export function renderTopicDraft({ topic, model, sourceIndex }) {
  const topicSourceIds = new Set(topic.sourceIds);
  validateModel(model, sourceIndex, topicSourceIds);

  const sections = [
    "## 直接答案",
    "",
    model.directAnswer.text.trim(),
    "",
    sourceLine(model.directAnswer.sourceIds, sourceIndex),
  ];
  for (const section of model.sections) {
    sections.push(
      "",
      `## ${section.heading.trim()}`,
      "",
      section.body.trim(),
      "",
      sourceLine(section.sourceIds, sourceIndex),
    );
  }
  if (model.faq.length) {
    sections.push("", "## 常见问题");
    for (const item of model.faq) {
      sections.push(
        "",
        `### ${item.question.trim()}`,
        "",
        item.answer.trim(),
        "",
        sourceLine(item.sourceIds, sourceIndex),
      );
    }
  }

  const frontmatter = {
    title: model.title.trim(),
    description: model.description.trim(),
    slug: topic.slug,
    primaryKeyword: topic.primaryKeyword,
    secondaryKeywords: topic.secondaryKeywords,
    intent: topic.intent,
    priority: topic.priority,
    sourceIds: topic.sourceIds,
    draft: topic.draft,
    generatedAt: topic.generatedAt,
    contentHash: topic.contentHash,
  };
  if (topic.reviewedAt) frontmatter.reviewedAt = topic.reviewedAt;

  const markdown = matter.stringify(`${sections.join("\n").trim()}\n`, frontmatter);
  validateDraft(parseTopicMarkdown(markdown), sourceIndex);
  return markdown;
}

async function readExisting(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function writeTopicDraft(outputDir, markdown, sourceIndex) {
  const draft = parseTopicMarkdown(markdown);
  validateDraft(draft, sourceIndex);
  if (draft.draft !== true) throw new Error("generated_draft_must_be_draft");

  const root = path.resolve(outputDir);
  const target = path.resolve(root, `${draft.slug}.md`);
  if (path.dirname(target) !== root) throw new Error("output_path_outside_root");

  await mkdir(root, { recursive: true });
  const existingMarkdown = await readExisting(target);
  if (existingMarkdown) {
    const existing = parseTopicMarkdown(existingMarkdown);
    validateDraft(existing, sourceIndex);
    if (existing.contentHash === draft.contentHash) {
      return { status: "unchanged", path: target };
    }
    if (existing.draft === false) {
      return { status: "published_stale", path: target };
    }
  }

  const temporary = `${target}.tmp`;
  try {
    await writeFile(temporary, markdown, "utf8");
    validateDraft(parseTopicMarkdown(await readFile(temporary, "utf8")), sourceIndex);
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch((cleanupError) => {
      if (cleanupError?.code !== "ENOENT") throw cleanupError;
    });
    throw error;
  }

  return { status: existingMarkdown ? "updated" : "created", path: target };
}
