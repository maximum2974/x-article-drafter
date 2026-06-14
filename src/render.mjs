import path from "node:path";

export function blockToHtml(block) {
  switch (block.kind) {
    case "heading":
      return `<h2>${block.html}</h2>`;
    case "paragraph":
      return `<p>${block.html}</p>`;
    case "blockquote":
      return `<blockquote>${block.html}</blockquote>`;
    case "code":
      return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
    case "divider":
      return "<hr>";
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const start = block.ordered && block.start !== 1 ? ` start="${block.start}"` : "";
      return `<${tag}${start}>${block.items.map((item) => `<li>${item}</li>`).join("")}</${tag}>`;
    }
    default:
      throw new Error(`Cannot render block kind: ${block.kind}`);
  }
}

export function buildEditorSegments(article) {
  const segments = [];
  let html = "";
  const flush = () => {
    if (html) segments.push({ kind: "html", html });
    html = "";
  };

  for (const block of article.blocks) {
    if (block.kind === "image") {
      flush();
      segments.push(block);
    } else {
      html += blockToHtml(block);
    }
  }
  flush();
  return segments;
}

export function buildEditorDocument(article) {
  const images = [];
  const html = article.blocks
    .map((block) => {
      if (block.kind !== "image") return blockToHtml(block);
      const marker = `XARTICLEIMAGE${String(images.length + 1).padStart(4, "0")}TOKEN`;
      images.push({ ...block, marker });
      return `<p>${marker}</p>`;
    })
    .join("");

  return { html, images };
}

export function renderPreview(article) {
  const body = article.blocks
    .map((block) =>
      block.kind === "image"
        ? `<figure><img src="${pathToFileUrl(block.path)}" alt="${escapeHtml(block.alt)}"></figure>`
        : blockToHtml(block),
    )
    .join("\n");
  const cover = article.cover
    ? `<img class="cover" src="${pathToFileUrl(article.cover.path)}" alt="${escapeHtml(article.cover.alt)}">`
    : "";

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(article.title)}</title>
  <style>
    body { max-width: 760px; margin: 40px auto; padding: 0 20px; color: #0f1419; font: 18px/1.65 system-ui, sans-serif; }
    .cover, figure img { display: block; width: 100%; border-radius: 14px; }
    .cover { margin-bottom: 32px; } h1 { font-size: 42px; line-height: 1.15; } h2 { margin-top: 2em; }
    blockquote { border-left: 4px solid #536471; margin-left: 0; padding-left: 20px; color: #536471; }
    pre { overflow-x: auto; padding: 18px; border-radius: 12px; background: #f7f9f9; }
    figure { margin: 32px 0; }
  </style>
</head>
<body>${cover}<h1>${escapeHtml(article.title)}</h1>${body}</body>
</html>`;
}

function pathToFileUrl(filePath) {
  return new URL(`file://${path.resolve(filePath)}`).href;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
