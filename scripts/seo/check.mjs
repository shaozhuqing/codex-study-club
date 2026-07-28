import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  isMainModule,
  loadSeoContext,
  runCli,
  writeJsonReport,
} from "./cli.mjs";
import { parseTopicMarkdown, validateDraftCollection } from "./drafts.mjs";
import { validateTopicConfig } from "./planner.mjs";

export async function checkSeoContent({ topics, sources, outputDir }) {
  validateTopicConfig(topics);
  const configuredBySlug = new Map(topics.map((topic) => [topic.slug, topic]));
  const sourceIndex = new Map(sources.map((source) => [source.id, source]));
  let entries;
  try {
    entries = await readdir(outputDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") entries = [];
    else throw error;
  }

  const drafts = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const filenameSlug = path.basename(entry.name, ".md");
    const draft = parseTopicMarkdown(await readFile(path.join(outputDir, entry.name), "utf8"));
    if (filenameSlug !== draft.slug) {
      throw new Error(`filename_slug_mismatch:${filenameSlug}:${draft.slug}`);
    }
    const configured = configuredBySlug.get(draft.slug);
    if (!configured) throw new Error(`unconfigured_topic:${draft.slug}`);
    if (configured.primaryKeyword !== draft.primaryKeyword) {
      throw new Error(`primary_keyword_mismatch:${draft.slug}`);
    }
    drafts.push(draft);
  }
  validateDraftCollection(drafts, sourceIndex);

  return {
    checkedAt: new Date().toISOString(),
    configuredTopics: topics.length,
    generatedTopics: drafts.length,
    draftTopics: drafts.filter((draft) => draft.draft).map((draft) => draft.slug),
    publishedTopics: drafts.filter((draft) => !draft.draft).map((draft) => draft.slug),
  };
}

async function main(args) {
  const options = {
    content: args.content || "content",
    config: args.config || "config/seo-topics.json",
    output: args.output || "content/seo",
    report: args.report || "reports/seo-check.json",
  };
  const context = await loadSeoContext(options);
  const report = await checkSeoContent({
    topics: context.topics,
    sources: context.sources,
    outputDir: options.output,
  });
  await writeJsonReport(options.report, report);
  console.log(
    `SEO check passed: ${report.generatedTopics} generated, ${report.publishedTopics.length} published.`,
  );
}

if (isMainModule(import.meta.url)) runCli(main);
