# Margin

A Chrome extension for reading PDFs the way they deserve to be read — highlights, flashcards, spaced repetition, and automatic chapter navigation. No backend. No accounts. Fully offline.

---

## What It Is

Margin intercepts every PDF you open in Chrome and loads it in a custom reader. You get:

- **Chapter detection** — automatically extracts a table of contents from any PDF, even scanned books with no embedded outline
- **Highlights** — select text, pick a color, add a note
- **Flashcards** — create front/back cards from highlights, reviewed via SM-2 spaced repetition
- **Library** — all your books in one place, with shelves and pins
- **Format support** — PDF, DOCX, EPUB, Markdown, TXT, HTML, RTF all normalized to PDF on ingest

---

## Stack

| Layer | Tech |
|---|---|
| Runtime | Bun |
| UI | React 18, TypeScript |
| PDF rendering | pdfjs-dist 4.7 (legacy build) |
| Storage | chrome.storage.local + IndexedDB (blobs) |
| Format conversion | mammoth (DOCX), JSZip (EPUB), marked (MD), jsPDF (output) |
| Spaced repetition | SM-2 (implemented in `src/lib/sm2.ts`) |
| Build | `build.ts` (Bun-native, no webpack/vite) |

---

## Project Layout

```
margin/
├── src/
│   ├── background.ts              # Service worker: PDF interception, context menus
│   ├── reader.tsx                 # Entry point — PDF reader UI
│   ├── newtab.tsx                 # Entry point — library / new-tab override
│   ├── globals.d.ts               # Global TypeScript declarations
│   │
│   ├── components/
│   │   ├── Reader.tsx             # Main reader: loads PDF, owns state, coordinates children
│   │   ├── PdfPage.tsx            # Single-page canvas renderer + text selection + highlights
│   │   ├── Library.tsx            # Book collection: list/grid, add/delete/search/shelve
│   │   ├── ChapterSidebar.tsx     # Table of contents panel, tracks current page
│   │   ├── ChapterThread.tsx      # Visual timeline bar of chapter boundaries
│   │   ├── ChapterSummary.tsx     # Highlights from the current chapter, quick reference
│   │   ├── Rail.tsx               # Right sidebar: chapters, highlights, flashcard tabs
│   │   ├── HighlightPopover.tsx   # Highlight creation / edit / delete popover
│   │   ├── FlashcardCreate.tsx    # Card creation dialog (linked to highlight or standalone)
│   │   ├── Review.tsx             # SM-2 flashcard review: again / hard / good / easy
│   │   ├── CommandPalette.tsx     # Cmd+P overlay: jump to page, search, settings
│   │   ├── CrossBookSearch.tsx    # Full-text search across all highlight text
│   │   ├── Settings.tsx           # Theme, font, size, column width, custom highlight colors
│   │   ├── Shortcuts.tsx          # Keyboard shortcut reference modal
│   │   └── ThemeRoot.tsx          # Loads settings → injects CSS custom properties
│   │
│   └── lib/
│       ├── types.ts               # Book, Highlight, Flashcard, Settings, Color types
│       ├── pdf.ts                 # PDF.js wrapper + chapter detection engine (1000+ lines)
│       ├── storage.ts             # chrome.storage CRUD + reactive subscriptions
│       ├── ingest.ts              # File → PDF normalization pipeline
│       ├── sm2.ts                 # SM-2 spaced repetition scheduler
│       ├── blobs.ts               # IndexedDB put/get/delete for PDF blobs
│       ├── colors.ts              # Resolve highlight color (built-in + custom)
│       ├── cover.ts               # Canvas-based book cover generator
│       ├── hash.ts                # SHA-256, random ID
│       └── useStore.ts            # React hook — reactive storage subscriptions
│
├── test/
│   ├── harness.ts                 # Chapter detection test runner (see Testing section)
│   ├── corpus.ts                  # 70+ PDF URLs with category + name metadata
│   ├── corpus/                    # Downloaded PDFs (git-ignored) + *.expected.json
│   ├── fixtures/                  # Small synthetic test PDFs + *.expected.json
│   ├── generate-fixtures.ts       # Builds synthetic test PDFs
│   └── pull-corpus.ts             # Downloads corpus PDFs, extracts embedded outlines
│
├── build.ts                       # Bun build script (no webpack)
├── manifest.json                  # Chrome MV3 manifest
├── package.json
└── tsconfig.json
```

---

## Getting Started

```bash
# Install dependencies
bun install

# Development build with auto-reload
bun run dev

# Production build
bun run build
```

Then load `dist/` as an unpacked extension in `chrome://extensions`.

The dev build injects a reload script that polls `dist/version.txt` every 800ms and reloads the extension on change — no manual reload needed.

---

## How Chapter Detection Works

This is the core hard problem in Margin. PDFs have no guaranteed structure, so the detector uses three independent paths and merges them.

**Entry point**: `detectChaptersFromText(pdf)` in `src/lib/pdf.ts`

### Pre-processing

