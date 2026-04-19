import { useEffect, useMemo, useRef, useState } from "react";

export type CommandItem = {
  id: string;
  label: string;
  sub?: string;
  keys?: string;
  section: string;
  run: () => void;
};

export function CommandPalette({
  items,
  onClose,
  placeholder = "Type a command…",
}: {
  items: CommandItem[];
  onClose: () => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const needle = q.toLowerCase();
    return items.filter(
      (i) => i.label.toLowerCase().includes(needle) || i.sub?.toLowerCase().includes(needle),
    );
  }, [items, q]);

  useEffect(() => { setIdx(0); }, [q]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, filtered.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter" && filtered[idx]) {
        e.preventDefault();
        const item = filtered[idx];
        onClose();
        item.run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, idx, onClose]);

  const sections = useMemo(() => {
    const groups = new Map<string, CommandItem[]>();
    for (const it of filtered) {
      const s = groups.get(it.section) ?? [];
      s.push(it);
      groups.set(it.section, s);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="cmd-panel" onClick={(e) => e.stopPropagation()}>
        <div className="header">
          <span className="kbd2">⌘K</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
          />
        </div>
        {filtered.length === 0 && <div className="empty">No commands.</div>}
        {sections.map(([label, list]) => (
          <div key={label} className="section">
            <div className="label">{label}</div>
            {list.map((it) => {
              const active = filtered[idx]?.id === it.id;
              return (
                <div
                  key={it.id}
                  className={`item${active ? " active" : ""}`}
                  onMouseEnter={() => setIdx(filtered.indexOf(it))}
                  onClick={() => { onClose(); it.run(); }}
                >
                  <div className="grow">
                    <div className="t">{it.label}</div>
                    {it.sub && <div className="sub">{it.sub}</div>}
                  </div>
                  {it.keys && <span className="kbd2">{it.keys}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
