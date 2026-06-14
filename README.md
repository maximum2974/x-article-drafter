<div align="center">

# x-article-drafter

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen)](https://nodejs.org)
[![Playwright](https://img.shields.io/badge/Playwright-latest-blue)](https://playwright.dev)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**English** | [中文](README.zh-CN.md)

</div>

Convert a local Markdown file into an **X Article cloud draft** through a visible, persistent browser session.

> **The tool never publishes. It only creates or updates drafts.**

---

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands](#commands)
- [Markdown Format](#markdown-format)
- [Options Reference](#options-reference)
- [How It Works](#how-it-works)
- [Troubleshooting](#troubleshooting)

---

## Features

- **`check`** — validate your Markdown and preview the parsed structure without opening a browser
- **`preview`** — render a styled local HTML file that matches how the article will look on X
- **`draft`** — create a new X Article cloud draft, or update an existing one; never publishes
- Persistent browser profile — stays logged in across runs, no repeated logins
- Automatic cover image upload and inline body image insertion
- Post-save verification confirms that all text segments and images were applied correctly

---

## Requirements

| Requirement | Version |
|---|---|
| Node.js | 18 or later |
| Google Chrome | Latest (recommended) |
| Chromium | Accepted alternative |
| X account | Must have [X Articles](https://x.com/compose/articles) access |

> X Articles is only available to qualifying accounts (verified or with sufficient followers). Check whether your account can access `x.com/compose/articles` before using this tool.

---

## Installation

```bash
git clone https://github.com/YOUR_USERNAME/x-article-drafter.git
cd x-article-drafter
npm install
npm link
```

After `npm link`, the `x-article-drafter` command is available globally in your shell.

---

## Quick Start

```bash
# 1. Validate your Markdown (no browser opened)
x-article-drafter check my-article.md

# 2. Preview locally in a browser
x-article-drafter preview my-article.md
open my-article.md.preview.html

# 3. Push to X as a cloud draft
x-article-drafter draft my-article.md
```

---

## Commands

### `check` — Validate only

```bash
x-article-drafter check <article.md>
```

Parses the Markdown and prints a summary of the title, cover, block count, and image count. No browser is opened. Use this to catch formatting errors before running `draft`.

Example output:

```
Title: My Article Title
Cover: /path/to/cover.jpg
Body blocks: 12
Body images: 3
Editor segments: 5
```

---

### `preview` — Local HTML preview

```bash
x-article-drafter preview <article.md> [--output <preview.html>]
```

Generates a styled HTML file that closely mirrors the X Article layout. Open it in any browser to review the article before sending it to X.

- Default output: `<article>.preview.html` (next to the source file)
- Use `--output` to write to a custom path

---

### `draft` — Create or update an X Article draft

```bash
# Create a new draft
x-article-drafter draft <article.md>

# Update an existing draft by ID
x-article-drafter draft <article.md> --draft 1234567890

# Update an existing draft by URL
x-article-drafter draft <article.md> --draft https://x.com/compose/articles/edit/1234567890
```

This command:

1. Opens Chrome with a persistent profile
2. Navigates to `x.com/compose/articles`
3. Creates or opens the specified draft
4. Fills in the title, uploads the cover image, pastes the body content, and inserts all body images
5. Waits for X's autosave
6. Verifies that all content was inserted correctly
7. Keeps the browser open so you can review and publish manually

After the draft is created you will see:

```
Draft created: My Article Title
Editor URL: https://x.com/compose/articles/edit/1234567890
The tool did not publish the article.
The browser will stay open for manual edits. Press Enter to close it...
```

**First-run login**

The first time you run `draft`, X's login page may appear. Log in manually in the browser window, then press Enter in the terminal. Your session is saved to `~/.x-article-drafter/chrome-profile` and reused on all future runs.

---

## Markdown Format

### Frontmatter (optional)

Place YAML frontmatter at the very top of the file:

```markdown
---
title: My Article Title
cover: ./images/cover.jpg
cover_alt: A description of the cover image
---
```

| Key | Description |
|---|---|
| `title` | Article title (use this or an `# H1` heading, not both) |
| `cover` | Relative path to the cover image file |
| `cover_alt` | Alt text for the cover image |

### Document structure

```markdown
![Cover image](./cover.jpg)

# Article Title

Introduction paragraph with **bold**, _italic_, and [links](https://example.com).

## Section One

Body paragraph text.

> A single-paragraph blockquote.

- Unordered item one
- Unordered item two

1. Ordered item one
2. Ordered item two

\`\`\`javascript
const greeting = "Hello, X!";
console.log(greeting);
\`\`\`

---

![Body image](./images/photo.jpg)

## Section Two

More content here.
```

### Supported and unsupported blocks

| Block type | Support |
|---|---|
| `# H1` — article title (one per file, before body) | ✅ |
| `## H2` — section heading | ✅ |
| Paragraphs (inline bold, italic, links, code) | ✅ |
| Flat unordered lists | ✅ |
| Flat ordered lists | ✅ |
| Single-paragraph blockquotes | ✅ |
| Fenced code blocks (with language hint) | ✅ |
| Horizontal dividers (`---`) | ✅ |
| Local images on their own line | ✅ |
| `### H3` and deeper headings | ❌ |
| Raw HTML | ❌ |
| Markdown tables | ❌ |
| Task lists (`- [ ] item`) | ❌ |
| Nested lists | ❌ |
| Remote images (`https://...`) | ❌ |
| Inline images mixed with text | ❌ |

**Cover image rules**

- Place a standalone image (`![alt](path)`) *before* the `# H1` heading — it becomes the cover.
- Alternatively, set `cover: path` in frontmatter.
- Only local image files are supported. Download remote images beside the Markdown file first.

**Validation errors are hard failures.** Unsupported blocks cause the tool to exit with a clear message instead of silently dropping content.

---

## Options Reference

### `draft` options

| Option | Description | Default |
|---|---|---|
| `--draft <id-or-url>` | Update an existing draft by numeric ID or full edit URL | Creates a new draft |
| `--profile <dir>` | Path to a custom browser profile directory | `~/.x-article-drafter/chrome-profile` |
| `--browser chrome\|chromium` | Browser channel to launch | `chrome` |
| `--close` | Close the browser automatically after the draft is saved | Browser stays open |

### `preview` options

| Option | Description | Default |
|---|---|---|
| `--output <path>` | Output file path for the generated HTML | `<article>.preview.html` |

---

## How It Works

```
Markdown file
     │
     ▼
┌─────────────┐    MarkdownValidationError
│   Parser    │ ──────────────────────────▶ exit 1
│ (markdown)  │
└─────────────┘
     │ article object
     ▼
┌─────────────┐
│   Renderer  │ ──▶ HTML segments + image placeholders
│  (render)   │
└─────────────┘
     │
     ▼
┌─────────────┐
│   Browser   │ ──▶ Playwright (persistent Chrome profile)
│  (browser)  │         │
└─────────────┘         ├── Fill title
                        ├── Upload cover image
                        ├── Paste body HTML
                        ├── Replace image placeholders with uploads
                        ├── Wait for autosave
                        └── Verify all segments present
```

1. **Parse** — reads the Markdown file, extracts frontmatter, tokenizes the body, and validates every block against the supported set.
2. **Render** — converts blocks to HTML segments; images become unique placeholder tokens so they can be located and replaced in the editor.
3. **Launch** — opens a non-headless Chrome window with a persistent profile so you can see exactly what is happening.
4. **Login** — polls for X logged-in UI surfaces; if none are found within 10 seconds, prompts you to log in manually.
5. **Fill** — types the title, clicks the cover upload button, pastes the body HTML via a synthetic clipboard event, then iterates over images in reverse order to upload each one in place of its placeholder.
6. **Verify** — after autosave, scans the editor DOM to confirm every text segment and image count matches expectations.
7. **Hand off** — prints the draft URL and waits for you to press Enter before closing the browser.

---

## Troubleshooting

**An `x-article-drafter-error.png` file appeared**

When the tool encounters an unexpected error, it captures a full-page screenshot and saves it as `x-article-drafter-error.png` in your working directory. Open it to see exactly what the browser showed at the time of failure.

**"X Article editor selectors changed or the editor did not load within 30 seconds"**

X occasionally updates its editor UI, which can break the element selectors. If this happens, please open an issue and attach the error screenshot.

**"X login was not detected"**

Make sure you completed the login flow in the browser window and that the X Articles page is fully loaded before pressing Enter in the terminal.

**`Invalid Markdown: ...`**

Your Markdown file uses a block type that X Articles does not support. Read the error message — it includes the block number and type — then refer to the [supported blocks table](#supported-and-unsupported-blocks).

**The browser opens but nothing is typed**

This usually means Chrome is already running with the same profile. Close all Chrome windows that use the default profile, or pass `--profile` to use a separate directory.
