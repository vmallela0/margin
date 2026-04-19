import { useEffect } from "react";
import { saveSettings } from "../lib/storage";
import type { Settings as S, FontFamily, Theme, CustomColor } from "../lib/types";
import { ACCENTS, BUILTIN_COLORS } from "../lib/types";
import { shortId } from "../lib/hash";

const FONTS: [FontFamily, string][] = [
  ["charter", "Charter"],
  ["iowan", "Iowan"],
  ["source-serif", "Source Serif"],
];
const THEMES: [Theme, string][] = [["paper", "Paper"], ["sepia", "Sepia"], ["night", "Night"]];

export function SettingsSheet({ settings, onClose }: { settings: S; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patch = (p: Partial<S>) => saveSettings({ ...settings, ...p });

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} style={{ background: "rgba(0,0,0,0.04)" }} />
      <aside className="settings-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Reading</h2>
          <span className="kbd2">esc</span>
        </div>

        <label>
          <span className="lbl">Font</span>
          <div className="seg">
            {FONTS.map(([k, l]) => (
              <button key={k} className={settings.font === k ? "on" : ""} onClick={() => patch({ font: k })}>{l}</button>
            ))}
          </div>
        </label>

        <label>
          <span className="lbl">Theme</span>
          <div className="seg">
            {THEMES.map(([k, l]) => (
              <button key={k} className={settings.theme === k ? "on" : ""} onClick={() => patch({ theme: k })}>{l}</button>
            ))}
          </div>
        </label>

        <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
          <div className="meta-s" style={{ marginBottom: 8 }}>Accent</div>
          <div className="accent-row" style={{ alignItems: "center" }}>
            {ACCENTS.map((c) => (
              <button
                key={c}
                className={`dot ${settings.accent === c ? "on" : ""}`}
                style={{ background: c }}
                onClick={() => patch({ accent: c })}
              />
            ))}
            <label style={{ marginLeft: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="color"
                value={settings.accent}
                onChange={(e) => patch({ accent: e.target.value })}
                style={{ width: 22, height: 22, borderRadius: "50%", border: "none", padding: 0, cursor: "pointer", background: "none" }}
              />
              <span className="meta-s" style={{ fontSize: 9 }}>custom</span>
            </label>
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
          <div className="meta-s" style={{ marginBottom: 8 }}>Library</div>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="lbl" style={{ fontSize: 13 }}>Auto-recycle unshelved</span>
            <select
              className="input"
              style={{ padding: "4px 8px", fontSize: 12, width: "auto" }}
              value={settings.autoRecycleDays ?? "off"}
              onChange={(e) => {
                const v = e.target.value;
                patch({ autoRecycleDays: v === "off" ? null : Number(v) });
              }}
            >
              <option value="off">Off</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
            </select>
          </label>
        </div>

        <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
          <div className="meta-s" style={{ marginBottom: 8 }}>Highlight colors</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {BUILTIN_COLORS.map((c) => (
              <label key={c} style={{ display: "flex", alignItems: "center", gap: 8, padding: 6, border: "1px solid var(--rule)", borderRadius: 3 }}>
                <div style={{ width: 16, height: 16, background: `var(--hi-${c})`, borderRadius: 2, border: "1px solid var(--rule-2)" }} />
                <input
                  className="input"
                  style={{ padding: "3px 6px", fontSize: 12 }}
                  value={settings.colorMeanings[c] ?? ""}
                  onChange={(e) => patch({ colorMeanings: { ...settings.colorMeanings, [c]: e.target.value } })}
                />
              </label>
            ))}
            {settings.customColors.map((cc, idx) => (
              <label key={cc.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: 6, border: "1px solid var(--rule)", borderRadius: 3, position: "relative" }}>
                <input
                  type="color"
                  value={cc.hex}
                  onChange={(e) => {
                    const next = [...settings.customColors];
                    next[idx] = { ...cc, hex: e.target.value };
                    patch({ customColors: next });
                  }}
                  style={{ width: 18, height: 18, padding: 0, border: "1px solid var(--rule-2)", borderRadius: 2, cursor: "pointer", background: "none" }}
                  title="Change color"
                />
                <input
                  className="input"
                  style={{ padding: "3px 6px", fontSize: 12, flex: 1 }}
                  placeholder="meaning…"
                  value={cc.meaning}
                  onChange={(e) => {
                    const next = [...settings.customColors];
                    next[idx] = { ...cc, meaning: e.target.value };
                    patch({ customColors: next });
                  }}
                />
                <button
                  onClick={() => patch({ customColors: settings.customColors.filter((x) => x.id !== cc.id) })}
                  title="Remove"
                  style={{ appearance: "none", border: 0, background: "transparent", color: "var(--ink-3)", cursor: "pointer", fontSize: 13, padding: 2 }}
                >×</button>
              </label>
            ))}
            <button
              className="btn"
              style={{ gridColumn: "1 / -1", fontSize: 11, padding: "5px 8px" }}
              onClick={() => {
                const c: CustomColor = { id: shortId(), hex: "#F2C94C", meaning: "" };
                patch({ customColors: [...settings.customColors, c] });
              }}
            >+ add color</button>
          </div>
        </div>
      </aside>
    </>
  );
}
