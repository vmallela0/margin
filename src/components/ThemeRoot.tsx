import { useEffect, type ReactNode } from "react";
import { useStore } from "../lib/useStore";
import { getSettings } from "../lib/storage";
import { DEFAULT_SETTINGS } from "../lib/types";

export function ThemeRoot({ children }: { children: ReactNode }) {
  const settings = useStore(getSettings, DEFAULT_SETTINGS);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.setProperty("--accent", settings.accent);
    document.documentElement.style.setProperty(
      "--accent-2",
      hexToRgba(settings.accent, 0.12),
    );
  }, [settings.theme, settings.accent]);

  return <>{children}</>;
}

function hexToRgba(hex: string, a: number) {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
