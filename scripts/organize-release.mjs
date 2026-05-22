// Post-build tidy for `electron-builder --mac`.
// Renames artifacts so Apple Silicon owns the plain "mac" name and Intel is
// explicitly "mac-intel", then leaves the M-chip DMG alone at the top of
// release/ and moves every other build output into release/other-artifacts/.
//
// electron-builder emits "...-mac-arm64.*" and "...-mac-x64.*" (see the
// artifactName template in package.json); we translate those tokens here.
import { readFileSync, readdirSync, mkdirSync, renameSync } from "node:fs";
import path from "node:path";

const ROOT = "release";
const OTHER = path.join(ROOT, "other-artifacts");
const { version } = JSON.parse(readFileSync("package.json", "utf8"));

// Neither token is a substring of the other, so order is irrelevant.
const RENAMES = [
  ["-mac-x64", "-mac-intel"], // Intel
  ["-mac-arm64", "-mac"], // Apple Silicon (M-chip) gets the plain name
];

function rename(name) {
  for (const [from, to] of RENAMES) name = name.split(from).join(to);
  return name;
}

// 1. Rename arch tokens on every file/dir currently in release/.
for (const name of readdirSync(ROOT)) {
  const next = rename(name);
  if (next !== name) renameSync(path.join(ROOT, name), path.join(ROOT, next));
}

// 2. Keep the M-chip installer at the top; move the rest aside.
const keep = `Overtree-${version}-mac.dmg`;
const entries = readdirSync(ROOT);
if (!entries.includes(keep)) {
  console.error(`\n  organize-release: expected ${keep} in ${ROOT}/, not found.`);
  console.error(`  found: ${entries.join(", ")}`);
  process.exit(1);
}

mkdirSync(OTHER, { recursive: true });
let moved = 0;
for (const name of entries) {
  if (name === keep || name === "other-artifacts") continue;
  renameSync(path.join(ROOT, name), path.join(OTHER, name));
  moved++;
}

console.log(`\n  Apple Silicon (M-chip) installer:`);
console.log(`    ${path.join(ROOT, keep)}`);
console.log(`  Moved ${moved} other artifact(s) into ${OTHER}/\n`);
