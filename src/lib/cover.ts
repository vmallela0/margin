import { loadFromBlob, loadFromUrl } from "./pdf";
import type { Book } from "./types";
import { getBlob } from "./blobs";

const COVER_MAX_W = 220;

export async function renderCoverDataUrl(book: Book): Promise<string | null> {
  try {
    const pdf = book.source.kind === "url"
      ? await loadFromUrl(book.source.url)
      : await (async () => {
          const blob = await getBlob(book.id);
          if (!blob) throw new Error("blob missing");
          return loadFromBlob(blob);
        })();

    if (pdf.numPages < 1) return null;

    // Prefer page 2 if the PDF has one — often page 1 of our synthesized
    // DOCX/EPUB outputs is a near-empty title page; page 2 has real content.
    const pageNum = pdf.numPages > 1 ? 2 : 1;
    const page = await pdf.getPage(pageNum);

    const v1 = page.getViewport({ scale: 1 });
    const scale = Math.min(1.4, COVER_MAX_W / v1.width);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Solid white background in case the page is transparent.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return null;
  }
}
