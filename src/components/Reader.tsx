import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { detectChaptersFromText, extractPdfTitle, flattenOutline, loadFromBlob, loadFromUrl, type OutlineItem, type PDFDocumentProxy } from "../lib/pdf";
import type { Book, Flashcard, Highlight, HighlightColor, Rect, Settings, Theme } from "../lib/types";
import type { ThreadEntry } from "../lib/types";
import { BUILTIN_COLORS, DEFAULT_SETTINGS } from "../lib/types";
import {
  addCard, addHighlight, deleteCard, deleteHighlight, getBook, getSettings,
  listBooks, listCards, listHighlights, saveSettings, subscribe, updateHighlight, upsertBook,
} from "../lib/storage";
import { getBlob } from "../lib/blobs";
import { shortId } from "../lib/hash";
import { newCardSM2 } from "../lib/sm2";
import { PdfPage, type PdfPageHandle } from "./PdfPage";
// ChapterSidebar removed — replaced by right rail + chapter ruler
import { Rail, type RailTab } from "./Rail";
import { HighlightPopover } from "./HighlightPopover";
import { FlashcardCreate } from "./FlashcardCreate";
import { CommandPalette, type CommandItem } from "./CommandPalette";
import { CrossBookSearch } from "./CrossBookSearch";
import { SettingsSheet } from "./Settings";
import { Shortcuts } from "./Shortcuts";
import { Review } from "./Review";
import { ChapterSummary } from "./ChapterSummary";

type Overlay =
  | { kind: "none" }
  | { kind: "cmd" }
  | { kind: "search" }
  | { kind: "shortcuts" }
  | { kind: "settings" }
  | { kind: "review" }
  | { kind: "summary" }
  | { kind: "highlight"; page: number; rects: Rect[]; text: string; x: number; y: number }
  | { kind: "edit-highlight"; id: string; x: number; y: number }
  | { kind: "flashcard"; page: number; text: string; back?: string; x: number; y: number; highlightId?: string };

function getParam(name: string): string | null {
  return new URL(location.href).searchParams.get(name);
}

