import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import { zipSync, unzipSync } from "fflate";

const files = {};
const blocked = new Set(["node_modules", ".netlify", ".git", ".vite", "coverage", "test-results", "playwright-report", "data"]);
async function add(path) {
  const children = await readdir(path, { withFileTypes: true });
  for (const child of children) {
    if (blocked.has(child.name) || /\.(log|tsbuildinfo)$/.test(child.name) || child.name.startsWith(".env")) continue;
    const name = join(path, child.name);
    // OneDrive cloud placeholders can be reported as reparse points by readdir.
    const info = await stat(name);
    if (info.isDirectory()) await add(name);
    else if (info.isFile()) files[name.replaceAll("\\", "/")] = await readFile(name);
  }
}
for (const path of ["apps/web", "packages/shared", "netlify", "serverless", "scripts"]) await add(path);
for (const name of ["netlify.toml", "package.json", "package-lock.json", "tsconfig.base.json", "vitest.config.ts", "README.md", "TEST-REPORT.md", ".gitignore"]) files[name] = await readFile(name);
const archive = zipSync(files, { level: 6 });
const entries = Object.keys(unzipSync(archive));
for (const name of ["netlify.toml", "package.json", "package-lock.json", "netlify/functions/game.ts", "apps/web/dist/index.html", "serverless/handler.ts"]) assert.ok(entries.includes(name), `Missing ${name}`);
assert.deepEqual(entries.filter(x => x.startsWith("netlify/functions/")), ["netlify/functions/game.ts"]);
const html = new TextDecoder().decode(files["apps/web/dist/index.html"]);
for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)) assert.ok(entries.includes(`apps/web/dist${match[1]}`), `Missing built asset ${match[1]}`);
assert.ok(!entries.some(x => /(^|\/)(node_modules|\.netlify|\.git|data|caches)(\/|$)|\.log$/.test(x)));
await writeFile("netlify-ready-game.zip", archive);
console.log(`netlify-ready-game.zip: ${entries.length} files, ${(archive.length / 1024 / 1024).toFixed(2)} MiB; root configuration, source, built frontend, function and lockfile verified.`);
