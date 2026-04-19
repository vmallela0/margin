import { useEffect } from "react";

export function Shortcuts({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="shortcuts-panel" onClick={(e) => e.stopPropagation()}>
        <div className="title">
          <h2>Keyboard</h2>
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span className="kbd2">?</span>
            <span className="meta-s" style={{ fontSize: 9 }}>toggle</span>
          </span>
        </div>
        <div className="cols">
          <Col title="On selection" rows={[
            [["H"], "Highlight · cycles 4 colors"],
            [["N"], "Inline note"],
            [["F"], "Flashcard"],
          ]} />
          <Col title="Navigate" rows={[
            [["/"], "Cross-book search"],
            [["⌘", "K"], "Command"],
            [["G", "n"], "Go to page n"],
            [["[", "]"], "Prev / next chapter"],
          ]} />
          <Col title="View" rows={[
            [["⌘", "."], "Toggle rail"],
            [["⇧", "⌘", "D"], "Toggle theme"],
            [["⌘", "+"], "Zoom in"],
            [["⌘", "-"], "Zoom out"],
          ]} />
          <Col title="Cards" rows={[
            [["R"], "Review due"],
            [["Space"], "Flip"],
            [["1", "2", "3", "4"], "Again · Hard · Good · Easy"],
          ]} />
        </div>
      </div>
    </div>
  );
}

function Col({ title, rows }: { title: string; rows: [string[], string][] }) {
  return (
    <div className="col">
      <div className="lbl">{title}</div>
      {rows.map(([keys, desc], i) => (
        <div key={i} className="row">
          <div className="k">{keys.map((k) => <span key={k} className="kbd2">{k}</span>)}</div>
          <div className="v">{desc}</div>
        </div>
      ))}
    </div>
  );
}