1. **Snapshot** — `snapshotPdf()` extracts all text with position + font data in parallel (8-thread worker pool). Builds `PageSnap[]`, each containing `LineAgg[]` (Y-grouped text items).
2. **Body metrics** — `dominantBodySize()` finds the median font size weighted by character count. `dominantBodyFontId()` finds the most common font ID.
3. **Running headers** — `detectRunningHeaders()` identifies text that repeats in the top/bottom 12% of many pages (chapter name reprinted at page top, etc.) and excludes it from all paths.
4. **TOC pages** — `detectTocPages()` flags pages with ≥4 dotted-leader lines OR ≥3 "Chapter X" lines (synopsis TOCs). These pages are excluded before any path runs.

### Path A — Font Cluster

Best for: academic papers, modern styled books with distinct heading fonts.

`collectHeadingCandidates()` → `rankHeadingStyles()` → `emitChapters()`

- Gathers lines in the top 45% of each page that are larger or different-font than body.
- Groups them by `size|fontId` style key.
- Scores styles by how many pages they appear on, how evenly distributed they are, and whether the style looks like a heading (bold indicator, significant size bump).
- Top-ranked styles get promoted to chapters; lower-ranked become sub-sections.

### Path B — Page Scorer

Best for: classic novels, books where the chapter heading shares the body font but is marked by whitespace + centering.

`scoreChapterPages()`

- Finds the first meaningful content line of each page.
- Scores it on: whitespace above (top gap vs. median), font size relative to body, font difference, isolation below (gap to next line), text length, centering, CHAPTER/Roman numeral patterns.
- Requires `structural ≥ 2` (at least 2 hard signals) + `score ≥ 4` to pass. Gate prevents plain body text from being scored as a chapter.

### Path C — Numbered Section Scanner

Best for: papers, technical textbooks, manuals that run sections inline.

`scanNumberedSections()`

- Scans every line on every page for patterns:
  - `NUMBERED_HEADING_RE`: `^([1-9]\d?(?:\.\d{1,2}){0,2})\s+([A-Z]...)` — "1 Introduction", "4.2 Applying LoRA"
  - `APPENDIX_HEADING_RE`: `^([A-Z](?:\.\d{1,2}){1,2})\s+...` — "A.1 Details"
  - `ALLCAPS_APPENDIX_HEADING_RE`: `^([A-Z])\s+([A-Z]{2,}...)` — "A BASELINE DETAILS"
  - `NAMED_CHAPTER_RE`: `^(chapter|book|part|volume|section)\s+([IVXLCDM]+|\d+)...` — "Chapter II", "Part 3"
- Rejects: running headers, TOC entries (dotted leaders, trailing page numbers), figure/table captions, dates, problem numbers (sub-section component > 20), garbled formulas.
- Requires: size bump OR different font OR bold OR small-caps spacing pattern.

### Merge

`mergeAllSources()` unions all three paths with:

- **Conflict resolution**: same-level entries within 2 pages → keep highest-confidence source (cluster > scored > numbered).
- **Same-page dedup**: keeps only the better-level match.
- **Windowed title dedup**: identical titles within 8 pages → deduplicated (war-and-peace "Chapter I" × 4 books = 4 valid entries 100 pages apart; same chapter bleeding 2 pages = 1 entry).

### Quality Filters (applied in all paths)

| Filter | Rejects |
|---|---|
| Figure/table guard | Titles starting with "Figure", "Table", "Algorithm", "Fig.", etc. |
| Short title | Titles < 3 chars, unless a pure Roman numeral that is centered |
| Word-token guard | No 3+ consecutive alpha chars (catches garbled formulas like "n(nJk") |
| Density guard | < 55% alphanumeric chars in title > 10 chars (catches "18 Th bb·f cxp(-μ))") |
| Date guard | "17 April 2011" style numbered dates |
| Problem number cap | Sub-section component > 20 (rejects "4.28 Exercise") |
| Boilerplate | "First Edition", "Made in the USA", "All rights reserved" |

---

## Data Model

All types in `src/lib/types.ts`. Stored in `chrome.storage.local`.

```
margin:books              → Book[]
margin:highlights:{id}    → Highlight[]   (per-book)
margin:flashcards         → Flashcard[]   (global)
margin:settings           → Settings
```

**Book**: `{ id, title, source: {kind:"url"|"blob", ...}, addedAt, lastPage, totalPages, shelf, pinned, coverVariant }`

**Highlight**: `{ id, bookId, page, rects: Rect[], color, text, note?, createdAt }`

**Flashcard**: `{ id, bookId, page, front, back, sourceHighlightId?, sm2: {easiness, interval, repetitions, dueAt}, createdAt }`

**Settings**: `{ theme: "paper"|"sepia"|"night", font, bodySize, columnWidth, flow: "reflow"|"paginated", accent, colorMeanings, customColors }`

Large PDF blobs are stored separately in IndexedDB via `src/lib/blobs.ts` (put/get/delete keyed by book ID).

---

## Testing

The harness runs chapter detection against real and synthetic PDFs and scores the output against ground truth.

