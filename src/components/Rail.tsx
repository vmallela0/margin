import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CustomColor, Flashcard, Highlight, HighlightColor, ThreadEntry } from "../lib/types";
import type { OutlineItem } from "../lib/pdf";
import { resolveHighlightBg } from "../lib/colors";

export type RailTab = "outline" | "marks" | "ask";
type MarkFilter = "all" | "notes" | "cards";

type AskMessage = {
  role: "user" | "assistant";
  text: string;
  citations?: Array<{ id: string; page: number; text: string; color: HighlightColor }>;
};

export function Rail({
  outline,
  highlights,
  cards,
  currentPage,
  numPages,
  customColors = [],
  tab,
  onTabChange,
  onJumpPage,
  onJumpHighlight,
  onDeleteCard,
  onUpdateHighlight,
  onClose,
  bookTitle,
}: {
  outline: OutlineItem[];
  highlights: Highlight[];
  cards: Flashcard[];
  currentPage: number;
  numPages: number;
  customColors?: CustomColor[];
  tab: RailTab;
  onTabChange: (t: RailTab) => void;
  onJumpPage: (page: number) => void;
  onJumpHighlight: (h: Highlight) => void;
  onDeleteCard: (id: string) => void;
  onUpdateHighlight: (h: Highlight) => void;
  onClose: () => void;
  bookTitle: string;
}) {
  const flatOutline = useMemo(() => flattenForDisplay(outline), [outline]);

  const currentOutlineIdx = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < flatOutline.length; i++) {
      const p = flatOutline[i].page;
      if (p && p <= currentPage) idx = i;
    }
    return idx;
  }, [flatOutline, currentPage]);

  const [flashIdx, setFlashIdx] = useState<number | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleJump = (page: number, idx: number) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlashIdx(idx);
    flashTimer.current = setTimeout(() => setFlashIdx(null), 1500);
    onJumpPage(page);
  };

  const listRef = useRef<HTMLDivElement>(null);
  const currentOutlineRef = useRef<HTMLAnchorElement>(null);
  const currentGroupRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (tab !== "outline") return;
    if (!currentOutlineRef.current || !listRef.current) return;
    const row = currentOutlineRef.current;
    const list = listRef.current;
    const rowTop = row.offsetTop;
    const rowBottom = rowTop + row.offsetHeight;
    const viewTop = list.scrollTop;
    const viewBottom = viewTop + list.clientHeight;
    if (rowTop < viewTop || rowBottom > viewBottom) {
      list.scrollTo({ top: rowTop - list.clientHeight / 3, behavior: "smooth" });
    }
  }, [tab, currentOutlineIdx]);

  useLayoutEffect(() => {
    if (tab !== "marks" || !currentGroupRef.current || !listRef.current) return;
    const el = currentGroupRef.current;
    const list = listRef.current;
    const elTop = el.offsetTop;
    const viewTop = list.scrollTop;
    const viewBottom = viewTop + list.clientHeight;
    if (elTop < viewTop || elTop > viewBottom) {
      list.scrollTo({ top: elTop - 60, behavior: "smooth" });
    }
  }, [tab, currentPage]);

  // Marks tab state
  const [markFilter, setMarkFilter] = useState<MarkFilter>("all");

  const chapterGroups = useMemo(
    () => buildChapterGroups(highlights, cards, outline, numPages, currentPage),
    [highlights, cards, outline, numPages, currentPage],
  );

  // Ask tab state
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [askInput, setAskInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const askInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tab === "ask") askInputRef.current?.focus();
  }, [tab]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleAsk() {
    const q = askInput.trim();
    if (!q) return;
    setAskInput("");
    const results = searchHighlights(q, highlights);
    const userMsg: AskMessage = { role: "user", text: q };
    const assistantMsg: AskMessage = {
      role: "assistant",
      text: results.length > 0
        ? `Found ${results.length} relevant passage${results.length === 1 ? "" : "s"}:`
        : "No highlights match your query. Try highlighting relevant passages as you read.",
      citations: results.slice(0, 5).map((h) => ({
        id: h.id, page: h.page, text: h.text, color: h.color,
      })),
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
  }

  return (
    <aside className="rail">
      <div className="rail-head">
        <span className="title">{bookTitle}</span>
        <span className="spacer" />
        <button className="btn" style={{ padding: "2px 8px" }} onClick={onClose} title="Close (⌘.)">✕</button>
      </div>
      <nav className="rail-tabs">
        {(["outline", "marks", "ask"] as RailTab[]).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => onTabChange(t)}>
            {t === "outline" ? "contents" : t}
            {t === "marks" && (highlights.length + cards.length) > 0 && (
              <span style={{ marginLeft: 6, color: "var(--ink-3)" }}>{highlights.length + cards.length}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="rail-body" ref={listRef}>
        {/* ── Outline tab ── */}
        {tab === "outline" && (
          flatOutline.length === 0 ? (
            <div className="meta-s" style={{ padding: 14, textAlign: "center" }}>No table of contents in this document.</div>
          ) : (
            <div className="outline-list">
              {flatOutline.map((o, i) => {
                const isCurrent = i === currentOutlineIdx;
                const indent = 8 + Math.min(o.level, 5) * 14;
                return (
                  <a
                    key={i}
                    ref={isCurrent ? currentOutlineRef : undefined}
                    className={`outline-item${isCurrent ? " current" : ""}${flashIdx === i ? " flash" : ""} lvl-${Math.min(o.level, 5)}`}
                    style={{ paddingLeft: indent }}
                    onClick={() => o.page && handleJump(o.page, i)}
                    title={o.title}
                  >
                    <span className="num">{o.level === 0 ? "▸" : "·"}</span>
                    <span className="t">{o.title}</span>
                    {o.page && <span className="pg">{o.page}</span>}
                  </a>
                );
              })}
            </div>
          )
        )}

        {/* ── Marks tab ── */}
        {tab === "marks" && (
          <div>
            <div className="marks-filters">
              {(["all", "notes", "cards"] as MarkFilter[]).map((f) => (
                <button
                  key={f}
                  className={`marks-chip${markFilter === f ? " on" : ""}`}
                  onClick={() => setMarkFilter(f)}
                >
                  {f === "all"
                    ? `all · ${highlights.length + cards.length}`
                    : f === "notes"
                    ? `notes · ${highlights.length}`
                    : `cards · ${cards.length}`}
                </button>
              ))}
            </div>

            {highlights.length + cards.length === 0 ? (
              <div className="meta-s" style={{ padding: "20px 14px", textAlign: "center" }}>
                No marks yet.<br />H to highlight · F for a flashcard.
              </div>
            ) : (
              chapterGroups.map((group) => {
                const visibleNotes = markFilter !== "cards" ? group.notes : [];
                const visibleCards = markFilter !== "notes" ? group.cards : [];
                if (visibleNotes.length + visibleCards.length === 0 && !group.isCurrent) return null;
                return (
                  <div
                    key={group.key}
                    ref={group.isCurrent ? currentGroupRef : undefined}
                    className={`marks-chapter${group.isCurrent ? " current" : ""}`}
                  >
                    {group.title && (
                      <div className="marks-chapter-hd">
                        <span className="marks-chapter-title">{group.title}</span>
                        {group.isCurrent && <span className="marks-you-here">here</span>}
                      </div>
                    )}
                    {visibleNotes.length > 0 && (
                      <div className="note-list">
                        {visibleNotes.map((h) => (
                          <NoteRow
                            key={h.id}
                            highlight={h}
                            customColors={customColors}
                            onJump={() => onJumpHighlight(h)}
                            onAddThread={(text) => {
                              const entry: ThreadEntry = { text, createdAt: Date.now() };
                              onUpdateHighlight({ ...h, threads: [...(h.threads ?? []), entry] });
                            }}
                          />
                        ))}
                      </div>
                    )}
                    {visibleCards.map((c) => (
                      <div key={c.id} className="marks-card-row">
                        <div className="marks-card-front">{c.front}</div>
                        {c.back && <div className="marks-card-back">{c.back}</div>}
                        <div className="marks-card-meta">
                          <span className="chip" style={{ padding: "0 5px", cursor: "pointer" }} onClick={() => onJumpPage(c.page)}>p.{c.page}</span>
                          <span>{c.sm2.dueAt <= Date.now() ? "due" : `in ${formatDays(c.sm2.dueAt - Date.now())}`}</span>
                          <span style={{ marginLeft: "auto" }}>
                            <button
                              className="btn"
                              style={{ padding: "1px 6px", fontSize: 10, color: "#B14B4B", borderColor: "transparent" }}
                              onClick={() => onDeleteCard(c.id)}
                            >del</button>
                          </span>
                        </div>
                      </div>
                    ))}
                    {visibleNotes.length + visibleCards.length === 0 && group.isCurrent && (
                      <div className="meta-s" style={{ padding: "8px 14px", fontStyle: "italic" }}>
                        No marks in this section yet.
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── Ask tab ── */}
        {tab === "ask" && (
          <div className="ask-body">
            {messages.length === 0 && (
              <div className="ask-empty">
                <div className="ask-empty-icon">?</div>
                <div className="ask-empty-text">Ask questions about your highlights.</div>
                <div className="meta-s" style={{ marginTop: 6 }}>
                  Searches your annotated passages locally.
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`ask-msg ask-msg-${msg.role}`}>
                <div className="ask-msg-text">{msg.text}</div>
                {msg.citations && msg.citations.length > 0 && (
                  <div className="ask-citations">
                    {msg.citations.map((c) => (
                      <div
                        key={c.id}
                        className="ask-citation"
                        onClick={() => { const h = highlights.find((x) => x.id === c.id); if (h) onJumpHighlight(h); }}
                        style={{ cursor: "pointer" }}
                      >
                        <span className="ask-citation-dot" style={{ background: resolveHighlightBg(c.color, customColors) }} />
                        <span className="ask-citation-text">{truncate(c.text, 120)}</span>
                        <span className="ask-citation-page">p.{c.page}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Ask input footer */}
      {tab === "ask" && (
        <div className="ask-input-row">
          <input
            ref={askInputRef}
            className="ask-input"
            placeholder="Ask about your highlights…"
            value={askInput}
            onChange={(e) => setAskInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAsk();
              if (e.key === "Escape") setAskInput("");
            }}
          />
          <button
            className="btn primary"
            style={{ padding: "5px 10px", fontSize: 11, flexShrink: 0 }}
            onClick={handleAsk}
            disabled={!askInput.trim()}
          >→</button>
        </div>
      )}
    </aside>
  );
}

// ── NoteRow ──────────────────────────────────────────────────────────────────

function NoteRow({
  highlight: h,
  customColors,
  onJump,
  onAddThread,
}: {
  highlight: Highlight;
  customColors: CustomColor[];
  onJump: () => void;
  onAddThread: (text: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [threadDraft, setThreadDraft] = useState("");
  const [hovering, setHovering] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submitThread = () => {
    const t = threadDraft.trim();
    if (!t) return;
    onAddThread(t);
    setThreadDraft("");
  };

  return (
    <div
      className={`note${expanded ? " expanded" : ""}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {hovering && h.note && (
        <div className="note-tooltip">{h.note}</div>
      )}
      <div className="text" onClick={() => setExpanded((v) => !v)} style={{ cursor: "pointer" }}>
        <span className="swatch" style={{ background: resolveHighlightBg(h.color, customColors) }} />
        {truncate(h.text, expanded ? 9999 : 160)}
      </div>
      {h.note && <div className="note-body">— {h.note}</div>}
      {(h.threads ?? []).map((t, i) => (
        <div key={i} className="thread-entry">
          <span className="thread-line" />
          <span className="thread-text">{t.text}</span>
        </div>
      ))}
      <div className="note-footer">
        <span className="anchor" onClick={onJump}>→ p.{h.page}</span>
        <button
          className="thread-add-btn"
          onClick={() => { setExpanded(true); setTimeout(() => inputRef.current?.focus(), 0); }}
          title="Add a thread comment"
        >⤷ reply</button>
      </div>
      {expanded && (
        <div className="thread-input-row">
          <input
            ref={inputRef}
            className="thread-input"
            placeholder="Add a comment…"
            value={threadDraft}
            onChange={(e) => setThreadDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitThread();
              if (e.key === "Escape") { setExpanded(false); setThreadDraft(""); }
            }}
          />
          <button className="btn primary" style={{ padding: "3px 8px", fontSize: 11 }} onClick={submitThread}>↵</button>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type ChapterGroup = {
  key: string;
  title: string;
  startPage: number;
  endPage: number;
  notes: Highlight[];
  cards: Flashcard[];
  isCurrent: boolean;
};

function buildChapterGroups(
  highlights: Highlight[],
  cards: Flashcard[],
  outline: OutlineItem[],
  numPages: number,
  currentPage: number,
): ChapterGroup[] {
  const chapters: { title: string; page: number }[] = [];
  const walk = (items: OutlineItem[], depth: number) => {
    for (const it of items) {
      if (depth === 0 && it.page) chapters.push({ title: it.title, page: it.page });
      walk(it.children, depth + 1);
    }
  };
  walk(outline, 0);

  if (chapters.length === 0) {
    return [{
      key: "_all",
      title: "",
      startPage: 1,
      endPage: numPages,
      notes: highlights.slice().sort((a, b) => a.page - b.page || a.createdAt - b.createdAt),
      cards: cards.slice().sort((a, b) => a.page - b.page || a.createdAt - b.createdAt),
      isCurrent: true,
    }].filter((g) => g.notes.length + g.cards.length > 0 || g.isCurrent);
  }

  chapters.sort((a, b) => a.page - b.page);

  return chapters
    .map((ch, i) => {
      const startPage = ch.page;
      const endPage = (chapters[i + 1]?.page ?? numPages + 1) - 1;
      const chNotes = highlights
        .filter((h) => h.page >= startPage && h.page <= endPage)
        .sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);
      const chCards = cards
        .filter((c) => c.page >= startPage && c.page <= endPage)
        .sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);
      const isCurrent = currentPage >= startPage && currentPage <= endPage;
      return { key: ch.title, title: ch.title, startPage, endPage, notes: chNotes, cards: chCards, isCurrent };
    })
    .filter((g) => g.notes.length + g.cards.length > 0 || g.isCurrent);
}

function flattenForDisplay(items: OutlineItem[]): { title: string; page?: number; level: number }[] {
  const out: { title: string; page?: number; level: number }[] = [];
  const walk = (list: OutlineItem[]) => {
    for (const it of list) {
      out.push({ title: it.title, page: it.page, level: it.level });
      walk(it.children);
    }
  };
  walk(items);
  return out;
}

function searchHighlights(query: string, highlights: Highlight[]): Highlight[] {
  const stopWords = new Set(["the","a","an","in","on","at","to","for","of","and","or","is","are","was","were","be","been","this","that","with","from","by","as","it","its"]);
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !stopWords.has(t));
  if (tokens.length === 0) return [];
  return highlights
    .map((h) => {
      const text = h.text.toLowerCase();
      const noteText = (h.note ?? "").toLowerCase();
      const score = tokens.reduce(
        (s, t) => s + (text.includes(t) ? 2 : 0) + (noteText.includes(t) ? 1 : 0),
        0,
      );
      return { h, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ h }) => h);
}

function truncate(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n).trimEnd() + "…";
}

function formatDays(ms: number) {
  const d = Math.round(ms / (24 * 60 * 60 * 1000));
  if (d < 1) return "<1d";
  if (d < 30) return `${d}d`;
  return `${Math.round(d / 30)}mo`;
}
