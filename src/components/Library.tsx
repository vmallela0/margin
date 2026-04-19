import { useEffect, useMemo, useRef, useState } from "react";
import type { Book, Settings } from "../lib/types";
import { DEFAULT_SETTINGS } from "../lib/types";
import { deleteBook, getSettings, listBooks, listCards, subscribe, upsertBook } from "../lib/storage";
import { useStore } from "../lib/useStore";
import { putBlob, deleteBlob } from "../lib/blobs";
import { shortId } from "../lib/hash";
import { dueCards } from "../lib/sm2";
import { Review } from "./Review";
import { SettingsSheet } from "./Settings";
import { normalizeToPdf, isSupported, ACCEPT_ATTR } from "../lib/ingest";
import { renderCoverDataUrl } from "../lib/cover";

function bookCoverVariant(i: number): "paper" | "dark" | "accent" {
  const pool = ["paper", "dark", "paper", "accent", "paper", "dark"] as const;
  return pool[i % pool.length];
}

function shelfFor(book: Book): "current" | "pinned" | "recent" {
  if (book.pinned) return "pinned";
  if (book.lastOpenedAt) return "current";
  return "recent";
}

async function openReader(book: Book) {
  const url = chrome.runtime.getURL(`reader.html?book=${encodeURIComponent(book.id)}`);
  const current = await chrome.tabs.getCurrent();
  await chrome.tabs.create({ url, active: true });
  if (current?.id != null) {
    try { await chrome.tabs.remove(current.id); } catch {}
  }
}