```bash
bun test/harness.ts                   # synthetic fixtures only (fast)
bun test/harness.ts --corpus          # real downloaded PDFs
bun test/harness.ts --all             # both
bun test/harness.ts --only paper-lora # single fixture
bun test/harness.ts --verbose         # show per-chapter diff on failures
```

Before running corpus tests, download the PDFs:

```bash
bun test/pull-corpus.ts
```

### Corpus Coverage

70 PDFs across 15+ categories: papers (GPT-3, BERT, LoRA, AlphaFold, Attention, ResNet, ViT, Diffusion, LLaMA, RLHF), novels (War & Peace, Moby Dick, Dracula, Jane Eyre, etc.), textbooks (Think Python/Stats/OS/Bayes/DSP), manuals (Bash, gawk, make, gdb, Emacs), legal (US Code, Constitution), religious (KJV Bible), non-English (French, Spanish, German, Chinese, Japanese, Russian, Arabic), government reports (IRS 1040, 9/11 Commission), medicine (OpenStax Anatomy/Microbiology).

### Scoring

For each fixture, the harness:

1. Detects chapters using `detectChaptersFromText`.
2. Picks the expected-outline level (0=parts, 1=chapters, 2=sections) that maximizes F1 — so detecting chapter-level granularity isn't penalized for missing sub-section starts.
3. Scores precision against **all** outline levels combined — a correctly detected sub-section doesn't count as an "extra" even if the best graded level is chapters only.
4. Title matching: normalized, squashed (drop whitespace for small-caps artifacts), token overlap, word-boundary substring.

**Pass threshold**: `recall ≥ 0.70` AND `precision ≥ 0.50` AND `titleRate ≥ 0.50`

**Current results**: 41 passed / 2 failed / 7 skipped (no ground truth)

The 2 permanent failures are structurally hard cases: IRS 1040 form (338-entry tax form with multi-column layout) and a Nature 2-column micro-paper with tiny inline headings.

---

## Extension Architecture

```
chrome.declarativeNetRequest
  └── *.pdf URLs → reader.html?src={encoded-url}

chrome.contextMenus
  ├── "Open in Margin" (PDF links) → new tab → reader.html?src={url}
  └── "Open Margin library"        → new tab → newtab.html

chrome.action.onClicked
  └── opens newtab.html

reader.html
  └── Reader.tsx
        ├── loads PDF (pdf.ts loadFromUrl / loadFromBlob)
        ├── detectChaptersFromText() → ChapterSidebar, ChapterThread
        ├── PdfPage.tsx × N         ← canvas render + selection
        ├── Rail.tsx                 ← highlights, flashcards, chapters
        └── HighlightPopover.tsx    ← text selection → create highlight

newtab.html
  └── Library.tsx
        ├── list books from storage
        ├── open PDF file → ingest.ts normalizeToPdf() → blobs.ts putBlob()
        └── click book → reader.html?src=blob:{id}
```

---

## Adding New Test Cases

1. Add an entry to `test/corpus.ts`:
   ```ts
   { name: "my-new-pdf", url: "https://...", category: "textbook" }
   ```

2. Run `bun test/pull-corpus.ts` to download it and extract its embedded outline as ground truth.

3. If the PDF has no embedded outline, hand-write `test/corpus/my-new-pdf.expected.json`:
   ```json
   {
     "description": "textbook: My Book Title",
     "category": "textbook",
     "source": "hand",
     "chapters": [
       { "title": "Chapter 1 Introduction", "page": 5, "level": 0 },
       { "title": "1.1 Background",         "page": 7, "level": 1 }
     ]
   }
   ```

4. Run `bun test/harness.ts --only my-new-pdf --verbose` to iterate.

---

## Known Limitations

- **Two-column academic papers** (Nature, many IEEE): section headings are too small/fragmented for reliable detection.
- **Form-heavy government documents** (IRS 1040, regulatory filings): layout breaks all three detection paths.
- **Scanned PDFs with no text layer**: no text = no detection. Would need OCR pre-processing.
- **Right-to-left scripts**: Arabic/Hebrew ordering not handled — RTL PDFs may have garbled line aggregation.

---

## Key Files for Common Tasks

| Task | File(s) |
|---|---|
| Improve chapter detection | `src/lib/pdf.ts` → `detectChaptersFromText` and its helpers |
| Add a new file format | `src/lib/ingest.ts` → add converter, update `ACCEPT_ATTR` |
| Change storage schema | `src/lib/types.ts` + `src/lib/storage.ts` (add migration if needed) |
| Add a new highlight color | `src/lib/types.ts` → `BUILTIN_COLORS`, `src/lib/colors.ts` |
| Modify SM-2 scheduling | `src/lib/sm2.ts` |
| Change reader layout/UI | `src/components/Reader.tsx` + `src/styles/reader.css` |
| Change library UI | `src/components/Library.tsx` + `src/styles/newtab.css` |
| Change keyboard shortcuts | `src/components/CommandPalette.tsx`, `src/components/Shortcuts.tsx` |
| Modify build pipeline | `build.ts` |
| Add corpus test PDF | `test/corpus.ts` → `bun test/pull-corpus.ts` → `bun test/harness.ts` |
