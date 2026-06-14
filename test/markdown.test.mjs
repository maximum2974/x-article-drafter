import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseMarkdownFile } from "../src/markdown.mjs";
import { buildEditorDocument, buildEditorSegments, renderPreview } from "../src/render.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "fixtures", "article.md");

test("parses a Markdown article into an X-safe model", async () => {
  const article = await parseMarkdownFile(fixture);
  assert.equal(article.title, "Example Article");
  assert.equal(article.cover.role, "cover");
  assert.equal(article.blocks.filter((block) => block.kind === "image").length, 1);
  assert.deepEqual(article.blocks.map((block) => block.kind), [
    "paragraph",
    "heading",
    "blockquote",
    "list",
    "image",
    "code",
  ]);
});

test("splits rich text around body images", async () => {
  const article = await parseMarkdownFile(fixture);
  const segments = buildEditorSegments(article);
  assert.deepEqual(segments.map((segment) => segment.kind), ["html", "image", "html"]);
});

test("builds one HTML document with stable image placeholders", async () => {
  const article = await parseMarkdownFile(fixture);
  const document = buildEditorDocument(article);
  assert.equal(document.images.length, 1);
  assert.equal(document.images[0].marker, "XARTICLEIMAGE0001TOKEN");
  assert.ok(document.html.includes("XARTICLEIMAGE0001TOKEN"));
  assert.ok(document.html.indexOf("XARTICLEIMAGE0001TOKEN") < document.html.indexOf("console.log"));
});

test("renders cover before title in preview", async () => {
  const article = await parseMarkdownFile(fixture);
  const preview = renderPreview(article);
  assert.ok(preview.indexOf('class="cover"') < preview.indexOf("<h1>Example Article</h1>"));
});
