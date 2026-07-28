import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

export const SOURCE_DIRECTORIES = ["start", "cases", "tutorials", "community-updates", "themes"];

const sourceDefinitions = {
  start: { kind: "start", href: (slug) => `/start/${slug}` },
  cases: { kind: "case", href: (slug) => `/cases/${slug}` },
  tutorials: { kind: "tutorial", href: (slug) => `/learn/${slug}` },
  "community-updates": { kind: "update", href: (slug) => `/community/updates/${slug}` },
  themes: { kind: "theme", href: () => "/themes" },
};

async function listMarkdownFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listMarkdownFiles(fullPath)));
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(fullPath);
  }
  return files;
}

function markdownHeadings(markdown) {
  return [...markdown.matchAll(/^#{2,3}\s+(.+)$/gm)].map((match) => match[1].trim());
}

function normalizeSearchText(parts) {
  return parts.filter(Boolean).join("\n").normalize("NFKC").toLocaleLowerCase("zh-CN");
}

async function parseSourceFile(contentRoot, directory, filePath) {
  const original = await readFile(filePath, "utf8");
  const parsed = matter(original);
  const slug = path.basename(filePath, ".md");
  const definition = sourceDefinitions[directory];
  const h1 = parsed.content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const markdown = parsed.content.replace(/^#\s+.+(?:\r?\n)+/m, "").trim();
  const title = String(parsed.data.title || h1 || slug);
  const description = String(
    parsed.data.description || parsed.data.summary || parsed.data.excerpt || "",
  );
  const headings = markdownHeadings(markdown);
  const relativePath = path.relative(contentRoot, filePath);
  const category = directory === "cases" ? path.basename(path.dirname(filePath)) : directory;

  return {
    id: `${definition.kind}:${slug}`,
    kind: definition.kind,
    slug,
    title,
    description,
    category,
    href: definition.href(slug),
    headings,
    markdown,
    checkedAt: parsed.data.checkedAt ? String(parsed.data.checkedAt) : undefined,
    relativePath,
    searchText: normalizeSearchText([title, description, headings.join("\n"), category, markdown]),
  };
}

export async function discoverSources(contentRoot) {
  const documents = [];
  for (const directory of SOURCE_DIRECTORIES) {
    const directoryPath = path.join(contentRoot, directory);
    for (const filePath of await listMarkdownFiles(directoryPath)) {
      documents.push(await parseSourceFile(contentRoot, directory, filePath));
    }
  }
  return documents.sort((left, right) => left.id.localeCompare(right.id));
}

