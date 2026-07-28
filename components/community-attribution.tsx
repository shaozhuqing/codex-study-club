"use client";

import { useEffect } from "react";
import { trackSeoEvent, type SeoEventParams } from "@/components/site-analytics";

export function CommunityAttribution({ attribution }: { attribution?: SeoEventParams }) {
  useEffect(() => {
    if (attribution?.topic_slug) trackSeoEvent("community_landing_view", attribution);
  }, [attribution]);

  return null;
}
