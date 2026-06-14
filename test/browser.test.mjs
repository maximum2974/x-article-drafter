import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { pasteHtml } from "../src/browser.mjs";

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
