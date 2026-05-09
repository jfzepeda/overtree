import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve relative to this file so it works regardless of process.cwd()
// (e.g. when launched as a stdio MCP server from another project's directory).
// In a packaged Electron build, OVERTREE_BUNDLE_ROOT pins the bundle layout
// so we don't rely on import.meta.url surviving webpack's API-route bundling.
const TEMPLATES_DIR = process.env.OVERTREE_BUNDLE_ROOT
  ? path.join(process.env.OVERTREE_BUNDLE_ROOT, "templates")
  : path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../templates",
    );

export async function listTemplates(): Promise<string[]> {
  try {
    const entries = await fs.readdir(TEMPLATES_DIR, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export async function copyTemplate(
  template: string,
  destDir: string,
): Promise<void> {
  const src = path.join(TEMPLATES_DIR, template);
  const stat = await fs.stat(src).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`template not found: ${template}`);
  await copyDir(src, destDir);
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) {
      await copyDir(s, d);
    } else {
      await fs.copyFile(s, d);
    }
  }
}