export function Reader() {
  const [book, setBook] = useState<Book | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [firstVp, setFirstVp] = useState<{ w: number; h: number } | null>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [railOpen, setRailOpen] = useState(true);
  const [railTab, setRailTab] = useState<RailTab>("outline");
  const [overlay, setOverlay] = useState<Overlay>({ kind: "none" });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(900);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageHandles = useRef<Map<number, PdfPageHandle>>(new Map());
  const pendingJump = useRef<{ page: number; hlId?: string } | null>(null);

  const scale = useMemo(() => {
    if (!firstVp) return 1;
    const target = Math.min(containerWidth - 48, 980);
    return (target / firstVp.w) * zoom;
  }, [firstVp, containerWidth, zoom]);

  // Init: load book + PDF
  useEffect(() => {
    (async () => {
      const bookId = getParam("book");
      const src = getParam("src");
      let b: Book | null = null;

      if (bookId) {
        b = (await getBook(bookId)) ?? null;
      } else if (src) {
        const url = decodeURIComponent(src);
        const existing = (await listBooks()).find(
          (x) => x.source.kind === "url" && x.source.url === url,
        );
        if (existing) {
          b = existing;
        } else {
          b = {
            id: shortId(),
            title: decodeURIComponent(url.split("/").pop() || "Untitled").replace(/\.pdf$/i, "") || "Untitled",
            source: { kind: "url", url },
            addedAt: Date.now(),
          };
          await upsertBook(b);
        }
      }

      if (!b) {
        setLoadError("No book specified. Open one from the Library tab.");
        return;
      }

      setBook(b);

      try {
        const doc = b.source.kind === "url"
          ? await loadFromUrl(b.source.url)
          : await loadFromBlob((await getBlob(b.id))!);
        setPdf(doc);
        setNumPages(doc.numPages);

        // Fetch just page 1 to learn the viewport size used for placeholders.
        // All other pages load lazily inside PdfPage on IntersectionObserver.
        const p1 = await doc.getPage(1);
        const v = p1.getViewport({ scale: 1 });
        setFirstVp({ w: v.width, h: v.height });

        // If the book title looks like an auto-generated URL slug (e.g. an
        // arxiv ID like "2103.14696"), try to extract the real title from the
        // PDF metadata or first-page text and update the stored record.
        const looksLikeSlug = /^\d[\d.]*$/.test(b.title.trim()) || /^[0-9a-f]{8,}$/i.test(b.title.trim());
        if (looksLikeSlug) {
          const realTitle = await extractPdfTitle(doc).catch(() => null);
          if (realTitle) {
            b = { ...b, title: realTitle };
            setBook(b);
          }
        }

        await upsertBook({ ...b, totalPages: doc.numPages, lastOpenedAt: Date.now() });
        const qp = Number(getParam("p")) || b.lastPage || 1;
        const hlParam = getParam("h") ?? undefined;
        pendingJump.current = { page: qp, hlId: hlParam };

        // Chapter detection runs in the background so first paint isn't
        // blocked waiting for it. The outline just lights up whenever it's
        // ready; the user can already scroll and highlight before then.
        const runDetect = async () => {
          try {
            const rawOutline = await doc.getOutline();
            let ol = await flattenOutline(doc);
            console.log("[margin] embedded outline", {
              rawCount: rawOutline?.length ?? 0,
              flattened: ol.map((e) => ({ title: e.title, page: e.page, level: e.level })),
            });
            if (ol.length < 3) {
              const detected = await detectChaptersFromText(doc);
              if (detected.length > ol.length) ol = detected;
            }
            setOutline(ol);
          } catch (err) {
            console.error("[margin] outline detection failed", err);
          }
        };
        const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
        if (typeof w.requestIdleCallback === "function") {
          w.requestIdleCallback(() => { runDetect(); }, { timeout: 2500 });
        } else {
          setTimeout(runDetect, 0);
        }
      } catch (e: any) {
        console.error(e);
        setLoadError(e?.message ?? "Failed to open PDF.");
      }
    })();
  }, []);

  // Load storage data + subscribe
  useEffect(() => {
    if (!book) return;
    const refresh = async () => {
      setHighlights(await listHighlights(book.id));
      setCards(await listCards());
      setSettings(await getSettings());
    };
    refresh();
    return subscribe(refresh);
  }, [book]);

  // Apply theme to <html>
  useEffect(() => {
    const t = settings.theme === "paper" ? "" : settings.theme;
    document.documentElement.setAttribute("data-theme", t);
  }, [settings.theme]);

  // Persist last page
  useEffect(() => {
    if (!book) return;
    const t = setTimeout(() => {
      upsertBook({ ...book, lastPage: currentPage });
    }, 400);
    return () => clearTimeout(t);
  }, [book, currentPage]);

  // Track container width
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let last = el.clientWidth;
    setContainerWidth(last);
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      // Ignore sub-2px jitter (e.g. from textarea focus causing micro layout shifts)
      // — those would change `scale`, clearing every canvas unnecessarily.
      if (Math.abs(w - last) >= 2) { last = w; setContainerWidth(w); }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef.current, railOpen]);

  // Current visible page — ratio of scrollTop to max scroll, mapped to page range.
  // O(1), fires on every scroll frame, no DOM querying needed.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || numPages === 0) return;
    const update = () => {
      const max = el.scrollHeight - el.clientHeight;
      const ratio = max > 0 ? el.scrollTop / max : 0;
      setCurrentPage(Math.max(1, Math.min(numPages, Math.round(ratio * (numPages - 1)) + 1)));
    };
    el.addEventListener("scroll", update, { passive: true });
    update();
    return () => el.removeEventListener("scroll", update);
  }, [numPages]);

  // Execute pending jumps after pages are ready
  useEffect(() => {
    const j = pendingJump.current;
    if (!j || numPages === 0) return;
    const id = requestAnimationFrame(() => jumpToPage(j.page, j.hlId));
    pendingJump.current = null;
    return () => cancelAnimationFrame(id);
  }, [numPages]);

  // Selection → popover
  useEffect(() => {
    const onMouseUp = () => {
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        const pageEl = (range.startContainer.parentElement?.closest(".pdf-page")
          ?? range.commonAncestorContainer.parentElement?.closest(".pdf-page")) as HTMLElement | null;
        if (!pageEl) return;
        const pageNum = Number(pageEl.dataset.page);
        const handle = pageHandles.current.get(pageNum);
        if (!handle) return;
        const rects = handle.rectsFromRange(range);
        if (!rects || rects.length === 0) return;
        const text = sel.toString().trim();
        if (!text) return;

        const last = range.getBoundingClientRect();
        const rootRect = scrollRef.current!.getBoundingClientRect();
        const x = Math.min(last.right - rootRect.left + 8, rootRect.width - 340);
        const y = last.bottom - rootRect.top + scrollRef.current!.scrollTop + 8;

        setOverlay({ kind: "highlight", page: pageNum, rects, text, x: Math.max(16, x), y });
      }, 10);
    };
    const container = scrollRef.current;
    if (!container) return;
    container.addEventListener("mouseup", onMouseUp);
    return () => container.removeEventListener("mouseup", onMouseUp);
  }, [scrollRef.current, numPages]);

  // Keyboard shortcuts
  useEffect(() => {
    const inInput = () => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
    };

    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (e.key === "Escape") {
        if (overlay.kind !== "none") { setOverlay({ kind: "none" }); }
        else {
          const sel = window.getSelection();
          if (sel && !sel.isCollapsed) sel.removeAllRanges();
        }
        return;
      }

      if (mod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOverlay({ kind: "cmd" });
        return;
      }
      if (mod && e.key === ".") { e.preventDefault(); setRailOpen((v) => !v); return; }
      if (mod && (e.key === "," || e.key === "<")) { e.preventDefault(); setOverlay({ kind: "settings" }); return; }
      if (mod && e.shiftKey && (e.key === "d" || e.key === "D")) { e.preventDefault(); cycleTheme(); return; }
      if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); setZoom((z) => Math.min(2.2, z + 0.1)); return; }
      if (mod && e.key === "-") { e.preventDefault(); setZoom((z) => Math.max(0.5, z - 0.1)); return; }
      if (mod && e.key === "0") { e.preventDefault(); setZoom(1); return; }

      if (inInput() || overlay.kind === "cmd" || overlay.kind === "search" || overlay.kind === "shortcuts" || overlay.kind === "settings" || overlay.kind === "review" || overlay.kind === "highlight" || overlay.kind === "edit-highlight" || overlay.kind === "flashcard") return;

      if (e.key === "/") { e.preventDefault(); setOverlay({ kind: "search" }); return; }
      if (e.key === "?") { e.preventDefault(); setOverlay({ kind: "shortcuts" }); return; }
      if (e.key === "r" || e.key === "R") { e.preventDefault(); setOverlay({ kind: "review" }); return; }
      if (e.key === "[") { e.preventDefault(); jumpToChapter(-1); return; }
      if (e.key === "]") { e.preventDefault(); jumpToChapter(+1); return; }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay.kind, currentPage, outline, numPages]);

  function cycleTheme() {
    const themes: Theme[] = ["paper", "sepia", "night"];
    const i = themes.indexOf(settings.theme);
    saveSettings({ ...settings, theme: themes[(i + 1) % themes.length] });
  }

  const jumpToPage = useCallback((page: number, hlId?: string) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`.pdf-page[data-page="${page}"]`);
    if (!el) { pendingJump.current = { page, hlId }; return; }
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    if (hlId) {
      setTimeout(() => pageHandles.current.get(page)?.pulseHighlight(hlId), 350);
    }
  }, []);

  function jumpToChapter(dir: number) {
    const ch = flattenChapters(outline);
    if (ch.length === 0) return;
    const idx = ch.findIndex((c, i) => currentPage < (ch[i + 1]?.page ?? Infinity));
    const target = ch[Math.max(0, Math.min(ch.length - 1, idx + dir))];
    if (target) jumpToPage(target.page);
  }

  async function saveSelectionAsHighlight(color: HighlightColor, note?: string) {
    if (overlay.kind !== "highlight" || !book) return;
    const h: Highlight = {
      id: shortId(),
      bookId: book.id,
      page: overlay.page,
      rects: overlay.rects,
      color,
      text: overlay.text,
      note: note?.trim() || undefined,
      createdAt: Date.now(),
    };
    await addHighlight(h);
    setOverlay({ kind: "none" });
    window.getSelection()?.removeAllRanges();
  }

  async function makeFlashcardFromSelection(noteForBack?: string) {
    if (overlay.kind !== "highlight" || !book) return;
    const page = overlay.page;
    const text = overlay.text;
    const { x, y } = overlay;
    // save as yellow highlight first if none exists for this exact text
    const h: Highlight = {
      id: shortId(),
      bookId: book.id,
      page,
      rects: overlay.rects,
      color: "yellow",
      text,
      note: noteForBack,
      createdAt: Date.now(),
    };
    await addHighlight(h);
    setOverlay({ kind: "flashcard", page, text, back: noteForBack, x, y, highlightId: h.id });
  }

  function openFlashcardForHighlight(h: Highlight) {
    if (!scrollRef.current) return;
    const el = scrollRef.current.querySelector<HTMLElement>(`.pdf-page[data-page="${h.page}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const rootRect = scrollRef.current.getBoundingClientRect();
    const rx = h.rects[0] ?? { x: 0.2, y: 0.5, w: 0, h: 0 };
    const x = rect.left - rootRect.left + rx.x * rect.width;
    const y = rect.top - rootRect.top + scrollRef.current.scrollTop + (rx.y + rx.h) * rect.height + 8;
    setOverlay({ kind: "flashcard", page: h.page, text: h.text, back: h.note, x: Math.max(16, x), y, highlightId: h.id });
  }

  async function saveCard(front: string, back: string) {
    if (overlay.kind !== "flashcard" || !book) return;
    const card: Flashcard = {
      id: shortId(),
      bookId: book.id,
      page: overlay.page,
      front,
      back,
      sourceHighlightId: overlay.highlightId,
      sm2: newCardSM2(),
      createdAt: Date.now(),
    };
    await addCard(card);
    setOverlay({ kind: "none" });
  }

  function openHighlightEdit(h: Highlight) {
    if (!scrollRef.current) return;
    const el = scrollRef.current.querySelector<HTMLElement>(`.pdf-page[data-page="${h.page}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const rootRect = scrollRef.current.getBoundingClientRect();
    const rx = h.rects[0] ?? { x: 0.2, y: 0.5, w: 0, h: 0 };
    const x = Math.min(rect.left - rootRect.left + (rx.x + rx.w) * rect.width + 8, rootRect.width - 340);
    const y = rect.top - rootRect.top + scrollRef.current.scrollTop + (rx.y + rx.h) * rect.height + 8;
    setOverlay({ kind: "edit-highlight", id: h.id, x: Math.max(16, x), y });
  }

  const commandItems: CommandItem[] = useMemo(() => {
    const items: CommandItem[] = [];
    if (book) {
      items.push({
        id: "back", label: "Back to Library", sub: "newtab",
        section: "Navigate", keys: "⌘N",
        run: () => { location.href = chrome.runtime.getURL("newtab.html"); },
      });
      items.push({
        id: "toggle-rail", label: railOpen ? "Close rail" : "Open rail",
        section: "Navigate", keys: "⌘.",
        run: () => setRailOpen((v) => !v),
      });
    }
    for (const ch of flattenChapters(outline)) {
      items.push({
        id: `jump:${ch.page}`,
        label: ch.title,
        sub: `chapter · p.${ch.page}`,
        section: "Jump",
        run: () => jumpToPage(ch.page),
      });
    }
    items.push({
      id: "settings", label: "Open settings", sub: "reading · theme · accent",
      section: "Actions", keys: "⌘,",
      run: () => setOverlay({ kind: "settings" }),
    });
    items.push({
      id: "shortcuts", label: "Keyboard shortcuts", sub: "every key",
      section: "Actions", keys: "?",
      run: () => setOverlay({ kind: "shortcuts" }),
    });
    items.push({
      id: "review", label: `Review due cards${cards.length ? ` · ${cards.filter((c) => c.sm2.dueAt <= Date.now()).length} now` : ""}`,
      section: "Actions", keys: "R",
      run: () => setOverlay({ kind: "review" }),
    });
    items.push({
      id: "theme", label: "Cycle theme", sub: `${settings.theme} → next`,
      section: "Actions", keys: "⇧⌘D",
      run: () => cycleTheme(),
    });
    items.push({
      id: "summary", label: "Chapter summary · from your marks",
      section: "Actions",
      run: () => setOverlay({ kind: "summary" }),
    });
    return items;
  }, [book, outline, railOpen, cards, settings.theme]);

  const bookCards = useMemo(() => cards.filter((c) => c.bookId === book?.id), [cards, book?.id]);
  const editingHighlight = overlay.kind === "edit-highlight"
    ? highlights.find((h) => h.id === overlay.id)
    : null;

  if (loadError) {
    return (
      <div className="reader-root" style={{ gridTemplateColumns: "1fr" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 16 }}>
          <div style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 500 }}>Couldn't open this PDF.</div>
          <div className="meta-s">{loadError}</div>
          <button className="btn" onClick={() => location.href = chrome.runtime.getURL("newtab.html")}>Back to Library</button>
        </div>
      </div>
    );
  }

  if (!pdf || !book || !firstVp || numPages === 0) {
    return (
      <div className="loading">loading PDF…</div>
    );
  }

  return (
    <div className="reader-root" style={{ gridTemplateColumns: railOpen ? "1fr 360px" : "1fr 0" }}>
      <div className="reader-main">
        <div className="reader-toolbar">
          <button className="back" onClick={() => location.href = chrome.runtime.getURL("newtab.html")}>← library</button>
          <div className="title" title={book.title}>{book.title}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              className="page-input"
              value={currentPage}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isNaN(n) && n >= 1 && n <= numPages) jumpToPage(n);
              }}
            />
            <span className="meta-s" style={{ fontSize: 10 }}>/ {numPages}</span>
          </div>
          <span className="spacer" />
          <div className="zoom-controls">
            <button className="tool" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))} title="Zoom out (⌘-)">−</button>
            <span className="zoom-label" onClick={() => setZoom(1)} title="Reset zoom (⌘0)">{Math.round(zoom * 100)}%</span>
            <button className="tool" onClick={() => setZoom((z) => Math.min(2.2, +(z + 0.1).toFixed(1)))} title="Zoom in (⌘+)">+</button>
          </div>
          <button
            className={`tool${railOpen && railTab === "outline" ? " on" : ""}`}
            onClick={() => {
              setRailTab("outline");
              setRailOpen((v) => !(v && railTab === "outline"));
            }}
            title="Contents (⌘.)"
            style={{ display: "flex", alignItems: "center", gap: 5, paddingRight: 8 }}
          >
            <span style={{ fontSize: 13, lineHeight: 1 }}>☰</span>
            <span style={{ fontSize: 11 }}>Contents</span>
          </button>
          <button className="tool" onClick={() => setOverlay({ kind: "cmd" })} title="⌘K">⌘K</button>
          <button className="tool" onClick={() => setOverlay({ kind: "search" })} title="/">/</button>
          <button className="tool" onClick={() => setOverlay({ kind: "review" })} title="Review">R</button>
          <button className="tool" onClick={cycleTheme} title={`Theme: ${settings.theme}`} style={{ fontSize: 14 }}>
            {settings.theme === "night" ? "☀" : "☾"}
          </button>
          <button className="tool" onClick={() => setOverlay({ kind: "settings" })} title="Settings">⚙</button>
          <button className="tool" onClick={() => setOverlay({ kind: "shortcuts" })} title="Shortcuts">?</button>
        </div>
        <div className="reader-scroll-area" onWheel={(e) => {
          if (!e.metaKey && !e.ctrlKey) return;
          e.preventDefault();
          const delta = e.deltaY > 0 ? -0.1 : 0.1;
          setZoom((z) => Math.min(2.2, Math.max(0.5, +((z + delta).toFixed(1)))));
        }}>
          <div className="pdf-scroll" ref={scrollRef}>
            {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
              <PdfPage
                key={n}
                pdf={pdf}
                pageNumber={n}
                initialSize={firstVp}
                scale={scale}
                highlights={highlights.filter((h) => h.page === n)}
                customColors={settings.customColors}
                onHighlightClick={openHighlightEdit}
                ref={(h) => {
                  if (h) pageHandles.current.set(n, h);
                  else pageHandles.current.delete(n);
                }}
              />
            ))}
          </div>
          <ChapterRuler scrollRef={scrollRef} outline={outline} numPages={numPages} onJumpPage={jumpToPage} />
        </div>
      </div>
      {railOpen ? (
        <Rail
          outline={outline}
          highlights={highlights}
          cards={bookCards}
          bookTitle={book.title}
          currentPage={currentPage}
          customColors={settings.customColors}
          tab={railTab}
          onTabChange={setRailTab}
          onJumpPage={jumpToPage}
          onJumpHighlight={(h) => jumpToPage(h.page, h.id)}
          onDeleteCard={(id) => deleteCard(id)}
          onUpdateHighlight={(h) => { if (book) updateHighlight(h); }}
          onClose={() => setRailOpen(false)}
        />
      ) : (
        <div className="rail-closed" title="Open rail (⌘.)" onClick={() => setRailOpen(true)} />
      )}

      {overlay.kind === "highlight" && (
        <HighlightPopover
          x={overlay.x}
          y={overlay.y}
          meanings={settings.colorMeanings}
          customColors={settings.customColors}
          onSave={(d) => saveSelectionAsHighlight(d.color, d.note)}
          onMakeFlashcard={(d) => makeFlashcardFromSelection(d.note)}
          onClose={() => { setOverlay({ kind: "none" }); window.getSelection()?.removeAllRanges(); }}
        />
      )}

      {overlay.kind === "edit-highlight" && editingHighlight && (
        <HighlightPopover
          x={overlay.x}
          y={overlay.y}
          initialColor={editingHighlight.color}
          initialNote={editingHighlight.note ?? ""}
          meanings={settings.colorMeanings}
          customColors={settings.customColors}
          canDelete
          onSave={async (d) => {
            await updateHighlight({ ...editingHighlight, color: d.color, note: d.note || undefined });
            setOverlay({ kind: "none" });
          }}
          onMakeFlashcard={() => openFlashcardForHighlight(editingHighlight)}
          onDelete={async () => {
            if (!book) return;
            await deleteHighlight(book.id, editingHighlight.id);
            setOverlay({ kind: "none" });
          }}
          onClose={() => setOverlay({ kind: "none" })}
        />
      )}

      {overlay.kind === "flashcard" && (
        <FlashcardCreate
          x={overlay.x}
          y={overlay.y}
          page={overlay.page}
          suggestedFront={suggestFront(overlay.text)}
          suggestedBack={overlay.back ?? suggestBack(overlay.text)}
          onSave={saveCard}
          onClose={() => setOverlay({ kind: "none" })}
        />
      )}

      {overlay.kind === "cmd" && (
        <CommandPalette items={commandItems} onClose={() => setOverlay({ kind: "none" })} />
      )}

      {overlay.kind === "search" && (
        <CrossBookSearch
          onClose={() => setOverlay({ kind: "none" })}
          onJumpHighlight={(b2, h) => {
            if (b2.id === book.id) jumpToPage(h.page, h.id);
            else location.href = chrome.runtime.getURL(`reader.html?book=${b2.id}&p=${h.page}&h=${h.id}`);
          }}
          onJumpPage={(b2, p) => {
            if (b2.id === book.id) jumpToPage(p);
            else location.href = chrome.runtime.getURL(`reader.html?book=${b2.id}&p=${p}`);
          }}
        />
      )}

      {overlay.kind === "shortcuts" && (
        <Shortcuts onClose={() => setOverlay({ kind: "none" })} />
      )}

      {overlay.kind === "settings" && (
        <SettingsSheet settings={settings} onClose={() => setOverlay({ kind: "none" })} />
      )}

      {overlay.kind === "review" && (
        <Review onClose={() => setOverlay({ kind: "none" })} />
      )}

      {overlay.kind === "summary" && (
        <ChapterSummary
          chapter={currentChapterTitle(outline, currentPage)}
          page={currentPage}
          highlights={highlightsInChapter(highlights, outline, currentPage)}
          onJump={jumpToPage}
          onClose={() => setOverlay({ kind: "none" })}
        />
      )}
    </div>
  );
}

