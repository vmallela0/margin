// Generates synthetic PDFs into test/fixtures/. Each PDF exercises a known
// layout pattern so the harness can score detection against a ground truth.
//
// Run with: bun test/generate-fixtures.ts
//
// Ground-truth metadata for each fixture is written alongside as
// `<name>.expected.json`.

import { jsPDF } from "jspdf";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

const OUT_DIR = resolve(import.meta.dir, "fixtures");
mkdirSync(OUT_DIR, { recursive: true });

interface Expected {
  description: string;
  chapters: { title: string; page: number }[];
}

function write(name: string, doc: jsPDF, expected: Expected) {
  const buf = Buffer.from(doc.output("arraybuffer"));
  writeFileSync(resolve(OUT_DIR, `${name}.pdf`), buf);
  writeFileSync(
    resolve(OUT_DIR, `${name}.expected.json`),
    JSON.stringify(expected, null, 2),
  );
  console.log(`  wrote ${name}.pdf (${buf.length} bytes)`);
}

const LOREM = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.";

function fillBody(doc: jsPDF, startY: number, endY: number, lineH = 16) {
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  let y = startY;
  let idx = 0;
  while (y < endY) {
    const slice = LOREM.slice(idx % LOREM.length, (idx % LOREM.length) + 80);
    doc.text(slice, 50, y);
    y += lineH;
    idx += 80;
  }
}

// ---------------------------------------------------------------------------
// Fixture A — classic novel. Same font everywhere; chapters are a centered
// roman numeral with lots of whitespace above. This is the book case that
// kills pure font-cluster detection.
// ---------------------------------------------------------------------------
function buildNovel() {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const chapters: { title: string; page: number }[] = [];
  const ROMAN = ["I", "II", "III", "IV", "V", "VI"];
  const PAGES_PER_CHAPTER = 5;

  for (let ci = 0; ci < ROMAN.length; ci++) {
    for (let pi = 0; pi < PAGES_PER_CHAPTER; pi++) {
      if (ci > 0 || pi > 0) doc.addPage();
      const pageNum = ci * PAGES_PER_CHAPTER + pi + 1;

      if (pi === 0) {
        // Chapter opener: whitespace, centered roman, more whitespace, body.
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        doc.text(ROMAN[ci], pageW / 2, pageH * 0.33, { align: "center" });
        fillBody(doc, pageH * 0.50, pageH - 60);
        chapters.push({ title: ROMAN[ci], page: pageNum });
      } else {
        fillBody(doc, 80, pageH - 60);
      }

      // Page number (footer).
      doc.setFontSize(10);
      doc.text(String(pageNum), pageW / 2, pageH - 30, { align: "center" });
    }
  }

  write("novel", doc, {
    description: "Classic novel: centered roman numerals, same font as body, whitespace-marked openings.",
    chapters,
  });
}

// ---------------------------------------------------------------------------
// Fixture B — academic paper. Bold section headings larger than body.
// ---------------------------------------------------------------------------
function buildPaper() {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const sections = [
    { title: "1. Introduction", page: 1 },
    { title: "2. Related Work", page: 3 },
    { title: "3. Methods", page: 5 },
    { title: "4. Results", page: 7 },
    { title: "5. Discussion", page: 9 },
    { title: "6. Conclusion", page: 11 },
  ];
  const PAGES_PER_SECTION = 2;

  // Title page header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("A Study of Synthetic Fixtures in PDF Chapter Detection", pageW / 2, 80, { align: "center" });
  doc.setFontSize(11);
  doc.setFont("helvetica", "italic");
  doc.text("Margin Test Suite", pageW / 2, 110, { align: "center" });

  for (let si = 0; si < sections.length; si++) {
    for (let pi = 0; pi < PAGES_PER_SECTION; pi++) {
      if (si > 0 || pi > 0) doc.addPage();
      const pageNum = si * PAGES_PER_SECTION + pi + 1;
      const y0 = si === 0 && pi === 0 ? 140 : 80;

      if (pi === 0) {
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(sections[si].title, 50, y0);
        fillBody(doc, y0 + 28, pageH - 60);
      } else {
        fillBody(doc, y0, pageH - 60);
      }

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(String(pageNum), pageW - 50, pageH - 30);
    }
  }

  write("paper", doc, {
    description: "Arxiv-style paper: bold numbered sections, larger font than body.",
    chapters: sections,
  });
}

