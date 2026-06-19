import os from "node:os";
import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { chromium } from "playwright";
import { buildEditorDocument, buildEditorSegments } from "./render.mjs";

const COMPOSE_URL = "https://x.com/compose/articles";
const DEFAULT_GSTACK_X_PROFILE = path.join(os.homedir(), ".gstack", "x-browser-profile");
const DEFAULT_GSTACK_X_STATE = path.join(os.homedir(), ".gstack", "x-browser", "browse.json");

export async function createDraft(article, options = {}) {
  const browserOptions = await resolveBrowserOptions(options);
  const context = await launchDraftContext(browserOptions);
  const { profileDir } = browserOptions;
  const page = context.pages()[0] || (await context.newPage());

  try {
    const draftUrl = normalizeDraftUrl(options.draft);
    await page.goto(draftUrl || COMPOSE_URL, { waitUntil: "domcontentloaded" });
    await ensureLoggedIn(page, draftUrl || COMPOSE_URL);
    if (!draftUrl) await openEditor(page);
    const editor = await locateEditor(page);

    await fillTitle(editor.title, article.title);
    if (article.cover) await uploadCover(page, article.cover.path);

    await clearBody(page, editor.body);
    const segments = buildEditorSegments(article);
    const document = buildEditorDocument(article);
    await pasteHtml(editor.body, document.html);
    for (const image of document.images.toReversed()) {
      await replaceImageMarker(page, editor.body, image);
    }

    await waitForAutosave(page);
    await verifyDraftContent(page, editor.body, segments);
    return { url: page.url(), title: article.title, profileDir, close: () => context.close() };
  } catch (error) {
    await page.screenshot({ path: path.resolve("x-article-drafter-error.png"), fullPage: true }).catch(() => {});
    await context.close().catch(() => {});
    throw error;
  }
}

export async function resolveBrowserOptions(options = {}) {
  const profileDir = path.resolve(options.profileDir || process.env.GSTACK_X_PROFILE || DEFAULT_GSTACK_X_PROFILE);
  const sharedProfileDir = path.resolve(process.env.GSTACK_X_PROFILE || DEFAULT_GSTACK_X_PROFILE);
  const usesSharedGstackProfile = profileDir === sharedProfileDir;
  const channel = options.channel || (usesSharedGstackProfile ? "chromium" : "chrome");

  if (usesSharedGstackProfile) {
    await assertSharedGstackBrowserIsNotRunning(profileDir);
  }

  return { profileDir, channel, usesSharedGstackProfile };
}

async function launchDraftContext({ profileDir, channel, usesSharedGstackProfile }) {
  try {
    return await chromium.launchPersistentContext(profileDir, {
      headless: false,
      channel: channel === "chromium" ? undefined : channel,
      viewport: null,
    });
  } catch (error) {
    if (usesSharedGstackProfile) {
      error.message = `${error.message}\n\nThe shared GStack X profile could not be opened. Close the GStack Browser window that uses ${profileDir}, then retry. Chromium profiles cannot be controlled by two browser processes at once.`;
    }
    throw error;
  }
}