export function Library() {
  const books = useStore(listBooks, []);
  const cards = useStore(listCards, []);
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; book: Book } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ingestMsg, setIngestMsg] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const due = dueCards(cards);

  useEffect(() => {
    const apply = async () => {
      const s = await getSettings();
      setSettings(s);
      document.documentElement.setAttribute("data-theme", s.theme === "paper" ? "" : s.theme);
    };
    apply();
    return subscribe(apply);
  }, []);

  // Backfill covers for any existing books that don't have one yet.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const b of books) {
        if (cancelled) return;
        if (b.coverDataUrl) continue;
        const dataUrl = await renderCoverDataUrl(b);
        if (cancelled) return;
        if (dataUrl) await upsertBook({ ...b, coverDataUrl: dataUrl });
      }
    })();
    return () => { cancelled = true; };
    // Run only once per books length change; the loop skips already-covered books.
  }, [books.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "r" && cards.length && !reviewOpen) {
        if (document.activeElement === inputRef.current) return;
        e.preventDefault();
        setReviewOpen(true);
      }
      if (e.key === "Escape") setCtxMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cards.length, reviewOpen]);

  useEffect(() => {
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      setDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false);
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []).filter(isSupported);
      for (const file of files) await addFile(file);
      if (files[0]) {
        const latest = (await listBooks()).at(-1);
        if (latest) openReader(latest);
      }
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  async function addUrl(raw: string) {
    const url = raw.trim();
    if (!url) return;
    let parsed: URL;
    try { parsed = new URL(url); } catch { return; }
    const existing = (await listBooks()).find(
      (b) => b.source.kind === "url" && b.source.url === parsed.toString(),
    );
    const book: Book = existing ?? {
      id: shortId(),
      title: decodeURIComponent(parsed.pathname.split("/").pop() || parsed.hostname).replace(/\.pdf$/i, ""),
      source: { kind: "url", url: parsed.toString() },
      addedAt: Date.now(),
      coverVariant: bookCoverVariant((await listBooks()).length),
    };
    await upsertBook(book);
    if (!book.coverDataUrl) {
      renderCoverDataUrl(book).then((dataUrl) => {
        if (dataUrl) upsertBook({ ...book, coverDataUrl: dataUrl });
      });
    }
    openReader(book);
  }

  async function addFile(file: File) {
    const id = shortId();
    const ext = file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase();
    const needsConvert = ext !== "pdf" && file.type !== "application/pdf";
    if (needsConvert) setIngestMsg(`Converting ${file.name}…`);
    try {
      const { blob, title, originalName } = await normalizeToPdf(file);
      await putBlob(id, blob);
      const book: Book = {
        id,
        title,
        source: { kind: "blob", fileName: originalName, size: blob.size },
        addedAt: Date.now(),
        coverVariant: bookCoverVariant((await listBooks()).length),
      };
      await upsertBook(book);
      // Render cover thumbnail off the critical path.
      renderCoverDataUrl(book).then((dataUrl) => {
        if (dataUrl) upsertBook({ ...book, coverDataUrl: dataUrl });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      setIngestMsg(`⚠ ${msg}`);
      setTimeout(() => setIngestMsg(null), 4000);
      return;
    }
    if (needsConvert) setIngestMsg(null);
  }

  async function removeBook(book: Book) {
    if (book.source.kind === "blob") await deleteBlob(book.id).catch(() => {});
    await deleteBook(book.id);
  }

  const filtered = useMemo(() => {
    if (!query.trim()) return books;
    const q = query.toLowerCase();
    return books.filter((b) => b.title.toLowerCase().includes(q));
  }, [books, query]);

  const shelves = useMemo(() => {
    const groups: Map<string, Book[]> = new Map();
    const current: Book[] = [];
    const pinned: Book[] = [];
    const recent: Book[] = [];
    for (const b of filtered) {
      if (b.shelf) {
        const g = groups.get(b.shelf) ?? [];
        g.push(b);
        groups.set(b.shelf, g);
        continue;
      }
      const s = shelfFor(b);
      if (s === "current") current.push(b);
      else if (s === "pinned") pinned.push(b);
      else recent.push(b);
    }
    current.sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0));
    pinned.sort((a, b) => a.title.localeCompare(b.title));
    recent.sort((a, b) => b.addedAt - a.addedAt);
    // Sort groups by the most-recent activity in each group (frequent usage proxy).
    const sortedGroups = [...groups.entries()]
      .map(([name, bs]) => {
        const last = bs.reduce((m, b) => Math.max(m, b.lastOpenedAt ?? b.addedAt ?? 0), 0);
        bs.sort((a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt));
        return { name, bs, last };
      })
      .sort((a, b) => b.last - a.last)
      .map(({ name, bs }) => [name, bs] as [string, Book[]]);
    return { groups: sortedGroups, current, pinned, recent };
  }, [filtered]);

  const isEmpty = books.length === 0;

  return (
    <div className={`library-root${dragging ? " drop-active" : ""}`}>
      <header className="top-bar">
        <div className="brand">Margin</div>
        <div className="search">
          <input
            ref={inputRef}
            className="input"
            placeholder="Paste a link, search, or drop a document…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && /^https?:\/\//i.test(query)) {
                addUrl(query);
                setQuery("");
              }
            }}
          />
          <span className="kbd2">/</span>
        </div>
        <button className="btn" onClick={() => fileRef.current?.click()} title="Open a document (PDF, DOCX, EPUB, MD, TXT, HTML, RTF)">+ Add</button>
        {due.length > 0 && (
          <button className="btn primary" onClick={() => setReviewOpen(true)} title="Review due (R)">
            Review · {due.length}
          </button>
        )}
        <span className="meta-s">{books.length} book{books.length === 1 ? "" : "s"}</span>
        <button className="btn" onClick={() => setSettingsOpen(true)} title="Settings">⚙</button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          hidden
          onChange={async (e) => {
            const list = Array.from(e.target.files ?? []);
            for (const f of list) await addFile(f);
            if (e.target) e.target.value = "";
          }}
        />
        {ingestMsg && <span className="meta-s" style={{ color: "var(--ink-2)" }}>{ingestMsg}</span>}
      </header>

      {isEmpty ? (
        <div className="shelves empty">
          <EmptyHero onPaste={addUrl} onPickFile={() => fileRef.current?.click()} inputRef={inputRef} />
        </div>
      ) : (
        <main className="shelves">
          {shelves.current.length > 0 && (
            <Shelf name="Currently Reading" books={shelves.current} onOpen={openReader} onContext={setCtxMenu} />
          )}
          {shelves.pinned.length > 0 && (
            <Shelf name="Pinned" books={shelves.pinned} onOpen={openReader} onContext={setCtxMenu} />
          )}
          {shelves.groups.map(([name, groupBooks]) => (
            <Shelf
              key={name}
              name={name}
              books={groupBooks}
              onOpen={openReader}
              onContext={setCtxMenu}
              onRename={async (newName) => {
                await Promise.all(
                  groupBooks.map((b) => upsertBook({ ...b, shelf: newName }))
                );
              }}
            />
          ))}
          {shelves.recent.length > 0 && (
            <Shelf name="Recent" books={shelves.recent} small onOpen={openReader} onContext={setCtxMenu} />
          )}
        </main>
      )}

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          book={ctxMenu.book}
          allGroups={[...new Set(books.map((b) => b.shelf).filter(Boolean) as string[])]}
          onClose={() => setCtxMenu(null)}
          onRename={async (title) => { await upsertBook({ ...ctxMenu.book, title }); setCtxMenu(null); }}
          onTogglePin={async () => { await upsertBook({ ...ctxMenu.book, pinned: !ctxMenu.book.pinned }); setCtxMenu(null); }}
          onSetGroup={async (g) => { await upsertBook({ ...ctxMenu.book, shelf: g || undefined }); setCtxMenu(null); }}
          onRefreshCover={async () => {
            const b = ctxMenu.book;
            setCtxMenu(null);
            const dataUrl = await renderCoverDataUrl(b);
            if (dataUrl) await upsertBook({ ...b, coverDataUrl: dataUrl });
          }}
          onDelete={async () => { await removeBook(ctxMenu.book); setCtxMenu(null); }}
        />
      )}

      {reviewOpen && <Review onClose={() => setReviewOpen(false)} />}
      {settingsOpen && <SettingsSheet settings={settings} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function Shelf({
  name,
  books,
  small,
  onOpen,
  onContext,
  onRename,
}: {
  name: string;
  books: Book[];
  small?: boolean;
  onOpen: (b: Book) => void;
  onContext: (m: { x: number; y: number; book: Book }) => void;
  onRename?: (newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename?.(trimmed);
    setEditing(false);
  };

  return (
    <section className="shelf">
      <div className="shelf-title">
        {editing ? (
          <input
            className="shelf-rename-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") { setDraft(name); setEditing(false); }
            }}
            ref={inputRef}
            autoFocus
          />
        ) : (
          <span
            className={`h${onRename ? " renameable" : ""}`}
            onDoubleClick={() => { if (onRename) { setDraft(name); setEditing(true); } }}
            title={onRename ? "Double-click to rename" : undefined}
          >{name}</span>
        )}
        <span className="c">{books.length}</span>
      </div>
      <div className={`book-grid${small ? " small" : ""}`}>
        {books.map((b) => (
          <div
            key={b.id}
            className="book-card"
            onClick={() => onOpen(b)}
            onContextMenu={(e) => { e.preventDefault(); onContext({ x: e.clientX, y: e.clientY, book: b }); }}
          >
            <div className={`cover ${b.coverVariant ?? "paper"}${b.coverDataUrl ? " has-thumb" : ""}`}>
              {b.coverDataUrl && (
                <img className="cover-thumb" src={b.coverDataUrl} alt="" draggable={false} />
              )}
              {!b.coverDataUrl && <div className="cover-title">{b.title}</div>}
              {b.totalPages && b.lastPage && (
                <div className="progress">
                  <i style={{ width: `${Math.min(100, (b.lastPage / b.totalPages) * 100)}%` }} />
                </div>
              )}
            </div>
            {!small && <div className="title">{b.title}</div>}
            {!small && <div className="sub">{b.source.kind === "url" ? hostOf(b.source.url) : b.source.fileName}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

function hostOf(url: string) {
  try { return new URL(url).hostname; } catch { return url; }
}

function EmptyHero({
  onPaste,
  onPickFile,
  inputRef,
}: {
  onPaste: (s: string) => void;
  onPickFile: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  const [val, setVal] = useState("");
  return (
    <div className="empty-hero">
      <div className="wordmark">Margin</div>
      <div className="tagline">A quiet place to read PDFs.</div>
      <div className="paste">
        <input
          ref={inputRef}
          className="input"
          placeholder="Paste a PDF link, or drop any document (PDF · DOCX · EPUB · MD · TXT · HTML · RTF)"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { onPaste(val); setVal(""); } }}
        />
        <span className="kbd2">↵</span>
      </div>
      <button className="btn" style={{ marginTop: 10 }} onClick={onPickFile}>Open a file…</button>
      <div className="meta-s" style={{ marginTop: 12 }}>local-first · 0 books yet</div>
    </div>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ContextMenu({
  x, y, book, allGroups, onClose, onRename, onTogglePin, onSetGroup, onRefreshCover, onDelete,
}: {
  x: number; y: number; book: Book;
  allGroups: string[];
  onClose: () => void;
  onRename: (title: string) => void;
  onTogglePin: () => void;
  onSetGroup: (group: string) => void;
  onRefreshCover: () => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(book.title);
  const [groupDraft, setGroupDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);
  const groupRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) {
      renameRef.current?.focus();
      renameRef.current?.select();
    }
  }, [renaming]);

  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 2400);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  const commitRename = () => {
    const t = titleDraft.trim();
    if (t && t !== book.title) onRename(t);
    else setRenaming(false);
  };

  const sub = book.source.kind === "url"
    ? new URL(book.source.url).hostname
    : `${book.source.fileName}${book.source.size ? ` · ${formatSize(book.source.size)}` : ""}`;

  const otherGroups = allGroups.filter((g) => g !== book.shelf);
  const matchingGroup = groupDraft.trim() && allGroups.find((g) => g.toLowerCase() === groupDraft.trim().toLowerCase());

  return (
    <div className="ctx" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
      <div className="ctx-head">
        {renaming ? (
          <input
            ref={renameRef}
            className="ctx-input"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitRename(); }
              if (e.key === "Escape") { e.preventDefault(); setRenaming(false); setTitleDraft(book.title); }
            }}
            onBlur={commitRename}
          />
        ) : (
          <div className="ctx-title" onDoubleClick={() => setRenaming(true)} title="Double-click to rename">
            {book.title}
          </div>
        )}
        <div className="ctx-sub">{sub}</div>
      </div>

      <div className="ctx-row" onClick={onTogglePin}>
        <span className="ctx-ico">{book.pinned ? "★" : "☆"}</span>
        <span>{book.pinned ? "Unpin" : "Pin"}</span>
      </div>

      <div className="ctx-row" onClick={() => setRenaming(true)}>
        <span className="ctx-ico">Aa</span>
        <span>Rename</span>
        <span className="ctx-hint">dbl-click title</span>
      </div>

      <div className="ctx-row" onClick={onRefreshCover}>
        <span className="ctx-ico">◫</span>
        <span>Regenerate cover</span>
      </div>

      <div className="ctx-sep" />

      <div className="ctx-section">
        <div className="ctx-label">Group</div>
        <div className="ctx-chips">
          {book.shelf && (
            <button className="ctx-chip on" onClick={() => onSetGroup("")} title="Remove from group">
              <span>{book.shelf}</span>
              <span className="x">×</span>
            </button>
          )}
          {otherGroups.map((g) => (
            <button key={g} className="ctx-chip" onClick={() => onSetGroup(g)}>{g}</button>
          ))}
        </div>
        <div className="ctx-input-row">
          <input
            ref={groupRef}
            className="ctx-input"
            placeholder={book.shelf ? "Move to new group…" : "New group…"}
            value={groupDraft}
            onChange={(e) => setGroupDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && groupDraft.trim()) {
                e.preventDefault();
                onSetGroup(groupDraft.trim());
              }
              if (e.key === "Escape") onClose();
            }}
            list={`ctx-groups-${book.id}`}
          />
          <datalist id={`ctx-groups-${book.id}`}>
            {otherGroups.map((g) => <option key={g} value={g} />)}
          </datalist>
          {groupDraft.trim() && (
            <button
              className="ctx-mini"
              onClick={() => onSetGroup(groupDraft.trim())}
              title={matchingGroup ? `Move to ${matchingGroup}` : `Create "${groupDraft.trim()}"`}
            >
              {matchingGroup ? "→" : "+"}
            </button>
          )}
        </div>
      </div>

      <div className="ctx-sep" />

      <div
        className={`ctx-row danger${confirmDelete ? " armed" : ""}`}
        onClick={() => {
          if (confirmDelete) onDelete();
          else setConfirmDelete(true);
        }}
      >
        <span className="ctx-ico">✕</span>
        <span>{confirmDelete ? "Click again to delete" : "Delete"}</span>
      </div>
    </div>
  );
}
