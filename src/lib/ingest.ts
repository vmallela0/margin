import JSZip from "jszip";
import { marked } from "marked";
import { jsPDF } from "jspdf";

type Para = { text: string; style: "h1" | "h2" | "h3" | "body" | "quote" };

type Result = { blob: Blob; title: string; originalName: string };

export const SUPPORTED_EXT = ["pdf", "docx", "epub", "md", "markdown", "txt", "html", "htm", "rtf"] as const;
export const ACCEPT_ATTR =
  "application/pdf,.pdf,.docx,.epub,.md,.markdown,.txt,.html,.htm,.rtf";

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

function baseName(name: string) {
  const i = name.lastIndexOf(".");
  return i <= 0 ? name : name.slice(0, i);
}

function htmlToParas(html: string): Para[] {
  const d = new DOMParser().parseFromString(html, "text/html");
  // Strip scripts/styles.
  d.querySelectorAll("script, style, nav, header, footer").forEach((n) => n.remove());
  const out: Para[] = [];
  const walk = (root: ParentNode) => {
    for (const el of Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,pre,blockquote"))) {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const tag = el.tagName.toLowerCase();
      let style: Para["style"] = "body";
      if (tag === "h1") style = "h1";
      else if (tag === "h2") style = "h2";
      else if (tag.startsWith("h")) style = "h3";
      else if (tag === "blockquote") style = "quote";
      else if (tag === "li") style = "body";
      const marker = tag === "li" ? "• " : "";
      out.push({ text: marker + text, style });
    }
  };
  walk(d.body);
  if (out.length === 0) {
    // Fallback: use raw body text split on blank lines.
    const raw = (d.body.textContent || "").trim();
    for (const chunk of raw.split(/\n\s*\n+/)) {
      const t = chunk.replace(/\s+/g, " ").trim();
      if (t) out.push({ text: t, style: "body" });
    }
  }
  return out;
}

async function docxToParas(file: File): Promise<Para[]> {
  const mammoth = await import("mammoth/mammoth.browser.js");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return htmlToParas(result.value);
}

async function mdToParas(file: File): Promise<Para[]> {
  const text = await file.text();
  const html = await marked.parse(text);
  return htmlToParas(html);
}

async function txtToParas(file: File): Promise<Para[]> {
  const text = await file.text();
  return text
    .split(/\n\s*\n+/)
    .map((t) => ({ text: t.replace(/\s+/g, " ").trim(), style: "body" as const }))
    .filter((p) => p.text);
}

async function htmlFileToParas(file: File): Promise<Para[]> {
  return htmlToParas(await file.text());
}

async function epubToParas(file: File): Promise<Para[]> {
  const ab = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(ab);

  const container = await zip.file("META-INF/container.xml")?.async("text");
  if (!container) throw new Error("Invalid EPUB: missing container.xml");
  const opfPath = new DOMParser()
    .parseFromString(container, "application/xml")
    .querySelector("rootfile")
    ?.getAttribute("full-path");
  if (!opfPath) throw new Error("Invalid EPUB: no rootfile path");

  const opf = await zip.file(opfPath)?.async("text");
  if (!opf) throw new Error("Invalid EPUB: missing OPF");
  const opfDoc = new DOMParser().parseFromString(opf, "application/xml");
  const baseDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

  const manifest = new Map<string, string>();
  for (const item of Array.from(opfDoc.querySelectorAll("manifest > item"))) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id && href) manifest.set(id, baseDir + href);
  }

  const spine = Array.from(opfDoc.querySelectorAll("spine > itemref"))
    .map((i) => i.getAttribute("idref"))
    .filter((id): id is string => !!id);

  const paras: Para[] = [];
  for (const idref of spine) {
    const href = manifest.get(idref);
    if (!href) continue;
    const xhtml = await zip.file(href)?.async("text");
    if (!xhtml) continue;
    paras.push(...htmlToParas(xhtml));
  }
  return paras;
}

async function rtfToParas(file: File): Promise<Para[]> {
  // Very light RTF sanitizer: strip control words & groups. Good enough for the common case.
  const raw = await file.text();
  const stripped = raw
    .replace(/\\par[d]?/g, "\n\n")
    .replace(/\\'[0-9a-fA-F]{2}/g, "")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\r/g, "");
  return stripped
    .split(/\n\s*\n+/)
    .map((t) => ({ text: t.replace(/\s+/g, " ").trim(), style: "body" as const }))
    .filter((p) => p.text);
}

function parasToPdf(title: string, paras: Para[]): Blob {
  const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 72;
  const maxW = pageW - margin * 2;
  let y = margin;

  const line = (text: string, size: number, bold: boolean, italic: boolean, spaceAfter: number, indent = 0) => {
    const style = bold && italic ? "bolditalic" : bold ? "bold" : italic ? "italic" : "normal";
    doc.setFont("times", style);
    doc.setFontSize(size);
    const lh = size * 1.45;
    const lines = doc.splitTextToSize(text, maxW - indent);
    for (const ln of lines) {
      if (y + lh > pageH - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(ln, margin + indent, y);
      y += lh;
    }
    y += spaceAfter;
  };

  // Title page
  doc.setFont("times", "bold");
  doc.setFontSize(26);
  doc.text(doc.splitTextToSize(title, maxW), margin, margin + 60);
  doc.addPage();
  y = margin;

  // Outline: record h1/h2 positions so PDF.js getOutline() picks them up.
  for (const p of paras) {
    if (p.style === "h1") {
      if (y > margin + 20) {
        doc.addPage();
        y = margin;
      }
      const pageNum = doc.getNumberOfPages();
      line(p.text, 20, true, false, 14);
      try {
        doc.outline.add(null, p.text, { pageNumber: pageNum });
      } catch {}
    } else if (p.style === "h2") {
      const pageNum = doc.getNumberOfPages();
      line(p.text, 15, true, false, 10);
      try {
        doc.outline.add(null, p.text, { pageNumber: pageNum });
      } catch {}
    } else if (p.style === "h3") {
      line(p.text, 13, true, false, 8);
    } else if (p.style === "quote") {
      line(p.text, 11, false, true, 8, 18);
    } else {
      line(p.text, 11, false, false, 8);
    }
  }

  return doc.output("blob");
}

export async function normalizeToPdf(file: File): Promise<Result> {
  const name = file.name || "document";
  const ext = extOf(name);
  const title = baseName(name);

  if (ext === "pdf" || file.type === "application/pdf") {
    return { blob: file, title, originalName: name };
  }

  let paras: Para[];
  switch (ext) {
    case "docx":
      paras = await docxToParas(file);
      break;
    case "md":
    case "markdown":
      paras = await mdToParas(file);
      break;
    case "txt":
      paras = await txtToParas(file);
      break;
    case "html":
    case "htm":
      paras = await htmlFileToParas(file);
      break;
    case "epub":
      paras = await epubToParas(file);
      break;
    case "rtf":
      paras = await rtfToParas(file);
      break;
    case "doc":
      throw new Error("Legacy .doc files aren't supported. Save it as .docx in Word first.");
    default:
      throw new Error(`Unsupported file type: .${ext || "?"}`);
  }

  if (paras.length === 0) throw new Error(`${name} contained no readable text`);
  const blob = parasToPdf(title, paras);
  return { blob, title, originalName: name };
}

export function isSupported(file: File): boolean {
  const ext = extOf(file.name);
  return (SUPPORTED_EXT as readonly string[]).includes(ext) || file.type === "application/pdf";
}
