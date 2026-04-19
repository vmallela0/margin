import { useLayoutEffect, useMemo, useRef } from "react";
import type { CustomColor, Flashcard, Highlight } from "../lib/types";
import type { OutlineItem } from "../lib/pdf";
import { resolveHighlightBg } from "../lib/colors";

export type RailTab = "outline" | "notes" | "cards";

export function Rail({
  outline,
  highlights,
  cards,
  currentPage,
  customColors = [],
  tab,
  onTabChange,
  onJumpPage,
  onJumpHighlight,
  onDeleteCard,
  onClose,
  bookTitle,
}: {
  outline: OutlineItem[];
  highlights: Highlight[];
  cards: Flashcard[];
  currentPage: number;
  customColors?: CustomColor[];
  tab: RailTab;
  onTabChange: (t: RailTab) => void;
  onJumpPage: (page: number) => void;
  onJumpHighlight: (h: Highlight) => void;
  onDeleteCard: (id: string) => void;
  onClose: () => void;
  bookTitle: string;
}) {
  const flatOutline = useMemo(() => flattenForDisplay(outline), [outline]);

  // Determine current chapter: deepest outline entry whose page <= currentPage.
  const currentIdx = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < flatOutline.length; i++) {
      const p = flatOutline[i].page;
      if (p && p <= currentPage) idx = i;
    }
    return idx;
  }, [flatOutline, currentPage]);

  const listRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLAnchorElement>(null);

  // When the outline tab opens or current chapter changes, scroll current into view.
  useLayoutEffect(() => {
    if (tab !== "outline") return;
    if (!currentRef.current || !listRef.current) return;
    const row = currentRef.current;
    const list = listRef.current;
    const rowTop = row.offsetTop;
    const rowBottom = rowTop + row.offsetHeight;
    const viewTop = list.scrollTop;
    const viewBottom = viewTop + list.clientHeight;
    if (rowTop < viewTop || rowBottom > viewBottom) {
      list.scrollTo({ top: rowTop - list.clientHeight / 3, behavior: "smooth" });
    }
  }, [tab, currentIdx]);

  return (
    <aside className="rail">
      <div className="rail-head">
        <span className="title">{bookTitle}</span>
        <span className="spacer" />
        <button className="btn" style={{ padding: "2px 8px" }} onClick={onClose} title="Close (⌘.)">✕</button>
      </div>
      <nav className="rail-tabs">
        {(["outline", "notes", "cards"] as RailTab[]).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => onTabChange(t)}>
            {t === "outline" ? "contents" : t}
            {t === "notes" && highlights.length > 0 && <span style={{ marginLeft: 6, color: "var(--ink-3)" }}>{highlights.length}</span>}
            {t === "cards" && cards.length > 0 && <span style={{ marginLeft: 6, color: "var(--ink-3)" }}>{cards.length}</span>}
          </button>
        ))}
      </nav>

      <div className="rail-body" ref={listRef}>
        {tab === "outline" && (
          flatOutline.length === 0 ? (
            <div className="meta-s" style={{ padding: 14, textAlign: "center" }}>No table of contents in this document.</div>
          ) : (
            <div className="outline-list">
              {flatOutline.map((o, i) => {
                const isCurrent = i === currentIdx;
                const indent = 8 + Math.min(o.level, 5) * 14;
                return (
                  <a
                    key={i}
                    ref={isCurrent ? currentRef : undefined}
                    className={`outline-item${isCurrent ? " current" : ""} lvl-${Math.min(o.level, 5)}`}
                    style={{ paddingLeft: indent }}
                    onClick={() => o.page && onJumpPage(o.page)}
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

        {tab === "notes" && (
          highlights.length === 0 ? (
            <div className="meta-s" style={{ padding: 14, textAlign: "center" }}>Select text and press H to highlight.</div>
          ) : (
            <div className="note-list">
              {highlights
                .slice()
                .sort((a, b) => a.page - b.page || a.createdAt - b.createdAt)
                .map((h) => (
                  <div key={h.id} className="note">
                    <div className="text">
                      <span className="swatch" style={{ background: resolveHighlightBg(h.color, customColors) }} />
                      {truncate(h.text, 180)}
                    </div>
                    {h.note && <div className="note-body">— {h.note}</div>}
                    <div className="anchor" onClick={() => onJumpHighlight(h)}>→ p.{h.page}</div>
                  </div>
                ))}
            </div>
          )
        )}

        {tab === "cards" && (
          cards.length === 0 ? (
            <div className="meta-s" style={{ padding: 14, textAlign: "center" }}>Press F on selected text to make a flashcard.</div>
          ) : (
            <div className="cards-list">
              {cards
                .slice()
                .sort((a, b) => a.page - b.page || a.createdAt - b.createdAt)
                .map((c) => (
                  <div key={c.id} className="card-row">
                    <div className="front">{c.front}</div>
                    {c.back && <div className="back">{c.back}</div>}
                    <div className="meta">
                      <span className="chip" style={{ padding: "0 5px" }} onClick={() => onJumpPage(c.page)}>p.{c.page}</span>
                      <span>ef {c.sm2.easiness.toFixed(2)}</span>
                      <span>·</span>
                      <span>{c.sm2.dueAt <= Date.now() ? "due" : `in ${formatDays(c.sm2.dueAt - Date.now())}`}</span>
                      <span style={{ marginLeft: "auto" }}>
                        <button
                          className="btn"
                          style={{ padding: "1px 6px", fontSize: 10, color: "#B14B4B", borderColor: "transparent" }}
                          onClick={() => onDeleteCard(c.id)}
                        >
                          delete
                        </button>
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )
        )}
      </div>
    </aside>
  );
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

function truncate(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n).trimEnd() + "…";
}

function formatDays(ms: number) {
  const d = Math.round(ms / (24 * 60 * 60 * 1000));
  if (d < 1) return "<1d";
  if (d < 30) return `${d}d`;
  return `${Math.round(d / 30)}mo`;
}
