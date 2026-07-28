import { createHash } from "node:crypto";

import matter from "gray-matter";

const weights = {
  pinned: 100,
  title: 24,
  description: 12,
  heading: 8,
  category: 6,
  body: 2,
};

function normalize(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("zh-CN");
}

function includesTerm(value, term) {
  return normalize(value).includes(normalize(term));
}

function assertArray(value, name, slug) {
  if (!Array.isArray(value)) throw new Error(`invalid_${name}:${slug}`);
}

export function validateTopicConfig(topics) {
  if (!Array.isArray(topics) || !topics.length) throw new Error("topics_required");
  const slugs = new Set();
  const primaryKeywords = new Set();

  for (const topic of topics) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(topic.slug || ""))) {
      throw new Error(`invalid_topic_slug:${topic.slug || "missing"}`);
    }
    if (slugs.has(topic.slug)) throw new Error(`duplicate_topic_slug:${topic.slug}`);
    slugs.add(topic.slug);

    const primaryKeyword = normalize(topic.primaryKeyword);
    if (!primaryKeyword) throw new Error(`primary_keyword_required:${topic.slug}`);
    if (primaryKeywords.has(primaryKeyword)) {
      throw new Error(`duplicate_primary_keyword:${topic.primaryKeyword}`);
    }
    primaryKeywords.add(primaryKeyword);

    for (const name of ["secondaryKeywords", "pinnedSourceIds", "matchTerms", "requiredEvidenceGroups"]) {
      assertArray(topic[name], name, topic.slug);
    }
    if (!Number.isInteger(topic.minSources) || topic.minSources < 1) {
      throw new Error(`invalid_min_sources:${topic.slug}`);
    }
    if (!Number.isInteger(topic.maxSources) || topic.maxSources < topic.minSources) {
      throw new Error(`invalid_max_sources:${topic.slug}`);
    }
  }
}

function scoreSource(topic, source) {
  let score = topic.pinnedSourceIds.includes(source.id) ? weights.pinned : 0;
  for (const term of topic.matchTerms) {
    if (includesTerm(source.title, term)) score += weights.title;
    if (includesTerm(source.description, term)) score += weights.description;
    if (source.headings?.some((heading) => includesTerm(heading, term))) score += weights.heading;
    if (includesTerm(source.category, term)) score += weights.category;
    if (includesTerm(source.markdown, term)) score += weights.body;
  }
  return score;
}

function evidenceSatisfied(topic, selectedSources) {
  return topic.requiredEvidenceGroups.every((terms) =>
    terms.some((term) => selectedSources.some((source) => includesTerm(source.searchText || [
      source.title,
      source.description,
      source.markdown,
    ].join("\n"), term))),
  );
}

function contentHash(topic, selectedSources) {
  const payload = {
    topic: {
      slug: topic.slug,
      primaryKeyword: topic.primaryKeyword,
      secondaryKeywords: topic.secondaryKeywords,
      intent: topic.intent,
      priority: topic.priority,
    },
    sources: selectedSources.map((source) => ({
      id: source.id,
      title: source.title,
      description: source.description,
      markdown: source.markdown,
    })),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function existingState(markdown, nextHash) {
  if (!markdown) return { status: "ready", action: "generate" };
  const parsed = matter(markdown).data;
  if (parsed.contentHash === nextHash) return { status: "unchanged", action: "skip" };
  if (parsed.draft === false) return { status: "published_stale", action: "report_only" };
  return { status: "ready", action: "generate" };
}

function assignSourceOwners(plannedTopics) {
  const priorityRank = { P0: 0, P1: 1, P2: 2 };
  const candidates = new Map();

  for (const topic of plannedTopics) {
    if (topic.status === "insufficient_sources") continue;
    for (const sourceId of topic.sourceIds) {
      const ownerCandidates = candidates.get(sourceId) || [];
      ownerCandidates.push({
        slug: topic.slug,
        priority: priorityRank[topic.priority] ?? 99,
        score: topic.scores[sourceId] || 0,
      });
      candidates.set(sourceId, ownerCandidates);
    }
  }

  return Object.fromEntries(
    [...candidates.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([sourceId, owners]) => {
        owners.sort(
          (left, right) =>
            right.score - left.score ||
            left.priority - right.priority ||
            left.slug.localeCompare(right.slug),
        );
        return [sourceId, owners[0].slug];
      }),
  );
}

export function buildPlan(topics, sources, existingMarkdownBySlug = new Map()) {
  validateTopicConfig(topics);
  const sourceIds = new Set(sources.map((source) => source.id));

  const plannedTopics = topics.map((topic) => {
    const missingPinnedSourceIds = topic.pinnedSourceIds.filter((id) => !sourceIds.has(id));
    const ranked = sources
      .map((source) => ({ source, score: scoreSource(topic, source) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.source.id.localeCompare(right.source.id))
      .slice(0, topic.maxSources);
    const selectedSources = ranked.map(({ source }) => source);
    const meetsMinimum = selectedSources.length >= topic.minSources;
    const hasEvidence = evidenceSatisfied(topic, selectedSources);

    if (missingPinnedSourceIds.length || !meetsMinimum || !hasEvidence) {
      return {
        ...topic,
        status: "insufficient_sources",
        action: "skip",
        sourceIds: selectedSources.map((source) => source.id),
        missingPinnedSourceIds,
      };
    }

    const nextHash = contentHash(topic, selectedSources);
    const state = existingState(existingMarkdownBySlug.get(topic.slug), nextHash);
    return {
      ...topic,
      ...state,
      contentHash: nextHash,
      sourceIds: selectedSources.map((source) => source.id),
      scores: Object.fromEntries(ranked.map(({ source, score }) => [source.id, score])),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    topics: plannedTopics,
    sourceOwners: assignSourceOwners(plannedTopics),
    summary: Object.fromEntries(
      ["ready", "unchanged", "published_stale", "insufficient_sources"].map((status) => [
        status,
        plannedTopics.filter((topic) => topic.status === status).length,
      ]),
    ),
  };
}
