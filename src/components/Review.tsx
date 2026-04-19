import { useEffect, useMemo, useState } from "react";
import type { Book, Flashcard } from "../lib/types";
import { listBooks, listCards, updateCard } from "../lib/storage";
import { dueCards, queuePreview, rate, type Rating } from "../lib/sm2";
import { useStore } from "../lib/useStore";

export function Review({ onClose, filterBookId }: { onClose: () => void; filterBookId?: string }) {
  const cards = useStore(listCards, []);
  const books = useStore(listBooks, []);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [initialDue, setInitialDue] = useState<Flashcard[] | null>(null);

  const scopedCards = useMemo(
    () => filterBookId ? cards.filter((c) => c.bookId === filterBookId) : cards,
    [cards, filterBookId],
  );
  const due = useMemo(() => dueCards(scopedCards).filter((c) => !done.includes(c.id)), [scopedCards, done]);
  const upcoming = useMemo(() => queuePreview(scopedCards, Date.now()), [scopedCards]);

  const current = due[0];
  const bookOf = (c: Flashcard) => books.find((b) => b.id === c.bookId);

  useEffect(() => {
    if (initialDue === null && due.length > 0) setInitialDue(due);
  }, [due, initialDue]);

  useEffect(() => {
    setFlipped(false);
  }, [current?.id]);

  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (!current) return;
      if (e.key === " ") { e.preventDefault(); setFlipped((f) => !f); return; }
      const ratings: Record<string, Rating> = { "1": "again", "2": "hard", "3": "good", "4": "easy" };
      const r = ratings[e.key];
      if (r && flipped) { e.preventDefault(); await grade(r); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, flipped]);

  async function grade(r: Rating) {
    if (!current) return;
    const next = rate(current, r);
    await updateCard(next);
    setDone((d) => [...d, current.id]);
    setFlipped(false);
  }

  const initialTotal = initialDue?.length ?? due.length;
  const remaining = due.length;
  const completed = initialTotal - remaining;

  return (
    <div className="review-stage" onClick={onClose}>
      <div className="top" onClick={(e) => e.stopPropagation()}>
        Due today · {initialTotal} card{initialTotal === 1 ? "" : "s"} · {remaining} remaining
      </div>

      {!current ? (
        <div className="done" onClick={(e) => e.stopPropagation()}>
          <div style={{ fontSize: 28, fontWeight: 500 }}>All done.</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {completed > 0 ? `${completed} card${completed === 1 ? "" : "s"} reviewed` : "Nothing due right now."}
          </div>
          <button className="btn" style={{ marginTop: 16 }} onClick={onClose}>esc</button>
        </div>
      ) : (
        <>
          <div className="cards-row" onClick={(e) => e.stopPropagation()}>
            {done.slice(-2).map((id) => (
              <div key={id} className="mini" style={{ opacity: 0.35 }}>
                <div className="mini-lbl">done</div>
                <div className="mini-sub">↑ rated</div>
              </div>
            ))}
            <div className="big" onClick={() => setFlipped((f) => !f)}>
              <div className="meta">
                {bookOf(current)?.title ?? "card"} · p.{current.page}
              </div>
              <div className="text">
                {flipped ? current.back || <span style={{ fontStyle: "italic", color: "var(--ink-3)" }}>(no back)</span> : current.front}
              </div>
              <div className="hint">{flipped ? "space · hide" : "space · flip"}</div>
            </div>
            {upcoming.slice(0, 1).map((c) => (
              <div key={c.id} className="mini">
                <div className="mini-lbl">next</div>
                <div className="mini-sub">p.{c.page}</div>
              </div>
            ))}
            {remaining > 1 && (
              <div className="mini">
                <div className="mini-lbl">queue</div>
                <div className="mini-sub">+ {remaining - 1}</div>
              </div>
            )}
          </div>

          <div className="rate-row" onClick={(e) => e.stopPropagation()}>
            {([
              ["1", "Again", "#B14B4B", "again"],
              ["2", "Hard",  "#B17C3D", "hard"],
              ["3", "Good",  "var(--accent)", "good"],
              ["4", "Easy",  "#4A7A4A", "easy"],
            ] as const).map(([k, l, c, r]) => (
              <button
                key={k}
                className="rate-btn"
                onClick={() => flipped && grade(r)}
                disabled={!flipped}
                style={{ color: c, borderColor: c, opacity: flipped ? 1 : 0.45, cursor: flipped ? "pointer" : "not-allowed" }}
              >
                <span className="k">{k}</span>
                <span>{l}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
