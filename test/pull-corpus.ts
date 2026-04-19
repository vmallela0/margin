// Downloads every URL in CORPUS into test/corpus/. Skips files that already
// exist (resumable). After each PDF is present, extracts its embedded
// outline into `<name>.expected.json` so the harness can use it as ground
// truth.
//
// Run with: bun test/pull-corpus.ts

import { CORPUS } from "./corpus";
import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync } from "fs";
import { resolve } from "path";
import { pathToFileURL } from "url";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const CORPUS_DIR = resolve(import.meta.dir, "corpus");
mkdirSync(CORPUS_DIR, { recursive: true });

pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
  resolve(import.meta.dir, "../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
).href;

async function download(url: string, dest: string): Promise<{ ok: boolean; bytes: number; reason?: string }> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "margin-harness/0.1 (test suite)" },
    });
    if (!res.ok) return { ok: false, bytes: 0, reason: `status ${res.status}` };
    const ct = res.headers.get("content-type") ?? "";
    const buf = Buffer.from(await res.arrayBuffer());
    // First bytes of a PDF should be %PDF-
    if (!buf.slice(0, 5).toString().startsWith("%PDF-")) {
      return { ok: false, bytes: buf.length, reason: `not a PDF (ct=${ct.slice(0, 40)})` };
    }
    writeFileSync(dest, buf);
    return { ok: true, bytes: buf.length };
  } catch (e: any) {
    return { ok: false, bytes: 0, reason: e?.message ?? String(e) };
  }
}

interface OutlineEntry { title: string; page: number; level: number }

async function extractOutline(pdfPath: string): Promise<OutlineEntry[]> {
  const data = new Uint8Array(readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const raw = await doc.getOutline();
  if (!raw) return [];

  const out: OutlineEntry[] = [];
  async function resolvePage(dest: unknown): Promise<number | undefined> {
    if (!dest) return undefined;
    try {
      const r: unknown = typeof dest === "string" ? await doc.getDestination(dest) : dest;
      if (!Array.isArray(r)) return undefined;
      const ref = r[0];
      if (ref && typeof ref === "object") {
        const idx = await doc.getPageIndex(ref as never);
        return idx + 1;
      }
    } catch {}
    return undefined;
  }
  async function walk(items: any[], level: number) {
    for (const it of items) {
      const page = await resolvePage(it.dest);
      if (page != null) out.push({ title: it.title, page, level });
      if (it.items?.length) await walk(it.items, level + 1);
    }
  }
  await walk(raw, 0);
  out.sort((a, b) => a.page - b.page);
  await doc.destroy();
  return out;
}

async function main() {
  console.log(`Pulling ${CORPUS.length} PDFs into ${CORPUS_DIR}`);

  const results = {
    downloaded: 0,
    skipped: 0,
    failed: 0,
    withOutline: 0,
    withoutOutline: 0,
  };

  // Concurrency-limited parallel download.
  const queue = [...CORPUS];
  const concurrency = 6;
  const downloads = new Map<string, { ok: boolean; reason?: string; bytes?: number }>();

  async function worker() {
    while (queue.length) {
      const e = queue.shift();
      if (!e) return;
      const dest = resolve(CORPUS_DIR, `${e.name}.pdf`);
      if (existsSync(dest) && statSync(dest).size > 1024) {
        results.skipped++;
        downloads.set(e.name, { ok: true });
        console.log(`  skip ${e.name} (exists)`);
        continue;
      }
      const r = await download(e.url, dest);
      if (r.ok) {
        results.downloaded++;
        downloads.set(e.name, { ok: true, bytes: r.bytes });
        console.log(`  pull ${e.name} (${(r.bytes / 1024).toFixed(0)}K)`);
      } else {
        results.failed++;
        downloads.set(e.name, { ok: false, reason: r.reason });
        console.log(`  FAIL ${e.name} — ${r.reason}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  console.log(`\nDownload: ${results.downloaded} new, ${results.skipped} cached, ${results.failed} failed\n`);
  console.log("Extracting embedded outlines as expected ground truth...");

  for (const e of CORPUS) {
    const d = downloads.get(e.name);
    if (!d?.ok) continue;
    const dest = resolve(CORPUS_DIR, `${e.name}.pdf`);
    if (!existsSync(dest)) continue;
    const expectedPath = resolve(CORPUS_DIR, `${e.name}.expected.json`);
    try {
      const outline = await extractOutline(dest);
      if (outline.length >= 2) {
        results.withOutline++;
        writeFileSync(
          expectedPath,
          JSON.stringify({
            description: `${e.category}: ${e.name}`,
            category: e.category,
            source: "embedded-outline",
            chapters: outline.map((o) => ({ title: o.title, page: o.page, level: o.level })),
          }, null, 2),
        );
      } else {
        results.withoutOutline++;
        // Still write a stub so the harness knows this PDF exists but has
        // no ground truth (will be scored by quality heuristic).
        writeFileSync(
          expectedPath,
          JSON.stringify({
            description: `${e.category}: ${e.name}`,
            category: e.category,
            source: "no-outline",
            chapters: [],
          }, null, 2),
        );
      }
    } catch (err: any) {
      console.log(`  outline FAIL ${e.name} — ${err?.message ?? err}`);
    }
  }

  console.log(`\nOutline extraction: ${results.withOutline} with, ${results.withoutOutline} without`);
  console.log("Done.");
}

await main();
