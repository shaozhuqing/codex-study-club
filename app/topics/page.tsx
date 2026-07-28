import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpenCheck } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { visibleSeoTopics } from "@/lib/seo-topics";

export function generateMetadata(): Metadata {
  const hasPublishedTopics = visibleSeoTopics().length > 0;
  return {
    title: "Codex 中文专题",
    description: "按学习目标和实际问题整理的 Codex 中文教程、配置与排查专题。",
    alternates: { canonical: "/topics" },
    robots: hasPublishedTopics ? undefined : { index: false, follow: false },
  };
}

export default function TopicsPage() {
  const topics = visibleSeoTopics();

  return (
    <>
      <SiteHeader />
      <main className="topics-page">
        <section className="topics-heading shell">
          <span className="eyebrow">CODEX TOPICS</span>
          <h1>Codex 中文专题</h1>
          <p>从明确的问题或目标出发，按经过核对的站内资料继续学习。</p>
        </section>
        <section className="topics-list-section shell" aria-label="专题列表">
          {topics.length ? (
            <div className="topics-grid">
              {topics.map((topic) => (
                <article className="topic-card" key={topic.slug}>
                  <div className="topic-card-meta">
                    <span>{topic.priority}</span>
                    <span>{topic.primaryKeyword}</span>
                  </div>
                  <h2>{topic.title}</h2>
                  <p>{topic.description}</p>
                  <Link href={`/topics/${topic.slug}`}>
                    阅读专题
                    <ArrowRight size={16} />
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="topics-empty">
              <BookOpenCheck aria-hidden="true" size={24} />
              <h2>专题正在审核中</h2>
              <p>已发布的入门教程和实战案例仍可正常访问。</p>
              <Link href="/start/01-what-is-codex">从新手入门开始</Link>
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
