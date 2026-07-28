import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { buildPlan } from "./planner.mjs";
import { discoverSources } from "./sources.mjs";

const supportedOptions = new Set([
  "content",
  "config",
  "output",
  "report",
  "fixture",
  "topic",
]);

export function parseSeoArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`unexpected_argument:${token}`);
    const name = token.slice(2);
    if (!supportedOptions.has(name)) throw new Error(`unknown_option:${name}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`option_value_required:${name}`);
    options[name] = value;
    index += 1;
  }
  return options;
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function readExistingMarkdown(outputDir) {
  let entries;
  try {
    entries = await readdir(outputDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return new Map();
    throw error;
  }

  const markdownBySlug = new Map();
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const slug = path.basename(entry.name, ".md");
    markdownBySlug.set(slug, await readFile(path.join(outputDir, entry.name), "utf8"));
  }
  return markdownBySlug;
}

export async function loadSeoContext({ content, config, output }) {
  const [topics, sources, existingMarkdown] = await Promise.all([
    readJson(config),
    discoverSources(content),
    readExistingMarkdown(output),
  ]);
  return {
    topics,
    sources,
    existingMarkdown,
    plan: buildPlan(topics, sources, existingMarkdown),
  };
}

export async function writeJsonReport(filePath, report) {
  const target = path.resolve(filePath);
  const temporary = `${target}.tmp`;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

export function isMainModule(metaUrl) {
  return Boolean(process.argv[1]) && metaUrl === pathToFileURL(process.argv[1]).href;
}

export async function runCli(main) {
  try {
    await main(parseSeoArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
