# Codex Study Club

Codex Study Club is a Chinese learning and practice community for OpenAI Codex. It combines a Markdown-driven tutorial and case library with a homepage assistant that retrieves answers from the same local content repository.

![Codex Study Club](public/og-image.webp)

## Features

- Chat-first homepage for Codex learning questions.
- Local Markdown knowledge retrieval with optional OpenAI-generated answers.
- Categorized, SEO-friendly case studies and a standalone Codex theme gallery.
- Beginner tutorial and curated community updates.
- Responsive layouts for desktop and mobile.
- Sitemap, robots metadata, Open Graph metadata, and structured data.

## Architecture

```text
content/**/*.md
      |
      v
lib/content.ts --------------------> Next.js pages
      |
      v
lib/knowledge-base.ts ------------> /api/chat
                                      |
                                      +-- local answer when no API key
                                      +-- retrieved context for OpenAI Responses API

public content Markdown ----------> scripts/seo/*
                                      |
                                      +-- content/seo/*.md (draft first)
                                      +-- /topics/[slug] (static page)
```

Editorial content is stored under `content/`. React and Next.js code only loads, indexes, and renders these documents.

```text
content/
├── assistant/             # Homepage assistant knowledge
├── cases/
│   ├── getting-started/   # Beginner workflows
│   ├── development/       # Development and automation
│   ├── content-design/    # Content and design
│   ├── knowledge/         # Knowledge and collaboration
│   └── tools-devices/     # Tools and devices
├── community-updates/     # Curated community notes
├── seo/                   # Reviewable generated topic drafts
├── themes/                # Codex desktop themes and visual customization
└── tutorials/             # Structured tutorials
```

See [content/README.md](content/README.md) for frontmatter schemas and authoring rules.

## Requirements

- Node.js 20.9 or newer
- npm

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `OPENAI_API_KEY` | No | Enables generated answers through the OpenAI Responses API. Without it, the assistant returns local Markdown answers and excerpts. |
| `OPENAI_BASE_URL` | No | Server-side Responses API base URL. Defaults to `https://api.openai.com/v1`; custom OpenAI-compatible services can provide their own `/v1` base URL. |
| `OPENAI_MODEL` | No | Responses API model. Defaults to the value in `.env.example`. |
| `NEXT_PUBLIC_SITE_URL` | Production | Public origin used for canonical URLs, sitemap entries, and social metadata. |
| `NEXT_PUBLIC_COMMUNITY_JOIN_URL` | No | Payment or onboarding URL used by the community join action. |
| `SEO_TOPICS_ENABLED` | No | Enables links and sitemap entries for reviewed, non-draft SEO topics. Defaults to disabled. |
| `GOOGLE_SITE_VERIFICATION` | No | Adds the Google site-verification metadata value. |
| `BAIDU_SITE_VERIFICATION` | No | Adds the Baidu site-verification metadata value. |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | No | Loads GA4 and emits the documented SEO-to-community events. |

Do not commit `.env.local` or any API key.

## Content Workflow

1. Add or edit a Markdown file under the appropriate `content/` directory.
2. Keep page metadata in YAML frontmatter and the full article in Markdown.
3. Put images under `public/` and reference them with root-relative paths.
4. Run the validation commands below.
5. Rebuild or restart the service so the document enters the page index and local assistant knowledge base.

Adding a case, tutorial, or community update does not require editing a TypeScript content array.

## Commands

```bash
npm run dev                 # Start the development server
npm run lint                # Run ESLint
npm run build               # Create the production build
npm run start               # Serve the production build
npm run import:codexguide   # Refresh categorized imported cases
npm run seo:plan            # Scan all public Markdown and write the SEO plan report
npm run seo:generate        # Generate validated drafts through the Responses API
npm run seo:check           # Validate topic config and generated Markdown
npm run seo:test            # Run offline SEO unit and contract tests
npm run smoke               # Check public routes, chat fallback, and draft noindex
```

## SEO Static Topic Workflow

The SEO scanner reads all Markdown under `content/start`, `content/cases`, `content/tutorials`, `content/community-updates`, and `content/themes` on every run. It does not use Git diff as the content source. `content/assistant`, `content/seo`, and root industry-insight HTML are excluded, so generated content cannot recursively generate more topics or enter `/api/chat`.

### 1. Plan without model calls

```bash
npm run seo:plan -- --output content/seo
```

