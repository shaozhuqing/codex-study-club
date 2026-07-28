function plainText(value) {
  return value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractFaqItems(markdown) {
  const lines = markdown.split(/\r?\n/);
  const sectionStart = lines.findIndex((line) => line.trim() === "## 常见问题");
  if (sectionStart < 0) return [];

  const items = [];
  let question = "";
  let answerLines = [];
  const flush = () => {
    const answer = plainText(answerLines.join("\n"));
    if (question && answer) items.push({ question, answer });
    question = "";
    answerLines = [];
  };

  for (const line of lines.slice(sectionStart + 1)) {
    if (/^##\s+/.test(line)) break;
    const questionMatch = line.match(/^###\s+(.+)$/);
    if (questionMatch) {
      flush();
      question = questionMatch[1].trim();
      continue;
    }
    if (!question || /^>\s*相关资料：/.test(line)) continue;
    answerLines.push(line);
  }
  flush();
  return items;
}