// ---------------------------------------------------------------------------
// Fixture C — textbook. Running header on every page plus styled chapter
// openings with "Chapter N" / subtitle two-line pattern.
// ---------------------------------------------------------------------------
function buildTextbook() {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const chapters = [
    { label: "Chapter 1", subtitle: "First Principles" },
    { label: "Chapter 2", subtitle: "Foundations" },
    { label: "Chapter 3", subtitle: "Patterns" },
    { label: "Chapter 4", subtitle: "Advanced Topics" },
  ];
  const PAGES_PER_CHAPTER = 6;
  const out: { title: string; page: number }[] = [];

  for (let ci = 0; ci < chapters.length; ci++) {
    for (let pi = 0; pi < PAGES_PER_CHAPTER; pi++) {
      if (ci > 0 || pi > 0) doc.addPage();
      const pageNum = ci * PAGES_PER_CHAPTER + pi + 1;

      // Running header.
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      doc.text("An Introduction to Margin Detection", 50, 40);

      if (pi === 0) {
        doc.setFontSize(20);
        doc.setFont("helvetica", "bold");
        doc.text(chapters[ci].label, pageW / 2, 140, { align: "center" });
        doc.setFontSize(14);
        doc.setFont("helvetica", "normal");
        doc.text(chapters[ci].subtitle, pageW / 2, 170, { align: "center" });
        fillBody(doc, 220, pageH - 60);
        out.push({ title: `${chapters[ci].label}: ${chapters[ci].subtitle}`, page: pageNum });
      } else {
        fillBody(doc, 80, pageH - 60);
      }

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(String(pageNum), pageW / 2, pageH - 30, { align: "center" });
    }
  }

  write("textbook", doc, {
    description: "Textbook: running header on every page, two-line chapter openings (label + subtitle).",
    chapters: out,
  });
}

// ---------------------------------------------------------------------------
// Fixture D — memoir. Named sections (prologue, chapter N, epilogue),
// smaller font differential, italic chapter labels.
// ---------------------------------------------------------------------------
function buildMemoir() {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const parts = [
    { title: "Prologue", pages: 3 },
    { title: "Chapter One", pages: 5 },
    { title: "Chapter Two", pages: 5 },
    { title: "Chapter Three", pages: 5 },
    { title: "Epilogue", pages: 3 },
  ];

  const out: { title: string; page: number }[] = [];
  let pageCounter = 0;
  for (let pi = 0; pi < parts.length; pi++) {
    for (let i = 0; i < parts[pi].pages; i++) {
      if (pi > 0 || i > 0) doc.addPage();
      pageCounter++;

      if (i === 0) {
        doc.setFontSize(13);
        doc.setFont("times", "italic");
        doc.text(parts[pi].title, pageW / 2, 120, { align: "center" });
        fillBody(doc, 180, pageH - 60);
        out.push({ title: parts[pi].title, page: pageCounter });
      } else {
        fillBody(doc, 80, pageH - 60);
      }

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(String(pageCounter), pageW / 2, pageH - 30, { align: "center" });
    }
  }

  write("memoir", doc, {
    description: "Memoir: named sections (Prologue / Chapter N / Epilogue) in italic, small size bump.",
    chapters: out,
  });
}

// ---------------------------------------------------------------------------
// Fixture E — front matter + TOC offset. Printed page "1" is actually PDF
// page 5. The body-scan path must land on the real PDF page, not the
// printed number.
// ---------------------------------------------------------------------------
function buildFrontMatter() {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Front matter: title, copyright, dedication, blank.
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.text("Title", pageW / 2, pageH / 2, { align: "center" });

  doc.addPage();
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Copyright © 2026. All rights reserved.", 50, 100);

  doc.addPage();
  doc.setFontSize(12);
  doc.setFont("helvetica", "italic");
  doc.text("For the reader.", pageW / 2, pageH / 2, { align: "center" });

  doc.addPage(); // blank

  // Now real content starts at pdf page 5.
  const chapters: { title: string; page: number }[] = [];
  const PAGES_PER_CHAPTER = 4;
  const TITLES = ["Beginnings", "The Journey", "Arrival"];
  for (let ci = 0; ci < TITLES.length; ci++) {
    for (let pi = 0; pi < PAGES_PER_CHAPTER; pi++) {
      doc.addPage();
      const pdfPage = 4 + ci * PAGES_PER_CHAPTER + pi + 1;

      if (pi === 0) {
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(TITLES[ci], pageW / 2, 150, { align: "center" });
        fillBody(doc, 200, pageH - 60);
        chapters.push({ title: TITLES[ci], page: pdfPage });
      } else {
        fillBody(doc, 80, pageH - 60);
      }

      // Printed page number (starts from 1 for body; matches offset-bug case).
      const printed = ci * PAGES_PER_CHAPTER + pi + 1;
      doc.setFontSize(9);
      doc.text(String(printed), pageW / 2, pageH - 30, { align: "center" });
    }
  }

  write("frontmatter", doc, {
    description: "Front matter offset: title/copyright/dedication/blank before body. Body starts at PDF page 5.",
    chapters,
  });
}

console.log("Generating fixtures into", OUT_DIR);
buildNovel();
buildPaper();
buildTextbook();
buildMemoir();
buildFrontMatter();
console.log("Done.");
