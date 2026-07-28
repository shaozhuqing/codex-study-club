import type { MetadataRoute } from "next";
import { cases, industryInsights, startArticles, updates } from "@/lib/content";
import { visibleSeoTopics } from "@/lib/seo-topics";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const staticRoutes = [
    "",
    "/learn/getting-started",
    "/themes",
    "/agent-awards",
    "/industry-insights",
    "/cases",
    "/community",
    "/community/updates",
  ];
  const topics = visibleSeoTopics();
  if (topics.length) staticRoutes.push("/topics");

  return [
    ...staticRoutes.map((route) => ({
      url: `${base}${route}`,
      lastModified: new Date("2026-07-20"),
      changeFrequency: route === "" ? ("weekly" as const) : ("monthly" as const),
      priority: route === "" ? 1 : 0.8,
    })),
    ...cases.map((item) => ({
      url: `${base}/cases/${item.slug}`,
      lastModified: new Date(item.checkedAt || "2026-07-20"),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...startArticles.map((item) => ({
      url: `${base}/start/${item.slug}`,
      lastModified: new Date(item.checkedAt || "2026-07-20"),
      changeFrequency: "monthly" as const,
      priority: 0.9,
    })),
    ...updates.map((item) => ({
      url: `${base}/community/updates/${item.slug}`,
      lastModified: new Date(item.date),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...topics.map((topic) => ({
      url: `${base}/topics/${topic.slug}`,
      lastModified: new Date(topic.reviewedAt || topic.generatedAt),
      changeFrequency: "monthly" as const,
      priority: topic.priority === "P0" ? 0.9 : 0.8,
    })),
    ...industryInsights.map((item) => ({
      url: `${base}/industry-insights/${item.slug}`,
      lastModified: new Date("2026-07-23"),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
