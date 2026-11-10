/**
 * Rejects a banned authority phrase in source.
 * The needle is concatenated so this file does not contain it.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const forbidden = ["is the", "identified"].join(" ");
const roots = ["src", "server", "scripts", "shared"].map((dir) => join(process.cwd(), dir));
const hits = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const path = join(dir, name);
    const info = statSync(path);
    if (info.isDirectory()) walk(path);
    else if (/\.(ts|tsx|mjs|js|cjs)$/.test(name)) {
      const text = readFileSync(path, "utf8");
      if (text.includes(forbidden)) hits.push(path);
    }
  }
}

for (const root of roots) walk(root);

if (hits.length) {
  console.error(`lint: rejected ${JSON.stringify(forbidden)}`);
  for (const file of hits) console.error(file);
  process.exit(1);
}

console.log("lint: copy phrases ok");
