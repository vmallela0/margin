import type { OutlineItem } from "../lib/pdf";
import { flattenOutlinePages } from "../lib/pdf";

type Mark = { page: number; title: string; label: string };

const MIN = 4;
const MAX = 24;
const IDEAL = 10;

function pickChapterMarks(outline: OutlineItem[], totalPages: number): Mark[] {
  const all = flattenOutlinePages(outline);

  if (all.length === 0) {
    // No outline — synthesize evenly spaced marks so the rail isn't empty.
    if (totalPages < 8) return [];
    const n = Math.min(MAX, Math.max(MIN, Math.round(totalPages / 30)));
    const out: Mark[] = [];
    for (let i = 0; i < n; i++) {
      const page = Math.round(1 + (i * (totalPages - 1)) / (n - 1));
      out.push({ page, title: `Page ${page}`, label: String(i + 1) });
    }
    return out;
  }

  // Group by level
  const byLevel = new Map<number, typeof all>();
  for (const c of all) {
    const arr = byLevel.get(c.level) ?? [];
    arr.push(c);
    byLevel.set(c.level, arr);
  }

  const levels = Array.from(byLevel.keys()).sort((a, b) => a - b);

  // Accumulate items from level 0 down, so we include everything at and above the chosen level.
  // This makes "Parts + Chapters" books work: we pick the level deep enough to hit the sweet spot.
  let chosen: typeof all = [];
  let bestScore = Infinity; // distance from IDEAL
  let bestPick: typeof all = [];

  let acc: typeof all = [];
  for (const lvl of levels) {
    acc = acc.concat(byLevel.get(lvl)!);
    const dedup = dedupeByPage(acc);
    const n = dedup.length;
    if (n >= MIN && n <= MAX) {
      // First level that lands in the sweet spot wins.
      chosen = dedup;
      break;
    }
    // Track closest-to-IDEAL as fallback.
    const score = Math.abs(n - IDEAL);
    if (score < bestScore) {
      bestScore = score;
      bestPick = dedup;
    }
  }

  if (chosen.length === 0) chosen = bestPick;
  if (chosen.length === 0) chosen = dedupeByPage(all);

  // If still too many, evenly subsample.
  if (chosen.length > MAX) {
    const step = chosen.length / MAX;
    const sampled: typeof all = [];
    for (let i = 0; i < MAX; i++) sampled.push(chosen[Math.floor(i * step)]);
    chosen = sampled;
  }

  chosen.sort((a, b) => a.page - b.page);
  return chosen.map((c, i) => ({ page: c.page, title: c.title, label: String(i + 1) }));
}

function dedupeByPage<T extends { page: number }>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => a.page - b.page);
  const out: T[] = [];
  for (const it of sorted) {
    if (out.length === 0 || out[out.length - 1].page !== it.page) out.push(it);
  }
  return out;
}

export function ChapterThread({
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
  const marks = pickChapterMarks(outline, totalPages);
  const current = totalPages > 0 ? (currentPage - 1) / Math.max(1, totalPages - 1) : 0;

  return (
    <div className="chapter-thread">
      <div className="line" />
      {marks.map((m, i) => {
        const p = totalPages > 1 ? (m.page - 1) / (totalPages - 1) : 0;
        const active = currentPage >= m.page && (i === marks.length - 1 || currentPage < marks[i + 1].page);
        return (
          <div
            key={i}
            className={`mark${active ? " active" : ""}`}
            style={{ top: `${10 + p * 80}%` }}
            title={m.title}
            onClick={() => onJump(m.page)}
          />
        );
      })}
      <div
        className="mark active"
        style={{ top: `${10 + current * 80}%`, width: 4, height: 4, left: 15, background: "var(--accent)", opacity: 0.4, boxShadow: "none" }}
      />
      <div className="pagenum">
        {currentPage}
        <br />
        <span style={{ opacity: 0.6 }}>{totalPages}</span>
      </div>
    </div>
  );
}
