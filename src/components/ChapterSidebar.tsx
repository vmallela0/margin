import { useLayoutEffect, useMemo, useRef } from "react";
import type { OutlineItem } from "../lib/pdf";
import { flattenOutlinePages } from "../lib/pdf";

type Entry = { page: number; title: string; level: number };

export function ChapterSidebar({
  outline,
  totalPages,
  currentPage,
  onJump,
}: {
  outline: OutlineItem[];
  totalPages: number;
  currentPage: number;
  onJump: (page: number) => void;
}) {
  const entries: Entry[] = useMemo(() => {
    const raw = flattenOutlinePages(outline);
    // Dedupe consecutive entries on same page (prefer the first, typically highest-level).
    const out: Entry[] = [];
    for (const r of raw) {
      if (out.length && out[out.length - 1].page === r.page) continue;
      out.push({ page: r.page, title: r.title, level: r.level });
    }
    return out;
  }, [outline]);

  const currentIdx = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].page <= currentPage) idx = i;
    }
    return idx;
  }, [entries, currentPage]);

  const listRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!currentRef.current || !listRef.current) return;
    const row = currentRef.current;
    const list = listRef.current;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < list.scrollTop || bottom > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: top - list.clientHeight / 3, behavior: "smooth" });
    }
  }, [currentIdx]);

  if (entries.length === 0) {
    // Nothing to show — render a minimal progress strip with the page counter.
    const pct = totalPages > 0 ? Math.min(1, Math.max(0, (currentPage - 1) / Math.max(1, totalPages - 1))) : 0;
    return (
      <aside className="chapter-sidebar empty">
        <div className="empty-rail">
          <div className="empty-fill" style={{ height: `${pct * 100}%` }} />
        </div>
        <div className="pagenum">
          <div>{currentPage}</div>
          <div className="tot">{totalPages}</div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="chapter-sidebar">
      <div className="cs-body" ref={listRef}>
        {entries.map((e, i) => {
          const isCurrent = i === currentIdx;
          const minLevel = Math.min(...entries.map((x) => x.level));
          const depth = Math.max(0, e.level - minLevel);
          return (
            <button
              key={`${e.page}-${i}`}
              ref={isCurrent ? currentRef : undefined}
              className={`cs-item${isCurrent ? " current" : ""} lvl-${Math.min(depth, 3)}`}
              style={{ paddingLeft: 10 + depth * 10 }}
              onClick={() => onJump(e.page)}
              title={`${e.title} · p.${e.page}`}
            >
              <span className="t">{e.title}</span>
              <span className="pg">{e.page}</span>
            </button>
          );
        })}
      </div>
      <div className="cs-foot">
        <span className="now">{currentPage}</span>
        <span className="sep">/</span>
        <span className="tot">{totalPages}</span>
      </div>
    </aside>
  );
}