async function assertSharedGstackBrowserIsNotRunning(profileDir) {
  const stateFile = process.env.GSTACK_X_STATE_FILE || DEFAULT_GSTACK_X_STATE;
  let state;
  try {
    state = JSON.parse(await readFile(stateFile, "utf8"));
  } catch {
    return;
  }

  if (!state?.port) return;

  try {
    const response = await fetch(`http://127.0.0.1:${state.port}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return;
    const health = await response.json();
    if (health.status !== "healthy") return;
  } catch {
    return;
  }

  throw new Error(
    [
      `The shared GStack X browser is already running and owns ${profileDir}.`,
      "Close that GStack Browser window before running x-article-drafter, or pass --profile to use a separate profile.",
      "This avoids launching two Chromium processes against the same X login profile.",
    ].join(" "),
  );
}

async function ensureLoggedIn(page, returnUrl) {
  if (await waitForLoggedInSurface(page, 10_000)) return;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("Log in to X in the opened browser, then press Enter here... ");
  rl.close();
  await page.goto(returnUrl, { waitUntil: "domcontentloaded" });
  if (!(await waitForLoggedInSurface(page, 30_000))) {
    throw new Error("X login was not detected after waiting for the Articles page.");
  }
}

async function openEditor(page) {
  const existingDrafts = new Set(await page.locator('a[href*="/compose/articles/edit/"]').evaluateAll((links) => links.map((link) => link.href)));
  const create = page.getByRole("button", { name: /^create$/i }).first();
  const emptyState = page.locator('[data-testid="empty_state_button_text"]').first();
  if (await create.isVisible().catch(() => false)) await create.click();
  else if (await emptyState.isVisible().catch(() => false)) await emptyState.click();
  else throw new Error("X Articles create-draft control was not found.");

  await page.waitForTimeout(1500);
  if (/\/compose\/articles\/edit\//.test(page.url())) return;

  const draftLinks = page.locator('a[href*="/compose/articles/edit/"]');
  await draftLinks.first().waitFor({ state: "visible", timeout: 15_000 });
  const hrefs = await draftLinks.evaluateAll((links) => links.map((link) => link.href));
  const newDraft = hrefs.find((href) => !existingDrafts.has(href)) || hrefs[0];
  await page.goto(newDraft, { waitUntil: "domcontentloaded" });
}

async function locateEditor(page) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const titleCandidates = [
      page.locator('textarea[placeholder="添加标题"]'),
      page.locator('textarea[placeholder*="Title" i]'),
      page.locator('input[placeholder*="Title" i]'),
      page.locator('[contenteditable="true"][data-testid*="title" i]'),
      page.getByRole("textbox", { name: /title|标题/i }),
    ];
    const bodyCandidates = [
      page.locator('[data-testid="composer"][contenteditable="true"]'),
      page.locator('[data-testid*="longform" i] [contenteditable="true"]'),
      page.locator('.public-DraftEditor-content[contenteditable="true"]'),
      page.locator('[contenteditable="true"][role="textbox"]'),
    ];

    const title = await firstVisible(titleCandidates);
    const body = await firstVisible(bodyCandidates, title);
    if (title && body) return { title, body };

    await page.waitForTimeout(250);
  }

  throw new Error(
    `X Article editor selectors changed or the editor did not load within 30 seconds. URL: ${page.url()}`,
  );
}

async function firstVisible(candidates, exclude) {
  for (const candidate of candidates) {
    const count = await candidate.count();
    for (let index = 0; index < count; index += 1) {
      const item = candidate.nth(index);
      if (exclude && (await item.evaluate((node, other) => node === other, await exclude.elementHandle()))) continue;
      if (await item.isVisible().catch(() => false)) return item;
    }
  }
  return null;
}

async function fillTitle(locator, title) {
  await locator.click();
  await locator.fill(title).catch(async () => {
    await locator.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await locator.pressSequentially(title);
  });
}

async function clearBody(page, locator) {
  const firstBlock = locator.locator('[data-block="true"]').first();
  await firstBlock.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.press("Backspace");

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const text = (await locator.locator('[data-block="true"]').allInnerTexts()).join(" ").trim();
    const images = await locator.locator("img").count();
    if (!text && images === 0) return;
    await page.waitForTimeout(100);
  }

  throw new Error("Could not clear the existing X Article body before rebuilding it.");
}

export async function pasteHtml(locator, html) {
  const expected = await locator.evaluate(
    (element, content) => new DOMParser().parseFromString(content, "text/html").body.innerText.replace(/\s+/g, ""),
    html,
  );
  const before = (await locator.innerText()).replace(/\s+/g, "");

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await moveCaretToEnd(locator);
    await locator.evaluate((element, content) => {
      const transfer = new DataTransfer();
      transfer.setData("text/html", content);
      transfer.setData("text/plain", new DOMParser().parseFromString(content, "text/html").body.innerText);
      element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
    }, html);

    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      const actual = (await locator.innerText()).replace(/\s+/g, "");
      if (actual.length > before.length && actual.endsWith(expected)) return;
      if (actual !== before) {
        throw new Error("X inserted a rich-text segment at the wrong editor position.");
      }
      await locator.page().waitForTimeout(100);
    }
  }

  throw new Error("X ignored a rich-text paste after 3 attempts.");
}

async function uploadCover(page, filePath) {
  const button = page.getByRole("button", { name: /add photo or video|添加照片或视频|cover|封面/i }).first();
  if (!(await button.isVisible().catch(() => false))) {
    throw new Error("Cover upload button was not found in the X Article editor.");
  }
  const chooser = page.waitForEvent("filechooser");
  await button.click();
  await (await chooser).setFiles(filePath);
  await applyMediaEdit(page);
}

async function replaceImageMarker(page, body, image) {
  const candidates = body.locator('[data-block="true"]').filter({ hasText: image.marker });
  const count = await candidates.count();
  let markerBlock = null;
  for (let index = 0; index < count; index += 1) {
    const candidate = candidates.nth(index);
    if ((await candidate.innerText()).trim() === image.marker) {
      markerBlock = candidate;
      break;
    }
  }
  if (!markerBlock) {
    throw new Error(`Image placeholder was not found in the X editor: ${image.marker}`);
  }

  await markerBlock.click();
  if (process.platform === "darwin") {
    await page.keyboard.press("Meta+ArrowLeft");
    await page.keyboard.press("Meta+Shift+ArrowRight");
  } else {
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
  }
  const selected = await page.evaluate(() => getSelection().toString().trim());
  if (selected !== image.marker) {
    throw new Error(`Could not select image placeholder ${image.marker}; selected: ${selected || "nothing"}.`);
  }
  await page.keyboard.press("Backspace");

  const before = await body.locator("img").count();
  const insert = page.getByRole("button", { name: /add media|添加媒体内容|insert|插入/i }).first();
  if (!(await insert.isVisible().catch(() => false))) {
    throw new Error("Body image upload button was not found in the X Article editor.");
  }
  await insert.click();
  const media = page.getByText(/^(media|媒体)$/i).last();
  await media.waitFor({ state: "visible", timeout: 5_000 });
  await media.click();
  const input = page.locator('input[data-testid="fileInput"][multiple]').last();
  await input.waitFor({ state: "attached", timeout: 5_000 });
  await input.setInputFiles(image.path);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if ((await body.locator("img").count()) === before + 1) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`X did not insert body image: ${image.path}`);
}

async function moveCaretToEnd(locator) {
  const lastBlock = locator.locator('[data-block="true"]').last();
  if (await lastBlock.count()) {
    await lastBlock.click();
    await lastBlock.press("End");
    await locator.page().waitForTimeout(100);
    return;
  }

  await locator.click();
  await locator.press("End");
}

async function applyMediaEdit(page) {
  const apply = page.getByRole("button", { name: /^(apply|应用)$/i }).last();
  await apply.waitFor({ state: "visible", timeout: 10_000 });
  await apply.click();
  await apply.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(500);
}

async function waitForAutosave(page) {
  const saved = page.getByText(/saved|已保存/i).first();
  if (await saved.isVisible().catch(() => false)) return;
  await page.waitForTimeout(4000);
}

async function verifyDraftContent(page, body, segments) {
  const expectedHtml = segments.filter((segment) => segment.kind === "html").map((segment) => segment.html);
  const expectedText = await page.evaluate(
    (items) =>
      items.map((html) =>
        new DOMParser().parseFromString(html, "text/html").body.innerText.replace(/\s+/g, ""),
      ),
    expectedHtml,
  );
  const actualText = (await body.innerText()).replace(/\s+/g, "");
  let offset = 0;

  for (let index = 0; index < expectedText.length; index += 1) {
    const position = actualText.indexOf(expectedText[index], offset);
    if (position === -1) {
      throw new Error(`Draft verification failed: text segment ${index + 1} is missing or out of order.`);
    }
    offset = position + expectedText[index].length;
  }

  const expectedImages = segments.filter((segment) => segment.kind === "image").length;
  const actualImages = await body.locator("img").count();
  if (actualImages !== expectedImages) {
    throw new Error(`Draft verification failed: expected ${expectedImages} body images, found ${actualImages}.`);
  }
}

async function waitForLoggedInSurface(page, timeout) {
  const surfaces = [
    page.getByRole("button", { name: /^create$/i }),
    page.locator('[data-testid="composer"]'),
    page.locator('a[href*="/compose/articles/edit/"]'),
    page.locator('[data-testid="empty_state_button_text"]'),
  ];
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const surface of surfaces) {
      if (await surface.first().isVisible().catch(() => false)) return true;
    }
    await page.waitForTimeout(250);
  }
  return false;
}

function normalizeDraftUrl(value) {
  if (!value) return null;
  if (/^https:\/\/x\.com\/compose\/articles\/edit\/\d+$/.test(value)) return value;
  if (/^\d+$/.test(value)) return `https://x.com/compose/articles/edit/${value}`;
  throw new Error("--draft must be a numeric X draft ID or a full X Articles edit URL.");
}
