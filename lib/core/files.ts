import { promises as fs } from "node:fs";
import path from "node:path";
import {
  exists,
  isSafeId,
  projectDir,
  resolveInProject,
} from "./storage";
import { touchProject } from "./projects";

export type FileNode = {
  name: string;
  path: string;
  kind: "file" | "dir";
  size?: number;
  children?: FileNode[];
};

const HIDDEN_TOPLEVEL = new Set([".overtree"]);

export async function listFiles(id: string): Promise<FileNode[]> {
  if (!isSafeId(id)) throw new Error(`invalid id: ${id}`);
  const dir = await projectDir(id);
  return await walk(dir, "");
}

async function walk(absDir: string, relDir: string): Promise<FileNode[]> {
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  const out: FileNode[] = [];
  for (const e of entries) {
    if (relDir === "" && HIDDEN_TOPLEVEL.has(e.name)) continue;
    const rel = relDir ? path.posix.join(relDir, e.name) : e.name;
    const abs = path.join(absDir, e.name);
    if (e.isDirectory()) {
      out.push({
        name: e.name,
        path: rel,
        kind: "dir",
        children: await walk(abs, rel),
      });
    } else if (e.isFile()) {
      const s = await fs.stat(abs);
      out.push({ name: e.name, path: rel, kind: "file", size: s.size });
    }
  }
  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

export async function readFile(id: string, relPath: string): Promise<string> {
  const abs = await resolveInProject(id, relPath);
  return await fs.readFile(abs, "utf8");
}

export async function readFileBinary(
  id: string,
  relPath: string,
): Promise<Buffer> {
  const abs = await resolveInProject(id, relPath);
  return await fs.readFile(abs);
}

export async function writeFile(
  id: string,
  relPath: string,
  content: string | Buffer,
): Promise<void> {
  const abs = await resolveInProject(id, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await atomicWrite(abs, content);
  await touchProject(id);
}

/**
 * Write `content` to `target` atomically: temp sibling + rename. Prevents
 * partial/corrupt files if the process is killed mid-write.
 */
export async function atomicWrite(
  target: string,
  content: string | Buffer,
): Promise<void> {
  const dir = path.dirname(target);
  const base = path.basename(target);
  const tmp = path.join(
    dir,
    `.${base}.tmp.${process.pid}.${Math.random().toString(36).slice(2, 10)}`,
  );
  try {
    await fs.writeFile(tmp, content);
    await fs.rename(tmp, target);
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    throw err;
  }
}

export async function editFile(
  id: string,
  relPath: string,
  oldString: string,
  newString: string,
): Promise<void> {
  const current = await readFile(id, relPath);
  if (!oldString) throw new Error("oldString cannot be empty");
  const idx = current.indexOf(oldString);
  if (idx === -1) throw new Error("oldString not found in file");
  if (current.indexOf(oldString, idx + oldString.length) !== -1) {
    throw new Error("oldString matches multiple times — provide more context");
  }
  const next = current.slice(0, idx) + newString + current.slice(idx + oldString.length);
  await writeFile(id, relPath, next);
}

export async function deleteFile(id: string, relPath: string): Promise<void> {
  const abs = await resolveInProject(id, relPath);
  if (!(await exists(abs))) return;
  const stat = await fs.stat(abs);
  if (stat.isDirectory()) {
    await fs.rm(abs, { recursive: true, force: true });
  } else {
    await fs.unlink(abs);
  }
  await touchProject(id);
}

export async function renameFile(
  id: string,
  fromRel: string,
  toRel: string,
): Promise<void> {
  const fromAbs = await resolveInProject(id, fromRel);
  const toAbs = await resolveInProject(id, toRel);
  await fs.mkdir(path.dirname(toAbs), { recursive: true });
  await fs.rename(fromAbs, toAbs);
  await touchProject(id);
}

export async function mkdir(id: string, relPath: string): Promise<void> {
  const abs = await resolveInProject(id, relPath);
  await fs.mkdir(abs, { recursive: true });
  await touchProject(id);
}
