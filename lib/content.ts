import "server-only";

import generatedContent from "./generated-content.json";

export type SourceLink = {
  label: string;
  href: string;
};

export type CaseStudy = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  markdown: string;
  cover?: string;
  imageAlt?: string;
  level?: string;
  surface?: string;
  duration?: string;
  checkedAt?: string;
  number?: string;
};

export type CommunityUpdate = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  displayDate: string;
  topics: string[];
  markdown: string;
};

export type TutorialDocument = {
  slug: string;
  title: string;
  description: string;
  level?: string;
  duration?: string;
  checkedAt?: string;
  markdown: string;
};

export type StartArticle = {
  slug: string;
  number: string;
  title: string;
  description: string;
  checkedAt?: string;
  markdown: string;
  track: "基础入门" | "开发者入门";
};

export type ThemeDocument = {
  slug: string;
  title: string;
  description: string;
  checkedAt?: string;
  markdown: string;
};

export type AssistantKnowledge = {
  slug: string;
  title: string;
  terms: string[];
  answer: string;
  sources: SourceLink[];
};

export type IndustryInsight = {
  slug: string;
  title: string;
  description: string;
  html: string;
};

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

type GeneratedContent = {
  cases: CaseStudy[];
  updates: CommunityUpdate[];
  tutorials: TutorialDocument[];
  startArticles: StartArticle[];
  themes: ThemeDocument[];
  knowledge: AssistantKnowledge[];
  seoTopics: SeoTopic[];
  industryInsights: IndustryInsight[];
};

const content = generatedContent as unknown as GeneratedContent;

export const cases = content.cases;
export const updates = content.updates;
export const tutorials = content.tutorials;
export const startArticles = content.startArticles;
export const themes = content.themes;
export const knowledge = content.knowledge;
export const seoTopics = content.seoTopics;
export const industryInsights = content.industryInsights;

export function getCase(slug: string) {
  return cases.find((item) => item.slug === slug);
}

export function getUpdate(slug: string) {
  return updates.find((item) => item.slug === slug);
}

export function getTutorial(slug: string) {
  return tutorials.find((item) => item.slug === slug);
}

export function getStartArticle(slug: string) {
  return startArticles.find((item) => item.slug === slug);
}

export function getTheme(slug: string) {
  return themes.find((item) => item.slug === slug);
}

export function getSeoTopic(slug: string) {
  return seoTopics.find((item) => item.slug === slug);
}

export function publishedSeoTopics() {
  return seoTopics.filter((item) => !item.draft && Boolean(item.reviewedAt));
}

export function findSeoTopicForSource(sourceId: string) {
  return publishedSeoTopics().find((topic) => topic.sourceIds.includes(sourceId));
}

export function getIndustryInsight(slug: string) {
  let normalizedSlug = slug;
  try {
    normalizedSlug = decodeURIComponent(slug);
  } catch {
    // Keep the original value so malformed route input simply returns no match.
  }
  return industryInsights.find((item) => item.slug === normalizedSlug);
}
