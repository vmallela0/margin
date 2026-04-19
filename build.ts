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
    minify: false,
    sourcemap: "linked",
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
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Source+Serif+4:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet" />
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
