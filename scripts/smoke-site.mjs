import { pathToFileURL } from "node:url";

const pagePaths = [
  "/",
  "/start/01-what-is-codex",
  "/cases",
  "/community/updates",
  "/robots.txt",
  "/sitemap.xml",
  "/topics/codex-cli",
];

function endpoint(baseUrl, pathname) {
  return new URL(pathname, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

async function successfulResponse(fetchImpl, url, options) {
  const response = await fetchImpl(url, {
    ...options,
    signal: options?.signal || AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`smoke_http_error:${response.status}:${url}`);
  return response;
}

export async function runSiteSmoke({ baseUrl, fetchImpl = globalThis.fetch }) {
  if (!baseUrl) throw new Error("base_url_required");
  if (typeof fetchImpl !== "function") throw new Error("fetch_not_available");

  for (const pathname of pagePaths) {
    const response = await successfulResponse(fetchImpl, endpoint(baseUrl, pathname));
    if (pathname === "/topics/codex-cli") {
      const html = await response.text();
      const robots = html.match(/<meta[^>]+name=["']robots["'][^>]*>/i)?.[0] || "";
      if (!/noindex/i.test(robots)) throw new Error("draft_topic_must_be_noindex");
    }
  }

  const chatResponse = await successfulResponse(fetchImpl, endpoint(baseUrl, "/api/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Codex CLI 如何安装？" }],
    }),
  });
  const eventTypes = (await chatResponse.text())
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const event = JSON.parse(line);
        return typeof event.type === "string" ? [event.type] : [];
      } catch {
        return [];
      }
    });
  for (const requiredType of ["sources", "delta", "done"]) {
    if (!eventTypes.includes(requiredType)) throw new Error(`chat_event_missing:${requiredType}`);
  }

  return { pages: pagePaths.length, chatEvents: eventTypes };
}

function parseArgs(argv) {
  if (argv.length === 0) return { baseUrl: "http://localhost:3000" };
  if (argv.length !== 2 || argv[0] !== "--base-url" || !argv[1]) {
    throw new Error("usage: npm run smoke -- --base-url http://localhost:3000");
  }
  return { baseUrl: argv[1] };
}

async function main() {
  try {
    const result = await runSiteSmoke(parseArgs(process.argv.slice(2)));
    console.log(`Smoke passed: ${result.pages} pages and ${result.chatEvents.length} chat events.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
