import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

// In the extension runtime, resolve the worker via chrome.runtime. When this
// module is imported from a test harness running under Bun/Node, the harness
// sets workerSrc to a filesystem path before loading any PDF.
if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
  pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.mjs");
}

export async function loadFromUrl(url: string): Promise<PDFDocumentProxy> {
  return pdfjs.getDocument({ url, withCredentials: false, isEvalSupported: false }).promise;
}

export async function loadFromBlob(blob: Blob): Promise<PDFDocumentProxy> {
  const data = await blob.arrayBuffer();
  return pdfjs.getDocument({ data, isEvalSupported: false }).promise;
}

export interface OutlineItem {
  title: string;
  page?: number;
  level: number;
  children: OutlineItem[];
}

export async function flattenOutline(pdf: PDFDocumentProxy): Promise<OutlineItem[]> {
  const raw = await pdf.getOutline();
  if (!raw) return [];

  async function destPage(dest: unknown): Promise<number | undefined> {
    if (!dest) return undefined;
    try {
      const resolved: unknown = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
      if (!Array.isArray(resolved)) return undefined;
      const ref = resolved[0];
      if (ref && typeof ref === "object") {
        const idx = await pdf.getPageIndex(ref as never);
        return idx + 1;
      }
    } catch {}
    return undefined;
  }

  async function walk(nodes: any[], level: number): Promise<OutlineItem[]> {
    const out: OutlineItem[] = [];
    for (const n of nodes) {
      out.push({
        title: n.title,
        page: await destPage(n.dest),
        level,
        children: n.items?.length ? await walk(n.items, level + 1) : [],
      });
    }
    return out;
  }

  return walk(raw, 0);
}

export function flattenOutlinePages(items: OutlineItem[]): { page: number; title: string; level: number }[] {
  const out: { page: number; title: string; level: number }[] = [];
  const visit = (list: OutlineItem[]) => {
    for (const it of list) {
      if (it.page) out.push({ page: it.page, title: it.title, level: it.level });
      if (it.children.length) visit(it.children);
    }
  };
  visit(items);
  return out.sort((a, b) => a.page - b.page);
}

export async function pageTextContent(page: PDFPageProxy) {
  return page.getTextContent();
}

// Extracts the human-readable title of a PDF. Tries metadata first; falls back
// to scanning the largest text on page 1. Returns null if nothing reliable is
// found. Useful for giving arxiv papers (where the URL is just a number) a
// proper display name.
export async function extractPdfTitle(doc: PDFDocumentProxy): Promise<string | null> {
  try {
    const meta = await (doc as any).getMetadata();
    const t = ((meta?.info?.Title ?? meta?.info?.title ?? "") as string).trim();
    // Accept metadata title if it's non-trivial and not a bare arxiv ID / number
    if (t.length > 4 && !/^\d[\d.]*$/.test(t) && !/^untitled/i.test(t)) return t;
  } catch {}

  // Scan page 1 for the largest text — almost always the paper title on
  // academic PDFs. Only look in the top 70% of the page so we skip footers.
  try {
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const bottomCutoff = vp.height * 0.30; // PDF y=0 is bottom; skip bottom 30%

    const items = (content.items as any[])
      .filter((it) => it.str?.trim().length > 0 && (it.transform?.[5] ?? 0) > bottomCutoff && it.height > 0)
      .map((it) => ({ str: (it.str as string).trim(), h: it.height as number, y: it.transform[5] as number }));

    if (!items.length) return null;

    const maxH = Math.max(...items.map((it) => it.h));
    // Grab items whose font size is ≥70% of the maximum — these are title-sized
    const titleItems = items
      .filter((it) => it.h >= maxH * 0.7)
      .sort((a, b) => b.y - a.y); // top of page first (high y = near top in PDF coords)

    if (!titleItems.length) return null;

    const title = titleItems.map((it) => it.str).join(" ").replace(/\s+/g, " ").trim();
    if (title.length < 4 || title.length > 300) return null;
    // Reject if it looks like a number-only arxiv ID or garbled
    if (!/[A-Za-z]{3,}/.test(title)) return null;

    return title;
  } catch {}

  return null;
}

// -----------------------------------------------------------------------------
// Chapter detection.
//
// We use font-metric clustering, the same signal a human uses when skimming a
// PDF: headings are visually distinct — larger, usually near the top of a
// page, often in a different font. The algorithm:
//   1. Snapshot every page: each text item's (x, y, font-size, font-id).
//   2. Line-group items so each line has an aggregate size + font-id.
//   3. Find the dominant *body* font size (the size with the most characters).
//   4. For every page, collect "big" lines near the top of the page as
//      heading candidates.
//   5. Group candidates by (size-bucket, font-id). Score each group by
//      page coverage + distribution; heading styles that appear once or
//      only in front matter lose. Keep the top 1-2 styles.
//   6. Emit one entry per page for the kept styles, with an optional
//      subtitle line appended. Levels come from size order (bigger = part,
//      smaller = chapter).
//
// No regex is required for this to work. Regex patterns ("Chapter N",
// "Part N") are still consulted as a tie-breaker when styles are ambiguous.
// -----------------------------------------------------------------------------

interface RawItem { str: string; transform: number[]; fontName?: string; height?: number; width?: number }

interface TextItemEx {
  str: string;
  x: number;       // PDF user-space x (from left)
  y: number;       // PDF user-space y (from bottom)
  size: number;    // font size in PDF units
  fontId: string;
  width: number;   // rendered width in PDF units
}

