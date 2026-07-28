import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, FileCheck2 } from "lucide-react";
import { MarkdownContent } from "@/components/markdown-content";
import { SeoCommunityLink } from "@/components/seo-community-link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSeoTopic, seoTopics } from "@/lib/content";
import { extractFaqItems } from "@/lib/seo-faq";
import { isSeoTopicVisible, sourcesForSeoTopic } from "@/lib/seo-topics";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return seoTopics.map((topic) => ({ slug: topic.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const topic = getSeoTopic((await params).slug);
  if (!topic) return {};
  const visible = isSeoTopicVisible(topic);
  return {
    title: topic.title,
    description: topic.description,
    alternates: { canonical: `/topics/${topic.slug}` },
    robots: visible ? undefined : { index: false, follow: false },
    openGraph: {
      type: "article",
      title: topic.title,
      description: topic.description,
      url: `/topics/${topic.slug}`,
      modifiedTime: topic.reviewedAt || topic.generatedAt,
    },
  };
}

export default async function TopicDetailPage({ params }: Props) {
  const topic = getSeoTopic((await params).slug);
  if (!topic) notFound();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const sources = sourcesForSeoTopic(topic);
  const faqs = extractFaqItems(topic.markdown);
  const graph: Record<string, unknown>[] = [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首页", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "Codex 中文专题", item: `${siteUrl}/topics` },
        {
          "@type": "ListItem",
          position: 3,
          name: topic.title,
          item: `${siteUrl}/topics/${topic.slug}`,
        },
      ],
    },
    {
      "@type": "CollectionPage",
      name: topic.title,
      description: topic.description,
      url: `${siteUrl}/topics/${topic.slug}`,
      inLanguage: "zh-CN",
      dateModified: topic.reviewedAt || topic.generatedAt,
    },
    {
      "@type": "ItemList",
      name: `${topic.title}相关资料`,
      itemListElement: sources.map((source, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: source.title,
        url: `${siteUrl}${source.href}`,
      })),
    },
  ];
  if (faqs.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    });
  }
  const jsonLd = { "@context": "https://schema.org", "@graph": graph };

  return (
    <>
      <SiteHeader />
      <main className="article-page markdown-article-page topic-detail-page">
        <article className="article shell-narrow">
          <Link className="back-link" href="/topics">
            <ArrowLeft size={16} />
            返回专题
          </Link>
          <div className="topic-detail-meta">
            <span>{topic.primaryKeyword}</span>
            <span>{topic.intent}</span>
            {topic.draft ? <span className="topic-draft-state">草稿预览</span> : null}
          </div>
          <h1>{topic.title}</h1>
          <p className="article-lead">{topic.description}</p>
          <p className="topic-review-date">
            <FileCheck2 aria-hidden="true" size={15} />
            {topic.reviewedAt ? `审核于 ${topic.reviewedAt.slice(0, 10)}` : `生成于 ${topic.generatedAt.slice(0, 10)}`}
          </p>
          <MarkdownContent content={topic.markdown} />

          <SeoCommunityLink
            intent={topic.intent}
            primaryKeyword={topic.primaryKeyword}
            slug={topic.slug}
          />

          <section className="topic-related" aria-labelledby="topic-related-title">
            <span className="eyebrow">SOURCE READING</span>
            <h2 id="topic-related-title">继续阅读相关资料</h2>
            <ul>
              {sources.map((source) => (
                <li key={source.id}>
                  <Link href={source.href}>
                    {source.title}
                    <ArrowRight aria-hidden="true" size={15} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </article>
      </main>
      <SiteFooter />
      <script dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} type="application/ld+json" />
    </>
  );
}
