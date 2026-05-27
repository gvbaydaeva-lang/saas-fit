import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const distIndex = resolve("dist/index.html");
const dist404 = resolve("dist/404.html");

if (!existsSync(distIndex)) {
  console.error("postbuild-pages: dist/index.html не найден. Сначала выполните vite build.");
  process.exit(1);
}

copyFileSync(distIndex, dist404);
console.log("postbuild-pages: dist/404.html создан (копия index.html для SPA на GitHub Pages)");