function flattenChapters(outline: OutlineItem[]): { title: string; page: number }[] {
  const out: { title: string; page: number }[] = [];
  const walk = (list: OutlineItem[]) => {
    for (const it of list) {
      if (it.page) out.push({ title: it.title, page: it.page });
      walk(it.children);
    }
  };
  walk(outline);
  return out.sort((a, b) => a.page - b.page);
}

function currentChapterTitle(outline: OutlineItem[], page: number): string {
  const ch = flattenChapters(outline);
  for (let i = ch.length - 1; i >= 0; i--) {
    if (ch[i].page <= page) return ch[i].title;
  }
  return "this chapter";
}

function highlightsInChapter(highlights: Highlight[], outline: OutlineItem[], page: number): Highlight[] {
  const ch = flattenChapters(outline);
  if (ch.length === 0) return highlights.filter((h) => Math.abs(h.page - page) <= 5);
  let start = 1, end = Infinity;
  for (let i = 0; i < ch.length; i++) {
    if (ch[i].page <= page) { start = ch[i].page; end = ch[i + 1]?.page ?? Infinity; }
  }
  return highlights.filter((h) => h.page >= start && h.page < end);
}

function suggestFront(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length < 80) return t;
  // Try to find a sentence boundary
  const m = t.match(/^.{20,140}?[.!?](?=\s|$)/);
  return (m ? m[0] : t.slice(0, 140)) + (m ? "" : "…");
}