Review `reports/seo-plan.json`. A topic must meet its minimum source count; comparison topics also require evidence for both products. `insufficient_sources` topics are skipped.

### 2. Preview the complete offline path

```bash
npm run seo:generate -- \
  --output content/seo \
  --fixture scripts/seo/fixtures/codex-cli-response.json \
  --topic codex-cli
npm run seo:check -- --output content/seo
SEO_TOPICS_ENABLED=true npm run dev
```

Open `/topics/codex-cli`. The fixture is selected only by the explicit `--fixture` argument and passes the same JSON schema, source-ID, Markdown, and atomic-write checks as an API response.

### 3. Generate through the Responses API

```bash
OPENAI_API_KEY=your-server-key \
OPENAI_MODEL=gpt-5.6-terra \
npm run seo:generate -- --output content/seo --topic codex-cli
```

`OPENAI_BASE_URL` may point to a compatible `/v1` endpoint. The command fails before writing a topic when the key is missing. Model calls happen only in this explicit command; `npm run build` never calls the model.

### 4. Review and publish

1. Verify facts, source links, title/description, search intent, and content overlap.
2. Run `npm run seo:check -- --output content/seo`.
3. Change `draft: true` to `draft: false` and add `reviewedAt: "<ISO timestamp>"`.
4. Set `SEO_TOPICS_ENABLED=true`, rebuild, and deploy.

Draft pages are directly previewable but emit `noindex,nofollow` and never appear in topic navigation or the sitemap. The generator may replace an existing draft after validation. It never replaces a published file; changed inputs are reported as `published_stale` for manual review.

### 5. Verify and roll back

```bash
npm run seo:test
npm run lint
SEO_TOPICS_ENABLED=false npm run build
SEO_TOPICS_ENABLED=true npm run build
SEO_TOPICS_ENABLED=true npm run dev
npm run smoke -- --base-url http://localhost:3000
```

The immediate rollback is to set `SEO_TOPICS_ENABLED=false` and redeploy. This removes topic navigation and sitemap exposure without deleting content or changing the existing assistant, case, tutorial, or community routes.

The planning command is safe to schedule with cron or CI because it performs a full read and writes only a replaceable report. Keep `seo:generate` approval-gated because it calls a paid model and can replace drafts.

## Measuring SEO Results

Before publishing, record a baseline for the previous 28 days. After publishing, compare the same query, country, device, and page filters rather than relying on total site traffic.

| Source | Primary measurements | Use |
| --- | --- | --- |
| Google Search Console | Indexed pages, impressions, clicks, CTR, average position, query and landing-page breakdown | Google discovery and ranking quality |
| Baidu Search Resource Platform | Submitted/indexed URLs and any available query, impression, click, or crawl diagnostics | Baidu discovery and technical issues |
| GA4 | Topic page views plus `community_cta_click`, `community_landing_view`, and `community_join_click` | Topic-to-community intent funnel |

Recommended funnel calculations:

- Topic CTA rate = `community_cta_click / topic page views`.
- Attribution continuity = `community_landing_view / community_cta_click`.
- Join-intent rate = `community_join_click / community_landing_view`.

Review on three windows:

- Day 7: crawl errors, canonical/robots correctness, submitted and indexed URL status.
- Day 28: impressions, query coverage, CTR, average position, and pages with impressions but weak clicks.
- Day 56: sustained click growth, topic-to-community funnel, stale source reports, and which topics to update, merge, or stop.

The current static WeChat QR cannot prove that an attributed visitor completed payment. Reliable paid conversion requires an attributable onboarding/payment URL or a manual CRM record that preserves the topic source; do not label QR scans as paid conversions.

## Deployment Checklist

- Set `NEXT_PUBLIC_SITE_URL` to the production HTTPS origin.
- Configure `NEXT_PUBLIC_COMMUNITY_JOIN_URL` when community enrollment is available.
- Configure `OPENAI_API_KEY` only on the server when generated answers are required.
- Keep `SEO_TOPICS_ENABLED=false` until at least one topic is manually reviewed and published.
- Run `npm run lint` and `npm run build`.
- Verify `/`, `/themes`, `/cases`, `/learn/getting-started`, `/sitemap.xml`, and `/api/chat`.

## Disclaimer

Codex Study Club is not an official OpenAI website. Product facts should be checked against the official OpenAI documentation.

Third-party content notices are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
