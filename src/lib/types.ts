export type HighlightColor = string;

export const BUILTIN_COLORS = ["yellow", "pink", "blue", "green"] as const;

export const COLOR_MEANING: Record<string, string> = {
  yellow: "important",
  pink: "confused",
  blue: "definition",
  green: "example",
};

export interface CustomColor {
  id: string;
  hex: string;
  meaning: string;
}

export type Rect = { x: number; y: number; w: number; h: number };

export interface Highlight {
  id: string;
  bookId: string;
  page: number;
  rects: Rect[];
  color: HighlightColor;
  text: string;
  note?: string;
  createdAt: number;
}

export interface Flashcard {
  id: string;
  bookId: string;
  page: number;
  front: string;
  back: string;
  sourceHighlightId?: string;
  sm2: {
    easiness: number;
    interval: number;
    repetitions: number;
    dueAt: number;
    lastReviewedAt?: number;
  };
  createdAt: number;
}

export interface Book {
  id: string;
  title: string;
  source: { kind: "url"; url: string } | { kind: "blob"; fileName: string; size: number };
  addedAt: number;
  lastOpenedAt?: number;
  lastPage?: number;
  totalPages?: number;
  shelf?: string;
  pinned?: boolean;
  coverVariant?: "paper" | "dark" | "accent";
  coverDataUrl?: string;
}

export type Theme = "paper" | "sepia" | "night";
export type FontFamily = "charter" | "iowan" | "source-serif";
export type FlowMode = "reflow" | "paginated";

export interface Settings {
  theme: Theme;
  font: FontFamily;
  bodySize: number;
  columnWidth: number;
  flow: FlowMode;
  accent: string;
  colorMeanings: Record<string, string>;
  customColors: CustomColor[];
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "sepia",
  font: "source-serif",
  bodySize: 16,
  columnWidth: 72,
  flow: "reflow",
  accent: "#4C52B3",
  colorMeanings: { ...COLOR_MEANING },
  customColors: [],
};

export const ACCENTS = ["#4C52B3", "#A24648", "#5A7A4B", "#8A7030", "#2B2B2B"] as const;
