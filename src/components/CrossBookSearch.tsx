import { useEffect, useMemo, useRef, useState } from "react";
import type { Book, Flashcard, Highlight } from "../lib/types";
import { listBooks, listCards, listHighlights } from "../lib/storage";

type Hit =
  | { kind: "highlight"; book: Book; h: Highlight }
  | { kind: "card"; book: Book; card: Flashcard };

export function CrossBookSearch({
  onClose,
  onJumpHighlight,
  onJumpPage,
  placeholder = "Search highlights, notes, cards…",
}: {
  onClose: () => void;
  onJumpHighlight: (book: Book, h: Highlight) => void;
  onJumpPage: (book: Book, page: number) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [hlByBook, setHlByBook] = useState<Record<string, Highlight[]>>({});
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    (async () => {
      const bs = await listBooks();
      setBooks(bs);
      setCards(await listCards());
      const entries = await Promise.all(bs.map(async (b) => [b.id, await listHighlights(b.id)] as const));
      setHlByBook(Object.fromEntries(entries));
    })();
  }, []);

  const grouped = useMemo(() => {
    if (!q.trim()) return [] as [Book, Hit[]][];
    const needle = q.toLowerCase();
    const byBook = new Map<string, Hit[]>();
    for (const b of books) {
      const list: Hit[] = [];
      for (const h of hlByBook[b.id] ?? []) {
        if (h.text.toLowerCase().includes(needle) || h.note?.toLowerCase().includes(needle)) {
          list.push({ kind: "highlight", book: b, h });
        }
      }
      for (const c of cards) {
        if (c.bookId !== b.id) continue;
        if (c.front.toLowerCase().includes(needle) || c.back.toLowerCase().includes(needle)) {
          list.push({ kind: "card", book: b, card: c });
        }
      }
      if (list.length) byBook.set(b.id, list);
    }
    return Array.from(byBook.entries()).map(([bid, hits]) => [books.find((b) => b.id === bid)!, hits] as [Book, Hit[]]);
  }, [q, books, hlByBook, cards]);

  const flat = useMemo(() => grouped.flatMap(([, hs]) => hs), [grouped]);

  useEffect(() => setIdx(0), [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, flat.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter" && flat[idx]) {
        e.preventDefault();
        jump(flat[idx]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, idx]);

  function jump(hit: Hit) {
    onClose();
    if (hit.kind === "highlight") onJumpHighlight(hit.book, hit.h);
    else onJumpPage(hit.book, hit.card.page);
  }

  const totalCount = flat.length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="cmd-panel" onClick={(e) => e.stopPropagation()} style={{ width: "min(620px, 94vw)" }}>
        <div className="header">
          <span className="kbd2">/</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
          />
          <span className="meta-s" style={{ fontSize: 9 }}>{totalCount} · {grouped.length} book{grouped.length === 1 ? "" : "s"}</span>
        </div>
        {!q.trim() && (
          <div className="empty">Your highlights and cards, searchable.</div>
        )}
        {q.trim() && grouped.length === 0 && (
          <div className="empty">No matches.</div>
        )}
        {grouped.map(([book, hits]) => (
          <div key={book.id} className="section">
            <div className="label">{book.title}</div>
            {hits.map((hit) => {
              const k = hit.kind === "highlight" ? `h:${hit.h.id}` : `c:${hit.card.id}`;
              const active = flat[idx] === hit;
              return (
                <div
                  key={k}
                  className={`item${active ? " active" : ""}`}
                  onMouseEnter={() => setIdx(flat.indexOf(hit))}
                  onClick={() => jump(hit)}
                >
                  <span className="chip" style={{ padding: "0 5px", fontSize: 9.5 }}>
                    p.{hit.kind === "highlight" ? hit.h.page : hit.card.page}
                  </span>
                  <div className="grow">
                    {hit.kind === "highlight" ? (
                      <>
                        <div className="t" style={{ lineHeight: 1.5 }}>
                          {highlightSnippet(hit.h.text, q)}
                        </div>
                        {hit.h.note && <div className="sub" style={{ fontStyle: "italic" }}>— {hit.h.note}</div>}
                      </>
                    ) : (
                      <>
                        <div className="t">{hit.card.front}</div>
                        {hit.card.back && <div className="sub">{hit.card.back.slice(0, 100)}</div>}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function highlightSnippet(text: string, q: string) {
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return text.slice(0, 140);
  const start = Math.max(0, at - 40);
  const end = Math.min(text.length, at + q.length + 60);
  const before = text.slice(start, at);
  const match = text.slice(at, at + q.length);
  const after = text.slice(at + q.length, end);
  return (
    <>
      {start > 0 ? "…" : ""}
      {before}
      <span className="highlight">{match}</span>
      {after}
      {end < text.length ? "…" : ""}
    </>
  );
}
