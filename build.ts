import { watch } from "node:fs";
import { cp, mkdir, rm, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = import.meta.dir;
const OUT = path.join(ROOT, "dist");
const PUBLIC = path.join(ROOT, "public");
const WATCH = process.argv.includes("--watch");

async function build() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const result = await Bun.build({
    entrypoints: [
      path.join(ROOT, "src/newtab.tsx"),
      path.join(ROOT, "src/reader.tsx"),
      path.join(ROOT, "src/background.ts"),
    ],
    outdir: OUT,
    target: "browser",
    format: "esm",
    splitting: false,
    minify: !WATCH,
    sourcemap: WATCH ? "linked" : "none",
    naming: "[name].[ext]",
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".woff2": "file", ".png": "file", ".svg": "file" },
  });

  if (!result.success) {
    console.error(result.logs);
    throw new Error("build failed");
  }

  await Bun.write(
    path.join(OUT, "newtab.html"),
    htmlShell({ title: "Margin", script: "newtab.js", styles: ["newtab.css"] }),
  );
  await Bun.write(
    path.join(OUT, "reader.html"),
    htmlShell({ title: "Margin · Reader", script: "reader.js", styles: ["reader.css"] }),
  );

  await cp(path.join(ROOT, "manifest.json"), path.join(OUT, "manifest.json"));

  const worker = Bun.resolveSync("pdfjs-dist/build/pdf.worker.mjs", ROOT);
  await cp(worker, path.join(OUT, "pdf.worker.mjs"));

  // Bundle fonts locally — eliminates runtime Google Fonts request
  const FONT_DIR = path.join(OUT, "fonts");
  await mkdir(FONT_DIR, { recursive: true });
  const FONTSOURCE = path.join(ROOT, "node_modules/@fontsource");
  const FONT_FILES = [
    ["inter/files/inter-latin-400-normal.woff2", "inter-400.woff2"],
    ["inter/files/inter-latin-500-normal.woff2", "inter-500.woff2"],
    ["inter/files/inter-latin-600-normal.woff2", "inter-600.woff2"],
    ["jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2", "jbm-400.woff2"],
    ["jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2", "jbm-500.woff2"],
    ["source-serif-4/files/source-serif-4-latin-400-normal.woff2", "ss4-400.woff2"],
    ["source-serif-4/files/source-serif-4-latin-500-normal.woff2", "ss4-500.woff2"],
    ["source-serif-4/files/source-serif-4-latin-600-normal.woff2", "ss4-600.woff2"],
    ["source-serif-4/files/source-serif-4-latin-400-italic.woff2", "ss4-400i.woff2"],
  ];
  for (const [src, dest] of FONT_FILES) {
    await cp(path.join(FONTSOURCE, src), path.join(FONT_DIR, dest));
  }
  await cp(path.join(PUBLIC, "fonts.css"), path.join(OUT, "fonts.css"));

  if (await Bun.file(path.join(PUBLIC, "icons/icon128.png")).exists()) {
    await mkdir(path.join(OUT, "icons"), { recursive: true });
    for (const f of await readdir(path.join(PUBLIC, "icons"))) {
      await cp(path.join(PUBLIC, "icons", f), path.join(OUT, "icons", f));
    }
  }

  if (WATCH) {
    await writeFile(path.join(OUT, "dev-reload.js"), DEV_RELOAD_JS);
    await writeFile(path.join(OUT, "version.txt"), String(Date.now()));
  }

  console.log(`built · ${new Date().toLocaleTimeString()}`);
}

const DEV_RELOAD_JS = `// auto-reload page when dist/version.txt changes
let last = null;
setInterval(async () => {
  try {
    const r = await fetch("version.txt?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return;
    const t = (await r.text()).trim();
    if (last !== null && last !== t) { console.log("[margin] reloading"); location.reload(); }
    last = t;
  } catch {}
}, 800);
`;

function htmlShell(o: { title: string; script: string; styles: string[] }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${o.title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<link rel="stylesheet" href="fonts.css" />
${o.styles.map((s) => `<link rel="stylesheet" href="${s}" />`).join("\n")}
</head>
<body>
<div id="app"></div>
<script type="module" src="${o.script}"></script>
${WATCH ? `<script src="dev-reload.js"></script>` : ""}
</body>
</html>
`;
}

if (WATCH) {
  await build();
  console.log("watching src/ …");
  let pending: ReturnType<typeof setTimeout> | null = null;
  watch(path.join(ROOT, "src"), { recursive: true }, () => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      build().catch((e) => console.error(e));
    }, 80);
  });
} else {
  await build();
}
