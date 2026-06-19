import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { pasteHtml, resolveBrowserOptions } from "../src/browser.mjs";

test("uses the shared GStack X profile by default", async () => {
  const previousState = process.env.GSTACK_X_STATE_FILE;
  process.env.GSTACK_X_STATE_FILE = path.join(os.tmpdir(), `missing-gstack-x-${Date.now()}.json`);
  try {
    const options = await resolveBrowserOptions();
    assert.equal(options.profileDir, path.join(os.homedir(), ".gstack", "x-browser-profile"));
    assert.equal(options.channel, "chromium");
    assert.equal(options.usesSharedGstackProfile, true);
  } finally {
    if (previousState === undefined) delete process.env.GSTACK_X_STATE_FILE;
    else process.env.GSTACK_X_STATE_FILE = previousState;
  }
});

test("keeps Chrome as the default browser for a custom profile", async () => {
  const profile = path.join(os.tmpdir(), "x-article-drafter-custom-profile");
  const options = await resolveBrowserOptions({ profileDir: profile });
  assert.equal(options.profileDir, profile);
  assert.equal(options.channel, "chrome");
  assert.equal(options.usesSharedGstackProfile, false);
});

test("refuses to open the shared profile while GStack Browser is running", async () => {
  const server = http.createServer((request, response) => {
    if (request.url === "/health") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ status: "healthy" }));
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const previousState = process.env.GSTACK_X_STATE_FILE;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "x-article-drafter-state-"));
  const stateFile = path.join(dir, "browse.json");
  const { port } = server.address();
  await fs.writeFile(stateFile, JSON.stringify({ port }), "utf8");
  process.env.GSTACK_X_STATE_FILE = stateFile;

  try {
    await assert.rejects(
      () => resolveBrowserOptions(),
      /shared GStack X browser is already running/,
    );
  } finally {
    server.close();
    if (previousState === undefined) delete process.env.GSTACK_X_STATE_FILE;
    else process.env.GSTACK_X_STATE_FILE = previousState;
  }
});

test("pastes rich HTML into a contenteditable editor", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(`
    <div id="editor" contenteditable="true"></div>
    <script>
      editor.addEventListener("paste", (event) => {
        event.preventDefault();
        document.execCommand("insertHTML", false, event.clipboardData.getData("text/html"));
      });
    </script>
  `);

  const editor = page.locator("#editor");
  await editor.click();
  await pasteHtml(editor, "<h2>Section</h2><p>A <strong>bold</strong> paragraph.</p>");

  assert.match(await editor.innerHTML(), /<h2>Section<\/h2>/);
  assert.match(await editor.innerHTML(), /<strong>bold<\/strong>/);
  await browser.close();
});

test("always appends rich HTML after existing content", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<div id="append-editor" contenteditable="true"><div data-block="true">First</div></div>',
    );
    await page.locator("#append-editor").evaluate((element) => {
      element.addEventListener("paste", (event) => {
        event.preventDefault();
        document.execCommand("insertHTML", false, event.clipboardData.getData("text/html"));
      });
      const selection = document.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    });

    const editor = page.locator("#append-editor");
    await pasteHtml(editor, "<p>Second</p>");
    assert.equal((await editor.innerText()).replace(/\s+/g, "").trim(), "FirstSecond");
  } finally {
    await browser.close();
  }
});

test("retries when the editor drops a paste event", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<div id="retry-editor" contenteditable="true"><div data-block="true">First</div></div>',
    );
    await page.locator("#retry-editor").evaluate((element) => {
      let attempts = 0;
      element.addEventListener("paste", (event) => {
        event.preventDefault();
        attempts += 1;
        if (attempts > 1) {
          document.execCommand("insertHTML", false, event.clipboardData.getData("text/html"));
        }
      });
    });

    const editor = page.locator("#retry-editor");
    await pasteHtml(editor, "<p>Second</p>");
    assert.equal((await editor.innerText()).replace(/\s+/g, ""), "FirstSecond");
  } finally {
    await browser.close();
  }
});
