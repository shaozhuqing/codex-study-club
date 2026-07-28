"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { trackSeoEvent, type SeoEventParams } from "@/components/site-analytics";

export function CommunityLink({
  className = "",
  seoAttribution,
}: {
  className?: string;
  seoAttribution?: SeoEventParams;
}) {
  const joinUrl = process.env.NEXT_PUBLIC_COMMUNITY_JOIN_URL;
  const trackJoin = () => {
    if (seoAttribution?.topic_slug) trackSeoEvent("community_join_click", seoAttribution);
  };

  if (joinUrl) {
    return (
      <a className={className} href={joinUrl} onClick={trackJoin} rel="noreferrer" target="_blank">
        立即加入
        <ArrowUpRight size={17} />
      </a>
    );
  }

  return (
    <Link className={className} href="/community#join" onClick={trackJoin}>
      了解加入方式
      <ArrowUpRight size={17} />
    </Link>
  );
}