interface LineAgg {
  y: number;
  text: string;
  size: number;
  fontId: string;
  xStart: number;
  xEnd: number;
}

interface PageSnap {
  pageNum: number;
  pageWidth: number;
  pageHeight: number;
  lines: LineAgg[];
}

const CHAPTER_MARKER_RE = /^(chapter|ch\.?|part|book|section|volume|prologue|epilogue|introduction|foreword|preface|appendix)\b/i;
const ROMAN_RE = /^[IVXLCDM]{1,7}\.?$/i;
const ARABIC_RE = /^\d{1,3}\.?$/;

export async function detectChaptersFromText(pdf: PDFDocumentProxy): Promise<OutlineItem[]> {
  const rawSnaps = await snapshotPdf(pdf);
  const bodySize = dominantBodySize(rawSnaps);
  const bodyFontId = dominantBodyFontId(rawSnaps);

  // Flag TOC pages (many dotted-leader lines) and strip them from all paths.
  // Otherwise we spam detection with TOC entries that look identical to real
  // headings font-wise.
  const tocPages = detectTocPages(rawSnaps);
  const snaps = rawSnaps.filter((s) => !tocPages.has(s.pageNum));

  // Running headers/footers first — used to filter candidates across paths.
  const runningHeaders = detectRunningHeaders(snaps);

  // Path A — font-cluster ranking (great for papers, styled modern books with
  // distinct heading fonts).
  const candidatesRaw = collectHeadingCandidates(snaps, bodySize);
  const candidates = candidatesRaw.filter((c) => !runningHeaders.has(normalizeHeaderKey(c.text)));
  const styles = rankHeadingStyles(candidates, pdf.numPages);
  const clusterChapters = emitChapters(candidates, snaps, styles);

  // Path B — multi-signal page scorer (great for classic books / novels where
  // the chapter opening shares the body font but is marked by whitespace +
  // centering + short line). Always compute both, then union.
  const scoredChapters = scoreChapterPages(snaps, bodySize, bodyFontId, runningHeaders);

  // Path C — numbered-section scanner. Finds headings like "1 Introduction",
  // "4.2 Applying LoRA", "A.1 Appendix" anywhere on a page (not just at the
  // top). Essential for academic papers and dense textbooks/manuals that
  // run sections inline rather than starting each on a new page.
  const numberedChapters = scanNumberedSections(snaps, bodySize, bodyFontId, runningHeaders);

  // Merge paths. Priority order when present: cluster > scored > numbered,
  // but if one path has many more entries we switch to it. Collisions
  // within 2 pages are deduped.
  const merged = mergeAllSources(clusterChapters, scoredChapters, numberedChapters);

  // eslint-disable-next-line no-console
  console.log("[margin] chapter detect", {
    numPages: pdf.numPages,
    bodySize,
    bodyFontId,
    cluster: clusterChapters.length,
    scored: scoredChapters.length,
    numbered: numberedChapters.length,
    final: merged.length,
    runningHeaders: [...runningHeaders].slice(0, 3),
    chapters: merged.slice(0, 20).map((c) => ({ title: c.title, page: c.page, level: c.level })),
  });

  return merged;
}

