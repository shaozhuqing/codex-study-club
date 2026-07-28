import "server-only";

import {
  cases,
  seoTopics,
  startArticles,
  themes,
  tutorials,
  updates,
  type SeoTopic,
} from "@/lib/content";

export type SeoTopicSource = {
  id: string;
  title: string;
  href: string;
};

export function seoTopicsEnabled() {
  return process.env.SEO_TOPICS_ENABLED === "true";
}

export function visibleSeoTopics() {
  if (!seoTopicsEnabled()) return [];
  return seoTopics.filter((topic) => !topic.draft && Boolean(topic.reviewedAt));
}

export function isSeoTopicVisible(topic: SeoTopic) {
  return seoTopicsEnabled() && !topic.draft && Boolean(topic.reviewedAt);
}

function sourceForId(sourceId: string): SeoTopicSource | undefined {
  const [kind, slug] = sourceId.split(":", 2);
  if (kind === "case") {
    const item = cases.find((candidate) => candidate.slug === slug);
    return item ? { id: sourceId, title: item.title, href: `/cases/${item.slug}` } : undefined;
  }
  if (kind === "start") {
    const item = startArticles.find((candidate) => candidate.slug === slug);
    return item ? { id: sourceId, title: item.title, href: `/start/${item.slug}` } : undefined;
  }
  if (kind === "tutorial") {
    const item = tutorials.find((candidate) => candidate.slug === slug);
    return item ? { id: sourceId, title: item.title, href: `/learn/${item.slug}` } : undefined;
  }
  if (kind === "update") {
    const item = updates.find((candidate) => candidate.slug === slug);
    return item
      ? { id: sourceId, title: item.title, href: `/community/updates/${item.slug}` }
      : undefined;
  }
  if (kind === "theme") {
    const item = themes.find((candidate) => candidate.slug === slug);
    return item ? { id: sourceId, title: item.title, href: "/themes" } : undefined;
  }
  return undefined;
}

export function sourcesForSeoTopic(topic: SeoTopic) {
  return topic.sourceIds.flatMap((sourceId) => {
    const source = sourceForId(sourceId);
    return source ? [source] : [];
  });
}

export function visibleSeoTopicForSource(sourceId: string) {
  return visibleSeoTopics().find((topic) => topic.sourceIds.includes(sourceId));
}
