import {
  isMainModule,
  loadSeoContext,
  readJson,
  runCli,
  writeJsonReport,
} from "./cli.mjs";
import { renderTopicDraft, writeTopicDraft } from "./drafts.mjs";
import { requestTopicDraft, validateTopicOutput } from "./openai.mjs";

export async function generateSeoDrafts({
  plannedTopics,
  sources,
  outputDir,
  topicSlug,
  fixtureOutput,
  apiOptions = {},
  now = () => new Date(),
}) {
  const requestedTopic = topicSlug
    ? plannedTopics.find((topic) => topic.slug === topicSlug)
    : undefined;
  if (topicSlug && !requestedTopic) throw new Error(`unknown_topic:${topicSlug}`);
  if (
    fixtureOutput &&
    requestedTopic &&
    ["unchanged", "published_stale"].includes(requestedTopic.status)
  ) {
    return [{ slug: requestedTopic.slug, status: requestedTopic.status }];
  }

  const selected = plannedTopics.filter(
    (topic) =>
      topic.status === "ready" &&
      topic.action === "generate" &&
      (!topicSlug || topic.slug === topicSlug),
  );
  if (fixtureOutput && selected.length !== 1) {
    throw new Error("fixture_requires_one_ready_topic");
  }
  if (!fixtureOutput && selected.length && !apiOptions.apiKey?.trim()) {
    throw new Error("OPENAI_API_KEY is required");
  }

  const sourceIndex = new Map(sources.map((source) => [source.id, source]));
  const results = [];
  for (const topic of selected) {
    const selectedSources = topic.sourceIds.map((sourceId) => {
      const source = sourceIndex.get(sourceId);
      if (!source) throw new Error(`unknown_source_id:${sourceId}`);
      return source;
    });
    const model = fixtureOutput
      ? validateTopicOutput(fixtureOutput, new Set(topic.sourceIds))
      : await requestTopicDraft({ topic, sources: selectedSources }, apiOptions);
    const markdown = renderTopicDraft({
      topic: {
        ...topic,
        draft: true,
        generatedAt: now().toISOString(),
      },
      model,
      sourceIndex,
    });
    const writeResult = await writeTopicDraft(outputDir, markdown, sourceIndex);
    results.push({ slug: topic.slug, status: writeResult.status });
  }

  return results;
}

async function main(args) {
  const options = {
    content: args.content || "content",
    config: args.config || "config/seo-topics.json",
    output: args.output || "content/seo",
    report: args.report || "reports/seo-generation.json",
  };
  if (args.fixture && !args.topic) throw new Error("fixture_requires_topic");

  const context = await loadSeoContext(options);
  const fixtureOutput = args.fixture ? await readJson(args.fixture) : undefined;
  const results = await generateSeoDrafts({
    plannedTopics: context.plan.topics,
    sources: context.sources,
    outputDir: options.output,
    topicSlug: args.topic,
    fixtureOutput,
    apiOptions: {
      apiKey: process.env.OPENAI_API_KEY || "",
      baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      model: process.env.OPENAI_MODEL || "gpt-5.6-terra",
    },
  });
  const report = {
    generatedAt: new Date().toISOString(),
    fixture: Boolean(args.fixture),
    requestedTopic: args.topic || null,
    planSummary: context.plan.summary,
    results,
  };
  await writeJsonReport(options.report, report);
  console.log(
    results.length
      ? results.map((result) => `${result.slug}: ${result.status}`).join("\n")
      : "No SEO topics required generation.",
  );
}

if (isMainModule(import.meta.url)) runCli(main);
