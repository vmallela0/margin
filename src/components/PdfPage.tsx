import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { pdfjs, type PDFDocumentProxy, type PDFPageProxy } from "../lib/pdf";
import type { CustomColor, Highlight, Rect } from "../lib/types";
import { resolveHighlightBg, resolveHighlightUnderline } from "../lib/colors";
import { BUILTIN_COLORS } from "../lib/types";

export interface PdfPageHandle {
  container: HTMLDivElement | null;
  rectsFromRange(range: Range): Rect[] | null;
  viewport(): { width: number; height: number };
  textContent(): string;
  pulseHighlight(id: string): void;
}

export const PdfPage = forwardRef<PdfPageHandle, {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  initialSize: { w: number; h: number }; // unscaled width/height of a reference page
  scale: number;
  highlights: Highlight[];
  customColors?: CustomColor[];
  onHighlightClick: (h: Highlight) => void;
}>(function PdfPage({ pdf, pageNumber, initialSize, scale, highlights, customColors = [], onHighlightClick }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const hlLayerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({
    w: Math.floor(initialSize.w * scale),
    h: Math.floor(initialSize.h * scale),
  });
  const [rendered, setRendered] = useState(false);
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState("");
  const pageRef = useRef<PDFPageProxy | null>(null);
  const taskRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    container: containerRef.current,
    viewport: () => ({ width: size.w, height: size.h }),
    textContent: () => text,
    rectsFromRange(range: Range): Rect[] | null {
      const layer = textLayerRef.current;
      if (!layer || !layer.contains(range.startContainer) || !layer.contains(range.endContainer)) return null;
      const rect = containerRef.current!.getBoundingClientRect();
      const out: Rect[] = [];
      for (const r of range.getClientRects()) {
        if (r.width < 1 || r.height < 1) continue;
        out.push({
          x: (r.left - rect.left) / rect.width,
          y: (r.top - rect.top) / rect.height,
          w: r.width / rect.width,
          h: r.height / rect.height,
        });
      }
      return out.length ? mergeRects(out) : null;
    },
    pulseHighlight(id: string) {
      const el = hlLayerRef.current?.querySelector<HTMLElement>(`[data-hl="${id}"]`);
      if (!el) return;
      el.classList.remove("pulse");
      void el.offsetWidth;
      el.classList.add("pulse");
    },
  }), [size, text]);

  // Visibility gate — only load + render when within 1200px of the viewport.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { setVisible(true); io.disconnect(); return; }
    }, { rootMargin: "1200px 0px 1200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Keep placeholder size in sync with the latest scale so the scroll
  // container's total height is accurate even before the page renders.
  useEffect(() => {
    if (rendered) return;
    setSize({ w: Math.floor(initialSize.w * scale), h: Math.floor(initialSize.h * scale) });
  }, [scale, initialSize.w, initialSize.h, rendered]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    (async () => {
      if (!pageRef.current) pageRef.current = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const page = pageRef.current;

      const viewport = page.getViewport({ scale });
      if (!canvasRef.current || !textLayerRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;
      const ratio = window.devicePixelRatio || 1;
      const newW = Math.floor(viewport.width * ratio);
      const newH = Math.floor(viewport.height * ratio);
      // Only reset canvas dimensions if they actually changed — setting canvas.width
      // always clears the bitmap to black (alpha:false), causing a visible flash.
      if (canvas.width !== newW || canvas.height !== newH) {
        canvas.width = newW;
        canvas.height = newH;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, newW, newH);
      }
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      if (taskRef.current) {
        try { taskRef.current.cancel(); } catch {}
      }

      // Render canvas + fetch text content in parallel — pdfjs queues them
      // in its worker either way, but this lets us interleave deserialization
      // of the text layer with the tail of canvas paint.
      const textPromise = page.getTextContent();
      const task = page.render({
        canvasContext: ctx,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      } as any);
      taskRef.current = task;

      try {
        await task.promise;
      } catch (e: any) {
        if (e?.name === "RenderingCancelledException") return;
        throw e;
      }

      if (cancelled) return;

      const textContent = await textPromise;
      const layer = textLayerRef.current;
      layer.innerHTML = "";
      layer.style.setProperty("--scale-factor", String(scale));
      layer.style.width = `${Math.floor(viewport.width)}px`;
      layer.style.height = `${Math.floor(viewport.height)}px`;

      const TextLayerCtor: any = (pdfjs as any).TextLayer;
      if (TextLayerCtor) {
        const tl = new TextLayerCtor({
          textContentSource: textContent,
          container: layer,
          viewport,
        });
        await tl.render();
      } else {
        const renderTextLayer = (pdfjs as any).renderTextLayer;
        await renderTextLayer({
          textContentSource: textContent,
          container: layer,
          viewport,
        }).promise;
      }

      const joined = textContent.items
        .map((it: any) => ("str" in it ? it.str : ""))
        .join(" ");

      if (!cancelled) {
        setSize({ w: viewport.width, h: viewport.height });
        setText(joined);
        setRendered(true);
      }
    })().catch(() => {});

    return () => {
      cancelled = true;
      if (taskRef.current) {
        try { taskRef.current.cancel(); } catch {}
      }
    };
  }, [pdf, pageNumber, scale, visible]);

  return (
    <div
      ref={containerRef}
      className={`pdf-page ${rendered ? "" : "pending"}`}
      data-page={pageNumber}
      style={{ width: size.w, height: size.h }}
    >
      <canvas ref={canvasRef} />
      <div ref={hlLayerRef} className="hl-layer">
        {rendered && highlights.map((h) => {
          const isBuiltin = (BUILTIN_COLORS as readonly string[]).includes(h.color);
          const bg = isBuiltin ? undefined : resolveHighlightBg(h.color, customColors);
          const underline = isBuiltin ? undefined : resolveHighlightUnderline(h.color, customColors);
          return (
            <span key={h.id}>
              {h.rects.map((r, i) => (
                <span
                  key={i}
                  data-hl={h.id}
                  className={`hl${isBuiltin ? ` ${h.color}` : ""}`}
                  title={h.note || h.text}
                  onClick={(e) => { e.stopPropagation(); onHighlightClick(h); }}
                  style={{
                    left: `${r.x * 100}%`,
                    top: `${r.y * 100}%`,
                    width: `${r.w * 100}%`,
                    height: `${r.h * 100}%`,
                    ...(bg ? { background: bg } : {}),
                    ...(underline ? { boxShadow: underline } : {}),
                  }}
                />
              ))}
            </span>
          );
        })}
      </div>
      <div ref={textLayerRef} className="textLayer" />
      <div className="page-label">p.{pageNumber}</div>
    </div>
  );
});

function mergeRects(rects: Rect[]): Rect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: Rect[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.y - r.y) < 0.002 && Math.abs(last.h - r.h) < 0.004 && r.x - (last.x + last.w) < 0.003) {
      last.w = r.x + r.w - last.x;
    } else {
      out.push({ ...r });
    }
  }
  return out;
}
