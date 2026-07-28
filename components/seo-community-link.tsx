"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { trackSeoEvent, type SeoEventParams } from "@/components/site-analytics";

type Props = {
  slug: string;
  primaryKeyword: string;
  intent: string;
};

export function SeoCommunityLink({ slug, primaryKeyword, intent }: Props) {
  const attribution: SeoEventParams = {
    topic_slug: slug,
    primary_keyword: primaryKeyword,
    intent,
  };

  return (
    <Link
      className="topic-community-link"
      href={`/community?from=${encodeURIComponent(`topic:${slug}`)}#join`}
      onClick={() => trackSeoEvent("community_cta_click", attribution)}
    >
      <span>
        <strong>仍无法定位问题？</strong>
        带上错误日志和复现步骤参与讨论
      </span>
      <ArrowUpRight aria-hidden="true" size={18} />
    </Link>
  );
}
