import { useEffect, useMemo, useState } from "react";
import type { Flashcard } from "../lib/types";
import { listBooks, listCards, updateCard } from "../lib/storage";
import { dueCards, rate, type Rating } from "../lib/sm2";
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

  const current = due[0];
  const bookOf = (c: Flashcard) => books.find((b) => b.id === c.bookId);

  useEffect(() => {
    if (initialDue === null && due.length > 0) setInitialDue(due);
  }, [due, initialDue]);

  useEffect(() => { setFlipped(false); }, [current?.id]);

  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (!current) return;
      if (e.key === " ") { e.preventDefault(); setFlipped((f) => !f); return; }
      const ratingMap: Record<string, Rating> = {
        "1": "again", "j": "again", "J": "again",
        "2": "hard",
        "3": "good", "k": "good", "K": "good",
        "4": "easy", "l": "easy", "L": "easy",
      };
      const r = ratingMap[e.key];
      if (r && flipped) { e.preventDefault(); await grade(r); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, flipped, onClose]);

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
      <div className="rv-hd" onClick={(e) => e.stopPropagation()}>
        <span className="rv-label">{remaining} remaining</span>
        <div className="rv-bar">
          <div className="rv-fill" style={{ width: `${initialTotal > 0 ? (completed / initialTotal) * 100 : 0}%` }} />
        </div>
        <button className="btn" style={{ padding: "2px 10px" }} onClick={onClose}>esc</button>
      </div>

      {!current ? (
        <div className="rv-done" onClick={(e) => e.stopPropagation()}>
          <div style={{ fontFamily: "var(--serif)", fontSize: 30, fontWeight: 500, letterSpacing: "-0.02em" }}>
            All done.
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.12em", marginTop: 8 }}>
            {completed > 0 ? `${completed} card${completed === 1 ? "" : "s"} reviewed` : "Nothing due right now."}
          </div>
          <button className="btn" style={{ marginTop: 24 }} onClick={onClose}>back to reading</button>
        </div>
      ) : (
        <>
          <div className="rv-card" onClick={(e) => { e.stopPropagation(); setFlipped((f) => !f); }}>
            <div className="rv-source">{bookOf(current)?.title ?? "card"} · p.{current.page}</div>
            <blockquote className="rv-quote">{current.front}</blockquote>
            {flipped && (
              <>
                <hr className="rv-sep" />
                <div className={`rv-back${!current.back ? " empty" : ""}`}>
                  {current.back || <em>no note added</em>}
                </div>
              </>
            )}
            <div className="rv-hint">
              {flipped ? (
                <><span className="kbd2" style={{ fontSize: 9 }}>space</span><span> hide</span></>
              ) : (
                <><span className="kbd2" style={{ fontSize: 9 }}>space</span><span> reveal</span></>
              )}
            </div>
          </div>

          <div className="rv-rate-row" onClick={(e) => e.stopPropagation()}>
            {([
              ["j / 1", "Again", "#B14B4B", "again"],
              ["2",     "Hard",  "#B17C3D", "hard"],
              ["k / 3", "Good",  "var(--accent)", "good"],
              ["l / 4", "Easy",  "#4A7A4A", "easy"],
            ] as const).map(([k, l, c, r]) => (
              <button
                key={k}
                className="rv-rate-btn"
                onClick={() => flipped && grade(r as Rating)}
                disabled={!flipped}
                style={{ color: c, borderColor: c, opacity: flipped ? 1 : 0.3, cursor: flipped ? "pointer" : "not-allowed" }}
              >
                <span className="rv-key">{k}</span>
                <span>{l}</span>
              </button>
            ))}
          </div>

          {remaining > 1 && (
            <div onClick={(e) => e.stopPropagation()} style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-4)" }}>
              {remaining - 1} more in queue
            </div>
          )}
        </>
      )}
    </div>
  );
}