async function snapshotPdf(pdf: PDFDocumentProxy): Promise<PageSnap[]> {
  const total = pdf.numPages;
  const snaps: PageSnap[] = new Array(total);
  // Worker-pool to parallelize getPage + getTextContent across the pdf.js
  // worker. Concurrency ≈ 8 is the sweet spot — the worker thread queues
  // anyway, and too-large values add overhead without speeding things up.
  const concurrency = Math.min(8, total);
  let next = 0;

  async function worker() {
    while (true) {
      const idx = next++;
      if (idx >= total) return;
      const pageNum = idx + 1;
      const page = await pdf.getPage(pageNum);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: TextItemEx[] = [];
      for (const raw of content.items as unknown as RawItem[]) {
        if (!raw?.str || !raw.str.trim()) continue;
        const t = raw.transform ?? [];
        const x = t[4] ?? 0;
        const y = t[5] ?? 0;
        const size = Math.abs(t[3] ?? raw.height ?? 12) || 12;
        const width = raw.width ?? raw.str.length * size * 0.5;
        items.push({ str: raw.str, x, y, size, fontId: String(raw.fontName ?? ""), width });
      }
      snaps[idx] = {
        pageNum,
        pageWidth: vp.width,
        pageHeight: vp.height,
        lines: aggregateLines(items),
      };
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return snaps;
}

function aggregateLines(items: TextItemEx[]): LineAgg[] {
  // Group by Y with ±2pt tolerance. Use rounded bucket.
  const buckets = new Map<number, TextItemEx[]>();
  for (const it of items) {
    const key = Math.round(it.y / 2) * 2;
    const arr = buckets.get(key) ?? [];
    arr.push(it);
    buckets.set(key, arr);
  }

  const rows: LineAgg[] = [];
  for (const [y, arr] of buckets) {
    arr.sort((a, b) => a.x - b.x);
    const text = arr.map((x) => x.str).join(" ").replace(/\s+/g, " ").trim();
    if (!text) continue;

    const totalLen = arr.reduce((s, x) => s + x.str.length, 0) || 1;
    const size = arr.reduce((s, x) => s + x.size * x.str.length, 0) / totalLen;
    // Mode font id (by character count).
    const counts = new Map<string, number>();
    for (const it of arr) counts.set(it.fontId, (counts.get(it.fontId) ?? 0) + it.str.length);
    let fontId = "";
    let best = 0;
    for (const [k, c] of counts) if (c > best) { best = c; fontId = k; }
    const xStart = arr[0]?.x ?? 0;
    const last = arr[arr.length - 1];
    const xEnd = (last?.x ?? 0) + (last?.width ?? 0);

    rows.push({ y, text, size, fontId, xStart, xEnd });
  }

  // Top-to-bottom (PDF y decreases downward — but user-space y is from bottom,
  // so a larger y is higher on the page; sort descending).
  rows.sort((a, b) => b.y - a.y);
  return rows;
}

function dominantBodySize(snaps: PageSnap[]): number {
  const counts = new Map<number, number>();
  for (const snap of snaps) {
    for (const line of snap.lines) {
      const k = Math.round(line.size);
      counts.set(k, (counts.get(k) ?? 0) + line.text.length);
    }
  }
  let best = 12;
  let bestC = 0;
  for (const [k, c] of counts) if (c > bestC) { best = k; bestC = c; }
  return best;
}

interface HeadingCandidate {
  pageNum: number;
  text: string;
  size: number;
  sizeKey: number;
  fontId: string;
  lineIdx: number;
  yFromTop: number; // 0 = top of page
  hasMarker: boolean;
  isCentered: boolean;
}

function collectHeadingCandidates(snaps: PageSnap[], bodySize: number): HeadingCandidate[] {
  const out: HeadingCandidate[] = [];
  const MIN_SIZE_RATIO = 1.18;
  for (const snap of snaps) {
    const topZone = snap.pageHeight * 0.45; // distance from page top
    const centerX = snap.pageWidth / 2;

    for (let li = 0; li < snap.lines.length && li < 10; li++) {
      const line = snap.lines[li];
      const yFromTop = snap.pageHeight - line.y;
      if (yFromTop > topZone) break; // stopped being "near top"

      if (line.text.length === 0 || line.text.length > 180) continue;
      if (line.size < bodySize * MIN_SIZE_RATIO) continue;
      // Skip obvious page numbers / running footers.
      if (/^\s*\d{1,4}\s*$/.test(line.text)) continue;

      const lineMid = (line.xStart + line.xEnd) / 2;
      const isCentered = Math.abs(lineMid - centerX) < snap.pageWidth * 0.08;

      out.push({
        pageNum: snap.pageNum,
        text: line.text,
        size: line.size,
        sizeKey: Math.round(line.size * 2) / 2,
        fontId: line.fontId,
        lineIdx: li,
        yFromTop,
        hasMarker: CHAPTER_MARKER_RE.test(line.text),
        isCentered,
      });
    }
  }
  return out;
}

function rankHeadingStyles(candidates: HeadingCandidate[], totalPages: number): Set<string> {
  const groups = new Map<string, HeadingCandidate[]>();
  for (const c of candidates) {
    const key = `${c.sizeKey}|${c.fontId}`;
    const arr = groups.get(key) ?? [];
    arr.push(c);
    groups.set(key, arr);
  }

  interface Scored { key: string; score: number; pages: number }
  const scored: Scored[] = [];
  for (const [key, arr] of groups) {
    const pagesSet = new Set(arr.map((c) => c.pageNum));
    const pageCount = pagesSet.size;
    if (pageCount < 2) continue;
    // Reject styles that match >70% of all pages — that's body or a running
    // header, not a heading.
    if (pageCount > totalPages * 0.7) continue;

    // Spread across book: pages should be roughly uniformly distributed.
    const sortedPages = [...pagesSet].sort((a, b) => a - b);
    const first = sortedPages[0];
    const last = sortedPages[sortedPages.length - 1];
    const coverage = (last - first) / Math.max(1, totalPages - 1);

    const markerBonus = arr.filter((c) => c.hasMarker).length / arr.length;
    const centeredBonus = arr.filter((c) => c.isCentered).length / arr.length;
    const sizeBonus = Math.min(2.2, arr[0].size / 12);

    const score =
      pageCount *
      (0.6 + coverage) *
      (1 + 0.6 * markerBonus) *
      (1 + 0.2 * centeredBonus) *
      sizeBonus;
    scored.push({ key, score, pages: pageCount });
  }

  scored.sort((a, b) => b.score - a.score);
  const keep = new Set<string>();
  if (scored[0]) keep.add(scored[0].key);
  // Optionally accept a second, *larger-font* style as parts / book-level
  // headings. It must be rarer than the chapter style.
  if (scored[1]) {
    const aSize = Number(scored[0].key.split("|")[0]);
    const bSize = Number(scored[1].key.split("|")[0]);
    if (
      scored[1].pages >= 2 &&
      scored[1].pages <= scored[0].pages * 0.6 &&
      bSize !== aSize
    ) {
      keep.add(scored[1].key);
    }
  }
  return keep;
}

function emitChapters(
  candidates: HeadingCandidate[],
  snaps: PageSnap[],
  styles: Set<string>,
): OutlineItem[] {
  if (styles.size === 0) return [];

  // Determine level per style: largest font = outermost (level 0).
  const sizeByStyle = new Map<string, number>();
  for (const s of styles) sizeByStyle.set(s, Number(s.split("|")[0]));
  const ordered = [...styles].sort((a, b) => sizeByStyle.get(b)! - sizeByStyle.get(a)!);
  const levelByStyle = new Map<string, number>();
  ordered.forEach((s, i) => levelByStyle.set(s, i));

  // For each page, pick the *highest-ranked* (outermost) heading present.
  interface PageHit { text: string; level: number; size: number; lineIdx: number; fontId: string }
  const perPage = new Map<number, PageHit>();
  for (const c of candidates) {
    const key = `${c.sizeKey}|${c.fontId}`;
    if (!styles.has(key)) continue;
    const level = levelByStyle.get(key) ?? 1;
    const existing = perPage.get(c.pageNum);
    if (!existing || level < existing.level) {
      perPage.set(c.pageNum, {
        text: c.text,
        level,
        size: c.size,
        lineIdx: c.lineIdx,
        fontId: c.fontId,
      });
    }
  }

  // Build titles: append a subtitle line when the next visual line is medium-
  // sized and looks title-like (short, not another heading).
  const out: OutlineItem[] = [];
  for (const [pageNum, hit] of perPage) {
    const snap = snaps[pageNum - 1];
    let title = hit.text;
    const next = snap?.lines[hit.lineIdx + 1];
    if (snap && next) {
      const sameStyleKey = `${Math.round(next.size * 2) / 2}|${next.fontId}`;
      const isHeading = styles.has(sameStyleKey);
      const headingLine = snap.lines[hit.lineIdx];
      const gap = headingLine ? headingLine.y - next.y : Infinity;
      if (!isHeading && isSubtitleLike(next.text, hit.size, next.size, gap)) {
        title = `${title}: ${next.text}`;
      }
    }
    title = title.replace(/\s+/g, " ").trim();
    if (title.length > 160) title = title.slice(0, 160).trim();
    // Reject figure/table/equation captions masquerading as headings when
    // they share a large-font style.
    if (/^(figure|table|algorithm|equation|listing|theorem|lemma|fig\.?|eq\.?|tbl\.?)\b/i.test(title)) continue;

    // Too short or garbled — axis labels, formula symbols, encoding artifacts.
    // Exception: pure Roman numerals are valid chapter markers ("I", "IX"…).
    const isPureRoman = /^[IVXLCDMivxlcdm]+$/.test(title);
    if (!isPureRoman && title.length < 3) continue;
    if (!isPureRoman && !/[A-Za-z\u00C0-\u024F]{3,}/.test(title)) continue;
    { const wc = (title.match(/[A-Za-z0-9\u00C0-\u024F]/g) ?? []).length;
      if (!isPureRoman && title.length > 10 && wc / title.length < 0.55) continue; }
    if (/\b(first edition|second edition|third edition|fourth edition|fifth edition|made in (the|usa)|all rights reserved|isbn|printed (in|by))\b/i.test(title)) continue;

    out.push({ title, page: pageNum, level: hit.level, children: [] });
  }

  out.sort((a, b) => (a.page ?? 0) - (b.page ?? 0));

  // Dedupe consecutive identical titles on nearby pages (chapter start
  // occasionally bleeds onto 2 consecutive pages due to misread lineIdx).
  const cleaned: OutlineItem[] = [];
  for (const c of out) {
    const prev = cleaned[cleaned.length - 1];
    if (
      prev &&
      prev.title.toLowerCase() === c.title.toLowerCase() &&
      Math.abs((prev.page ?? 0) - (c.page ?? 0)) <= 1
    ) continue;
    cleaned.push(c);
  }

  // Require a minimum count so single-heading styles don't produce a noisy
  // "outline" of 1 entry.
  if (cleaned.length < 2) return [];
  return cleaned;
}

// A subtitle is the second line of a chapter opener: a short title-cased
// phrase that continues the heading. Body text (lorem-ipsum sentences)
// looks nothing like this, so the rules are strict by design.
function isSubtitleLike(
  text: string,
  headingSize: number,
  nextSize: number,
  gap: number,
): boolean {
  const t = text.trim();
  if (!t || t.length > 60) return false;
  if (/^\s*\d{1,4}\s*$/.test(t)) return false;          // page number
  if (!/^[A-Z"'(\u00C0-\u024F]/.test(t)) return false;  // must start capital
  if (/\.\s+[A-Z]/.test(t)) return false;               // sentence-internal period+space
  if (/,\s+\S+\s+\S+\s/.test(t)) return false;          // comma-prose middle
  const wordCount = t.split(/\s+/).length;
  if (wordCount > 10) return false;
  if (nextSize < headingSize * 0.6) return false;       // too small
  if (nextSize > headingSize * 1.1) return false;       // bigger than heading = different heading
  if (gap > headingSize * 3.5) return false;            // too far below
  if (gap <= 0) return false;
  return true;
}

function dominantBodyFontId(snaps: PageSnap[]): string {
  const counts = new Map<string, number>();
  for (const snap of snaps) {
    for (const line of snap.lines) {
      counts.set(line.fontId, (counts.get(line.fontId) ?? 0) + line.text.length);
    }
  }
  let best = "";
  let bestC = 0;
  for (const [k, c] of counts) if (c > bestC) { best = k; bestC = c; }
  return best;
}

// A running header/footer is a short line that recurs on the same vertical
// band across a large fraction of pages (e.g. author name, book title,
// chapter name reprinted at the top of every spread). We strip these so the
// page scorer never mistakes them for chapter headings.
function detectRunningHeaders(snaps: PageSnap[]): Set<string> {
  const counts = new Map<string, number>();
  for (const snap of snaps) {
    const topZone = snap.pageHeight * 0.12;
    const botZone = snap.pageHeight * 0.12;
    for (const line of snap.lines) {
      const yFromTop = snap.pageHeight - line.y;
      const yFromBot = line.y;
      if (yFromTop > topZone && yFromBot > botZone) continue;
      if (line.text.length < 1 || line.text.length > 80) continue;
      const key = normalizeHeaderKey(line.text);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  // A running header for a SECTION of a long book may only appear on a
  // small fraction of the pages (e.g. a 10-page preface in a 400-page
  // manual). An absolute minimum of 3 catches those; the upper clamp keeps
  // us from flagging incidental text on a handful of pages of a short doc.
  const threshold = Math.max(3, Math.min(10, Math.floor(snaps.length * 0.05)));
  const out = new Set<string>();
  for (const [k, c] of counts) if (c >= threshold) out.add(k);
  return out;
}

function normalizeHeaderKey(s: string): string {
  // Replace digits with # so page-number variation collapses. Also collapse
  // leading/trailing roman numerals (common in manual running headers like
  // "ii GAWK: Effective AWK Programming") but not mid-line romans or
  // stand-alone ones — otherwise chapter titles like "I" or "II" normalize
  // to the same key and chapters collapse.
  const trimmed = s.trim();
  if (/^[IVXLCDMivxlcdm]{1,7}$/.test(trimmed)) {
    // Stand-alone Roman — keep as-is (chapter number / page marker).
    return trimmed.toLowerCase().replace(/\s+/g, " ");
  }
  return trimmed
    .toLowerCase()
    .replace(/^([ivxlcdm]{1,6})\s+/, "# ")  // leading Roman "ii GAWK..."
    .replace(/\s+([ivxlcdm]{1,6})$/, " #")  // trailing Roman
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

interface ChapterScore {
  pageNum: number;
  score: number;
  structural: number;
  firstLineIdx: number;
  title: string;
  size: number;
  level: number;
  centered: boolean;
}

function scoreChapterPages(
  snaps: PageSnap[],
  bodySize: number,
  bodyFontId: string,
  running: Set<string>,
): OutlineItem[] {
  // Median top gap across all pages — pages whose first meaningful line sits
  // much farther below the page top than this are strong chapter-start
  // signals (white space above).
  const topGaps: number[] = [];
  for (const snap of snaps) {
    const first = firstContentLine(snap, running);
    if (!first) continue;
    topGaps.push(snap.pageHeight - first.line.y);
  }
  const medianGap = median(topGaps) || 60;

  const scores: ChapterScore[] = [];
  for (const snap of snaps) {
    const first = firstContentLine(snap, running);
    if (!first) continue;
    const { line, idx } = first;
    const yFromTop = snap.pageHeight - line.y;
    const centerX = snap.pageWidth / 2;
    const lineMid = (line.xStart + line.xEnd) / 2;
    const centered = Math.abs(lineMid - centerX) < snap.pageWidth * 0.10;

    let structural = 0;
    let score = 0;

    // Big top gap (lots of whitespace above the first line).
    if (yFromTop > medianGap * 2.0) { structural += 2; score += 3; }
    else if (yFromTop > medianGap * 1.5) { structural += 1; score += 2; }
    else if (yFromTop > medianGap * 1.2) { score += 1; }

    // Font size relative to body.
    const sizeRatio = line.size / (bodySize || 12);
    if (sizeRatio >= 1.5) { structural += 2; score += 3; }
    else if (sizeRatio >= 1.25) { structural += 1; score += 2; }
    else if (sizeRatio >= 1.1) { score += 1; }

    // Different font from body.
    if (line.fontId && line.fontId !== bodyFontId) { structural += 1; score += 1; }

    // Isolation: big vertical gap below the first line.
    const nextLine = snap.lines[idx + 1];
    if (nextLine) {
      const gap = line.y - nextLine.y;
      if (gap > line.size * 3.0) { structural += 1; score += 2; }
      else if (gap > line.size * 2.0) { score += 1; }
    } else {
      score += 1;
    }

    // Content signals.
    const textLen = line.text.length;
    if (textLen <= 20) score += 2;
    else if (textLen <= 50) score += 1;
    else if (textLen >= 110) score -= 1;

    if (CHAPTER_MARKER_RE.test(line.text)) { score += 3; structural += 1; }
    if (ROMAN_RE.test(line.text) || ARABIC_RE.test(line.text)) {
      score += centered ? 3 : 1;
    }
    if (centered) score += 1;

    // Gate: need at least one structural signal + a reasonable total. The
    // structural gate prevents running body-text from being a chapter.
    if (structural < 2 || score < 4) continue;

    // Title: first line + optional continuation if the next line looks
    // title-like (short, title-cased, no sentence-internal punctuation).
    let title = line.text;
    if (nextLine) {
      const gap = line.y - nextLine.y;
      if (isSubtitleLike(nextLine.text, line.size, nextLine.size, gap)) {
        title = `${title}: ${nextLine.text}`;
      }
    }
    title = title.replace(/\s+/g, " ").trim();
    if (title.length > 160) title = title.slice(0, 160).trim();

    // Figures/tables/equations are not chapter starts, even when they happen
    // to be the first content line on a page with lots of white space above.
    if (/^(figure|table|algorithm|equation|listing|theorem|lemma|fig\.?|eq\.?|tbl\.?)\b/i.test(title)) continue;

    // Pure Roman numeral chapter markers ("I", "IX", "XXII") are valid even
    // when short — but MUST be centered to distinguish from math variables.
    const isPureRomanS = /^[IVXLCDMivxlcdm]+$/.test(title);

    // Too short — axis labels, math symbols, lone letters.
    if (!isPureRomanS && title.length < 3) continue;
    // Short Roman numeral must be centered to be a chapter marker, not a variable.
    if (isPureRomanS && !centered) continue;

    // Garbled formula or encoding artifact: must contain at least one
    // word-like token (3+ consecutive letters). "n(nJk", "ST-Kl K2-KI",
    // "Th bb" all fail this. Real headings always have English words.
    if (!isPureRomanS && !/[A-Za-z\u00C0-\u024F]{3,}/.test(title)) continue;
    // Word-char density < 55% → formula/garbled text ("18 Th bb·f cxp(-μ))").
    { const wc = (title.match(/[A-Za-z0-9\u00C0-\u024F]/g) ?? []).length;
      if (!isPureRomanS && title.length > 10 && wc / title.length < 0.55) continue; }

    // Front/back-matter boilerplate — cover edition lines, colophons.
    if (/\b(first edition|second edition|third edition|fourth edition|fifth edition|made in (the|usa)|all rights reserved|isbn|printed (in|by))\b/i.test(title)) continue;

    scores.push({
      pageNum: snap.pageNum,
      score,
      structural,
      firstLineIdx: idx,
      title,
      size: line.size,
      level: sizeRatio >= 1.5 ? 0 : 1,
      centered,
    });
  }

  // Dedupe near-neighbors: if two candidates are <3 pages apart, keep the
  // higher-scoring one. Chapter openings legitimately span at most one page.
  scores.sort((a, b) => a.pageNum - b.pageNum);
  const kept: ChapterScore[] = [];
  for (const s of scores) {
    const prev = kept[kept.length - 1];
    if (prev && s.pageNum - prev.pageNum < 3) {
      if (s.score > prev.score) kept[kept.length - 1] = s;
      continue;
    }
    kept.push(s);
  }

  if (kept.length < 2) return [];

  return kept.map((s) => ({
    title: s.title,
    page: s.pageNum,
    level: s.level,
    children: [],
  }));
}

function firstContentLine(
  snap: PageSnap,
  running: Set<string>,
): { line: LineAgg; idx: number } | null {
  for (let i = 0; i < snap.lines.length && i < 12; i++) {
    const line = snap.lines[i];
    if (!line.text) continue;
    if (/^\s*\d{1,4}\s*$/.test(line.text)) continue; // page number
    if (running.has(normalizeHeaderKey(line.text))) continue;
    return { line, idx: i };
  }
  return null;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Scans every line on every page for numbered-section headings. A heading
// qualifies if its section number is non-decreasing in page order and its
// visual signature (size bump OR font difference OR bold indicator) sets it
// apart from body prose. This finds section markers that don't sit at the
// top of a page — the common arxiv / textbook / manual case.
// Accept "1 Title", "2.3 Title", "4.1.2 Title". First component must be 1-99,
// sub-parts 1-99 — rules out "0.55 LoRA"-style floats in body text.
const NUMBERED_HEADING_RE = /^([1-9]\d?(?:\.\d{1,2}){0,2})\s+([A-Z][^\n]{0,140})$/;
// Appendix heading: requires explicit sub-section form like "A.1 Details"
// (so we don't match the start of prose sentences like "A Generalization of
// Full Fine-tuning …"). Plain "A Foo" is too ambiguous.
const APPENDIX_HEADING_RE = /^([A-Z](?:\.\d{1,2}){1,2})\s+([A-Z][^\n]{0,140})$/;
// Also catch ALL-CAPS single-letter appendix titles like "A BASELINE DETAILS"
// where the title clearly is ALL CAPS (not mixed-case prose).
const ALLCAPS_APPENDIX_HEADING_RE = /^([A-Z])\s+([A-Z]{2,}(?:\s+[A-Z0-9\-'&]{1,}){0,10})\s*$/;
// "Chapter I Introduction.", "Chapter 12 Foo", "Chapter XIV Recapitulation"
// Case-insensitive on the word "Chapter" so we catch "CHAPTER" all-caps too.
const NAMED_CHAPTER_RE = /^(chapter|book|part|volume|section)\s+([IVXLCDMivxlcdm]{1,7}|\d{1,3})\b\.?\s*(.{0,140})$/i;

function scanNumberedSections(
  snaps: PageSnap[],
  bodySize: number,
  bodyFontId: string,
  running: Set<string>,
): OutlineItem[] {
  interface Hit { pageNum: number; number: string; title: string; size: number; y: number; depth: number }
  const hits: Hit[] = [];

  for (const snap of snaps) {
    const headerBand = snap.pageHeight * 0.88; // top 12% of page = header band
    const footerBand = snap.pageHeight * 0.12; // bottom 12% = footer band
    for (const line of snap.lines) {
      // Skip running headers/footers — "2 GAWK: Effective AWK Programming"
      // appears on every page as a header, and matches our numbered heading
      // regex but is not a real section marker.
      const isInHeaderFooter = line.y >= headerBand || line.y <= footerBand;
      // Running header/footer match — known repeating text.
      if (running.has(normalizeHeaderKey(line.text))) continue;
      // Structural match — text in the top/bottom band that looks like
      // "<title> <page number>" or "<page number> <title>" is almost
      // always a running header even on a first read.
      if (isInHeaderFooter && /^(?:\d{1,4}\s+\S.{2,80}|\S.{2,80}\s+\d{1,4})\s*$/.test(line.text)) continue;
      const cleaned = cleanSmallCapsSpacing(line.text);
      let m = cleaned.match(NUMBERED_HEADING_RE) || cleaned.match(APPENDIX_HEADING_RE);
      let namedChapterPrefix: string | null = null;
      if (!m) {
        const nm = cleaned.match(NAMED_CHAPTER_RE);
        if (nm) {
          namedChapterPrefix = nm[1];
          m = [nm[0], nm[2], (nm[3] ?? "").trim()] as RegExpMatchArray;
        }
      }
      if (!m) continue;
      const num = m[1];
      const rest = m[2].trim();

      // Reject obvious false positives.
      if (rest.length < 2) continue;
      if (/^(figure|table|algorithm|equation|listing|theorem|lemma|fig\.?|eq\.?)\b/i.test(rest)) continue;
      // Running page headers: "2 Mallela et al.", "4 Smith et al. · Title" — any
      // numbered heading where the body contains "et al." is an author citation,
      // not a section title.
      if (/\bet\.?\s*al\b/i.test(rest)) continue;
      // Dates masquerading as numbered sections: "17 April 2011", "3 Jan 2020".
      if (/^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i.test(rest) && /\b(?:19|20)\d{2}\b/.test(rest)) continue;
      if (/\.{3,}/.test(rest)) continue;  // TOC entry "Chapter 1 ........ 5"
      if (/(?:\.\s){3,}/.test(rest)) continue;  // "Foo . . . . . . 5" (space-separated dots)
      if (/\s{8,}\d+\s*$/.test(cleaned)) continue;  // trailing big-gap page number = TOC line
      if (/\s\d{1,4}\s*$/.test(cleaned) && /\.\s/.test(cleaned)) continue;  // TOC line with trailing page number
      // Problem/exercise numbers: "4.28 The special case" — subsection component > 20
      // is virtually never a real heading (books/papers don't have 20+ subsections).
      if (!namedChapterPrefix) {
        const numParts = num.split(".");
        if (numParts.slice(1).some((p) => Number(p) > 20)) continue;
      }
      // Garbled formula or encoding artifact — require at least one word-like
      // token (3+ consecutive letters). "ST-Kl K2-KI", "n(nJk" fail this.
      if (!/[A-Za-z\u00C0-\u024F]{3,}/.test(rest)) continue;
      // Word-char density below 55% = formula/garbled ("18 Th bb·f cxp(-μ))").
      { const wc = (rest.match(/[A-Za-z0-9\u00C0-\u024F]/g) ?? []).length;
        if (rest.length > 10 && wc / rest.length < 0.55) continue; }

      // Reject if line is body-styled.
      const sizeBump = line.size >= bodySize * 1.1;
      const fontDiff = line.fontId && line.fontId !== bodyFontId;
      const looksBold = /bold|black|heavy|medium/i.test(line.fontId ?? "");
      const smallCapsLike = /\b([A-Z])\s+[A-Z]/.test(line.text); // "I NTRODUCTION"
      if (!sizeBump && !fontDiff && !looksBold && !smallCapsLike) continue;

      const depth = namedChapterPrefix ? 0 : (num.match(/\./g)?.length ?? 0);

      // "Chapter II" needs to be kept with its prefix; but numbering key must
      // be unique across named-chapter vs. plain-numbered to avoid collisions.
      const title = namedChapterPrefix
        ? `${namedChapterPrefix} ${num}${rest ? " " + rest : ""}`.replace(/\s+/g, " ").slice(0, 160)
        : `${num} ${rest}`.replace(/\s+/g, " ").slice(0, 160);
      const numberKey = namedChapterPrefix ? `${namedChapterPrefix.toLowerCase()}:${num}` : num;

      hits.push({
        pageNum: snap.pageNum,
        number: numberKey,
        title,
        size: line.size,
        y: line.y,
        depth,
      });
    }
  }

  if (hits.length < 2) return [];

  // Dedupe: keep first occurrence of each (number) — sections aren't
  // repeated, but running footers sometimes echo the section number on
  // subsequent pages. Also drop depth > 2 — those are sub-sub-sections.
  const seen = new Set<string>();
  const filtered = hits.filter((h) => {
    if (h.depth > 2) return false;
    if (seen.has(h.number)) return false;
    seen.add(h.number);
    return true;
  });

  // Validate the first number is reasonable (1 or 1.x) and numbers are
  // non-decreasing — otherwise it's probably list numbering (e.g. figure
  // captions). Trim leading noise.
  const sorted = [...filtered].sort((a, b) => {
    if (a.pageNum !== b.pageNum) return a.pageNum - b.pageNum;
    return b.y - a.y; // within page: top first
  });
  // Keep all sorted hits. Previously gated by a "major is close to the last
  // major" check, but that's too strict: textbooks often jump back to 1 in
  // appendices, papers mix mains and appendices, and TOC-like noise has
  // already been filtered upstream. Keep everything that survives the upstream
  // filters; the merge step will handle dupes.
  const cleaned = sorted;

  if (cleaned.length < 2) return [];

  return cleaned.map((h) => ({
    title: h.title,
    page: h.pageNum,
    level: h.depth,
    children: [],
  }));
}

// Flag pages that are clearly TOC / index — many lines have dotted leaders
// ending in a page number. Manuals and dense books have multi-page TOCs
// whose entries look like real section headings to font-clustering. If we
// don't exclude them we get every TOC line as a detected chapter.
function detectTocPages(snaps: PageSnap[]): Set<number> {
  const flagged = new Set<number>();
  const TOC_LINE = /(?:\.\s?){3,}\s*\d{1,4}\s*$|\.{3,}\s*\d{1,4}\s*$|^\s*\S.*\s{4,}\d{1,4}\s*$/;
  // Synopsis TOC: several "Chapter X" / "Part X" lines on one page. Common in
  // Gutenberg reprints that have no dotted leaders.
  const NAMED_CH_LINE = /^(chapter|book|part|volume|section)\s+([IVXLCDMivxlcdm]{1,7}|\d{1,3})\b/i;
  for (const snap of snaps) {
    let tocLike = 0;
    let namedChCount = 0;
    for (const line of snap.lines) {
      if (line.text.length < 4) continue;
      if (TOC_LINE.test(line.text)) tocLike++;
      if (NAMED_CH_LINE.test(line.text)) namedChCount++;
    }
    if (tocLike >= 4 || namedChCount >= 3) flagged.add(snap.pageNum);
  }
  return flagged;
}

// Small-caps rendering often breaks up a word because the drop-cap letter is
// in a different size than the rest. This joins "1 I NTRODUCTION" →
// "1 INTRODUCTION" and "Lo w- R ank A daptation" → "Low-Rank Adaptation".
function cleanSmallCapsSpacing(s: string): string {
  return s
    .replace(/\b([A-Z])\s+([A-Z]{2,})/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

// Merge three detection paths with conflict resolution.
// The base path (most entries) is kept in full — we never drop entries from
// it even when they share a page (e.g. papers with "1 Introduction" and
// "2 Background" both on page 2). Secondary/tertiary entries are only added
// if they don't conflict with an already-kept entry: same page+level, or
// within 2 pages for level-0 entries (to avoid double-counting a novel
// chapter marker picked up by both clustering and scoring).
function mergeAllSources(
  cluster: OutlineItem[],
  scored: OutlineItem[],
  numbered: OutlineItem[],
): OutlineItem[] {
  const paths = [cluster, scored, numbered].sort((a, b) => b.length - a.length);
  const [base, secondary, tertiary] = paths;

  const out: OutlineItem[] = [];
  // De-dup only when *the same normalized title* repeats within a close page
  // window — that catches running headers ("Chapter 2: Getting In and Out")
  // detected on many adjacent pages, while preserving novel chapters with
  // repeated-by-design names ("Chapter I", "Chapter II", ...) that are
  // spread throughout the book.
  const DEDUP_WINDOW = 8;
  const titleWindow = new Map<string, number[]>(); // title → pages seen
  const seenWithinWindow = (title: string, page: number): boolean => {
    const key = normalizeTitle(title);
    if (!key) return false;
    const arr = titleWindow.get(key) ?? [];
    for (const p of arr) if (Math.abs(p - page) <= DEDUP_WINDOW) return true;
    return false;
  };
  const remember = (title: string, page: number) => {
    const key = normalizeTitle(title);
    if (!key) return;
    const arr = titleWindow.get(key) ?? [];
    arr.push(page);
    titleWindow.set(key, arr);
  };

  for (const c of base) {
    if (c.page == null) continue;
    if (seenWithinWindow(c.title, c.page)) continue;
    out.push(c);
    remember(c.title, c.page);
  }

  const conflicts = (c: OutlineItem): boolean => {
    if (c.page == null) return true;
    if (seenWithinWindow(c.title, c.page)) return true;
    for (const k of out) {
      if (k.page == null) continue;
      const sameLevel = (k.level ?? 0) === (c.level ?? 0);
      const distance = Math.abs(k.page - c.page);
      if (sameLevel && distance <= 2) return true;
      if ((k.level ?? 0) === 0 && (c.level ?? 0) === 0 && distance <= 1) return true;
    }
    return false;
  };
  const addIfOk = (c: OutlineItem) => {
    if (conflicts(c)) return;
    out.push(c);
    remember(c.title, c.page!);
  };
  for (const c of secondary) addIfOk(c);
  for (const c of tertiary) addIfOk(c);

  out.sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
  return out;
}

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function mergeChapterSources(
  cluster: OutlineItem[],
  scored: OutlineItem[],
  _totalPages: number,
): OutlineItem[] {
  // Prefer whichever path produced more chapters as the base, then fill gaps
  // from the other. This way, when font-clustering returns zero (classic book
  // with uniform font) the scored path wins outright; when clustering
  // already produces a clean list (paper), scoring only adds extras that it
  // clearly missed (e.g. unstyled prologue).
  const base = cluster.length >= scored.length ? cluster : scored;
  const other = base === cluster ? scored : cluster;

  const byPage = new Map<number, OutlineItem>();
  for (const c of base) if (c.page != null) byPage.set(c.page, c);
  for (const c of other) {
    if (c.page == null) continue;
    // Skip if within 2 pages of an existing entry — likely duplicate of the
    // same physical chapter start picked up by both heuristics.
    let conflict = false;
    for (const p of byPage.keys()) {
      if (Math.abs(p - c.page) <= 2) { conflict = true; break; }
    }
    if (!conflict) byPage.set(c.page, c);
  }

  const out = [...byPage.values()];
  out.sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
  return out;
}

export { pdfjs };
export type { PDFDocumentProxy, PDFPageProxy };
