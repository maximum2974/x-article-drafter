#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createDraft } from "./browser.mjs";
import { MarkdownValidationError, parseMarkdownFile } from "./markdown.mjs";
import { buildEditorSegments, renderPreview } from "./render.mjs";

async function main() {
  const [command, file, ...rest] = process.argv.slice(2);
  if (!["check", "preview", "draft"].includes(command) || !file) {
    printUsage();
    process.exitCode = 2;
    return;
  }

  const options = parseOptions(rest);
  const article = await parseMarkdownFile(file);

  if (command === "check") {
    printPlan(article);
    return;
  }

  if (command === "preview") {
    const output = path.resolve(options.output || `${file}.preview.html`);
    await fs.writeFile(output, renderPreview(article), "utf8");
    console.log(`Preview written: ${output}`);
    printPlan(article);
    return;
  }

  const result = await createDraft(article, {
    profileDir: options.profile,
    channel: options.browser,
    draft: options.draft,
  });
  console.log(`Draft created: ${result.title}`);
  console.log(`Editor URL: ${result.url}`);
  console.log("The tool did not publish the article.");
  if (!options.close && process.stdin.isTTY) {
    const readline = await import("node:readline/promises");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await rl.question("The browser will stay open for manual edits. Press Enter to close it... ");
    rl.close();
  }
  await result.close();
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--close") options.close = true;
    else if (["--output", "--profile", "--browser", "--draft"].includes(arg)) options[toCamel(arg.slice(2))] = args[++index];
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function printPlan(article) {
  const bodyImages = article.blocks.filter((block) => block.kind === "image").length;
  console.log(`Title: ${article.title}`);
  console.log(`Cover: ${article.cover ? article.cover.path : "none"}`);
  console.log(`Body blocks: ${article.blocks.length}`);
  console.log(`Body images: ${bodyImages}`);
  console.log(`Editor segments: ${buildEditorSegments(article).length}`);
}

function printUsage() {
  console.log(`Usage:
  x-article-drafter check <article.md>
  x-article-drafter preview <article.md> [--output preview.html]
  x-article-drafter draft <article.md> [--draft id-or-url] [--profile dir] [--browser chrome|chromium] [--close]

The draft command creates a cloud draft in X Articles. It never publishes.
By default it reuses ~/.gstack/x-browser-profile for the shared X login.`);
}

main().catch((error) => {
  if (error instanceof MarkdownValidationError) console.error(`Invalid Markdown: ${error.message}`);
  else console.error(error.stack || error.message);
  process.exitCode = 1;
});
