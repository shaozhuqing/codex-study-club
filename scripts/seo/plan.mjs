import {
  isMainModule,
  loadSeoContext,
  runCli,
  writeJsonReport,
} from "./cli.mjs";

async function main(args) {
  const options = {
    content: args.content || "content",
    config: args.config || "config/seo-topics.json",
    output: args.output || "content/seo",
    report: args.report || "reports/seo-plan.json",
  };
  const { plan } = await loadSeoContext(options);
  await writeJsonReport(options.report, plan);
  console.log(
    Object.entries(plan.summary)
      .map(([status, count]) => `${status}: ${count}`)
      .join("\n"),
  );
}

if (isMainModule(import.meta.url)) runCli(main);
