import { useEffect, useRef, useState } from "react";
import type { CustomColor, HighlightColor } from "../lib/types";
import { allHighlightChoices, resolveMeaning } from "../lib/colors";

export type HighlightDraft = {
  color: HighlightColor;
  note: string;
};

export function HighlightPopover({
  initialColor = "yellow",
  initialNote = "",
  x,
  y,
  meanings,
  customColors = [],
  onSave,
  onMakeFlashcard,
  onDelete,
  onClose,
  canDelete,
}: {
  initialColor?: HighlightColor;
  initialNote?: string;
  x: number;
  y: number;
  meanings: Record<string, string>;
  customColors?: CustomColor[];
  onSave: (draft: HighlightDraft) => void;
  onMakeFlashcard: (draft: HighlightDraft) => void;
  onDelete?: () => void;
  onClose: () => void;
  canDelete?: boolean;
}) {
  const [color, setColor] = useState<HighlightColor>(initialColor);
  const [note, setNote] = useState(initialNote);
  const ref = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault(); onSave({ color, note });
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
  }, [color, note, onSave, onClose]);

  const choices = allHighlightChoices(customColors);

  return (
    <div
      ref={ref}
      className="highlight-popover popover-hi"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="row">
        {choices.map((c) => (
          <button
            key={c.id}
            title={resolveMeaning(c.id, meanings, customColors)}
            className={`swatch ${c.id === color ? "sel" : ""}`}
            style={{ background: c.bg, padding: 0 }}
            onClick={() => setColor(c.id)}
          />
        ))}
        <span className="spacer" />
        <span className="kbd2" title="Highlight">H</span>
        <span className="kbd2" title="Note">N</span>
        <span className="kbd2" title="Flashcard" onClick={() => onMakeFlashcard({ color, note })} style={{ cursor: "pointer" }}>F</span>
      </div>
      <div className="divider" />
      <textarea
        ref={textareaRef}
        placeholder="Add a note…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="footer">
        <span className="meta-s" style={{ fontSize: 9 }}>{resolveMeaning(color, meanings, customColors)}</span>
        <div style={{ display: "flex", gap: 6 }}>
          {canDelete && onDelete && (
            <button className="btn" onClick={onDelete} style={{ color: "#B14B4B" }}>Delete</button>
          )}
          <button className="btn" onClick={onClose}>esc</button>
          <button className="btn primary" onClick={() => onSave({ color, note })}>⌘↵</button>
        </div>
      </div>
    </div>
  );
}
