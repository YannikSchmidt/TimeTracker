// Baut eine eigenständige Browser-Vorschau der App als EINE HTML-Datei
// (JS und benötigte Assets inline), z.B. zum Teilen als Link oder Testen am Handy.
//
//   npm run build:preview   →   dist-preview/timetracker.html
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const outDir = join(root, 'dist-preview');

rmSync(dist, { recursive: true, force: true });
execSync('npx expo export --platform web', { cwd: root, stdio: 'inherit', env: { ...process.env, CI: '1' } });

const jsDir = join(dist, '_expo/static/js/web');
const bundles = readdirSync(jsDir).filter((f) => f.endsWith('.js'));
let js = bundles.map((f) => readFileSync(join(jsDir, f), 'utf8')).join('\n;\n');

// Nur tatsächlich genutzte Assets einbetten: Ionicons (Tab-Icons) und die kleinen Router-PNGs.
const MIME = { '.ttf': 'font/ttf', '.png': 'image/png' };
const assetPaths = [...new Set(js.match(/"\/assets\/[^"]+"/g) ?? [])].map((s) => s.slice(1, -1));
let inlined = 0;
for (const path of assetPaths) {
  if (extname(path) === '.ttf' && !path.includes('/Ionicons.')) continue;
  const data = readFileSync(join(dist, path)).toString('base64');
  js = js.split(`"${path}"`).join(`"data:${MIME[extname(path)]};base64,${data}"`);
  inlined++;
}

// "</script" im Code würde das Inline-Script vorzeitig beenden.
js = js.replace(/<\/script/gi, '<\\/script');

const html = `<title>TimeTracker</title>
<style>
  :root { --bg: #F4F5F7; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0F1115; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg: #0F1115; color-scheme: dark; }
  html, body { height: 100%; }
  body { overflow: hidden; background: var(--bg); }
  #root { display: flex; height: 100%; flex: 1; }
</style>
<div id="root"></div>
<script>
${js}
</script>
`;

mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'timetracker.html');
writeFileSync(outFile, html);
console.log(`\n✔ ${outFile} (${(html.length / 1024 / 1024).toFixed(1)} MB, ${inlined} Assets eingebettet)`);
