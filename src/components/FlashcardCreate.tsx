import { useEffect, useRef, useState } from "react";

export function FlashcardCreate({
  x, y, page, suggestedFront, suggestedBack,
  onSave, onClose,
}: {
  x: number;
  y: number;
  page: number;
  suggestedFront: string;
  suggestedBack?: string;
  onSave: (front: string, back: string) => void;
  onClose: () => void;
}) {
  const [front, setFront] = useState(suggestedFront);
  const [back, setBack] = useState(suggestedBack ?? "");
  const [side, setSide] = useState<"front" | "back">("front");
  const frontRef = useRef<HTMLTextAreaElement>(null);
  const backRef = useRef<HTMLTextAreaElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (side === "front" ? frontRef : backRef).current?.focus();
  }, [side]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "Tab") {
        e.preventDefault();
        setSide((s) => s === "front" ? "back" : "front");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (front.trim()) onSave(front.trim(), back.trim());
      }
    };
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    setTimeout(() => window.addEventListener("mousedown", onClickOutside), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClickOutside);
    };
  }, [front, back, onSave, onClose]);

  return (
    <div ref={ref} className="flashcard-create" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <span className="meta-s" style={{ fontSize: 9 }}>New card · anchored p.{page}</span>
        <span style={{ display: "flex", gap: 4 }}>
          <span className="kbd2">tab</span>
          <span className="meta-s" style={{ fontSize: 9 }}>flip</span>
        </span>
      </div>
      <div className="lbl">front</div>
      <textarea
        ref={frontRef}
        className="front"
        rows={2}
        value={front}
        onChange={(e) => setFront(e.target.value)}
        onFocus={() => setSide("front")}
      />
      <div className="divider" />
      <div className="lbl">back</div>
      <textarea
        ref={backRef}
        className="back"
        rows={2}
        value={back}
        placeholder="Answer (optional)"
        onChange={(e) => setBack(e.target.value)}
        onFocus={() => setSide("back")}
      />
      <div className="footer">
        <span className="chip">→ p.{page}</span>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onClose}>esc</button>
        <button className="btn primary" onClick={() => front.trim() && onSave(front.trim(), back.trim())}>Save · ⌘↵</button>
      </div>
    </div>
  );
}