function suggestBack(_text: string): string {
  return "";
}

function ChapterRuler({
  scrollRef,
  outline,
  numPages,
  onJumpPage,
}: {
  scrollRef: React.RefObject<HTMLDivElement>;
  outline: OutlineItem[];
  numPages: number;
  onJumpPage: (page: number) => void;
}) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? el.scrollTop / max : 0);
    };
    el.addEventListener("scroll", update, { passive: true });
    update();
    return () => el.removeEventListener("scroll", update);
  }, [scrollRef.current]);

  const marks = useMemo(() => {
    const out: { page: number; level: number; title: string }[] = [];
    const walk = (items: OutlineItem[]) => {
      for (const it of items) {
        if (it.page) out.push({ page: it.page, level: it.level, title: it.title });
        walk(it.children);
      }
    };
    walk(outline);
    return out;
  }, [outline]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    el.scrollTop = fraction * (el.scrollHeight - el.clientHeight);
  };

  return (
    <div className="chapter-ruler" onClick={handleClick} title="Click to jump">
      <div className="chapter-ruler-fill" style={{ height: `${progress * 100}%` }} />
      {numPages > 0 && marks.map((m, i) => (
        <div
          key={i}
          className={`chapter-ruler-mark${m.level === 0 ? " major" : ""}`}
          style={{ top: `${(m.page / numPages) * 100}%` }}
          title={m.title}
          onClick={(e) => { e.stopPropagation(); onJumpPage(m.page); }}
        />
      ))}
      <div className="chapter-ruler-thumb" style={{ top: `${progress * 100}%` }} />
    </div>
  );
}
