import fs from "node:fs/promises";
import path from "node:path";
import { marked, Parser } from "marked";

export class MarkdownValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "MarkdownValidationError";
  }
}

function parseFrontmatter(source) {
  if (!source.startsWith("---\n")) return { attributes: {}, body: source };

  const end = source.indexOf("\n---\n", 4);
  if (end === -1) {
    throw new MarkdownValidationError("Frontmatter starts with --- but has no closing ---.");
  }

  const attributes = {};
  for (const line of source.slice(4, end).split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (!match) {
      throw new MarkdownValidationError(`Unsupported frontmatter line: ${line}`);
    }
    attributes[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }

  return { attributes, body: source.slice(end + 5) };
}

function containsHtml(tokens = []) {
  for (const token of tokens) {
    if (token.type === "html") return true;
    if (containsHtml(token.tokens)) return true;
    if (token.items?.some((item) => containsHtml(item.tokens))) return true;
  }
  return false;
}

function assertSafeLinks(tokens = [], context) {
  for (const token of tokens) {
    if (token.type === "link" && !/^(https?:|mailto:|#)/i.test(token.href)) {
      throw new MarkdownValidationError(`${context}: unsupported link protocol in ${token.href}.`);
    }
    assertSafeLinks(token.tokens, context);
  }
}

function renderInline(tokens, context) {
  if (containsHtml(tokens)) {
    throw new MarkdownValidationError(`${context}: raw HTML is not supported.`);
  }
  assertSafeLinks(tokens, context);
  return Parser.parseInline(tokens, { async: false }).trim();
}

function imageFromParagraph(token) {
  const meaningful = token.tokens.filter((item) => item.type !== "space");
  return meaningful.length === 1 && meaningful[0].type === "image" ? meaningful[0] : null;
}

function resolveImage(markdownPath, href, alt, role = "body") {
  if (/^https?:\/\//i.test(href)) {
    throw new MarkdownValidationError(
      `Remote image ${href} is not supported yet. Download it beside the Markdown file first.`,
    );
  }

  const absolutePath = path.resolve(path.dirname(markdownPath), href);
  return { kind: "image", role, path: absolutePath, alt: alt || "" };
}

function parseList(token, index) {
  const items = token.items.map((item, itemIndex) => {
    if (item.task) {
      throw new MarkdownValidationError(`Block ${index + 1}, item ${itemIndex + 1}: task lists are unsupported.`);
    }
    if (item.tokens.some((child) => child.type === "list")) {
      throw new MarkdownValidationError(`Block ${index + 1}, item ${itemIndex + 1}: nested lists are unsupported.`);
    }
    return renderInline(item.tokens.flatMap((child) => child.tokens || [child]), `List item ${itemIndex + 1}`);
  });
  return { kind: "list", ordered: token.ordered, start: token.start || 1, items };
}

export async function parseMarkdownFile(markdownPath) {
  const absolutePath = path.resolve(markdownPath);
  const source = await fs.readFile(absolutePath, "utf8");
  const { attributes, body } = parseFrontmatter(source.replace(/\r\n/g, "\n"));
  const tokens = marked.lexer(body, { gfm: true });

  let title = attributes.title || "";
  let cover = attributes.cover
    ? resolveImage(absolutePath, attributes.cover, attributes.cover_alt || title, "cover")
    : null;
  const blocks = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "space") continue;

    if (token.type === "heading") {
      if (token.depth === 1) {
        if (title) throw new MarkdownValidationError("Only one H1 title is allowed.");
        if (blocks.length > 0) {
          throw new MarkdownValidationError("The H1 title must appear before article body content.");
        }
        title = token.text.trim();
        continue;
      }
      if (token.depth > 2) {
        throw new MarkdownValidationError(`Heading level H${token.depth} is unsupported; use H2.`);
      }
      blocks.push({ kind: "heading", level: token.depth, html: renderInline(token.tokens, `Heading ${index + 1}`) });
      continue;
    }

    if (token.type === "paragraph") {
      const image = imageFromParagraph(token);
      if (image) {
        const role = !title && !cover && blocks.length === 0 ? "cover" : "body";
        const parsedImage = resolveImage(absolutePath, image.href, image.text, role);
        if (role === "cover") cover = parsedImage;
        else blocks.push(parsedImage);
        continue;
      }
      if (token.tokens.some((item) => item.type === "image")) {
        throw new MarkdownValidationError(`Block ${index + 1}: images must be on their own line.`);
      }
      blocks.push({ kind: "paragraph", html: renderInline(token.tokens, `Paragraph ${index + 1}`) });
      continue;
    }

    if (token.type === "list") {
      blocks.push(parseList(token, index));
      continue;
    }

    if (token.type === "blockquote") {
      const inner = token.tokens.filter((child) => child.type !== "space");
      if (inner.length !== 1 || inner[0].type !== "paragraph") {
        throw new MarkdownValidationError(`Blockquote ${index + 1}: use one paragraph per quote.`);
      }
      blocks.push({ kind: "blockquote", html: renderInline(inner[0].tokens, `Blockquote ${index + 1}`) });
      continue;
    }

    if (token.type === "code") {
      blocks.push({ kind: "code", language: token.lang || "", text: token.text });
      continue;
    }

    if (token.type === "hr") {
      blocks.push({ kind: "divider" });
      continue;
    }

    throw new MarkdownValidationError(`Unsupported Markdown block: ${token.type}.`);
  }

  if (!title.trim()) {
    throw new MarkdownValidationError("Article title is missing. Add one H1 or frontmatter title.");
  }
  if (blocks.length === 0) {
    throw new MarkdownValidationError("Article body is empty.");
  }

  const images = [cover, ...blocks.filter((block) => block.kind === "image")].filter(Boolean);
  await Promise.all(
    images.map(async (image) => {
      const stat = await fs.stat(image.path).catch(() => null);
      if (!stat?.isFile() || stat.size === 0) {
        throw new MarkdownValidationError(`Image does not exist or is empty: ${image.path}`);
      }
    }),
  );

  return { sourcePath: absolutePath, title: title.trim(), cover, blocks };
}
