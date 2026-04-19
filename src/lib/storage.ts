import type { Book, Flashcard, Highlight, Settings } from "./types";
import { DEFAULT_SETTINGS } from "./types";

const KEYS = {
  books: "margin:books",
  highlights: (bookId: string) => `margin:highlights:${bookId}`,
  cards: "margin:flashcards",
  settings: "margin:settings",
};

const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

async function get<T>(key: string, fallback: T): Promise<T> {
  const res = await chrome.storage.local.get(key);
  return (res[key] as T) ?? fallback;
}

async function set(key: string, value: unknown) {
  await chrome.storage.local.set({ [key]: value });
  emit();
}

export async function listBooks(): Promise<Book[]> {
  return get<Book[]>(KEYS.books, []);
}

export async function upsertBook(book: Book): Promise<void> {
  const books = await listBooks();
  const i = books.findIndex((b) => b.id === book.id);
  if (i >= 0) books[i] = { ...books[i], ...book };
  else books.push(book);
  await set(KEYS.books, books);
}

export async function getBook(id: string): Promise<Book | undefined> {
  return (await listBooks()).find((b) => b.id === id);
}

export async function deleteBook(id: string): Promise<void> {
  const books = (await listBooks()).filter((b) => b.id !== id);
  await set(KEYS.books, books);
  await chrome.storage.local.remove(KEYS.highlights(id));
}

export async function listHighlights(bookId: string): Promise<Highlight[]> {
  return get<Highlight[]>(KEYS.highlights(bookId), []);
}

export async function addHighlight(h: Highlight): Promise<void> {
  const items = await listHighlights(h.bookId);
  items.push(h);
  await set(KEYS.highlights(h.bookId), items);
}

export async function updateHighlight(h: Highlight): Promise<void> {
  const items = await listHighlights(h.bookId);
  const i = items.findIndex((x) => x.id === h.id);
  if (i >= 0) items[i] = h;
  await set(KEYS.highlights(h.bookId), items);
}

export async function deleteHighlight(bookId: string, id: string): Promise<void> {
  const items = (await listHighlights(bookId)).filter((h) => h.id !== id);
  await set(KEYS.highlights(bookId), items);
}

export async function listCards(): Promise<Flashcard[]> {
  return get<Flashcard[]>(KEYS.cards, []);
}

export async function addCard(card: Flashcard): Promise<void> {
  const items = await listCards();
  items.push(card);
  await set(KEYS.cards, items);
}

export async function updateCard(card: Flashcard): Promise<void> {
  const items = await listCards();
  const i = items.findIndex((x) => x.id === card.id);
  if (i >= 0) items[i] = card;
  await set(KEYS.cards, items);
}

export async function deleteCard(id: string): Promise<void> {
  const items = (await listCards()).filter((c) => c.id !== id);
  await set(KEYS.cards, items);
}

export async function getSettings(): Promise<Settings> {
  // Merge stored settings with defaults so pre-existing users (whose stored
  // object predates newer fields like customColors) don't hit `undefined.map`
  // in components that read those fields.
  const stored = await get<Partial<Settings>>(KEYS.settings, {} as Partial<Settings>);
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    colorMeanings: { ...DEFAULT_SETTINGS.colorMeanings, ...(stored.colorMeanings ?? {}) },
    customColors: Array.isArray(stored.customColors) ? stored.customColors : [],
    // Explicit undefined check: stored value of null means "disabled" (valid), undefined means "not yet set"
    autoRecycleDays: stored.autoRecycleDays !== undefined ? stored.autoRecycleDays : DEFAULT_SETTINGS.autoRecycleDays,
  };
}

export async function saveSettings(s: Settings): Promise<void> {
  await set(KEYS.settings, s);
}

if (typeof chrome !== "undefined" && chrome.storage) {
  chrome.storage.onChanged.addListener(() => emit());
}
