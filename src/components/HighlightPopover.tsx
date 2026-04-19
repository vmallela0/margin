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
  const [noteOpen, setNoteOpen] = useState(!!initialNote);
  const ref = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (noteOpen && !initialNote) noteRef.current?.focus();
  }, [noteOpen, initialNote]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (document.activeElement === noteRef.current) return;
      if (e.key === "n" || e.key === "N") { e.preventDefault(); setNoteOpen((v) => !v); }
      if (e.key === "f" || e.key === "F") { e.preventDefault(); onMakeFlashcard({ color, note }); }
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
  }, [color, note, onSave, onClose, onMakeFlashcard]);

  const choices = allHighlightChoices(customColors);

  return (
    <div
      ref={ref}
      className="hl-strip"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="hl-strip-row">
        {choices.map((c) => (
          <button
            key={c.id}
            title={resolveMeaning(c.id, meanings, customColors)}
            className={`hl-dot${c.id === color ? " sel" : ""}`}
            style={{ background: c.bg }}
            onClick={() => onSave({ color: c.id, note })}
          />
        ))}
        <div className="hl-strip-div" />
        <button
          className={`hl-act${noteOpen ? " on" : ""}`}
          onClick={() => setNoteOpen((v) => !v)}
          title="Add note (N)"
        >
          <span className="kbd2" style={{ fontSize: 8, lineHeight: 1 }}>N</span>
          <span>note</span>
        </button>
        <button
          className="hl-act"
          onClick={() => onMakeFlashcard({ color, note })}
          title="Make flashcard (F)"
        >
          <span className="kbd2" style={{ fontSize: 8, lineHeight: 1 }}>F</span>
          <span>card</span>
        </button>
        {canDelete && onDelete && (
          <button className="hl-act danger" onClick={onDelete} title="Delete highlight">
            del
          </button>
        )}
      </div>

      {noteOpen && (
        <div className="hl-strip-note">
          <textarea
            ref={noteRef}
            autoFocus
            placeholder="Add a note…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.preventDefault(); onClose(); }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSave({ color, note });
              }
            }}
          />
          <div className="hl-strip-note-footer">
            <span className="meta-s" style={{ fontSize: 9 }}>
              {resolveMeaning(color, meanings, customColors)}
            </span>
            <button
              className="btn primary"
              style={{ padding: "3px 10px", fontSize: 11 }}
              onClick={() => onSave({ color, note })}
            >
              save ↵
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
