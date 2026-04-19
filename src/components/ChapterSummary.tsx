import type { Highlight } from "../lib/types";

export function ChapterSummary({
  chapter, page, highlights, onJump, onClose,
}: {
  chapter: string;
  page: number;
  highlights: Highlight[];
  onJump: (page: number) => void;
  onClose: () => void;
}) {
  const byColor: Record<string, Highlight[]> = {};
  for (const h of highlights) (byColor[h.color] ??= []).push(h);
  return (
    <div style={{
      position: "absolute", right: 18, top: 64, width: 270,
      background: "var(--paper-2)", border: "1px solid var(--rule-2)", borderRadius: 4,
      padding: 18, boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
      zIndex: 30,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <div className="meta-s">chapter · in 60 seconds</div>
        <button className="btn" style={{ padding: "2px 6px" }} onClick={onClose}>✕</button>
      </div>
      <div style={{ fontFamily: "var(--serif)", fontSize: 16, fontWeight: 500, marginBottom: 10 }}>{chapter}</div>

      {highlights.length === 0 ? (
        <div style={{ fontFamily: "var(--serif)", fontSize: 12.5, color: "var(--ink-3)", fontStyle: "italic" }}>
          Nothing highlighted here yet. Select text and press H to start.
        </div>
      ) : (
        <>
          <div style={{ fontFamily: "var(--serif)", fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-2)" }}>
            <strong>{highlights.length}</strong> mark{highlights.length === 1 ? "" : "s"} in this stretch.
            {Object.entries(byColor).map(([c, items]) => (
              <div key={c} style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "inline-block", width: 10, height: 10, background: `var(--hi-${c})`, borderRadius: 2 }} />
                <span>{items.length} · {c}</span>
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px solid var(--rule)", marginTop: 12, paddingTop: 10 }}>
            <div className="meta-s" style={{ fontSize: 9, marginBottom: 6 }}>from your marks</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {Array.from(new Set(highlights.map((h) => h.page))).slice(0, 12).map((p) => (
                <span key={p} className="chip" style={{ fontSize: 9 }} onClick={() => onJump(p)}>p.{p}</span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
