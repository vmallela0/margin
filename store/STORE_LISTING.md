# Chrome Web Store — Listing Pack

Everything you paste into the Web Store Developer Dashboard. Copy fields as-is.

---

## Name

```
Margin — Calm PDF Reader
```

(32 char max. Current: 24.)

---

## Summary (short description, 132 char max)

```
A calm place to read PDFs — chapter detection, highlights, flashcards, and spaced-repetition review. 100% local, no account.
```

(124 chars.)

---

## Category

**Primary:** Productivity
**Secondary (optional):** Education

---

## Language

English (United States)

---

## Detailed Description (≤16,000 chars)

Margin turns Chrome into the PDF reader you actually want. Every PDF you open — linked from a web page, dragged in from disk, or sitting in your library — loads in a quiet, paper-grain reader built for long reading, not skimming.

**What you get**

- **Automatic chapter detection** — Margin builds a table of contents from any PDF, even scanned books and papers with no embedded outline. Jump between chapters instantly.
- **Highlighting that stays out of the way** — select text, pick a color, add a note. Highlights live in the right-side rail with inline threads for your comments.
- **Flashcards from highlights** — press F on a selection to create a front/back card. Cards are scheduled with the SM-2 spaced-repetition algorithm, like Anki.
- **A real library** — every PDF you open is saved. Shelves, pins, search across titles and highlights.
- **Format support** — PDF, DOCX, EPUB, Markdown, TXT, HTML, and RTF files are converted to PDF on ingest so the reader stays focused.
- **Calm design** — paper-grain background, Source Serif type, three themes (day, paper, night).
- **Keyboard-first** — ⌘K command palette, H to highlight, F for flashcard, ⌘. to toggle the rail, / to search.

**Privacy**

Nothing leaves your computer. No accounts, no sync, no telemetry, no ads. Margin uses Chrome's local storage for your library, highlights, and settings. Uninstall and it's all gone.

**Why it exists**

Most PDF readers treat PDFs like documents to click through. Margin treats them like books you'll come back to — with chapters that work, notes that stay organized, and spaced review so the stuff you highlight actually sticks.

---

## Why these permissions? (for reviewer notes)

Paste this verbatim into the "Single Purpose" / "Permission Justification" fields:

**Single purpose:** A calm, in-browser PDF reader with highlights, notes, and spaced-repetition review — fully local.

- **storage** — Saves the user's library, highlights, flashcards, reading positions, and settings via `chrome.storage.local` and IndexedDB. Nothing is uploaded.
- **declarativeNetRequest** — Redirects `.pdf` navigation requests to the extension's built-in reader so users can annotate them. One static redirect rule; no network observation.
- **contextMenus** — Adds "Open in Margin" to the right-click menu for `.pdf` links, and an "Open Margin library" item to the action button.
- **tabs** — Opens the reader or library in a new tab when the user clicks a PDF link or the extension icon.
- **host_permissions: `<all_urls>`** — Required so the PDF-redirect DNR rule matches PDF URLs on any website. The extension does not inspect page content, inject scripts, or fetch non-PDF data from these hosts.
- **Remote code:** None. All code is bundled at build time; no eval, no external script loads.

---

## Screenshots checklist (≥1, up to 5, 1280×800 or 640×400)

Required: at least one 1280×800 PNG/JPEG. Take these against a real book (e.g. a freely redistributable PDF like a SICP chapter or a Project Gutenberg book).

1. **Reader with rail open, highlight visible** — shows the main reading experience.
2. **Command palette (⌘K)** — shows keyboard-first UX.
3. **Library view** — shelves, covers, recent reads.
4. **Flashcard review** — shows the SM-2 review flow.
5. **Settings with custom colors** — shows personalization.

Dump raw screenshots into `store/screenshots/` before upload.

---

## Promotional tiles (optional but recommended)

| Size | Purpose | Required? |
|---|---|---|
| 440×280 | Small promo tile (featured lists) | Recommended |
| 920×680 | Large promo tile | Optional |
| 1400×560 | Marquee promo tile | Optional |

---

## Privacy disclosures (filled in Dashboard)

- **Data handling:** "This extension does NOT handle the following user data:" → check nothing; everything is handled locally.
- **Under "Data usage":** select "I do not collect, use, or share user data."
- **Privacy policy URL:** host `PRIVACY.md` somewhere public (GitHub Pages is fine). Example target: `https://<username>.github.io/margin/privacy.html`.

---

## Submission checklist

- [ ] `margin-v1.0.0.zip` built from `dist/` (see `scripts/package.sh`)
- [ ] Icons 16/32/48/128 in the zip
- [ ] Version in `manifest.json` matches zip filename
- [ ] ≥1 screenshot at 1280×800
- [ ] 128×128 store icon uploaded
- [ ] Privacy policy URL live and pointing at the contents of `PRIVACY.md`
- [ ] "Single purpose" and permission justification text pasted into dashboard
- [ ] Tested: load unpacked build, open a PDF, highlight, make a card, review
